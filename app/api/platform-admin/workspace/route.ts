import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

const cookieName = 'tradewise_platform_company'

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const companyId = String(body?.companyId || '').trim()

  const { data: company, error } = await supabaseServer
    .from('Companies')
    .select('id, name, status')
    .eq('id', companyId)
    .single()

  if (error || !company) {
    return Response.json({ error: 'Company not found.' }, { status: 404 })
  }

  if (company.status === 'disabled') {
    return Response.json({ error: 'This company is disabled.' }, { status: 400 })
  }

  return Response.json(
    { company },
    {
      headers: {
        'Set-Cookie': `${cookieName}=${encodeURIComponent(company.id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400`,
        'Cache-Control': 'no-store',
      },
    }
  )
}

export async function DELETE(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  return Response.json(
    { cleared: true },
    {
      headers: {
        'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
        'Cache-Control': 'no-store',
      },
    }
  )
}
