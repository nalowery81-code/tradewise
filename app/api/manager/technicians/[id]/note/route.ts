import { supabaseServer } from '../../../../../lib/supabase-server'
import { requireManagementAccess } from '../../../../../lib/management-auth'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireManagementAccess(request)
    if ('error' in auth) return auth.error

    const companyId = auth.profile.company_id
    const { id } = await params
    const body = await request.json()
    const note = typeof body?.note === 'string' ? body.note.trim() : ''

    const { data: technician, error: technicianError } = await supabaseServer
      .from('Technicians')
      .select('id, canonical_name')
      .eq('company_id', companyId)
      .eq('id', id)
      .single()

    if (technicianError || !technician) {
      return Response.json({ error: 'Technician not found.' }, { status: 404 })
    }

    const updatedAt = new Date().toISOString()

    const { error: noteError } = await supabaseServer
      .from('ManagerNotes')
      .upsert(
        [
          {
            company_id: companyId,
            technician_id: technician.id,
            technician_name: technician.canonical_name,
            note,
            updated_at: updatedAt,
          },
        ],
        { onConflict: 'company_id,technician_id' }
      )

    if (noteError) {
      console.error('MANAGER NOTE SAVE ERROR:', noteError)
      return Response.json({ error: 'Could not save manager note.' }, { status: 500 })
    }

    return Response.json({ managerNote: { note, updated_at: updatedAt } })
  } catch (error: any) {
    console.error('MANAGER NOTE API ERROR:', error)
    return Response.json({ error: error?.message || 'Could not save manager note.' }, { status: 500 })
  }
}
