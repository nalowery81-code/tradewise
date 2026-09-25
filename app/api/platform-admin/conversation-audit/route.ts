import OpenAI from 'openai'
import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { recordAIUsage } from '../../../lib/ai-usage'
import { supabaseServer } from '../../../lib/supabase-server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const AUDIT_MODEL = 'gpt-5.6-luna'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) },
  })

const getDisplayName = (user: any) => {
  const metadataName =
    typeof user?.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name.trim()
      : typeof user?.user_metadata?.name === 'string'
        ? user.user_metadata.name.trim()
        : ''
  return metadataName || user?.email || 'Unknown user'
}

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  try {
    const url = new URL(request.url)
    const conversationId = url.searchParams.get('conversationId')?.trim() || ''
    const conversationType = url.searchParams.get('conversationType')?.trim() || ''

    if (conversationId) {
      if (!['technician', 'management'].includes(conversationType)) {
        return jsonNoStore({ error: 'Conversation type is required.' }, { status: 400 })
      }

      if (conversationType === 'technician') {
        const { data: conversation, error: conversationError } = await supabaseServer
          .from('Conversations')
          .select('id, company_id, technician_id, title, created_at, updated_at, status, jurisdiction')
          .eq('id', conversationId)
          .single()

        if (conversationError || !conversation) {
          return jsonNoStore({ error: 'Conversation not found.' }, { status: 404 })
        }

        const [
          { data: technician },
          { data: company },
          { data: messages, error: messagesError },
        ] = await Promise.all([
          supabaseServer
            .from('Technicians')
            .select('id, canonical_name, auth_user_id')
            .eq('id', conversation.technician_id)
            .maybeSingle(),
          supabaseServer
            .from('Companies')
            .select('id, name')
            .eq('id', conversation.company_id)
            .maybeSingle(),
          supabaseServer
            .from('Messages')
            .select('id, role, content, image_url, created_at, sources')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true }),
        ])

        if (messagesError) throw messagesError

        let email = ''
        if (technician?.auth_user_id) {
          const authResult = await supabaseServer.auth.admin.getUserById(technician.auth_user_id)
          email = authResult.data?.user?.email || ''
        }

        return jsonNoStore({
          conversation: {
            id: conversation.id,
            type: 'technician',
            role: 'technician',
            title: conversation.title || 'Technician conversation',
            companyId: conversation.company_id,
            companyName: company?.name || 'Unknown company',
            userName: technician?.canonical_name || email || 'Unknown technician',
            userEmail: email,
            createdAt: conversation.created_at,
            updatedAt: conversation.updated_at,
            modelName: 'gpt-5.6-luna',
            contextType: 'chat',
            jurisdiction: conversation.jurisdiction || null,
          },
          messages: (messages || []).map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            imageUrl: message.image_url || null,
            createdAt: message.created_at,
            sources: Array.isArray(message.sources) ? message.sources : [],
          })),
          reviews: (await supabaseServer
            .from('ConversationAuditReviews')
            .select('id, message_id, status, category, correction_note, corrected_answer, updated_at')
            .eq('conversation_type', 'technician')
            .eq('conversation_id', conversationId)).data || [],
          feedbackRequests: (await supabaseServer
            .from('ConversationFeedbackRequests')
            .select('id, message_id, question, status, rating, response_text, created_at, responded_at')
            .eq('conversation_type', 'technician')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })).data || [],
          flags: (await supabaseServer
            .from('ConversationAuditFlags')
            .select('id, message_id, reporter_role, comment, status, created_at, reviewed_at')
            .eq('conversation_type', 'technician')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })).data || [],
          userFeedback: (await supabaseServer
            .from('ConversationUserFeedback')
            .select('id, message_id, rating, created_at, updated_at')
            .eq('conversation_type', 'technician')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })).data || [],
        })
      }

      const { data: conversation, error: conversationError } = await supabaseServer
        .from('ManagementConversations')
        .select('id, company_id, profile_id, user_role, context_type, title, model_name, created_at, updated_at')
        .eq('id', conversationId)
        .single()

      if (conversationError || !conversation) {
        return jsonNoStore({ error: 'Conversation not found.' }, { status: 404 })
      }

      const [
        { data: company },
        { data: profile },
        { data: messages, error: messagesError },
      ] = await Promise.all([
        supabaseServer.from('Companies').select('id, name').eq('id', conversation.company_id).maybeSingle(),
        supabaseServer.from('UserProfiles').select('id, auth_user_id').eq('id', conversation.profile_id).maybeSingle(),
        supabaseServer
          .from('ManagementMessages')
          .select('id, role, content, created_at, model_name, sources')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true }),
      ])

      if (messagesError) throw messagesError

      let userName = 'Unknown user'
      let userEmail = ''
      if (profile?.auth_user_id) {
        const authResult = await supabaseServer.auth.admin.getUserById(profile.auth_user_id)
        const authUser = authResult.data?.user
        userName = getDisplayName(authUser)
        userEmail = authUser?.email || ''
      }

      return jsonNoStore({
        conversation: {
          id: conversation.id,
          type: 'management',
          role: conversation.user_role,
          title: conversation.title || 'Management conversation',
          companyId: conversation.company_id,
          companyName: company?.name || 'Unknown company',
          userName,
          userEmail,
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
          modelName: conversation.model_name || null,
          contextType: conversation.context_type,
        },
        messages: (messages || []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          imageUrl: null,
          createdAt: message.created_at,
          modelName: message.model_name || null,
          sources: Array.isArray(message.sources) ? message.sources : [],
        })),
        reviews: (await supabaseServer
          .from('ConversationAuditReviews')
          .select('id, message_id, status, category, correction_note, corrected_answer, updated_at')
          .eq('conversation_type', 'management')
          .eq('conversation_id', conversationId)).data || [],
        feedbackRequests: (await supabaseServer
          .from('ConversationFeedbackRequests')
          .select('id, message_id, question, status, rating, response_text, created_at, responded_at')
          .eq('conversation_type', 'management')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })).data || [],
        flags: (await supabaseServer
          .from('ConversationAuditFlags')
          .select('id, message_id, reporter_role, comment, status, created_at, reviewed_at')
          .eq('conversation_type', 'management')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })).data || [],
        userFeedback: (await supabaseServer
          .from('ConversationUserFeedback')
          .select('id, message_id, rating, created_at, updated_at')
          .eq('conversation_type', 'management')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })).data || [],
      })
    }

    const [
      { data: companies, error: companiesError },
      { data: technicians, error: techniciansError },
      { data: profiles, error: profilesError },
      { data: technicianConversations, error: techConversationsError },
      { data: managementConversations, error: managementConversationsError },
      authResult,
    ] = await Promise.all([
      supabaseServer.from('Companies').select('id, name'),
      supabaseServer.from('Technicians').select('id, company_id, canonical_name, auth_user_id'),
      supabaseServer.from('UserProfiles').select('id, auth_user_id, company_id, role'),
      supabaseServer
        .from('Conversations')
        .select('id, company_id, technician_id, title, created_at, updated_at, status, jurisdiction')
        .order('updated_at', { ascending: false })
        .limit(500),
      supabaseServer
        .from('ManagementConversations')
        .select('id, company_id, profile_id, user_role, context_type, title, model_name, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(500),
      supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ])

    if (
      companiesError ||
      techniciansError ||
      profilesError ||
      techConversationsError ||
      managementConversationsError ||
      authResult.error
    ) {
      console.error('PLATFORM CONVERSATION AUDIT LOAD ERROR:', {
        companiesError,
        techniciansError,
        profilesError,
        techConversationsError,
        managementConversationsError,
        authError: authResult.error,
      })
      return jsonNoStore({ error: 'Could not load conversation audit.' }, { status: 500 })
    }

    const companyById = new Map((companies || []).map((company) => [company.id, company.name]))
    const technicianById = new Map((technicians || []).map((technician) => [technician.id, technician]))
    const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]))
    const authById = new Map(authResult.data.users.map((user) => [user.id, user]))

    const technicianRows = (technicianConversations || []).map((conversation) => {
      const technician = technicianById.get(conversation.technician_id)
      const authUser = technician?.auth_user_id ? authById.get(technician.auth_user_id) : undefined
      return {
        id: conversation.id,
        type: 'technician',
        role: 'technician',
        title: conversation.title || 'Technician conversation',
        companyId: conversation.company_id,
        companyName: companyById.get(conversation.company_id) || 'Unknown company',
        userName: technician?.canonical_name || getDisplayName(authUser),
        userEmail: authUser?.email || '',
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        contextType: 'chat',
        modelName: 'gpt-5.6-luna',
        jurisdiction: conversation.jurisdiction || null,
      }
    })

    const managementRows = (managementConversations || []).map((conversation) => {
      const profile = profileById.get(conversation.profile_id)
      const authUser = profile?.auth_user_id ? authById.get(profile.auth_user_id) : undefined
      return {
        id: conversation.id,
        type: 'management',
        role: conversation.user_role,
        title: conversation.title || 'Management conversation',
        companyId: conversation.company_id,
        companyName: companyById.get(conversation.company_id) || 'Unknown company',
        userName: getDisplayName(authUser),
        userEmail: authUser?.email || '',
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        contextType: conversation.context_type,
        modelName: conversation.model_name || null,
        jurisdiction: null,
      }
    })

    const conversations = [...technicianRows, ...managementRows].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    )

    const auditWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [
      { data: pendingFlags, error: pendingFlagsError },
      { data: helpfulSignals, error: helpfulSignalsError },
      { data: recentReviews, error: recentReviewsError },
    ] = await Promise.all([
      supabaseServer
        .from('ConversationAuditFlags')
        .select('conversation_type, conversation_id')
        .eq('status', 'pending'),
      supabaseServer
        .from('ConversationUserFeedback')
        .select('conversation_type, conversation_id')
        .eq('rating', 'helpful')
        .gte('updated_at', auditWeekAgo),
      supabaseServer
        .from('ConversationAuditReviews')
        .select('conversation_type, conversation_id, status')
        .in('status', ['good','corrected','resolved'])
        .gte('updated_at', auditWeekAgo),
    ])

    if (pendingFlagsError) console.error('PENDING AUDIT FLAGS LOAD ERROR:', pendingFlagsError)
    if (helpfulSignalsError) console.error('HELPFUL AUDIT SIGNALS LOAD ERROR:', helpfulSignalsError)
    if (recentReviewsError) console.error('RECENT AUDIT REVIEWS LOAD ERROR:', recentReviewsError)

    const flagCounts = new Map<string, number>()
    const helpfulCounts = new Map<string, number>()
    const reviewedCounts = new Map<string, number>()

    for (const flag of pendingFlags || []) {
      const key = `${flag.conversation_type}:${flag.conversation_id}`
      flagCounts.set(key, (flagCounts.get(key) || 0) + 1)
    }
    for (const signal of helpfulSignals || []) {
      const key = `${signal.conversation_type}:${signal.conversation_id}`
      helpfulCounts.set(key, (helpfulCounts.get(key) || 0) + 1)
    }
    for (const review of recentReviews || []) {
      const key = `${review.conversation_type}:${review.conversation_id}`
      reviewedCounts.set(key, (reviewedCounts.get(key) || 0) + 1)
    }

    const conversationsWithFlags = conversations.map((conversation) => {
      const key = `${conversation.type}:${conversation.id}`
      return {
        ...conversation,
        pendingFlagCount: flagCounts.get(key) || 0,
        helpful7dCount: helpfulCounts.get(key) || 0,
        reviewed7dCount: reviewedCounts.get(key) || 0,
      }
    })

    return jsonNoStore({
      conversations: conversationsWithFlags,
      companies: (companies || []).sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch (error) {
    console.error('PLATFORM CONVERSATION AUDIT ERROR:', error)
    return jsonNoStore({ error: 'Could not load conversation audit.' }, { status: 500 })
  }
}


export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '')
    const conversationType = String(body?.conversationType || '')
    const conversationId = String(body?.conversationId || '')
    const messageId = String(body?.messageId || '')

    if (!['technician', 'management'].includes(conversationType) || !conversationId) {
      return jsonNoStore({ error: 'Conversation is required.' }, { status: 400 })
    }

    if (action === 'draft_correction') {
      if (!messageId) return jsonNoStore({ error: 'Assistant message is required.' }, { status: 400 })

      const correctionNote = String(body?.correctionNote || '').trim()
      const category = String(body?.category || '').trim()

      if (!correctionNote) {
        return jsonNoStore({ error: 'Add an Admin finding first so the draft knows what to fix.' }, { status: 400 })
      }

      let rows: { id: string; role: string; content: string; created_at: string }[] = []

      if (conversationType === 'technician') {
        const { data, error } = await supabaseServer
          .from('Messages')
          .select('id, role, content, created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })

        if (error) throw error
        rows = data || []
      } else {
        const { data, error } = await supabaseServer
          .from('ManagementMessages')
          .select('id, role, content, created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })

        if (error) throw error
        rows = data || []
      }

      const targetIndex = rows.findIndex((row) => row.id === messageId)
      if (targetIndex < 0 || rows[targetIndex]?.role !== 'assistant') {
        return jsonNoStore({ error: 'Assistant message not found.' }, { status: 404 })
      }

      const contextRows = rows.slice(Math.max(0, targetIndex - 6), targetIndex + 1)
      const transcript = contextRows
        .map((row) => `${row.role === 'assistant' ? 'CraftCompass AI' : 'User'}: ${row.content}`)
        .join('\n\n')

      const response = await openai.responses.create({
        model: AUDIT_MODEL,
        instructions: `
You are helping a Platform Admin correct a CraftCompass AI response.

The original answer must remain preserved elsewhere. Your job is only to DRAFT a proposed replacement answer for the admin to review.

Rules:
- Follow the admin finding as the key correction signal.
- Use the supplied conversation context so the replacement answers the user's actual question.
- Do not invent facts, model numbers, prices, availability, code requirements, or sources.
- If the admin finding says the original answer recommended unnecessary items, remove those recommendations rather than merely softening them.
- Preserve useful parts of the original response that are not contradicted by the admin finding.
- Keep the answer practical and field-oriented.
- Do not mention this audit, the admin, or that the prior answer was wrong.
- Do not add citations or URLs unless they are already present in the supplied conversation and necessary to the answer.
- Return only the proposed corrected answer.
        `.trim(),
        input: `Conversation context:\n\n${transcript}\n\nAdmin category: ${category || 'other'}\nAdmin finding: ${correctionNote}\n\nDraft the corrected CraftCompass response.`,
      })

      await recordAIUsage({
        feature: 'audit_correction_draft',
        endpoint: '/api/platform-admin/conversation-audit',
        model: AUDIT_MODEL,
        conversationType,
        conversationId,
        response,
      })

      const draft = response.output_text?.trim()
      if (!draft) return jsonNoStore({ error: 'Could not draft a corrected answer.' }, { status: 500 })

      return jsonNoStore({ draft, modelName: AUDIT_MODEL })
    }

    if (action === 'update_flag') {
      const flagId = String(body?.flagId || '')
      const status = String(body?.status || '')
      if (!flagId || !['confirmed', 'dismissed', 'resolved'].includes(status)) return jsonNoStore({ error: 'Invalid flag update.' }, { status: 400 })
      const { data, error } = await supabaseServer.from('ConversationAuditFlags').update({
        status, reviewed_by_admin_profile_id: access.profileId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', flagId).eq('conversation_type', conversationType).eq('conversation_id', conversationId)
        .select('id, message_id, reporter_role, comment, status, created_at, reviewed_at').single()
      if (error) return jsonNoStore({ error: 'Could not update audit flag.' }, { status: 500 })
      return jsonNoStore({ flag: data })
    }

    if (action === 'draft_guidance') {
      if (!messageId) return jsonNoStore({ error: 'Reviewed message is required.' }, { status: 400 })
      const { data: review, error: reviewError } = await supabaseServer.from('ConversationAuditReviews')
        .select('id, status, category, correction_note, corrected_answer')
        .eq('conversation_type', conversationType).eq('conversation_id', conversationId).eq('message_id', messageId).single()
      if (reviewError || !review || !['corrected', 'resolved'].includes(review.status)) return jsonNoStore({ error: 'Mark the review Corrected or Resolved before using Learn Now.' }, { status: 400 })
      if (!review.correction_note && !review.corrected_answer) return jsonNoStore({ error: 'The review needs an Admin finding or corrected answer first.' }, { status: 400 })

      let transcriptRows: { role: string; content: string }[] = []
      if (conversationType === 'technician') {
        const { data, error } = await supabaseServer.from('Messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: true })
        if (error) throw error
        transcriptRows = data || []
      } else {
        const { data, error } = await supabaseServer.from('ManagementMessages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: true })
        if (error) throw error
        transcriptRows = data || []
      }
      const transcript = transcriptRows.slice(-12).map((row) => `${row.role}: ${row.content}`).join('\n\n')
      const response = await openai.responses.create({
        model: AUDIT_MODEL,
        instructions: `Turn an expert-reviewed CraftCompass mistake into ONE concise reusable guidance rule for future answers. Generalize when appropriate. Preserve product-specific detail only when truly necessary. Do not mention the audit or reviewer. Guidance must tell CraftCompass what to DO or VERIFY. Return ONLY JSON: {"title":"short title","guidance_text":"1-3 concise sentences","topic":"short topic","scope":"all|technician|management","priority":1-100}`,
        input: `Conversation:\n${transcript}\n\nCategory: ${review.category || 'other'}\nAdmin finding: ${review.correction_note || ''}\nCorrected answer: ${review.corrected_answer || ''}`,
      })
      await recordAIUsage({
        feature: 'guidance_draft',
        endpoint: '/api/platform-admin/conversation-audit',
        model: AUDIT_MODEL,
        conversationType,
        conversationId,
        response,
      })

      const json = (response.output_text || '').replace(/^\`\`\`json\s*/i, '').replace(/^\`\`\`\s*/i, '').replace(/\`\`\`$/i, '').trim()
      let draft: any
      try { draft = JSON.parse(json) } catch { return jsonNoStore({ error: 'Could not turn this review into guidance.' }, { status: 500 }) }
      const title = String(draft?.title || '').trim()
      const guidanceText = String(draft?.guidance_text || '').trim()
      const topic = String(draft?.topic || '').trim()
      const scope = ['all','technician','management'].includes(draft?.scope) ? draft.scope : (conversationType === 'technician' ? 'technician' : 'management')
      const priority = Math.min(100, Math.max(1, Number.isFinite(Number(draft?.priority)) ? Math.round(Number(draft.priority)) : 80))
      if (!title || !guidanceText) return jsonNoStore({ error: 'Generated guidance was incomplete.' }, { status: 500 })
      const { data: latestFlag } = await supabaseServer.from('ConversationAuditFlags').select('id')
        .eq('conversation_type', conversationType).eq('conversation_id', conversationId).eq('message_id', messageId)
        .in('status', ['confirmed','resolved']).order('created_at', { ascending: false }).limit(1).maybeSingle()
      const { data: guidance, error } = await supabaseServer.from('GuidanceLibrary').insert({
        title, guidance_text: guidanceText, topic: topic || null, scope, priority, status: 'draft', source_review_id: review.id,
        source_flag_id: latestFlag?.id || null, created_by_admin_profile_id: access.profileId,
      }).select('id, title, guidance_text, topic, scope, priority, status, source_review_id').single()
      if (error) return jsonNoStore({ error: 'Could not save guidance draft.' }, { status: 500 })
      return jsonNoStore({ guidance })
    }

    if (action === 'activate_guidance') {
      const guidanceId = String(body?.guidanceId || '')
      if (!guidanceId) return jsonNoStore({ error: 'Guidance item is required.' }, { status: 400 })
      const { data, error } = await supabaseServer.from('GuidanceLibrary').update({ status: 'active', activated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', guidanceId).eq('created_by_admin_profile_id', access.profileId)
        .select('id, title, guidance_text, topic, scope, priority, status, source_review_id').single()
      if (error) return jsonNoStore({ error: 'Could not activate guidance.' }, { status: 500 })
      return jsonNoStore({ guidance: data })
    }

    if (action === 'save_review') {
      if (!messageId) return jsonNoStore({ error: 'Assistant message is required.' }, { status: 400 })

      const status = String(body?.status || 'needs_review')
      const category = String(body?.category || '').trim()
      const correctionNote = String(body?.correctionNote || '').trim()
      const correctedAnswer = String(body?.correctedAnswer || '').trim()

      if (!['good', 'needs_review', 'incorrect', 'corrected', 'resolved'].includes(status)) {
        return jsonNoStore({ error: 'Invalid review status.' }, { status: 400 })
      }

      const { data, error } = await supabaseServer
        .from('ConversationAuditReviews')
        .upsert({
          conversation_type: conversationType,
          conversation_id: conversationId,
          message_id: messageId,
          status,
          category: category || null,
          correction_note: correctionNote || null,
          corrected_answer: correctedAnswer || null,
          admin_profile_id: access.profileId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'conversation_type,message_id' })
        .select('id, message_id, status, category, correction_note, corrected_answer, updated_at')
        .single()

      if (error) {
        console.error('AUDIT REVIEW SAVE ERROR:', error)
        return jsonNoStore({ error: 'Could not save correction.' }, { status: 500 })
      }

      if (['corrected', 'resolved'].includes(status)) {
        await supabaseServer.from('ConversationAuditFlags').update({
          status: 'resolved', reviewed_by_admin_profile_id: access.profileId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('conversation_type', conversationType).eq('conversation_id', conversationId).eq('message_id', messageId).in('status', ['pending', 'confirmed'])
      }
      return jsonNoStore({ review: data })
    }

    if (action === 'request_feedback') {
      const question = String(body?.question || '').trim()
      if (!question) return jsonNoStore({ error: 'Feedback question is required.' }, { status: 400 })

      let targetAuthUserId: string | null = null

      if (conversationType === 'technician') {
        const { data: conversation } = await supabaseServer
          .from('Conversations')
          .select('technician_id')
          .eq('id', conversationId)
          .single()

        if (conversation?.technician_id) {
          const { data: technician } = await supabaseServer
            .from('Technicians')
            .select('auth_user_id')
            .eq('id', conversation.technician_id)
            .maybeSingle()
          targetAuthUserId = technician?.auth_user_id || null
        }
      } else {
        const { data: conversation } = await supabaseServer
          .from('ManagementConversations')
          .select('profile_id')
          .eq('id', conversationId)
          .single()

        if (conversation?.profile_id) {
          const { data: profile } = await supabaseServer
            .from('UserProfiles')
            .select('auth_user_id')
            .eq('id', conversation.profile_id)
            .maybeSingle()
          targetAuthUserId = profile?.auth_user_id || null
        }
      }

      if (!targetAuthUserId) {
        return jsonNoStore({ error: 'This user is no longer connected to a CraftCompass login.' }, { status: 400 })
      }

      const { data, error } = await supabaseServer
        .from('ConversationFeedbackRequests')
        .insert({
          conversation_type: conversationType,
          conversation_id: conversationId,
          message_id: messageId || null,
          target_auth_user_id: targetAuthUserId,
          requested_by_admin_profile_id: access.profileId,
          question,
          status: 'pending',
        })
        .select('id, message_id, question, status, rating, response_text, created_at, responded_at')
        .single()

      if (error) {
        console.error('FEEDBACK REQUEST CREATE ERROR:', error)
        return jsonNoStore({ error: 'Could not request feedback.' }, { status: 500 })
      }

      return jsonNoStore({ feedbackRequest: data })
    }

    return jsonNoStore({ error: 'Unknown audit action.' }, { status: 400 })
  } catch (error) {
    console.error('AUDIT ACTION ERROR:', error)
    return jsonNoStore({ error: 'Could not update conversation audit.' }, { status: 500 })
  }
}
