'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import PlatformAdminShell from './platform-admin-shell'

type OpenAICostData = {
  configured: boolean
  reason?: string
  error?: string
  currency?: string
  generatedAt?: string
  today?: number
  last7?: number
  monthToDate?: number
  projectedMonthEnd?: number
  daily?: { date: string; cost: number }[]
  lineItems?: { name: string; cost: number }[]
  modelUsage?: {
    model: string
    requests: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
  }[]
  usageError?: string | null
  featureUsage?: {
    feature: string
    calls: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    totalTokens: number
    webSearchCalls: number
    fileSearchCalls: number
    models: string[]
  }[]
  featureUsageError?: string | null
  billingScopeNote?: string
  cacheStatus?: 'live' | 'cached' | 'stale'
  cachedAt?: string
  cacheAgeSeconds?: number | null
  warning?: string
  efficiency?: {
    status: 'collecting' | 'ready'
    totalCalls: number
    minimumCalls: number
    message: string
    recommendations: {
      id: string
      feature: string
      title: string
      finding: string
      action: string
      evidence: string
      savingsEstimate: string
      savingsBasis: string
      qualityRisk: 'low' | 'medium' | 'high'
      priority: 'watch' | 'opportunity' | 'review'
    }[]
  }
}

type DashboardData = {
  generatedAt: string
  health: 'healthy' | 'attention'
  attentionTotal: number
  needsAttention: {
    auditFlags: number
    sourceExceptions: number
    draftGuidance: number
    failedRuns: number
    pendingFeedback: number
  }
  deployment: {
    state: string
    environment: string
    commitSha: string | null
    commitMessage: string | null
    commitRef: string | null
    url: string
  }
  counts: {
    companies: number
    activeUsers: number
    technicians: number
    technicianConversations7d: number
    managementConversations7d: number
  }
  quality: {
    helpful7d: number
    flagsPending: number
    reviewed7d: number
    draftGuidance: number
    sourcesCheckedLatest: number
    sourceIssuesLatest: number
  }
  latestRun: any
  latestSourceChecks: {
    id: string
    source_title: string | null
    source_url: string
    status: string
    http_status: number | null
    final_url: string | null
    error_text: string | null
    checked_at: string
  }[]
  sourceIssues: {
    id: string
    source_title: string | null
    source_url: string
    status: string
    http_status: number | null
    checked_at: string
  }[]
  changes: {
    kind: string
    title: string
    at: string | null
    href: string
  }[]
  companyBreakdown: {
    id: string
    name: string
    status: string
    accountType: string
    trades: string[]
    jurisdictions: { country?: string; state?: string; locality?: string }[]
    activeUsers: number
    technicians: number
    technicianConversations7d: number
    managementConversations7d: number
    jurisdictionConversationCounts7d: Record<string, number>
  }[]
}

