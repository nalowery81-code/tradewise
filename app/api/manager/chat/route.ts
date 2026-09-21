import OpenAI from 'openai'
import { supabaseServer } from '../../../lib/supabase-server'
import { requireManagementAccess } from '../../../lib/management-auth'
import { getManagerTechnicianScope, technicianIsInScope } from '../../../lib/manager-technician-scope'
import { getActiveGuidance } from '../../../lib/active-guidance'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MANAGER_MODEL = 'gpt-5.6-luna'

type TechnicianScope = { id: string; name: string }

type Reflection = {
  technician_id: string | null
  technician_name: string | null
  job_type: string | null
  challenge: string | null
  what_went_well: string | null
  help_needed: string | null
  manager_insight: string | null
  created_at: string | null
}

const cleanManagerReply = (text: string) =>
  text.replace(/^#{1,6}\s*/gm, '').replace(/\*\*/g, '').trim()

const getLegacyProfileName = (message: string) => {
  const focusMatch = message.match(/Focus specifically on\s+(.+?)\.?\s*$/i)
  if (focusMatch?.[1]) return focusMatch[1].trim()

  const summaryMatch = message.match(/Give me a concise manager summary of\s+(.+?)\.\s+Return exactly/i)
  return summaryMatch?.[1]?.trim() || null
}

export async function POST(request: Request) {
  try {
    const auth = await requireManagementAccess(request)
    if ('error' in auth) return auth.error

    const companyId = auth.profile.company_id
    const scope = await getManagerTechnicianScope(auth.profile)
    if ('error' in scope) return scope.error

    const body = await request.json()
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    const requestedTechnicianId =
      typeof body?.technicianId === 'string' && body.technicianId.trim()
        ? body.technicianId.trim()
        : null
    const requestedConversationId =
      typeof body?.conversationId === 'string' && body.conversationId.trim()
        ? body.conversationId.trim()
        : null
    const contextType = body?.contextType === 'profile_summary' ? 'profile_summary' : 'chat'

    if (!message) {
      return Response.json({ error: 'A manager question is required.' }, { status: 400 })
    }

    let managementConversationId = requestedConversationId

    if (managementConversationId) {
      const { data: existingConversation, error: existingConversationError } = await supabaseServer
        .from('ManagementConversations')
        .select('id')
        .eq('id', managementConversationId)
        .eq('company_id', companyId)
        .eq('profile_id', auth.profile.id)
        .eq('user_role', auth.profile.role)
        .maybeSingle()

      if (existingConversationError) {
        console.error('MANAGEMENT CONVERSATION LOAD ERROR:', existingConversationError)
        return Response.json({ error: 'Could not load the management conversation.' }, { status: 500 })
      }

      if (!existingConversation?.id) {
        return Response.json({ error: 'Management conversation not found.' }, { status: 404 })
      }
    } else {
      const { data: createdConversation, error: createConversationError } = await supabaseServer
        .from('ManagementConversations')
        .insert({
          company_id: companyId,
          profile_id: auth.profile.id,
          user_role: auth.profile.role,
          context_type: contextType,
          title: message.slice(0, 120),
          model_name: MANAGER_MODEL,
        })
        .select('id')
        .single()

      if (createConversationError || !createdConversation?.id) {
        console.error('MANAGEMENT CONVERSATION CREATE ERROR:', createConversationError)
        return Response.json({ error: 'Could not start the management conversation.' }, { status: 500 })
      }

      managementConversationId = createdConversation.id
    }

    const { error: userMessageError } = await supabaseServer.from('ManagementMessages').insert({
      conversation_id: managementConversationId,
      role: 'user',
      content: message,
      model_name: null,
      sources: [],
    })

    if (userMessageError) {
      console.error('MANAGEMENT USER MESSAGE SAVE ERROR:', userMessageError)
      return Response.json({ error: 'Could not save the management message.' }, { status: 500 })
    }

    const logAssistantReply = async (
      replyText: string,
      payload: Record<string, unknown> = {},
      modelName: string | null = null
    ) => {
      const { data: assistantMessage, error: assistantMessageError } = await supabaseServer.from('ManagementMessages').insert({
        conversation_id: managementConversationId,
        role: 'assistant',
        content: replyText,
        model_name: modelName,
        sources: [],
      }).select('id').single()

      if (assistantMessageError || !assistantMessage) {
        console.error('MANAGEMENT ASSISTANT MESSAGE SAVE ERROR:', assistantMessageError)
        throw assistantMessageError || new Error('Assistant message was not saved.')
      }

      const { error: conversationUpdateError } = await supabaseServer
        .from('ManagementConversations')
        .update({
          updated_at: new Date().toISOString(),
          model_name: modelName || MANAGER_MODEL,
        })
        .eq('id', managementConversationId)

      if (conversationUpdateError) {
        console.error('MANAGEMENT CONVERSATION UPDATE ERROR:', conversationUpdateError)
      }

      return Response.json({
        reply: replyText,
        conversationId: managementConversationId,
        assistantMessageId: assistantMessage.id,
        ...payload,
      })
    }

    let technicianScope: TechnicianScope | null = null

    if (requestedTechnicianId) {
      if (!technicianIsInScope(scope.technicianIds, requestedTechnicianId)) {
        return Response.json({ error: 'Technician not found.' }, { status: 404 })
      }

      const { data: technician, error: technicianError } = await supabaseServer
        .from('Technicians')
        .select('id, canonical_name')
        .eq('company_id', companyId)
        .eq('id', requestedTechnicianId)
        .single()

      if (technicianError || !technician) {
        return Response.json({ error: 'Technician not found.' }, { status: 404 })
      }

      technicianScope = { id: technician.id, name: technician.canonical_name }
    } else {
      const legacyProfileName = getLegacyProfileName(message)

      if (legacyProfileName) {
        let technicianQuery = supabaseServer
          .from('Technicians')
          .select('id, canonical_name')
          .eq('company_id', companyId)

        if (scope.technicianIds !== null) {
          if (scope.technicianIds.length === 0) {
            return Response.json({ error: 'Technician not found.' }, { status: 404 })
          }
          technicianQuery = technicianQuery.in('id', scope.technicianIds)
        }

        const { data: technicians, error: technicianError } = await technicianQuery

        if (technicianError) {
          console.error('MANAGER TECHNICIAN SCOPE LOAD ERROR:', technicianError)
          return Response.json({ error: 'Could not verify technician scope.' }, { status: 500 })
        }

        const match = (technicians || []).find(
          (technician) =>
            technician.canonical_name.trim().toLowerCase() === legacyProfileName.toLowerCase()
        )

        if (!match) {
          return Response.json({ error: 'Technician not found.' }, { status: 404 })
        }

        technicianScope = { id: match.id, name: match.canonical_name }
      }
    }

    let reflections: Reflection[] = []

    if (technicianScope) {
      const { data: byId, error: byIdError } = await supabaseServer
        .from('Reflections')
        .select('technician_id, technician_name, job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
        .eq('company_id', companyId)
        .eq('technician_id', technicianScope.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (byIdError) {
        console.error('MANAGER TECHNICIAN REFLECTION LOAD ERROR:', byIdError)
        return Response.json({ error: 'Could not load technician reflections.' }, { status: 500 })
      }

      reflections = (byId || []) as Reflection[]

      if (reflections.length === 0) {
        const { data: byName, error: byNameError } = await supabaseServer
          .from('Reflections')
          .select('technician_id, technician_name, job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
          .eq('company_id', companyId)
          .eq('technician_name', technicianScope.name)
          .order('created_at', { ascending: false })
          .limit(50)

        if (byNameError) {
          console.error('MANAGER TECHNICIAN NAME REFLECTION LOAD ERROR:', byNameError)
          return Response.json({ error: 'Could not load technician reflections.' }, { status: 500 })
        }

        reflections = (byName || []) as Reflection[]
      }

      if (reflections.length === 0) {
        return logAssistantReply(
          `There are no manager-relevant reflections for ${technicianScope.name} yet, so I do not have enough verified reflection data to answer that reliably.`,
          { scope: { technicianId: technicianScope.id, technicianName: technicianScope.name } }
        )
      }
    } else {
      if (scope.technicianIds !== null && scope.technicianIds.length === 0) {
        return logAssistantReply(
          'No technicians are assigned to you yet, so I do not have technician data in your manager scope to answer from.',
          { scope: { assignedTechnicians: 0 } }
        )
      }

      let reflectionQuery = supabaseServer
        .from('Reflections')
        .select('technician_id, technician_name, job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (scope.technicianIds !== null) {
        reflectionQuery = reflectionQuery.in('technician_id', scope.technicianIds)
      }

      const { data, error: reflectionsError } = await reflectionQuery

      if (reflectionsError) {
        console.error('MANAGER REFLECTION LOAD ERROR:', reflectionsError)
        return Response.json({ error: 'Could not load technician reflections.' }, { status: 500 })
      }

      reflections = (data || []) as Reflection[]
    }

    const reflectionContext = reflections
      .map((reflection, index) => `${index + 1}. Technician: ${reflection.technician_name || 'Unknown'}
Job type: ${reflection.job_type || 'Unknown'}
Challenge: ${reflection.challenge || 'None shared'}
What went well: ${reflection.what_went_well || 'None shared'}
Help needed: ${reflection.help_needed || 'None shared'}
Manager insight: ${reflection.manager_insight || 'None'}
Created at: ${reflection.created_at || 'Unknown'}`)
      .join('\n\n')

    const scopeInstruction = technicianScope
      ? `This request is scoped ONLY to ${technicianScope.name}. Every reflection below belongs to that technician. Do not mention, compare, or infer anything about any other technician.`
      : auth.profile.role === 'owner'
        ? 'This is a company-wide owner request. Use only the verified company reflection data below.'
        : 'This is a manager request. Use only the verified reflection data for technicians assigned to this manager.'

    const activeGuidance = await getActiveGuidance('management')

    const response = await openai.responses.create({
      model: MANAGER_MODEL,
      instructions: `
You are CraftCompass Manager, an experienced field-service manager's AI partner.

Your job is to help a manager understand what their technicians are dealing with based ONLY on the verified technician reflection data provided in the request.

Rules:
- Be practical, concise, human, and contractor-friendly.
- Never invent technicians, events, jobs, patterns, risks, or performance claims.
- Only name a technician when the provided data supports the statement.
- If the data is too limited to answer the question, say that clearly.
- Separate a one-time issue from a repeated pattern. Do not call something a trend unless multiple records support it.
- Do not diagnose mental health conditions or make medical claims.
- Avoid ranking technicians or labeling someone a poor performer unless the manager explicitly asks and the data directly supports a limited factual comparison.
- Prefer useful manager actions: who may need a check-in, what system issue may need attention, what training may help, and what positive behavior should be reinforced.
- For broad questions, give the manager the most important findings first.
- Use plain text headings and bullets when helpful. Do not use Markdown heading markers (#) or bold markers (**).
- Do not expose raw internal data formatting or technical implementation details.

ACTIVE ADMIN-APPROVED GUIDANCE:
${activeGuidance || 'No additional Admin-approved guidance is active.'}

Apply active guidance when relevant. Do not mention the Guidance Library or internal review process.
      `.trim(),
      input: `${scopeInstruction}\n\nManager question:\n${message}\n\nVerified recent technician reflections:\n${reflectionContext}`,
    })

    const rawReply = response.output_text?.trim()
    const reply = rawReply ? cleanManagerReply(rawReply) : ''

    if (!reply) {
      return Response.json({ error: 'CraftCompass Manager could not generate a response.' }, { status: 500 })
    }

    return logAssistantReply(
      reply,
      {
        scope: technicianScope
          ? { technicianId: technicianScope.id, technicianName: technicianScope.name }
          : auth.profile.role === 'owner'
            ? { company: true }
            : { assignedTechnicians: scope.technicianIds?.length || 0 },
      },
      MANAGER_MODEL
    )
  } catch (error: any) {
    console.error('MANAGER CHAT API ERROR:', error)
    return Response.json({ error: error?.message || 'CraftCompass Manager could not generate a response.' }, { status: 500 })
  }
}
