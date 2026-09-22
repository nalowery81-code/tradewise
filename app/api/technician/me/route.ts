import { requireEffectiveTechnician } from '../../../lib/technician-access'

export async function GET(request: Request) {
  const access = await requireEffectiveTechnician(request)
  if ('error' in access) return access.error

  return Response.json(
    { technician: access.technician, impersonating: access.impersonating },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
