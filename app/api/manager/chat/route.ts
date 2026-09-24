import OpenAI from 'openai'
import { supabaseServer } from '../../../lib/supabase-server'
import { requireManagementAccess } from '../../../lib/management-auth'
import { getManagerTechnicianScope, technicianIsInScope } from '../../../lib/manager-technician-scope'
import { getActiveGuidance } from '../../../lib/active-guidance'
import { recordAIUsage } from '../../../lib/ai-usage'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MANAGER_MODEL = 'gpt-5.6-luna'

type TechnicianScope = { id: string; name: string }

type Reflection = {
  conversation_id: string | null
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

const REFLECTION_STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','been','but','by','for','from','had','has','have','he','i',
  'in','is','it','job','me','my','of','on','or','she','that','the','their','they','this','to','was',
  'we','were','with','you','your',
])

const reflectionTokens = (value: string | null | undefined) =>
  new Set(
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 3 && !REFLECTION_STOP_WORDS.has(word))
  )

const reflectionSimilarity = (a: Reflection, b: Reflection) => {
  const left = reflectionTokens([a.job_type, a.challenge, a.help_needed].filter(Boolean).join(' '))
  const right = reflectionTokens([b.job_type, b.challenge, b.help_needed].filter(Boolean).join(' '))
  if (!left.size || !right.size) return 0

  let intersection = 0
  for (const token of left) if (right.has(token)) intersection += 1
  const union = new Set([...left, ...right]).size
  return union ? intersection / union : 0
}

const collapseNearDuplicateReflections = (rows: Reflection[]) => {
  const maxGapMs = 2 * 60 * 60 * 1000
  const groups: Reflection[][] = []

  for (const row of rows) {
    const rowTime = new Date(row.created_at || '').getTime()
    const match = groups.find((group) => {
      const representative = group[0]
      if (!representative) return false
      if ((representative.technician_id || representative.technician_name) !== (row.technician_id || row.technician_name)) return false
      if (representative.conversation_id && row.conversation_id && representative.conversation_id === row.conversation_id) return false

      const representativeTime = new Date(representative.created_at || '').getTime()
      if (!Number.isFinite(rowTime) || !Number.isFinite(representativeTime)) return false
      if (Math.abs(representativeTime - rowTime) > maxGapMs) return false

      return reflectionSimilarity(representative, row) >= 0.72
    })

    if (match) match.push(row)
    else groups.push([row])
  }

  return groups.map((group) => ({
    reflection: group[0],
    collapsed_count: group.length,
  }))
}

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
        .select('conversation_id, technician_id, technician_name, job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
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
          .select('conversation_id, technician_id, technician_name, job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
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
        .select('conversation_id, technician_id, technician_name, job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
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

    const reflectionTechnicianIds = Array.from(
      new Set(reflections.map((reflection) => reflection.technician_id).filter((id): id is string => Boolean(id)))
    )

    if (reflectionTechnicianIds.length > 0) {
      const { data: currentTechnicians, error: currentTechniciansError } = await supabaseServer
        .from('Technicians')
        .select('id, canonical_name')
        .eq('company_id', companyId)
        .in('id', reflectionTechnicianIds)

      if (currentTechniciansError) {
        console.error('MANAGER CURRENT TECHNICIAN NAME LOAD ERROR:', currentTechniciansError)
        return Response.json({ error: 'Could not resolve current technician names.' }, { status: 500 })
      }

      const currentNameById = new Map(
        (currentTechnicians || []).map((technician) => [technician.id, technician.canonical_name])
      )

      reflections = reflections.map((reflection) => ({
        ...reflection,
        technician_name:
          (reflection.technician_id && currentNameById.get(reflection.technician_id)) ||
          reflection.technician_name,
      }))
    }

    const reflectionEpisodes = collapseNearDuplicateReflections(reflections)

    const reflectionContext = reflectionEpisodes
      .map(({ reflection, collapsed_count }, index) => `${index + 1}. Technician: ${reflection.technician_name || 'Unknown'}
Job type: ${reflection.job_type || 'Unknown'}
Challenge: ${reflection.challenge || 'None shared'}
What went well: ${reflection.what_went_well || 'None shared'}
Help needed: ${reflection.help_needed || 'None shared'}
Manager insight: ${reflection.manager_insight || 'None'}
Created at: ${reflection.created_at || 'Unknown'}
Evidence note: ${collapsed_count > 1 ? `${collapsed_count} near-duplicate reflection records from separate conversations within two hours were collapsed into this single episode and MUST NOT be counted as ${collapsed_count} independent occurrences.` : 'One reflection episode.'}`)
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
- Separate a one-time issue from a repeated pattern. Do not call something a trend unless multiple INDEPENDENT reflection episodes support it.
- Near-duplicate reflections from separate conversations may be collapsed into one episode before you see them. Never use a collapsed duplicate count as evidence of repetition or a trend.
- Repeated testing, rephrasing, or follow-up conversations about the same underlying event must count as one episode, not multiple performance signals.
- Do not diagnose mental health conditions or make medical claims.
- Avoid ranking technicians or labeling someone a poor performer unless the manager explicitly asks and the data directly supports a limited factual comparison.
- For technician-specific reviews, do not end with defensive or legalistic disclaimers such as "this does not mean the technician is underperforming" unless the manager explicitly asked about performance concerns.
- Instead, end with a natural manager takeaway that states what the evidence DOES support. Example style: "Overall, Dan appears to be handling difficult work well, while his recent reflections point to support and process issues that are worth addressing."
- Prefer useful manager actions: who may need a check-in, what system issue may need attention, what training may help, and what positive behavior should be reinforced.
- For broad questions, give the manager the most important findings first.
- When an answer discusses more than one technician, separate them clearly. Put each technician's current name on its own standalone line ending with a colon, then place only that technician's findings beneath it. Do not blend multiple technicians into one summary paragraph unless giving a final team-wide takeaway.
- Use plain text headings and bullets when helpful. Do not use Markdown heading markers (#) or bold markers (**).
- Do not expose raw internal data formatting or technical implementation details.

ACTIVE ADMIN-APPROVED GUIDANCE:
${activeGuidance || 'No additional Admin-approved guidance is active.'}

Apply active guidance when relevant. Do not mention the Guidance Library or internal review process.
      `.trim(),
      input: `${scopeInstruction}\n\nManager question:\n${message}\n\nVerified recent technician reflections:\n${reflectionContext}`,
    })

    await recordAIUsage({
      feature: 'manager_chat',
      endpoint: '/api/manager/chat',
      model: MANAGER_MODEL,
      conversationType: 'management',
      conversationId: managementConversationId,
      response,
      metadata: { context_type: contextType, technician_scoped: Boolean(requestedTechnicianId) },
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
