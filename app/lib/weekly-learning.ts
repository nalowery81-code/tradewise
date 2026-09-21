import OpenAI from 'openai'
import { supabaseServer } from './supabase-server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const WEEKLY_MODEL = 'gpt-5.6-luna'

type TriggerType = 'scheduled' | 'manual'

type WeeklyGuidanceDraft = {
  title: string
  guidance_text: string
  topic: string
  scope: 'all' | 'technician' | 'management'
  priority: number
}

const stripCodeFence = (value: string) =>
  value
    .replace(/^\`\`\`json\s*/i, '')
    .replace(/^\`\`\`\s*/i, '')
    .replace(/\`\`\`$/i, '')
    .trim()

export async function runWeeklyLearning(
  triggerType: TriggerType,
  adminProfileId?: string | null
) {
  const periodEnd = new Date()
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

  const { data: recentRunning } = await supabaseServer
    .from('WeeklyLearningRuns')
    .select('id, created_at')
    .eq('status', 'running')
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentRunning?.id) {
    return {
      skipped: true,
      reason: 'A weekly learning run is already in progress.',
      runId: recentRunning.id,
    }
  }

  const { data: reviews, error: reviewsError } = await supabaseServer
    .from('ConversationAuditReviews')
    .select('id, conversation_type, conversation_id, message_id, status, category, correction_note, corrected_answer, updated_at')
    .in('status', ['corrected', 'resolved'])
    .gte('updated_at', periodStart.toISOString())
    .lte('updated_at', periodEnd.toISOString())
    .order('updated_at', { ascending: true })
    .limit(100)

  if (reviewsError) throw reviewsError

  const candidateReviews = (reviews || []).filter(
    (review) => Boolean(review.correction_note?.trim() || review.corrected_answer?.trim())
  )

  let alreadyUsed = new Set<string>()
  if (candidateReviews.length > 0) {
    const { data: usedRows, error: usedError } = await supabaseServer
      .from('WeeklyLearningRunReviews')
      .select('review_id')
      .in('review_id', candidateReviews.map((review) => review.id))

    if (usedError) throw usedError
    alreadyUsed = new Set((usedRows || []).map((row) => row.review_id))
  }

  const newReviews = candidateReviews.filter((review) => !alreadyUsed.has(review.id))

  const { data: run, error: runError } = await supabaseServer
    .from('WeeklyLearningRuns')
    .insert({
      trigger_type: triggerType,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      status: 'running',
      review_count: newReviews.length,
      model_name: WEEKLY_MODEL,
    })
    .select('id, created_at, period_start, period_end, trigger_type, status, review_count')
    .single()

  if (runError || !run) throw runError || new Error('Could not create weekly learning run.')

  try {
    if (newReviews.length === 0) {
      const synopsis = 'No new Corrected or Resolved Admin reviews were available for weekly learning.'
      const { data: completed, error } = await supabaseServer
        .from('WeeklyLearningRuns')
        .update({
          status: 'completed',
          guidance_count: 0,
          synopsis,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)
        .select('*')
        .single()

      if (error) throw error
      return { run: completed, guidance: [] }
    }

    const technicianConversationIds = [...new Set(
      newReviews.filter((review) => review.conversation_type === 'technician').map((review) => review.conversation_id)
    )]
    const managementConversationIds = [...new Set(
      newReviews.filter((review) => review.conversation_type === 'management').map((review) => review.conversation_id)
    )]

    const technicianMessages = technicianConversationIds.length
      ? (await supabaseServer
          .from('Messages')
          .select('id, conversation_id, role, content, created_at')
          .in('conversation_id', technicianConversationIds)
          .order('created_at', { ascending: true })).data || []
      : []

    const managementMessages = managementConversationIds.length
      ? (await supabaseServer
          .from('ManagementMessages')
          .select('id, conversation_id, role, content, created_at')
          .in('conversation_id', managementConversationIds)
          .order('created_at', { ascending: true })).data || []
      : []

    const messagesByConversation = new Map<string, { id: string; role: string; content: string }[]>()
    for (const row of [...technicianMessages, ...managementMessages]) {
      const current = messagesByConversation.get(row.conversation_id) || []
      current.push({ id: row.id, role: row.role, content: row.content })
      messagesByConversation.set(row.conversation_id, current)
    }

    const learningExamples = newReviews.map((review) => {
      const rows = messagesByConversation.get(review.conversation_id) || []
      const targetIndex = rows.findIndex((row) => row.id === review.message_id)
      const originalAnswer = targetIndex >= 0 ? rows[targetIndex]?.content || '' : ''
      const userQuestion = targetIndex > 0
        ? [...rows.slice(0, targetIndex)].reverse().find((row) => row.role === 'user')?.content || ''
        : ''

      return {
        review_id: review.id,
        audience: review.conversation_type === 'technician' ? 'technician' : 'management',
        category: review.category || 'other',
        user_question: userQuestion,
        original_answer: originalAnswer,
        admin_finding: review.correction_note || '',
        corrected_answer: review.corrected_answer || '',
      }
    })

    const { data: activeGuidance, error: guidanceError } = await supabaseServer
      .from('GuidanceLibrary')
      .select('title, guidance_text, topic, scope, priority')
      .eq('status', 'active')
      .order('priority', { ascending: false })
      .limit(100)

    if (guidanceError) throw guidanceError

    const response = await openai.responses.create({
      model: WEEKLY_MODEL,
      instructions: `
You are the CraftCompass weekly learning synthesizer.

You receive ONLY human-reviewed CraftCompass corrections from the last week plus the currently active Guidance Library.

Your job is to:
1. Write a concise weekly synopsis of what the reviews revealed.
2. Identify repeated or important lessons that should improve future CraftCompass answers.
3. Generalize lessons when that makes them more reusable across products, manufacturers, or trades.
4. Keep genuinely product-specific guidance specific when generalizing would make it less accurate.
5. Do NOT create guidance that merely repeats an existing active rule.
6. Do NOT infer a rule from an unreviewed AI statement. The Admin finding/corrected answer is the trusted signal.
7. Prefer a small number of durable rules over many narrow rules.
8. If the reviews do not justify any new durable guidance, return an empty guidance array.

Return ONLY valid JSON with exactly this shape:
{
  "synopsis": "2-6 sentence weekly summary",
  "guidance": [
    {
      "title": "short rule title",
      "guidance_text": "1-3 concise sentences telling CraftCompass what to do or verify",
      "topic": "short topic label",
      "scope": "all|technician|management",
      "priority": 1-100
    }
  ]
}

Maximum 8 guidance items.
      `.trim(),
      input: `HUMAN-REVIEWED CORRECTIONS:\n${JSON.stringify(learningExamples)}\n\nCURRENT ACTIVE GUIDANCE:\n${JSON.stringify(activeGuidance || [])}`,
    })

    const raw = stripCodeFence(response.output_text || '')
    let parsed: { synopsis?: unknown; guidance?: unknown }

    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('Weekly learning model returned invalid JSON.')
    }

    const synopsis = String(parsed.synopsis || '').trim() || 'Weekly review synthesis completed.'
    const rawGuidance = Array.isArray(parsed.guidance) ? parsed.guidance : []

    const guidanceDrafts: WeeklyGuidanceDraft[] = rawGuidance
      .slice(0, 8)
      .map((item: any) => ({
        title: String(item?.title || '').trim(),
        guidance_text: String(item?.guidance_text || '').trim(),
        topic: String(item?.topic || '').trim(),
        scope: ['all', 'technician', 'management'].includes(item?.scope)
          ? item.scope
          : 'all',
        priority: Math.min(
          100,
          Math.max(1, Number.isFinite(Number(item?.priority)) ? Math.round(Number(item.priority)) : 70)
        ),
      }))
      .filter((item) => item.title && item.guidance_text)

    let insertedGuidance: any[] = []
    if (guidanceDrafts.length > 0) {
      const { data, error } = await supabaseServer
        .from('GuidanceLibrary')
        .insert(
          guidanceDrafts.map((item) => ({
            title: item.title,
            guidance_text: item.guidance_text,
            topic: item.topic || null,
            scope: item.scope,
            priority: item.priority,
            status: 'draft',
            source_weekly_run_id: run.id,
            created_by_admin_profile_id: adminProfileId || null,
          }))
        )
        .select('id, title, guidance_text, topic, scope, priority, status, source_weekly_run_id, created_at')

      if (error) throw error
      insertedGuidance = data || []
    }

    const { error: linkError } = await supabaseServer
      .from('WeeklyLearningRunReviews')
      .insert(newReviews.map((review) => ({ run_id: run.id, review_id: review.id })))

    if (linkError) throw linkError

    const { data: completedRun, error: completeError } = await supabaseServer
      .from('WeeklyLearningRuns')
      .update({
        status: 'completed',
        review_count: newReviews.length,
        guidance_count: insertedGuidance.length,
        synopsis,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id)
      .select('*')
      .single()

    if (completeError) throw completeError

    return {
      run: completedRun,
      guidance: insertedGuidance,
    }
  } catch (error: any) {
    await supabaseServer
      .from('WeeklyLearningRuns')
      .update({
        status: 'failed',
        error_text: error?.message || 'Weekly learning failed.',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    throw error
  }
}
