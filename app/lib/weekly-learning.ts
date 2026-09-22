import OpenAI from 'openai'
import { supabaseServer } from './supabase-server'
import { runWeeklySourceAudit } from './weekly-source-audit'
import { recordAIUsage } from './ai-usage'

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

  const { data: helpfulFeedback, error: helpfulFeedbackError } = await supabaseServer
    .from('ConversationUserFeedback')
    .select('id, conversation_type, conversation_id, message_id, rating, created_at, updated_at')
    .eq('rating', 'helpful')
    .gte('updated_at', periodStart.toISOString())
    .lte('updated_at', periodEnd.toISOString())
    .order('updated_at', { ascending: true })
    .limit(200)

  if (helpfulFeedbackError) throw helpfulFeedbackError

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

  let usedHelpful = new Set<string>()
  if ((helpfulFeedback || []).length > 0) {
    const { data: usedHelpfulRows, error: usedHelpfulError } = await supabaseServer
      .from('WeeklyLearningRunFeedback')
      .select('feedback_id')
      .in('feedback_id', (helpfulFeedback || []).map((item) => item.id))

    if (usedHelpfulError) throw usedHelpfulError
    usedHelpful = new Set((usedHelpfulRows || []).map((row) => row.feedback_id))
  }

  const newHelpfulFeedback = (helpfulFeedback || []).filter((item) => !usedHelpful.has(item.id))

  const { data: run, error: runError } = await supabaseServer
    .from('WeeklyLearningRuns')
    .insert({
      trigger_type: triggerType,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      status: 'running',
      review_count: newReviews.length,
      helpful_count: newHelpfulFeedback.length,
      model_name: WEEKLY_MODEL,
    })
    .select('id, created_at, period_start, period_end, trigger_type, status, review_count, helpful_count, source_checked_count, source_issue_count')
    .single()

  if (runError || !run) throw runError || new Error('Could not create weekly learning run.')

  try {
    const sourceAudit = await runWeeklySourceAudit(run.id, periodStart, periodEnd)

    if (newReviews.length === 0 && newHelpfulFeedback.length === 0) {
      const synopsis = `No new Corrected/Resolved Admin reviews or technician Helpful signals were available for weekly learning. Verified Source audit checked ${sourceAudit.checkedCount} unique recent links and found ${sourceAudit.issueCount} exception${sourceAudit.issueCount === 1 ? '' : 's'}.`
      const { data: completed, error } = await supabaseServer
        .from('WeeklyLearningRuns')
        .update({
          status: 'completed',
          guidance_count: 0,
          helpful_count: 0,
          source_checked_count: sourceAudit.checkedCount,
          source_issue_count: sourceAudit.issueCount,
          synopsis,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)
        .select('*')
        .single()

      if (error) throw error
      return { run: completed, guidance: [], sourceAudit }
    }

    const technicianConversationIds = [...new Set([
      ...newReviews.filter((review) => review.conversation_type === 'technician').map((review) => review.conversation_id),
      ...newHelpfulFeedback.filter((item) => item.conversation_type === 'technician').map((item) => item.conversation_id),
    ])]
    const managementConversationIds = [...new Set([
      ...newReviews.filter((review) => review.conversation_type === 'management').map((review) => review.conversation_id),
      ...newHelpfulFeedback.filter((item) => item.conversation_type === 'management').map((item) => item.conversation_id),
    ])]

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

    const positiveExamples = newHelpfulFeedback.map((feedback) => {
      const rows = messagesByConversation.get(feedback.conversation_id) || []
      const targetIndex = rows.findIndex((row) => row.id === feedback.message_id)
      const helpfulAnswer = targetIndex >= 0 ? rows[targetIndex]?.content || '' : ''
      const userQuestion = targetIndex > 0
        ? [...rows.slice(0, targetIndex)].reverse().find((row) => row.role === 'user')?.content || ''
        : ''

      return {
        feedback_id: feedback.id,
        audience: feedback.conversation_type === 'technician' ? 'technician' : 'management',
        user_question: userQuestion,
        helpful_answer: helpfulAnswer,
        signal: 'technician_marked_helpful',
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

You receive two separate learning streams from the last week plus the currently active Guidance Library:
1. HUMAN-REVIEWED CORRECTIONS: Admin-confirmed corrections/resolutions. These are trusted for technical and behavioral guidance.
2. POSITIVE HELPFUL EXAMPLES: answers technicians marked Helpful. These are evidence that the answer was useful, clear, well-structured, or field-effective, but they are NOT proof that every technical fact in the answer was correct.

Your job is to:
1. Write a concise weekly synopsis covering both corrections and positive Helpful signals.
2. From Admin-reviewed corrections, identify repeated or important lessons that should improve technical accuracy, safety, reasoning, or behavior.
3. From Helpful examples, identify positive patterns in clarity, usefulness, structure, tone, memory use, workflow, or field practicality.
4. Do NOT treat a Helpful click as technical verification. Never create a technical fact, part-number rule, code rule, manufacturer requirement, safety rule, or specification solely because an AI answer was marked Helpful.
5. A Helpful example may reinforce a technical behavior only when that behavior is already supported by an Admin-reviewed correction or existing active guidance.
6. Generalize lessons when that makes them more reusable across products, manufacturers, or trades.
7. Keep genuinely product-specific guidance specific when generalizing would make it less accurate.
8. Do NOT create guidance that merely repeats an existing active rule.
9. Prefer a small number of durable rules over many narrow rules.
10. If neither stream justifies any new durable guidance, return an empty guidance array.

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
      input: `HUMAN-REVIEWED CORRECTIONS:\n${JSON.stringify(learningExamples)}\n\nPOSITIVE HELPFUL EXAMPLES:\n${JSON.stringify(positiveExamples)}\n\nCURRENT ACTIVE GUIDANCE:\n${JSON.stringify(activeGuidance || [])}`,
    })

    await recordAIUsage({
      feature: 'weekly_learning',
      endpoint: '/api/cron/weekly-learning',
      model: WEEKLY_MODEL,
      response,
      metadata: { trigger_type: triggerType, run_id: run.id },
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

    if (newHelpfulFeedback.length > 0) {
      const { error: helpfulLinkError } = await supabaseServer
        .from('WeeklyLearningRunFeedback')
        .insert(newHelpfulFeedback.map((item) => ({ run_id: run.id, feedback_id: item.id })))

      if (helpfulLinkError) throw helpfulLinkError
    }

    const { data: completedRun, error: completeError } = await supabaseServer
      .from('WeeklyLearningRuns')
      .update({
        status: 'completed',
        review_count: newReviews.length,
        helpful_count: newHelpfulFeedback.length,
        guidance_count: insertedGuidance.length,
        source_checked_count: sourceAudit.checkedCount,
        source_issue_count: sourceAudit.issueCount,
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
      sourceAudit,
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
