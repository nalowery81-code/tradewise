import { supabaseServer } from '../../../../lib/supabase-server'
import { requireManagementAccess } from '../../../../lib/management-auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireManagementAccess(request)
    if ('error' in auth) return auth.error

    const { id } = await params
    const body = await request.json()
    const status = body?.status === 'done' ? 'done' : body?.status === 'open' ? 'open' : null

    if (!status) {
      return Response.json({ error: 'Status must be open or done.' }, { status: 400 })
    }

    const updatedAt = new Date().toISOString()
    const completedAt = status === 'done' ? updatedAt : null

    const { data, error } = await supabaseServer
      .from('ManagerFollowUps')
      .update({ status, completed_at: completedAt, updated_at: updatedAt })
      .eq('company_id', auth.profile.company_id)
      .eq('id', id)
      .select('id, technician_id, technician_name, note, status, created_at, completed_at, updated_at')
      .single()

    if (error || !data) {
      console.error('MANAGER FOLLOW-UP UPDATE ERROR:', error)
      return Response.json({ error: 'Could not update follow-up.' }, { status: 500 })
    }

    return Response.json({ followUp: data })
  } catch (error: any) {
    console.error('MANAGER FOLLOW-UP UPDATE API ERROR:', error)
    return Response.json({ error: error?.message || 'Could not update follow-up.' }, { status: 500 })
  }
}
