import OpenAI from 'openai'
import { supabaseServer } from '../../../lib/supabase-server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = authHeader.replace('Bearer ', '')

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(accessToken)

    if (userError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from('UserProfiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || profile?.role !== 'manager') {
      return Response.json({ error: 'Manager access required' }, { status: 403 })
    }

    const body = await request.json()
    const message = typeof body?.message === 'string' ? body.message.trim() : ''

    if (!message) {
      return Response.json({ error: 'A manager question is required.' }, { status: 400 })
    }

    const { data: reflections, error: reflectionsError } = await supabaseServer
      .from('Reflections')
      .select(
        'technician_id, technician_name, job_type, challenge, what_went_well, help_needed, manager_insight, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(50)

    if (reflectionsError) {
      console.error('MANAGER REFLECTION LOAD ERROR:', reflectionsError)
      return Response.json({ error: 'Could not load technician reflections.' }, { status: 500 })
    }

    const reflectionContext = (reflections || [])
      .map((reflection, index) => {
        return `${index + 1}. Technician: ${reflection.technician_name || 'Unknown'}
Job type: ${reflection.job_type || 'Unknown'}
Challenge: ${reflection.challenge || 'None shared'}
What went well: ${reflection.what_went_well || 'None shared'}
Help needed: ${reflection.help_needed || 'None shared'}
Manager insight: ${reflection.manager_insight || 'None'}
Created at: ${reflection.created_at || 'Unknown'}`
      })
      .join('\n\n')

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
- Do not diagnose mental health conditions or make medical claims. You may describe visible workplace strain, workload pressure, support needs, communication issues, training opportunities, recurring job friction, and positive patterns when supported by the data.
- Avoid ranking technicians or labeling someone a poor performer unless the manager explicitly asks and the data directly supports a limited factual comparison.
- Prefer useful manager actions: who may need a check-in, what system issue may need attention, what training may help, and what positive behavior should be reinforced.
- For broad questions, give the manager the most important findings first.
- When helpful, use short headings and bullets.
- Do not expose raw internal data formatting or technical implementation details.
      `.trim(),
      input: `Manager question:\n${message}\n\nVerified recent technician reflections:\n${reflectionContext || 'No technician reflections are currently available.'}`,
    })

    const reply = response.output_text?.trim()

    if (!reply) {
      return Response.json({ error: 'Tradewise Manager could not generate a response.' }, { status: 500 })
    }

    return Response.json({ reply })
  } catch (error: any) {
    console.error('MANAGER CHAT API ERROR:', error)
    return Response.json(
      { error: error?.message || 'Tradewise Manager could not generate a response.' },
      { status: 500 }
    )
  }
}
