import { requireManagementAccess } from '../../../lib/management-auth'
import { supabaseServer } from '../../../lib/supabase-server'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init?.headers || {}) },
  })

export async function GET(request: Request) {
  try {
    const auth = await requireManagementAccess(request, { ownerOnly: true })
    if ('error' in auth) return auth.error

    const companyId = auth.profile.company_id
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [
      { data: company, error: companyError },
      { data: managerProfiles, error: managerError },
      { data: technicians, error: technicianError },
      { data: assignments, error: assignmentError },
      { data: followUps, error: followUpError },
      { data: conversations, error: conversationError },
      { data: reflections, error: reflectionError },
      authUsersResult,
    ] = await Promise.all([
      supabaseServer
        .from('Companies')
        .select('id, name')
        .eq('id', companyId)
        .single(),
      supabaseServer
        .from('UserProfiles')
        .select('id, auth_user_id, is_active, technician_id')
        .eq('company_id', companyId)
        .eq('role', 'manager')
        .order('created_at', { ascending: true }),
      supabaseServer
        .from('Technicians')
        .select('id, canonical_name')
        .eq('company_id', companyId)
        .order('canonical_name', { ascending: true }),
      supabaseServer
        .from('ManagerTechnicians')
        .select('manager_profile_id, technician_id')
        .eq('company_id', companyId),
      supabaseServer
        .from('ManagerFollowUps')
        .select('id, technician_id, status, created_at, updated_at')
        .eq('company_id', companyId),
      supabaseServer
        .from('Conversations')
        .select('technician_id, created_at, updated_at')
        .eq('company_id', companyId),
      supabaseServer
        .from('Reflections')
        .select('technician_id, technician_name, created_at')
        .eq('company_id', companyId),
      supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ])

    const firstError =
      companyError || managerError || technicianError || assignmentError ||
      followUpError || conversationError || reflectionError || authUsersResult.error

    if (firstError || !company) {
      console.error('OWNER OVERVIEW LOAD ERROR:', firstError)
      return jsonNoStore({ error: 'Could not load owner overview.' }, { status: 500 })
    }

    // When a technician is promoted to manager, we intentionally keep their old
    // technician row linked through UserProfiles.technician_id so their historical
    // conversations/reflections are preserved. That historical identity should not
    // still count as a current technician in the owner dashboard.
    const historicalManagerTechnicianIds = new Set(
      (managerProfiles || [])
        .map((profile) => profile.technician_id)
        .filter((id): id is string => Boolean(id))
    )

    const techRows = (technicians || []).filter(
      (technician) => !historicalManagerTechnicianIds.has(technician.id)
    )
    const currentTechIds = new Set(techRows.map((technician) => technician.id))
    const techById = new Map(techRows.map((technician) => [technician.id, technician]))
    const techIdByName = new Map(
      techRows.map((technician) => [String(technician.canonical_name || '').trim().toLowerCase(), technician.id])
    )
    const authById = new Map(authUsersResult.data.users.map((user) => [user.id, user]))

    const managerTechIds = new Map<string, Set<string>>()
    const assignedTechIds = new Set<string>()

    for (const assignment of assignments || []) {
      if (!assignment.manager_profile_id || !assignment.technician_id) continue
      if (!currentTechIds.has(assignment.technician_id)) continue
      assignedTechIds.add(assignment.technician_id)
      const current = managerTechIds.get(assignment.manager_profile_id) || new Set<string>()
      current.add(assignment.technician_id)
      managerTechIds.set(assignment.manager_profile_id, current)
    }

    const openFollowUps = (followUps || []).filter((followUp) => followUp.status !== 'completed')
    const openFollowUpsByTech = new Map<string, number>()
    for (const followUp of openFollowUps) {
      if (!followUp.technician_id) continue
      openFollowUpsByTech.set(
        followUp.technician_id,
        (openFollowUpsByTech.get(followUp.technician_id) || 0) + 1
      )
    }

    type Activity = { count7d: number; latestAt: string | null }
    const activityByTech = new Map<string, Activity>()

    const addActivity = (technicianId: string | null | undefined, timestamp: string | null | undefined) => {
      if (!technicianId || !timestamp) return
      const current = activityByTech.get(technicianId) || { count7d: 0, latestAt: null }
      if (timestamp >= sevenDaysAgo) current.count7d += 1
      if (!current.latestAt || timestamp > current.latestAt) current.latestAt = timestamp
      activityByTech.set(technicianId, current)
    }

    for (const conversation of conversations || []) {
      addActivity(conversation.technician_id, conversation.updated_at || conversation.created_at)
    }

    for (const reflection of reflections || []) {
      const technicianId = reflection.technician_id ||
        techIdByName.get(String(reflection.technician_name || '').trim().toLowerCase()) || null
      addActivity(technicianId, reflection.created_at)
    }

    const managers = (managerProfiles || []).map((profile) => {
      const authUser = profile.auth_user_id ? authById.get(profile.auth_user_id) : null
      const email = authUser?.email || ''
      const name = String(authUser?.user_metadata?.full_name || '').trim() ||
        String(authUser?.user_metadata?.name || '').trim() ||
        (email ? email.split('@')[0] : 'Manager')
      const technicianIds = [...(managerTechIds.get(profile.id) || new Set<string>())]

      let managerOpenFollowUps = 0
      let recentActivity7d = 0
      let lastActivityAt: string | null = null

      for (const technicianId of technicianIds) {
        managerOpenFollowUps += openFollowUpsByTech.get(technicianId) || 0
        const activity = activityByTech.get(technicianId)
        if (!activity) continue
        recentActivity7d += activity.count7d
        if (activity.latestAt && (!lastActivityAt || activity.latestAt > lastActivityAt)) {
          lastActivityAt = activity.latestAt
        }
      }

      return {
        id: profile.id,
        name,
        email,
        isActive: profile.is_active !== false,
        technicianCount: technicianIds.length,
        technicians: technicianIds
          .map((technicianId) => techById.get(technicianId))
          .filter(Boolean)
          .map((technician) => ({ id: technician!.id, name: technician!.canonical_name })),
        openFollowUps: managerOpenFollowUps,
        recentActivity7d,
        lastActivityAt,
      }
    })

    const activeTechnicians7d = techRows.filter((technician) => {
      const activity = activityByTech.get(technician.id)
      return Boolean(activity?.latestAt && activity.latestAt >= sevenDaysAgo)
    }).length

    const unassignedTechnicians = techRows
      .filter((technician) => !assignedTechIds.has(technician.id))
      .map((technician) => ({ id: technician.id, name: technician.canonical_name }))

    let latestCompanyActivityAt: string | null = null
    for (const activity of activityByTech.values()) {
      if (activity.latestAt && (!latestCompanyActivityAt || activity.latestAt > latestCompanyActivityAt)) {
        latestCompanyActivityAt = activity.latestAt
      }
    }

    return jsonNoStore({
      company,
      snapshot: {
        managers: managers.length,
        activeManagers: managers.filter((manager) => manager.isActive).length,
        technicians: techRows.length,
        assignedTechnicians: assignedTechIds.size,
        unassignedTechnicians: unassignedTechnicians.length,
        openFollowUps: openFollowUps.length,
        activeTechnicians7d,
        latestCompanyActivityAt,
      },
      managers,
      unassignedTechnicians,
    })
  } catch (error: any) {
    console.error('OWNER OVERVIEW API ERROR:', error)
    return jsonNoStore({ error: error?.message || 'Could not load owner overview.' }, { status: 500 })
  }
}
