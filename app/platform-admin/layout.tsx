'use client'

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_COMPANY_FEATURES,
  normalizeCompanyFeatureFlags,
  type CompanyFeatureFlags,
} from '../lib/company-features'

type CompanyOption = {
  id: string
  name: string
  feature_flags: CompanyFeatureFlags
}

type FeatureDefinition = {
  key: keyof CompanyFeatureFlags
  label: string
  description: string
}

const managerFeatures: FeatureDefinition[] = [
  { key: 'manager_search', label: 'Search', description: 'Show Search in the manager sidebar.' },
  { key: 'manager_history', label: 'History', description: 'Show the History area in the manager sidebar.' },
  { key: 'manager_follow_up', label: 'Follow-up', description: 'Show manager follow-up actions.' },
  { key: 'manager_technicians', label: 'Technicians', description: 'Show the technician directory and profiles.' },
  { key: 'manager_notes', label: 'Manager Notes', description: 'Show the Manager Notes sidebar item.' },
]

const ownerFeatures: FeatureDefinition[] = [
  { key: 'owner_overview', label: 'Overview', description: 'Show the company overview dashboard.' },
  { key: 'owner_company', label: 'Company', description: 'Show company administration.' },
  { key: 'owner_assignments', label: 'Assignments', description: 'Show manager-to-technician assignments.' },
  { key: 'owner_add_manager', label: 'Add Manager', description: 'Show the owner manager-creation page.' },
  { key: 'owner_add_technician', label: 'Add Technician', description: 'Show the owner technician-creation page.' },
]

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [draft, setDraft] = useState<CompanyFeatureFlags>(DEFAULT_COMPANY_FEATURES)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) || null,
    [companies, selectedCompanyId]
  )

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  const openControls = async () => {
    setOpen(true)
    setLoading(true)
    setError('')
    setStatus('')

    try {
      const token = await getToken()
      if (!token) {
        window.location.href = '/login'
        return
      }

      const response = await fetch('/api/platform-admin/companies', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(data.error || 'Could not load company feature settings.')
        return
      }

      const nextCompanies = (data.companies || []).map((company: any) => ({
        id: company.id,
        name: company.name,
        feature_flags: normalizeCompanyFeatureFlags(company.feature_flags),
      })) as CompanyOption[]

      setCompanies(nextCompanies)

      const currentId = selectedCompanyId && nextCompanies.some((company) => company.id === selectedCompanyId)
        ? selectedCompanyId
        : nextCompanies[0]?.id || ''
      setSelectedCompanyId(currentId)

      const currentCompany = nextCompanies.find((company) => company.id === currentId)
      setDraft(normalizeCompanyFeatureFlags(currentCompany?.feature_flags))
    } catch (loadError) {
      console.error('FEATURE CONTROL LOAD ERROR:', loadError)
      setError('Could not load company feature settings.')
    } finally {
      setLoading(false)
    }
  }

  const chooseCompany = (companyId: string) => {
    setSelectedCompanyId(companyId)
    const company = companies.find((item) => item.id === companyId)
    setDraft(normalizeCompanyFeatureFlags(company?.feature_flags))
    setError('')
    setStatus('')
  }

  const toggleFeature = (key: keyof CompanyFeatureFlags) => {
    setDraft((current) => ({ ...current, [key]: !current[key] }))
    setStatus('')
  }

  const saveFeatures = async () => {
    if (!selectedCompanyId || saving) return
    setSaving(true)
    setError('')
    setStatus('')

    try {
      const token = await getToken()
      if (!token) {
        window.location.href = '/login'
        return
      }

      const response = await fetch('/api/platform-admin/companies', {
        method: 'PATCH',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ companyId: selectedCompanyId, featureFlags: draft }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(data.error || 'Could not save feature settings.')
        return
      }

      const savedFlags = normalizeCompanyFeatureFlags(data.featureFlags)
      setDraft(savedFlags)
      setCompanies((current) => current.map((company) =>
        company.id === selectedCompanyId ? { ...company, feature_flags: savedFlags } : company
      ))
      setStatus('Feature visibility saved.')
    } catch (saveError) {
      console.error('FEATURE CONTROL SAVE ERROR:', saveError)
      setError('Could not save feature settings.')
    } finally {
      setSaving(false)
    }
  }

  const renderFeature = (feature: FeatureDefinition) => (
    <button
      key={feature.key}
      type="button"
      onClick={() => toggleFeature(feature.key)}
      style={featureRowStyle}
    >
      <div style={{ textAlign: 'left', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#172033' }}>{feature.label}</div>
        <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.45, color: '#64748b' }}>{feature.description}</div>
      </div>
      <span style={{ ...switchStyle, background: draft[feature.key] ? '#172033' : '#cbd5e1' }}>
        <span style={{ ...switchKnobStyle, transform: draft[feature.key] ? 'translateX(18px)' : 'translateX(0)' }} />
      </span>
    </button>
  )

  const showControlButton = pathname !== '/platform-admin/return'

  return (
    <>
      {children}

      {showControlButton && (
        <button type="button" onClick={() => void openControls()} style={floatingButtonStyle}>
          Feature Controls
        </button>
      )}

      {open && (
        <div style={backdropStyle} onClick={() => setOpen(false)}>
          <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start' }}>
              <div>
                <div style={eyebrowStyle}>Platform Admin</div>
                <h2 style={{ margin: '6px 0 6px', fontSize: 28, color: '#172033' }}>Feature Controls</h2>
                <p style={{ margin: 0, color: '#64748b', lineHeight: 1.55 }}>
                  Choose which finished features each company can see. Hidden features stay in the code and can be turned on later.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={closeButtonStyle}>×</button>
            </div>

            {loading ? (
              <div style={statusCardStyle}>Loading companies…</div>
            ) : companies.length === 0 ? (
              <div style={statusCardStyle}>No companies found.</div>
            ) : (
              <>
                <label style={labelStyle}>
                  Company
                  <select
                    value={selectedCompanyId}
                    onChange={(event) => chooseCompany(event.target.value)}
                    style={selectStyle}
                  >
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </select>
                </label>

                {selectedCompany && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 850, color: '#172033' }}>{selectedCompany.name}</div>
                    <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
                      OFF hides the navigation button for this company. ON makes it visible.
                    </div>
                  </div>
                )}

                <div style={featureGridStyle}>
                  <section>
                    <div style={sectionTitleStyle}>Manager Workspace</div>
                    <div style={{ display: 'grid', gap: 9 }}>{managerFeatures.map(renderFeature)}</div>
                  </section>
                  <section>
                    <div style={sectionTitleStyle}>Owner Workspace</div>
                    <div style={{ display: 'grid', gap: 9 }}>{ownerFeatures.map(renderFeature)}</div>
                  </section>
                </div>

                {error && <div style={errorStyle}>{error}</div>}
                {status && <div style={successStyle}>{status}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 20 }}>
                  <button type="button" onClick={() => setOpen(false)} style={secondaryButtonStyle}>Close</button>
                  <button type="button" onClick={() => void saveFeatures()} disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const floatingButtonStyle: React.CSSProperties = {
  position: 'fixed',
  right: 22,
  bottom: 22,
  zIndex: 700,
  border: 'none',
  borderRadius: 999,
  padding: '11px 16px',
  background: '#172033',
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 8px 24px rgba(15,23,42,0.22)',
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 18,
  background: 'rgba(15,23,42,0.48)',
  overflowY: 'auto',
}

const modalStyle: React.CSSProperties = {
  width: 'min(820px, 100%)',
  maxHeight: 'calc(100vh - 36px)',
  overflowY: 'auto',
  boxSizing: 'border-box',
  padding: '26px clamp(18px, 4vw, 30px)',
  borderRadius: 20,
  background: '#ffffff',
  boxShadow: '0 24px 70px rgba(15,23,42,0.28)',
  fontFamily: 'Arial, Helvetica, sans-serif',
}

const eyebrowStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: 11,
  fontWeight: 850,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
}

const closeButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  color: '#64748b',
  fontSize: 22,
  cursor: 'pointer',
}

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 7,
  marginTop: 22,
  color: '#475569',
  fontSize: 12,
  fontWeight: 800,
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#172033',
  fontSize: 14,
}

const featureGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 18,
  marginTop: 20,
}

const sectionTitleStyle: React.CSSProperties = {
  marginBottom: 10,
  color: '#475569',
  fontSize: 12,
  fontWeight: 850,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const featureRowStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  padding: '13px 14px',
  borderRadius: 13,
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  cursor: 'pointer',
}

const switchStyle: React.CSSProperties = {
  position: 'relative',
  flex: '0 0 auto',
  width: 40,
  height: 22,
  borderRadius: 999,
  padding: 2,
  boxSizing: 'border-box',
  transition: 'background 120ms ease',
}

const switchKnobStyle: React.CSSProperties = {
  display: 'block',
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: '#ffffff',
  boxShadow: '0 1px 3px rgba(15,23,42,0.24)',
  transition: 'transform 120ms ease',
}

const statusCardStyle: React.CSSProperties = {
  marginTop: 22,
  padding: '15px 16px',
  borderRadius: 12,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  color: '#64748b',
}

const errorStyle: React.CSSProperties = {
  marginTop: 16,
  padding: '11px 13px',
  borderRadius: 10,
  background: '#fef2f2',
  color: '#991b1b',
  fontSize: 13,
}

const successStyle: React.CSSProperties = {
  marginTop: 16,
  padding: '11px 13px',
  borderRadius: 10,
  background: '#f0fdf4',
  color: '#166534',
  fontSize: 13,
}

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '10px 14px',
  background: '#172033',
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '10px 14px',
  background: '#ffffff',
  color: '#475569',
  fontSize: 13,
  fontWeight: 750,
  cursor: 'pointer',
}
