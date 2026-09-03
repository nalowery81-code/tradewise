import { supabaseServer } from '../../../../lib/supabase-server'
import { requireManagementAccess } from '../../../../lib/management-auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireManagementAccess(request)
    if ('error' in auth) return auth.error

    const companyId = auth.profile.company_id
    const { id } = await params

    const { data: technician, error: technicianError } = await supabaseServer
      .from('Technicians')
      .select('id, canonical_name')
      .eq('company_id', companyId)
      .eq('id', id)
      .single()

    if (technicianError || !technician) {
      return Response.json({ error: 'Technician not found.' }, { status: 404 })
    }

    let { data: reflections, error: reflectionError } = await supabaseServer
      .from('Reflections')
      .select('job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
      .eq('company_id', companyId)
      .eq('technician_id', technician.id)
      .order('created_at', { ascending: false })
      .limit(12)

    if (reflectionError) {
      console.error('MANAGER TECHNICIAN PROFILE REFLECTION ERROR:', reflectionError)
      return Response.json({ error: 'Could not load technician history.' }, { status: 500 })
    }

    if (!reflections?.length) {
      const fallback = await supabaseServer
        .from('Reflections')
        .select('job_type, challenge, what_went_well, help_needed, manager_insight, created_at')
        .eq('company_id', companyId)
        .eq('technician_name', technician.canonical_name)
        .order('created_at', { ascending: false })
        .limit(12)

      if (fallback.error) {
        console.error('MANAGER TECHNICIAN PROFILE NAME FALLBACK ERROR:', fallback.error)
      } else {
        reflections = fallback.data || []
      }
    }

    const { data: managerNote, error: noteError } = await supabaseServer
      .from('ManagerNotes')
      .select('note, updated_at')
      .eq('company_id', companyId)
      .eq('technician_id', technician.id)
      .maybeSingle()

    if (noteError) {
      console.error('MANAGER TECHNICIAN PROFILE NOTE ERROR:', noteError)
    }

    return Response.json({
      technician: {
        id: technician.id,
        name: technician.canonical_name,
      },
      reflections: reflections || [],
      managerNote: managerNote || null,
    })
  } catch (error: any) {
    console.error('MANAGER TECHNICIAN PROFILE API ERROR:', error)
    return Response.json({ error: error?.message || 'Could not load technician profile.' }, { status: 500 })
  }
}
