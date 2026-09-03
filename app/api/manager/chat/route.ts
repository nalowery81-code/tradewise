import OpenAI from 'openai'
import { supabaseServer } from '../../../lib/supabase-server'
import { requireManagementAccess } from '../../../lib/management-auth'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
    const body = await request.json()
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    const requestedTechnicianId =
      typeof body?.technicianId === 'string' && body.technicianId.trim()
        ? body.technicianId.trim()
        : null

    if (!message) {
      return Response.json({ error: 'A manager question is required.' }, { status: 400 })
    }

    let technicianScope: TechnicianScope | null = null

    if (requestedTechnicianId) {
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
        const { data: technicians, error: technicianError } = await supabaseServer
          .from('Technicians')
          .select('id, canonical_name')
          .eq('company_id', companyId)

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
        return Response.json({
          reply: `There are no manager-relevant reflections for ${technicianScope.name} yet, so I do not have enough verified reflection data to answer that reliably.`,
          scope: { technicianId: technicianScope.id, technicianName: technicianScope.name },
        })
      }
    } else {
      const { data, error: reflectionsError } = await supabaseServer
        .from('Reflections')
        .select('technician_id, technician_name, job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50)

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
      : 'This is a company-wide manager request. Use only the verified company reflection data below.'

    const response = await openai.responses.create({
      model: 'gpt-5.6-luna',
      instructions: `
You are Tradewise Manager, an experienced field-service manager's AI partner.

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
      `.trim(),
      input: `${scopeInstruction}\n\nManager question:\n${message}\n\nVerified recent technician reflections:\n${reflectionContext}`,
    })

    const rawReply = response.output_text?.trim()
    const reply = rawReply ? cleanManagerReply(rawReply) : ''

    if (!reply) {
      return Response.json({ error: 'Tradewise Manager could not generate a response.' }, { status: 500 })
    }

    return Response.json({
      reply,
      scope: technicianScope
        ? { technicianId: technicianScope.id, technicianName: technicianScope.name }
        : { company: true },
    })
  } catch (error: any) {
    console.error('MANAGER CHAT API ERROR:', error)
    return Response.json({ error: error?.message || 'Tradewise Manager could not generate a response.' }, { status: 500 })
  }
}