export default function PlatformAdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [costs, setCosts] = useState<OpenAICostData | null>(null)
  const [costLoading, setCostLoading] = useState(true)
  const [companyLensId, setCompanyLensId] = useState('')
  const [jurisdictionLens, setJurisdictionLens] = useState('')
  const [sourceDetailMode, setSourceDetailMode] = useState<'checked' | 'issues' | null>(null)

  useEffect(() => {
    void (async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return void (window.location.href = '/login')

      const [dashboardResponse, costsResponse] = await Promise.all([
        fetch('/api/platform-admin/dashboard', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/platform-admin/openai-costs', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      const [result, costResult] = await Promise.all([
        dashboardResponse.json().catch(() => ({})),
        costsResponse.json().catch(() => ({})),
      ])

      if (!dashboardResponse.ok) {
        setError(result.error || 'Could not load Platform Admin dashboard.')
        setLoading(false)
        setCostLoading(false)
        return
      }

      setData(result)
      setLoading(false)
      setCosts(costResult)
      setCostLoading(false)
    })()
  }, [])

  const attention = data?.needsAttention
  const selectedCompanyLens = useMemo(
    () => data?.companyBreakdown?.find((company) => company.id === companyLensId) || null,
    [data, companyLensId]
  )
  const selectedJurisdictionConversations = selectedCompanyLens && jurisdictionLens
    ? selectedCompanyLens.jurisdictionConversationCounts7d?.[jurisdictionLens] || 0
    : null

  return (
    <PlatformAdminShell maxWidth={1380} contentPadding="32px clamp(20px, 3.5vw, 54px) 64px">
      <style>{`
        @media (max-width: 1000px) {
          .health-grid, .two-col, .quality-grid, .cost-layout, .cost-metrics { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 650px) {
          .health-grid, .two-col, .quality-grid, .cost-layout, .cost-metrics { grid-template-columns: 1fr !important; }
        }
      `}</style>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={eyebrowLight}>CraftCompass Platform</div>
              <div style={{ marginTop: 6, color: 'var(--cc-deep-navy)', fontSize: 13, fontWeight: 800 }}>Real Skills. Smart Solutions.</div>
              <h1 style={{ margin: '6px 0 5px', fontSize: 38, letterSpacing: '-0.04em' }}>Platform Admin</h1>
              <p style={{ margin: 0, color: '#64748b' }}>See platform health, quality, changes, and what needs attention.</p>
            </div>
            <div style={{ ...statusPill, background: data?.deployment.environment === 'production' ? '#ecfdf5' : '#fff7ed', color: data?.deployment.environment === 'production' ? '#166534' : '#9a3412' }}>
              <span style={{ fontSize: 18 }}>●</span>
              {data?.deployment.environment === 'production' ? 'PRODUCTION' : (data?.deployment.environment || 'LOADING').toUpperCase()}
            </div>
          </header>

          {error && <div style={errorStyle}>{error}</div>}
          {loading && <div style={{ marginTop: 20, color: '#64748b' }}>Loading platform health…</div>}

          {data && (
            <>
              <div className="health-grid" style={healthGridStyle}>
                <HealthCard
                  title="System Health"
                  value={data.health === 'healthy' ? 'Healthy' : 'Needs attention'}
                  detail={data.health === 'healthy' ? 'Core platform checks are clear.' : 'One or more platform checks need review.'}
                  tone={data.health === 'healthy' ? 'good' : 'warn'}
                  href="/platform-admin"
                />
                <HealthCard title="Needs Attention" value={String(data.attentionTotal)} detail="Items requiring review" tone={data.attentionTotal ? 'warn' : 'good'} href="#attention" />
                <HealthCard title="Draft Guidance" value={String(attention?.draftGuidance || 0)} detail="Waiting for Admin decision" tone={(attention?.draftGuidance || 0) ? 'info' : 'good'} href="/platform-admin/guidance" />
                <HealthCard title="Source Exceptions" value={String(attention?.sourceExceptions || 0)} detail="Detected in the last 7 days" tone={(attention?.sourceExceptions || 0) ? 'warn' : 'good'} href="/platform-admin/guidance" />
                <HealthCard title="Current Deployment" value={data.deployment.state} detail="Vercel production runtime" tone={data.deployment.state === 'READY' ? 'good' : 'warn'} href="#deployment" />
              </div>

              <section style={{ ...cardStyle, marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <SectionHeader title="Company / Jurisdiction Lens" subtitle="Drill into customer activity without losing the global platform view." />
                  {selectedCompanyLens && <a href={`/platform-admin/companies/${selectedCompanyLens.id}`} style={buttonLink}>Open Control Center →</a>}
                </div>
                <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 10 }}>
                  <select
                    value={companyLensId}
                    onChange={(event) => { setCompanyLensId(event.target.value); setJurisdictionLens('') }}
                    style={{ minWidth: 230, padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff' }}
                  >
                    <option value="">All companies</option>
                    {(data.companyBreakdown || []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </select>
                  {selectedCompanyLens && (
                    <select
                      value={jurisdictionLens}
                      onChange={(event) => setJurisdictionLens(event.target.value)}
                      style={{ minWidth: 170, padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff' }}
                    >
                      <option value="">All jurisdictions</option>
                      {(selectedCompanyLens.jurisdictions || []).map((item) => (
                        <option key={`${item.country || 'US'}-${item.state}`} value={String(item.state || '').toUpperCase()}>
                          {item.locality ? `${item.locality}, ${item.state}` : item.state}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {selectedCompanyLens ? (
                  <div className="quality-grid" style={{ ...qualityGridStyle, marginTop: 12 }}>
                    <MiniMetric label="Active users" value={selectedCompanyLens.activeUsers} />
                    <MiniMetric label="Technicians" value={selectedCompanyLens.technicians} />
                    <MiniMetric label="Tech conversations · 7d" value={selectedJurisdictionConversations ?? selectedCompanyLens.technicianConversations7d} />
                    <MiniMetric label="Manager / owner · 7d" value={selectedCompanyLens.managementConversations7d} />
                    <MiniMetric label="Trades" value={selectedCompanyLens.trades.length} />
                    <MiniMetric label="Jurisdictions" value={selectedCompanyLens.jurisdictions.length} />
                  </div>
                ) : (
                  <div style={{ marginTop: 10, color: '#64748b', fontSize: 12 }}>Choose a company to inspect its scalable company context.</div>
                )}
              </section>

              <section style={{ ...cardStyle, marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <SectionHeader title="OpenAI Cost Tracker" subtitle="Organization billing and usage, cached to protect the OpenAI Admin API rate limit." />
                    {costs?.configured && !costs.error && costs.cacheStatus && (
                      <div style={{ marginTop: 4, color: costs.cacheStatus === 'stale' ? '#9a3412' : '#64748b', fontSize: 11, fontWeight: 750 }}>
                        {costs.cacheStatus === 'live'
                          ? 'Fresh OpenAI snapshot'
                          : costs.cacheStatus === 'cached'
                            ? `Cached snapshot · ${Math.max(0, Math.round((costs.cacheAgeSeconds || 0) / 60))} min old`
                            : 'Last good snapshot · OpenAI refresh temporarily unavailable'}
                      </div>
                    )}
                  </div>
                  {costs?.configured && !costs.error && (
                    <a href="https://platform.openai.com/usage" target="_blank" rel="noreferrer" style={buttonLink}>
                      View in OpenAI ↗
                    </a>
                  )}
                </div>

                {costLoading ? (
                  <div style={quietText}>Loading OpenAI billing data…</div>
                ) : !costs?.configured ? (
                  <div style={setupCardStyle}>
                    <div style={{ fontWeight: 900, fontSize: 15 }}>OpenAI Admin key required</div>
                    <div style={{ marginTop: 6, color: '#64748b', fontSize: 12, lineHeight: 1.55 }}>
                      Add <code>OPENAI_ADMIN_KEY</code> to the CraftCompass production environment in Vercel. The key stays server-side and is used only by the Platform Admin cost endpoint.
                    </div>
                  </div>
                ) : costs.error ? (
                  <div style={errorStyle}>OpenAI cost tracker: {costs.error}</div>
                ) : (
                  <>
                    {costs.warning && (
                      <div style={{ ...billingScopeStyle, background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412' }}>
                        <strong>Telemetry note:</strong> {costs.warning}
                      </div>
                    )}
                    {costs.billingScopeNote && (
                      <div style={billingScopeStyle}>
                        <strong>Billing scope:</strong> {costs.billingScopeNote}
                      </div>
                    )}

                    <div className="cost-metrics" style={costMetricGridStyle}>
                      <CostMetric label="Today" value={costs.today || 0} />
                      <CostMetric label="Last 7 days" value={costs.last7 || 0} />
                      <CostMetric label="This month" value={costs.monthToDate || 0} />
                      <CostMetric label="Projected month-end" value={costs.projectedMonthEnd || 0} />
                    </div>

                    <div className="cost-layout" style={costLayoutStyle}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 850, marginBottom: 10 }}>Daily API Cost · Last 14 Days</div>
                        <DailyCostBars rows={costs.daily || []} />
                      </div>

                      <div>
                        <div style={{ fontSize: 13, fontWeight: 850, marginBottom: 8 }}>Usage by Model · Last 14 Days</div>
                        {(costs.modelUsage || []).length === 0 ? (
                          <div style={quietText}>{costs.usageError || 'No model usage returned.'}</div>
                        ) : (
                          (costs.modelUsage || []).slice(0, 5).map((row) => (
                            <div key={row.model} style={modelRowStyle}>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: 12 }}>{row.model}</div>
                                <div style={{ marginTop: 3, color: '#94a3b8', fontSize: 10 }}>
                                  {row.requests.toLocaleString()} requests
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 800 }}>
                                {(row.inputTokens + row.outputTokens).toLocaleString()} tokens
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: 15 }}>
                      <div style={{ fontSize: 13, fontWeight: 850, marginBottom: 8 }}>Cost Efficiency Advisor</div>
                      {!costs.efficiency ? (
                        <div style={quietText}>Efficiency analysis is unavailable.</div>
                      ) : costs.efficiency.status === 'collecting' ? (
                        <div style={collectingStyle}>
                          <div style={{ fontWeight: 900 }}>Collecting evidence</div>
                          <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5 }}>{costs.efficiency.message}</div>
                          <div style={progressTrackStyle}>
                            <div
                              style={{
                                ...progressFillStyle,
                                width: `${Math.min(100, Math.round((costs.efficiency.totalCalls / Math.max(1, costs.efficiency.minimumCalls)) * 100))}%`,
                              }}
                            />
                          </div>
                          <div style={{ marginTop: 5, color: '#64748b', fontSize: 10 }}>
                            {costs.efficiency.totalCalls} / {costs.efficiency.minimumCalls} AI calls
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5 }}>{costs.efficiency.message}</div>
                          {costs.efficiency.recommendations.length === 0 ? (
                            <div style={{ ...quietText, color: '#166534' }}>No optimization pattern currently crosses the review threshold.</div>
                          ) : costs.efficiency.recommendations.map((rec) => (
                            <div key={rec.id} style={recommendationStyle}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <div>
                                  <div style={{ fontWeight: 900, fontSize: 13 }}>{rec.title}</div>
                                  <div style={{ marginTop: 3, color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 850 }}>
                                    {rec.feature.replace(/_/g, ' ')}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <span style={priorityBadgeStyle(rec.priority)}>{rec.priority}</span>
                                  <span style={riskBadgeStyle(rec.qualityRisk)}>quality risk: {rec.qualityRisk}</span>
                                </div>
                              </div>
                              <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: '#334155' }}>{rec.finding}</div>
                              <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.5 }}><strong>Possible action:</strong> {rec.action}</div>
                              <div style={{ marginTop: 7, fontSize: 11, color: '#475569' }}><strong>Evidence:</strong> {rec.evidence}</div>
                              <div style={{ marginTop: 4, fontSize: 11, color: '#475569' }}><strong>Savings:</strong> {rec.savingsEstimate}</div>
                              <div style={{ marginTop: 3, fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>{rec.savingsBasis}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 15 }}>
                      <div style={{ fontSize: 13, fontWeight: 850, marginBottom: 8 }}>CraftCompass Feature Telemetry · Last 14 Days</div>
                      {(costs.featureUsage || []).length === 0 ? (
                        <div style={quietText}>
                          {costs.featureUsageError || 'No feature telemetry yet. Data begins accumulating after Commit 3 is live.'}
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 7 }}>
                          {(costs.featureUsage || []).slice(0, 10).map((feature) => (
                            <div key={feature.feature} style={featureUsageRowStyle}>
                              <div>
                                <div style={{ fontWeight: 850, fontSize: 12 }}>{feature.feature.replace(/_/g, ' ')}</div>
                                <div style={{ marginTop: 3, color: '#94a3b8', fontSize: 10 }}>
                                  {feature.models.join(', ') || 'model unavailable'}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', fontSize: 10, color: '#475569', lineHeight: 1.5 }}>
                                <strong>{feature.calls}</strong> calls · <strong>{feature.totalTokens.toLocaleString()}</strong> tokens
                                <br />
                                {feature.webSearchCalls} web · {feature.fileSearchCalls} file searches
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {(costs.lineItems || []).length > 0 && (
                      <div style={{ marginTop: 15 }}>
                        <div style={{ fontSize: 13, fontWeight: 850, marginBottom: 8 }}>Month-to-Date Cost by Billing Line Item</div>
                        <div style={lineItemGridStyle}>
                          {(costs.lineItems || []).slice(0, 6).map((item) => (
                            <div key={item.name} style={lineItemStyle}>
                              <span style={{ color: '#475569', overflowWrap: 'anywhere' }}>{item.name}</span>
                              <strong>{formatCurrency(item.cost)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>

              <div className="two-col" style={twoColStyle}>
                <section id="attention" style={cardStyle}>
                  <SectionHeader title="Needs Attention" subtitle="The shortest path to what needs fixing." />
                  <AttentionRow label="Conversation flags waiting for review" value={attention?.auditFlags || 0} href="/platform-admin/conversation-audit" />
                  <AttentionRow label="Verified Source exceptions" value={attention?.sourceExceptions || 0} href="/platform-admin/guidance" />
                  <AttentionRow label="Draft guidance awaiting decision" value={attention?.draftGuidance || 0} href="/platform-admin/guidance" />
                  <AttentionRow label="Failed Sunday runs" value={attention?.failedRuns || 0} href="/platform-admin/guidance" />
                  <AttentionRow label="Pending user feedback requests" value={attention?.pendingFeedback || 0} href="/platform-admin/conversation-audit" />
                </section>

                <section style={cardStyle}>
                  <SectionHeader title="What Changed" subtitle="Recent meaningful platform activity." />
                  {data.changes.length === 0 ? (
                    <div style={quietText}>No recent platform changes to show.</div>
                  ) : data.changes.map((change, index) => (
                    <a key={index} href={change.href} style={changeRowStyle}>
                      <span style={{ ...dotStyle, background: change.kind === 'error' ? '#dc2626' : change.kind === 'source' ? '#f59e0b' : change.kind === 'guidance' ? '#16a34a' : '#2563eb' }} />
                      <span style={{ flex: 1 }}>{change.title}</span>
                      <span style={dateText}>{change.at ? new Date(change.at).toLocaleString() : ''}</span>
                    </a>
                  ))}
                </section>
              </div>

              <div className="two-col" style={twoColStyle}>
                <section style={cardStyle}>
                  <SectionHeader title="Learning & Quality" subtitle="The feedback loop that makes CraftCompass better." />
                  <div className="quality-grid" style={qualityGridStyle}>
                    <MiniMetric
                      label="Helpful · 7d"
                      value={data.quality.helpful7d}
                      href="/platform-admin/conversation-audit?view=helpful7d"
                      title="Show the conversations that received Helpful feedback in the last 7 days."
                    />
                    <MiniMetric
                      label="Pending flags"
                      value={data.quality.flagsPending}
                      href="/platform-admin/conversation-audit?view=pending"
                      title="Show conversations with audit flags waiting for review."
                    />
                    <MiniMetric
                      label="Reviewed · 7d"
                      value={data.quality.reviewed7d}
                      href="/platform-admin/conversation-audit?view=reviewed7d"
                      title="Show conversations with Good, Corrected, or Resolved reviews from the last 7 days."
                    />
                    <MiniMetric
                      label="Draft guidance"
                      value={data.quality.draftGuidance}
                      href="/platform-admin/guidance?status=draft"
                      title="Show guidance drafts waiting for an Admin decision."
                    />
                    <MiniMetric
                      label="Sources checked"
                      value={data.quality.sourcesCheckedLatest}
                      onClick={() => setSourceDetailMode('checked')}
                      title="Show every source checked in the latest weekly learning run."
                    />
                    <MiniMetric
                      label="Source issues"
                      value={data.quality.sourceIssuesLatest}
                      onClick={() => setSourceDetailMode('issues')}
                      title="Show source exceptions from the latest weekly learning run."
                    />
                  </div>
                </section>

                <section id="deployment" style={cardStyle}>
                  <SectionHeader title="Vercel Production Deployment" subtitle="The production version currently serving CraftCompass." />
                  <div style={{ ...deploymentStatus, background: data.deployment.state === 'READY' ? '#ecfdf5' : '#fff7ed', color: data.deployment.state === 'READY' ? '#166534' : '#9a3412' }}>
                    ● {data.deployment.state}
                  </div>
                  <KeyValue label="Environment" value={data.deployment.environment} />
                  <KeyValue label="Branch" value={data.deployment.commitRef || 'Unavailable'} />
                  <KeyValue label="Commit" value={data.deployment.commitSha ? data.deployment.commitSha.slice(0, 8) : 'Unavailable'} />
                  <KeyValue label="Release" value={data.deployment.commitMessage || 'Unavailable'} />
                  <a href={data.deployment.url} target="_blank" rel="noreferrer" style={{ ...buttonLink, marginTop: 12 }}>Open production app ↗</a>
                </section>
              </div>

              <div className="two-col" style={twoColStyle}>
                <section style={cardStyle}>
                  <SectionHeader title="Companion Activity" subtitle="Real usage from the last 7 days." />
                  <AudienceRow label="Technician Companion" value={data.counts.technicianConversations7d} suffix="conversations" />
                  <AudienceRow label="Manager / Owner Companion" value={data.counts.managementConversations7d} suffix="conversations" />
                  <AudienceRow label="Active users" value={data.counts.activeUsers} suffix="users" />
                  <AudienceRow label="Technicians" value={data.counts.technicians} suffix="technicians" />
                  <AudienceRow label="Companies" value={data.counts.companies} suffix="companies" />
                </section>

                <section style={cardStyle}>
                  <SectionHeader title="Verified Source Exceptions" subtitle="Recent source checks that need a closer look." />
                  {data.sourceIssues.length === 0 ? (
                    <div style={{ ...quietText, color: '#166534' }}>No recent source-link exceptions.</div>
                  ) : data.sourceIssues.map((issue) => (
                    <a key={issue.id} href="/platform-admin/guidance" style={issueRowStyle}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{issue.source_title || 'Verified source'}</div>
                        <div style={{ marginTop: 3, color: '#64748b', fontSize: 11, overflowWrap: 'anywhere' }}>{issue.source_url}</div>
                      </div>
                      <div style={{ textAlign: 'right', color: '#9a3412', fontSize: 11, fontWeight: 850, textTransform: 'uppercase' }}>
                        {issue.status}{issue.http_status ? ` · ${issue.http_status}` : ''}
                      </div>
                    </a>
                  ))}
                </section>
              </div>

              <section style={{ ...cardStyle, marginTop: 14 }}>
                <SectionHeader title="Build / Fix / Pivot" subtitle="Turn what CraftCompass is learning into the next action." />
                <div className="quality-grid" style={{ ...qualityGridStyle, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  <ActionCard title="Fix Now" detail={data.attentionTotal ? `${data.attentionTotal} current items need review.` : 'Nothing urgent is waiting.'} href="#attention" tone="red" />
                  <ActionCard title="Improve Next" detail="Use Guidance Library and Conversation Audit to turn reviewed issues into better behavior." href="/platform-admin/guidance" tone="amber" />
                  <ActionCard title="Create / Pivot" detail="Watch usage and quality signals before deciding what the next product move should be." href="/platform-admin/conversation-audit" tone="blue" />
                </div>
              </section>
            </>
          )}

          {data && sourceDetailMode && (
            <div style={sourceModalBackdropStyle} onClick={() => setSourceDetailMode(null)}>
              <div style={sourceModalCardStyle} onClick={(event) => event.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
                  <div>
                    <div style={eyebrowLight}>Latest weekly learning run</div>
                    <h2 style={{ margin: '5px 0 4px', fontSize: 24 }}>
                      {sourceDetailMode === 'checked' ? 'Sources checked' : 'Source issues'}
                    </h2>
                    <div style={quietText}>
                      {data.latestRun?.completed_at
                        ? new Date(data.latestRun.completed_at).toLocaleString()
                        : data.latestRun?.created_at
                          ? new Date(data.latestRun.created_at).toLocaleString()
                          : 'No completed run timestamp available'}
                    </div>
                  </div>
                  <button type="button" onClick={() => setSourceDetailMode(null)} style={sourceModalCloseStyle}>×</button>
                </div>

                <div style={{ display: 'grid', gap: 9, marginTop: 16 }}>
                  {(data.latestSourceChecks || [])
                    .filter((row) => sourceDetailMode === 'checked' || ['dead','blocked','unreachable','invalid'].includes(row.status))
                    .map((row) => (
                      <div key={row.id} style={sourceCheckRowStyle}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 850 }}>{row.source_title || 'Verified source'}</div>
                          <div style={{ marginTop: 3, color: '#64748b', fontSize: 11, overflowWrap: 'anywhere' }}>{row.source_url}</div>
                          {row.error_text && <div style={{ marginTop: 4, color: '#9a3412', fontSize: 11 }}>{row.error_text}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                          <div style={{
                            fontSize: 11,
                            fontWeight: 900,
                            textTransform: 'uppercase',
                            color: ['dead','blocked','unreachable','invalid'].includes(row.status) ? '#9a3412' : '#166534'
                          }}>
                            {row.status}{row.http_status ? ` · ${row.http_status}` : ''}
                          </div>
                          <div style={{ marginTop: 4, color: '#94a3b8', fontSize: 10 }}>
                            {new Date(row.checked_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}

                  {(data.latestSourceChecks || []).filter((row) => sourceDetailMode === 'checked' || ['dead','blocked','unreachable','invalid'].includes(row.status)).length === 0 && (
                    <div style={{ ...quietText, padding: 14 }}>
                      {sourceDetailMode === 'checked' ? 'No sources were recorded for the latest run.' : 'No source issues were recorded for the latest run.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
    </PlatformAdminShell>
  )
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

function CostMetric({ label, value }: { label: string; value: number }) {
  return (
    <div style={costMetricStyle}>
      <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 25, fontWeight: 900 }}>{formatCurrency(value)}</div>
    </div>
  )
}

function DailyCostBars({ rows }: { rows: { date: string; cost: number }[] }) {
  const max = Math.max(0.01, ...rows.map((row) => row.cost))
  if (rows.length === 0) return <div style={quietText}>No cost data returned for this period.</div>

  return (
    <div style={barChartStyle}>
      {rows.map((row) => {
        const height = Math.max(4, Math.round((row.cost / max) * 100))
        return (
          <div key={row.date} style={barColumnStyle} title={`${row.date}: ${formatCurrency(row.cost)}`}>
            <div style={{ ...barStyle, height: `${height}%` }} />
            <div style={barLabelStyle}>{row.date.slice(5)}</div>
          </div>
        )
      })}
    </div>
  )
}

function priorityBadgeStyle(priority: 'watch' | 'opportunity' | 'review'): React.CSSProperties {
  const palette =
    priority === 'review'
      ? { background: '#fff1f2', color: '#be123c', border: '#fecdd3' }
      : priority === 'opportunity'
        ? { background: '#fffbeb', color: '#b45309', border: '#fde68a' }
        : { background: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }

  return {
    padding: '4px 7px',
    borderRadius: 999,
    background: palette.background,
    color: palette.color,
    border: `1px solid ${palette.border}`,
    fontSize: 9,
    fontWeight: 900,
    textTransform: 'uppercase',
  }
}

function riskBadgeStyle(risk: 'low' | 'medium' | 'high'): React.CSSProperties {
  const color = risk === 'low' ? '#166534' : risk === 'medium' ? '#92400e' : '#991b1b'
  return {
    padding: '4px 7px',
    borderRadius: 999,
    background: '#f8fafc',
    color,
    border: '1px solid #e2e8f0',
    fontSize: 9,
    fontWeight: 850,
    textTransform: 'uppercase',
  }
}

function HealthCard({ title, value, detail, tone, href }: { title: string; value: string; detail: string; tone: 'good'|'warn'|'info'; href: string }) {
  const palette = tone === 'good' ? ['#ecfdf5','#166534'] : tone === 'warn' ? ['#fff7ed','#9a3412'] : ['#eff6ff','#1d4ed8']
  return <a href={href} style={{ ...healthCardStyle, textDecoration: 'none', color: '#172033' }}>
    <div style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>{title}</div>
    <div style={{ marginTop: 8, fontSize: 25, fontWeight: 900, color: palette[1] }}>{value}</div>
    <div style={{ marginTop: 5, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{detail}</div>
  </a>
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <div style={{ marginBottom: 12 }}><div style={{ fontSize: 20, fontWeight: 900 }}>{title}</div><div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>{subtitle}</div></div>
}
function AttentionRow({ label, value, href }: { label: string; value: number; href: string }) {
  return <a href={href} style={attentionRowStyle}><span>{label}</span><span style={{ fontWeight: 900, color: value ? '#b45309' : '#166534' }}>{value}</span></a>
}
function MiniMetric({
  label,
  value,
  href,
  onClick,
  title,
}: {
  label: string
  value: number
  href?: string
  onClick?: () => void
  title?: string
}) {
  const content = (
    <>
      <div style={{ fontSize: 25, fontWeight: 900 }}>{value}</div>
      <div style={{ marginTop: 4, color: '#64748b', fontSize: 11, fontWeight: 700 }}>{label}</div>
      {(href || onClick) && <div style={{ marginTop: 7, color: '#086195', fontSize: 10, fontWeight: 850 }}>View details →</div>}
    </>
  )

  if (href) return <a href={href} title={title} style={miniMetricLinkStyle}>{content}</a>
  if (onClick) return <button type="button" onClick={onClick} title={title} style={miniMetricButtonStyle}>{content}</button>
  return <div style={miniMetricStyle}>{content}</div>
}
function KeyValue({ label, value }: { label: string; value: string }) {
  return <div style={keyValueStyle}><span style={{ color: '#64748b' }}>{label}</span><span style={{ fontWeight: 800, textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</span></div>
}
function AudienceRow({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return <div style={audienceRowStyle}><span style={{ fontWeight: 800 }}>{label}</span><span><strong>{value}</strong> <span style={{ color: '#94a3b8' }}>{suffix}</span></span></div>
}
function ActionCard({ title, detail, href, tone }: { title: string; detail: string; href: string; tone: 'red'|'amber'|'blue' }) {
  const background = tone === 'red' ? '#fff1f2' : tone === 'amber' ? '#fffbeb' : '#eff6ff'
  const color = tone === 'red' ? '#be123c' : tone === 'amber' ? '#b45309' : '#1d4ed8'
  return <a href={href} style={{ padding: 14, borderRadius: 12, background, color, textDecoration: 'none' }}><div style={{ fontWeight: 900 }}>{title}</div><div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.5, color: '#475569' }}>{detail}</div></a>
}

const miniMetricLinkStyle: React.CSSProperties = { ...miniMetricStyle, display:'block', boxSizing:'border-box', color:'#172033', textDecoration:'none', cursor:'pointer' }
const miniMetricButtonStyle: React.CSSProperties = { ...miniMetricStyle, width:'100%', textAlign:'left', fontFamily:'inherit', cursor:'pointer' }
const sourceModalBackdropStyle: React.CSSProperties = { position:'fixed', inset:0, zIndex:90, display:'grid', placeItems:'center', padding:18, background:'rgba(15,23,42,.48)' }
const sourceModalCardStyle: React.CSSProperties = { width:'min(760px,100%)', maxHeight:'calc(100vh - 36px)', overflowY:'auto', padding:22, borderRadius:16, background:'#fff', boxShadow:'0 24px 70px rgba(15,23,42,.28)' }
const sourceModalCloseStyle: React.CSSProperties = { width:34, height:34, border:'1px solid #e2e8f0', borderRadius:9, background:'#fff', color:'#475569', fontSize:22, lineHeight:1, cursor:'pointer' }
const sourceCheckRowStyle: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:14, padding:12, border:'1px solid #e2e8f0', borderRadius:10, background:'#f8fafc' }

const pageStyle: React.CSSProperties = { minHeight: '100vh', background: '#f6f8fb', color: '#172033', fontFamily: 'Arial, Helvetica, sans-serif' }
const eyebrowLight: React.CSSProperties = { color: '#52708f', fontSize: 11, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.09em' }
const statusPill: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 900 }
const healthGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.2fr repeat(4, 1fr)', gap: 10, marginTop: 22 }
const healthCardStyle: React.CSSProperties = { padding: 15, border: '1px solid #e2e8f0', borderRadius: 13, background: '#fff', minHeight: 100 }
const twoColStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }
const cardStyle: React.CSSProperties = { padding: 17, border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff' }
const attentionRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: '1px solid #f1f5f9', color: '#334155', textDecoration: 'none', fontSize: 13 }
const changeRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, padding: '10px 0', borderTop: '1px solid #f1f5f9', color: '#334155', textDecoration: 'none', fontSize: 12 }
const dotStyle: React.CSSProperties = { width: 8, height: 8, borderRadius: 999, flex: '0 0 auto' }
const dateText: React.CSSProperties = { color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap' }
const qualityGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 9 }
const miniMetricStyle: React.CSSProperties = { padding: 12, borderRadius: 11, background: '#f8fafc', border: '1px solid #eef2f7' }
const deploymentStatus: React.CSSProperties = { padding: '11px 13px', borderRadius: 10, fontWeight: 900, marginBottom: 9 }
const keyValueStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }
const buttonLink: React.CSSProperties = { display: 'inline-block', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', color: '#334155', textDecoration: 'none', fontSize: 11, fontWeight: 800 }
const audienceRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 14, padding: '11px 0', borderTop: '1px solid #f1f5f9', fontSize: 13 }
const issueRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '10px 0', borderTop: '1px solid #f1f5f9', color: '#334155', textDecoration: 'none', fontSize: 12 }
const quietText: React.CSSProperties = { padding: '11px 0', color: '#64748b', fontSize: 12 }
const errorStyle: React.CSSProperties = { marginTop: 16, padding: 12, borderRadius: 10, background: '#fef2f2', color: '#991b1b', fontSize: 13 }

const setupCardStyle: React.CSSProperties = { padding: 15, borderRadius: 11, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }
const costMetricGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 9 }
const costMetricStyle: React.CSSProperties = { padding: 13, borderRadius: 11, background: '#f8fafc', border: '1px solid #e2e8f0' }
const costLayoutStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18, marginTop: 16 }
const barChartStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-end', gap: 5, height: 170, padding: '10px 4px 0', borderBottom: '1px solid #e2e8f0' }
const barColumnStyle: React.CSSProperties = { flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'stretch', gap: 5 }
const barStyle: React.CSSProperties = { minHeight: 4, borderRadius: '5px 5px 2px 2px', background: '#2563eb' }
const barLabelStyle: React.CSSProperties = { height: 18, color: '#94a3b8', fontSize: 8, textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }
const modelRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: '1px solid #f1f5f9' }
const lineItemGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }
const lineItemStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 10px', background: '#f8fafc', borderRadius: 9, fontSize: 11 }

const featureUsageRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '10px 11px', border: '1px solid #eef2f7', borderRadius: 9, background: '#fbfdff' }

const billingScopeStyle: React.CSSProperties = { marginBottom: 10, padding: '10px 12px', borderRadius: 9, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: 11, lineHeight: 1.45 }
const collectingStyle: React.CSSProperties = { padding: 13, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155' }
const progressTrackStyle: React.CSSProperties = { marginTop: 10, width: '100%', height: 7, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }
const progressFillStyle: React.CSSProperties = { height: '100%', borderRadius: 999, background: '#2563eb' }
const recommendationStyle: React.CSSProperties = { padding: 13, borderRadius: 10, background: '#fbfdff', border: '1px solid #e2e8f0' }

