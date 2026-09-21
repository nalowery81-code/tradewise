import { supabaseServer } from '../../../lib/supabase-server'
import { runWeeklyLearning } from '../../../lib/weekly-learning'

export const maxDuration = 60

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const secret = authHeader.slice('Bearer '.length)
  const { data: verified, error: verifyError } = await supabaseServer
    .rpc('verify_weekly_learning_secret', { provided_secret: secret })

  if (verifyError || verified !== true) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runWeeklyLearning('scheduled')
    return Response.json({ ok: true, ...result })
  } catch (error: any) {
    console.error('WEEKLY LEARNING CRON ERROR:', error)
    return Response.json({ error: error?.message || 'Weekly learning failed.' }, { status: 500 })
  }
}
