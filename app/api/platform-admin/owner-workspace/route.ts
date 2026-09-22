import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const { data: company, error } = await supabaseServer
    .from('Companies')
    .select('id, name, status, account_type')
    .eq('account_type', 'internal')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !company) {
    return Response.json(
      { error: 'No active internal owner workspace is configured.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' })
  headers.append(
    'Set-Cookie',
    `tradewise_platform_company=${encodeURIComponent(company.id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400`
  )
  headers.append(
    'Set-Cookie',
    'tradewise_platform_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  )

  return Response.json({ company }, { headers })
}
