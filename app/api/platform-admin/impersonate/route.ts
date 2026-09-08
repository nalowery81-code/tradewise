import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

const userCookieName = 'tradewise_platform_user'
const companyCookieName = 'tradewise_platform_company'

const getCookie = (request: Request, name: string) => {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const profileId = String(body?.profileId || '').trim()

  const { data: target, error } = await supabaseServer
    .from('UserProfiles')
    .select('id, auth_user_id, company_id, role, is_active, is_platform_admin')
    .eq('id', profileId)
    .single()

  if (error || !target) {
    return Response.json({ error: 'User not found.' }, { status: 404 })
  }

  if (target.is_active === false) {
    return Response.json({ error: 'Inactive users cannot be impersonated.' }, { status: 400 })
  }

  if (target.is_platform_admin === true) {
    return Response.json({ error: 'Platform administrators cannot be impersonated.' }, { status: 400 })
  }

  if (!['owner', 'manager'].includes(target.role || '')) {
    return Response.json({ error: 'Switch User currently supports owners and managers.' }, { status: 400 })
  }

  const { data: company } = await supabaseServer
    .from('Companies')
    .select('id, name, status')
    .eq('id', target.company_id)
    .single()

  if (!company || company.status === 'disabled') {
    return Response.json({ error: 'This company is not available.' }, { status: 400 })
  }

  const { data: authUserResult } = await supabaseServer.auth.admin.getUserById(target.auth_user_id)
  const email = authUserResult?.user?.email || 'Unknown user'

  await supabaseServer.from('PlatformImpersonationAudit').insert({
    admin_profile_id: access.profile.id,
    target_profile_id: target.id,
    target_company_id: target.company_id,
    action: 'start',
  })

  const headers = new Headers({ 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', `${userCookieName}=${encodeURIComponent(target.id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400`)
  headers.append('Set-Cookie', `${companyCookieName}=${encodeURIComponent(target.company_id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400`)

  return Response.json(
    {
      impersonating: true,
      user: { id: target.id, email, role: target.role },
      company: { id: company.id, name: company.name },
    },
    { headers }
  )
}

export async function DELETE(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const targetProfileId = getCookie(request, userCookieName)

  if (targetProfileId) {
    const { data: target } = await supabaseServer
      .from('UserProfiles')
      .select('id, company_id')
      .eq('id', targetProfileId)
      .maybeSingle()

    if (target) {
      await supabaseServer.from('PlatformImpersonationAudit').insert({
        admin_profile_id: access.profile.id,
        target_profile_id: target.id,
        target_company_id: target.company_id,
        action: 'stop',
      })
    }
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', `${userCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
  headers.append('Set-Cookie', `${companyCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)

  return Response.json({ cleared: true }, { headers })
}
