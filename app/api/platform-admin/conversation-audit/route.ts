import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

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
          .select('id, company_id, technician_id, title, created_at, updated_at, status')
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
        .select('id, company_id, technician_id, title, created_at, updated_at, status')
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
      }
    })

    const conversations = [...technicianRows, ...managementRows].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    )

    return jsonNoStore({
      conversations,
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
