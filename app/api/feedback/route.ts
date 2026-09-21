import { supabaseServer } from '../../lib/supabase-server'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) },
  })

const getUser = async (request: Request) => {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseServer.auth.getUser(token)
  return error ? null : user
}

export async function GET(request: Request) {
  const user = await getUser(request)
  if (!user) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseServer
    .from('ConversationFeedbackRequests')
    .select('id, conversation_type, conversation_id, message_id, question, created_at')
    .eq('target_auth_user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('FEEDBACK REQUEST LOAD ERROR:', error)
    return jsonNoStore({ error: 'Could not load feedback request.' }, { status: 500 })
  }

  if (!data) return jsonNoStore({ request: null })

  let originalQuestion = ''
  let assistantAnswer = ''

  if (data.message_id) {
    try {
      const table = data.conversation_type === 'management' ? 'ManagementMessages' : 'Messages'
      const { data: transcript, error: transcriptError } = await supabaseServer
        .from(table)
        .select('id, role, content, created_at')
        .eq('conversation_id', data.conversation_id)
        .order('created_at', { ascending: true })

      if (transcriptError) throw transcriptError

      const rows = transcript || []
      const targetIndex = rows.findIndex((row) => row.id === data.message_id)

      if (targetIndex >= 0) {
        assistantAnswer = String(rows[targetIndex]?.content || '').trim()
        originalQuestion =
          [...rows.slice(0, targetIndex)]
            .reverse()
            .find((row) => row.role === 'user')
            ?.content?.trim() || ''
      }
    } catch (contextError) {
      console.error('FEEDBACK CONTEXT LOAD ERROR:', contextError)
    }
  }

  return jsonNoStore({
    request: {
      ...data,
      original_question: originalQuestion,
      assistant_answer: assistantAnswer,
    },
  })
}

export async function POST(request: Request) {
  const user = await getUser(request)
  if (!user) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const id = String(body?.id || '').trim()
  const rating = String(body?.rating || '').trim()
  const responseText = String(body?.responseText || '').trim()

  if (!id || !['helpful', 'mixed', 'not_helpful'].includes(rating)) {
    return jsonNoStore({ error: 'Choose a feedback rating.' }, { status: 400 })
  }

  const { data: requestRow, error: requestError } = await supabaseServer
    .from('ConversationFeedbackRequests')
    .select('id, target_auth_user_id, status')
    .eq('id', id)
    .eq('target_auth_user_id', user.id)
    .single()

  if (requestError || !requestRow) return jsonNoStore({ error: 'Feedback request not found.' }, { status: 404 })
  if (requestRow.status !== 'pending') return jsonNoStore({ error: 'Feedback was already submitted.' }, { status: 409 })

  const { error } = await supabaseServer
    .from('ConversationFeedbackRequests')
    .update({
      status: 'responded',
      rating,
      response_text: responseText || null,
      responded_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('target_auth_user_id', user.id)

  if (error) {
    console.error('FEEDBACK RESPONSE SAVE ERROR:', error)
    return jsonNoStore({ error: 'Could not save feedback.' }, { status: 500 })
  }

  return jsonNoStore({ saved: true })
}
