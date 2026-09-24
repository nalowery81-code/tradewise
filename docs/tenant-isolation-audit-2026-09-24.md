# CraftCompass AI — Tenant Isolation Audit

Date: 2026-09-24
Scope: Commit 1 — audit only. No production behavior or database schema changes.

## Executive summary

CraftCompass already has a strong multi-company foundation. Core tenant-owned records are company-scoped, the management APIs consistently derive company context from authenticated UserProfiles, manager-to-technician scope is enforced, and technician Conversations/Reflections are forced to the technician's company by a database trigger.

Current data checks found:
- 0 tenant-owned core rows with a missing company_id.
- 0 cross-company mismatches in ManagerTechnicians, ManagerNotes, ManagerFollowUps, Reflections, or Conversations.
- RLS is enabled on all public tables inspected.

The main risk is not an existing cross-company data leak. The main scaling risk is that server API routes use the Supabase service-role client, which bypasses RLS, so tenant safety depends on each route applying the correct company/ownership checks.

## GREEN — already strong

### Core tenant model
The following core tables include company_id and are linked to Companies where appropriate:
- UserProfiles
- Technicians
- Conversations
- Reflections
- ManagerTechnicians
- ManagerNotes
- ManagerFollowUps
- ManagementConversations
- ai_insights

### Technician data ownership
- Technician access is derived from the authenticated Supabase user.
- Technician conversation reads are constrained by technician_id.
- Conversations and Reflections use the database trigger set_company_from_technician().
- That trigger overwrites company_id from the linked Technician on INSERT/UPDATE, preventing a caller from assigning a Conversation or Reflection to a different company.

### Management data ownership
- requireManagementAccess() authenticates the user and resolves role/company from UserProfiles rather than trusting user-editable metadata.
- Owners and managers must have an active profile and company.
- Manager technician access is constrained by ManagerTechnicians assignments.
- Manager chat, directory, technician profile, notes, follow-ups, owner overview, company roster, employee lifecycle, and assignment routes inspected all apply company scope before accessing tenant data.

### Current-data integrity
Verified current database state:
- Conversations with NULL company_id: 0
- Reflections with NULL company_id: 0
- ManagementConversations with NULL company_id: 0
- ManagerFollowUps with NULL company_id: 0
- ManagerNotes with NULL company_id: 0
- ManagerTechnicians with NULL company_id: 0
- Technicians with NULL company_id: 0
- Non-platform-admin UserProfiles with NULL company_id: 0

Verified cross-company mismatches:
- ManagerTechnicians: 0
- ManagerNotes: 0
- ManagerFollowUps: 0
- Reflections: 0
- Conversations: 0

## RED — fix before broader customer scaling

### 1. /api/team-summary is unauthenticated
The legacy team-summary route accepts reflection/report content directly from the caller and invokes OpenAI without requiring technician, manager, owner, or platform-admin authentication.

Risk:
- Public API cost abuse.
- A caller can submit arbitrary content to the manager-summary model.
- It does not currently read another tenant's database data, so this is not an observed cross-company data leak, but it is an exposed production endpoint that should not remain open.

Recommended Commit 2 action:
- Determine whether the route is still used.
- If unused, remove it.
- If still required, protect it with requireManagementAccess() and load tenant-scoped source data server-side rather than trusting caller-supplied reflections.

## YELLOW — harden as CraftCompass scales

### 1. Service-role APIs bypass RLS
app/lib/supabase-server.ts uses SUPABASE_SERVICE_ROLE_KEY. This is appropriate for trusted server operations but bypasses RLS.

Current state:
- The user-facing routes inspected perform explicit ownership/company checks.
- This design means a future route can accidentally create an IDOR/cross-tenant issue if a developer forgets one company filter.

Recommended hardening:
- Keep centralized access helpers.
- Add reusable company-scoped query helpers where practical.
- Add automated cross-tenant route tests before onboarding larger numbers of companies.

### 2. Many RLS-enabled tables have no policies
Supabase Security Advisor reports 30 public tables with RLS enabled but no policies, including Conversations, Messages, ManagementConversations, ManagementMessages, ManagerFollowUps, feedback/audit tables, AIUsageEvents, verified-source tables, and learning tables.

Interpretation:
- RLS + no policy is deny-by-default for ordinary Data API users, so this is not automatically a data exposure.
- Server service-role code bypasses those policies anyway.
- The pattern should be classified intentionally: tenant-user tables, platform-admin-only tables, and server-internal knowledge/telemetry tables.

Recommended hardening:
- Define and document the intended access class for each table.
- Add tenant RLS policies where direct authenticated access is intended.
- Keep server-only/platform tables inaccessible to ordinary authenticated users.

### 3. Child tables inherit tenant ownership through parents
Messages, ManagementMessages, ConversationUserFeedback, and ConversationAuditFlags do not carry company_id directly.

Current protection:
- Routes validate the parent conversation/message before reading or writing.

Scaling concern:
- Tenant ownership is less obvious to query and audit.
- A future route could accidentally query a child row by ID without validating its parent.

Recommended hardening:
- Either retain parent-derived tenancy with mandatory helper functions/tests, or add company_id to selected child/audit tables where operationally useful.

### 4. Cross-company consistency is validated mainly in application code
ManagerTechnicians, ManagerNotes, and ManagerFollowUps contain company_id plus foreign IDs, but standard foreign keys do not by themselves prove that the referenced manager/technician belongs to the same company.

Current data contains zero mismatches.

Recommended hardening:
- Consider database constraints/triggers/composite tenant keys for relationships where cross-company mismatch must be impossible even under service-role writes.

### 5. Public SECURITY DEFINER helper RPCs
Supabase Security Advisor flags:
- current_tradewise_company_id()
- current_tradewise_role()

They are SECURITY DEFINER and executable by authenticated users.

Current behavior:
- Each function derives the result from auth.uid() and returns only the caller's active profile company/role.
- No direct cross-company disclosure was identified.

Recommended hardening:
- Review whether these functions need to remain directly callable via RPC.
- If possible, move authorization helpers out of the exposed public API surface or otherwise restrict direct execution without breaking RLS.

### 6. AIUsageEvents is not company-scoped
AIUsageEvents currently has no company_id.

This is not a tenant data exposure because the table has RLS and no user policy and is used server-side, but it blocks accurate per-company AI cost/margin reporting.

Recommended later commit:
- Add company_id/tenant attribution to AI usage telemetry before billing/plan enforcement.

### 7. Management audit flag route has weaker defense-in-depth
/api/audit-flag verifies management conversations by profile_id but does not additionally constrain the conversation by company_id or reuse requireManagementAccess() for the management branch.

A UserProfile ID is currently unique and tied to one company, so no immediate cross-company access was demonstrated. However, this route is weaker than /api/answer-feedback, which checks both company_id and profile_id.

Recommended Commit 2 action:
- Use requireManagementAccess() and add company_id to the ManagementConversations lookup.

## Other Supabase security-advisor items

These are not tenant-isolation blockers but should be scheduled:
- pg_net extension is installed in public schema.
- Leaked Password Protection is disabled.

## Commit 2 recommended scope

Do not combine every yellow item into one deployment.

Commit 2 should be a focused security fix:
1. Secure or remove /api/team-summary.
2. Harden the management branch of /api/audit-flag with requireManagementAccess() + company_id.
3. Re-run Supabase security advisors and smoke-test technician, manager, owner, and platform-admin access.

After that, create a separate database-hardening commit for RLS/table access classification and cross-company database constraints.
