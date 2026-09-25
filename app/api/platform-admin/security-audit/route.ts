import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const [userAudit, impersonationAudit, profiles, companies, authUsers] = await Promise.all([
    supabaseServer.from('PlatformAdminUserAudit')
      .select('id, created_at, admin_profile_id, target_profile_id, action, before_state, after_state, note')
      .order('created_at', { ascending: false })
      .limit(250),
    supabaseServer.from('PlatformImpersonationAudit')
      .select('id, created_at, admin_profile_id, target_profile_id, target_company_id, action')
      .order('created_at', { ascending: false })
      .limit(250),
    supabaseServer.from('UserProfiles')
      .select('id, auth_user_id, company_id, role, preferred_name'),
    supabaseServer.from('Companies').select('id, name'),
    supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  const error = userAudit.error || impersonationAudit.error || profiles.error || companies.error || authUsers.error
  if (error) {
    console.error('SECURITY AUDIT LOAD ERROR:', error)
    return jsonNoStore({ error: 'Could not load security audit data.' }, { status: 500 })
  }

  const profileById = new Map((profiles.data || []).map((profile) => [profile.id, profile]))
  const companyById = new Map((companies.data || []).map((company) => [company.id, company.name]))
  const authById = new Map(authUsers.data.users.map((user) => [user.id, user]))

  const describeProfile = (profileId: string | null) => {
    if (!profileId) return null
    const profile = profileById.get(profileId)
    if (!profile) return { profileId, displayName: 'Unknown profile', email: '', role: '', companyName: '' }
    const auth = authById.get(profile.auth_user_id)
    const metadataName =
      typeof auth?.user_metadata?.full_name === 'string'
        ? auth.user_metadata.full_name.trim()
        : typeof auth?.user_metadata?.name === 'string'
          ? auth.user_metadata.name.trim()
          : ''
    return {
      profileId,
      displayName: profile.preferred_name || metadataName || auth?.email || 'Unnamed user',
      email: auth?.email || '',
      role: profile.role,
      companyName: companyById.get(profile.company_id) || '',
    }
  }

  const events = [
    ...(userAudit.data || []).map((row) => ({
      id: `user:${row.id}`,
      createdAt: row.created_at,
      category: 'user_admin',
      action: row.action,
      admin: describeProfile(row.admin_profile_id),
      target: describeProfile(row.target_profile_id),
      companyName: describeProfile(row.target_profile_id)?.companyName || '',
      note: row.note || '',
      beforeState: row.before_state,
      afterState: row.after_state,
    })),
    ...(impersonationAudit.data || []).map((row) => ({
      id: `impersonation:${row.id}`,
      createdAt: row.created_at,
      category: 'impersonation',
      action: row.action,
      admin: describeProfile(row.admin_profile_id),
      target: describeProfile(row.target_profile_id),
      companyName: companyById.get(row.target_company_id) || describeProfile(row.target_profile_id)?.companyName || '',
      note: '',
      beforeState: null,
      afterState: null,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const actionCounts = events.reduce<Record<string, number>>((counts, event) => {
    counts[event.action] = (counts[event.action] || 0) + 1
    return counts
  }, {})

  return jsonNoStore({
    generatedAt: new Date().toISOString(),
    events: events.slice(0, 400),
    summary: {
      totalEvents: events.length,
      userAdminEvents: events.filter((event) => event.category === 'user_admin').length,
      impersonationEvents: events.filter((event) => event.category === 'impersonation').length,
      actionCounts,
    },
  })
}
