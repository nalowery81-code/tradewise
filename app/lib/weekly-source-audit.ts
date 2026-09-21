import { supabaseServer } from './supabase-server'

type StoredSource = {
  title?: string
  url?: string
  type?: string
}

type SourceCandidate = {
  messageId: string
  title: string
  url: string
}

type SourceCheckStatus = 'reachable' | 'redirected' | 'dead' | 'blocked' | 'unreachable' | 'invalid'

type SourceCheckResult = SourceCandidate & {
  status: SourceCheckStatus
  httpStatus: number | null
  finalUrl: string | null
  errorText: string | null
}

const ISSUE_STATUSES = new Set<SourceCheckStatus>(['dead', 'blocked', 'unreachable', 'invalid'])

const normalizeUrl = (value: string) => value.trim()

const checkOneSource = async (source: SourceCandidate): Promise<SourceCheckResult> => {
  let parsed: URL
  try {
    parsed = new URL(source.url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported URL protocol')
  } catch (error: any) {
    return {
      ...source,
      status: 'invalid',
      httpStatus: null,
      finalUrl: null,
      errorText: error?.message || 'Invalid URL',
    }
  }

  try {
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'CraftCompass-Source-Validator/1.0',
        Range: 'bytes=0-1023',
      },
    })

    const finalUrl = response.url || parsed.toString()
    const redirected = finalUrl !== parsed.toString()

    if (response.status >= 200 && response.status < 400) {
      return {
        ...source,
        status: redirected ? 'redirected' : 'reachable',
        httpStatus: response.status,
        finalUrl,
        errorText: null,
      }
    }

    if ([401, 403, 429].includes(response.status)) {
      return {
        ...source,
        status: 'blocked',
        httpStatus: response.status,
        finalUrl,
        errorText: `HTTP ${response.status}`,
      }
    }

    if ([404, 410].includes(response.status)) {
      return {
        ...source,
        status: 'dead',
        httpStatus: response.status,
        finalUrl,
        errorText: `HTTP ${response.status}`,
      }
    }

    return {
      ...source,
      status: 'unreachable',
      httpStatus: response.status,
      finalUrl,
      errorText: `HTTP ${response.status}`,
    }
  } catch (error: any) {
    return {
      ...source,
      status: 'unreachable',
      httpStatus: null,
      finalUrl: null,
      errorText: error?.name === 'TimeoutError' ? 'Timed out' : error?.message || 'Request failed',
    }
  }
}

export async function runWeeklySourceAudit(
  weeklyRunId: string,
  periodStart: Date,
  periodEnd: Date
) {
  const { data: rows, error } = await supabaseServer
    .from('Messages')
    .select('id, sources, created_at')
    .eq('role', 'assistant')
    .gte('created_at', periodStart.toISOString())
    .lte('created_at', periodEnd.toISOString())
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw error

  const byUrl = new Map<string, SourceCandidate>()

  for (const row of rows || []) {
    const sources = Array.isArray(row.sources) ? (row.sources as StoredSource[]) : []

    for (const source of sources) {
      const url = typeof source?.url === 'string' ? normalizeUrl(source.url) : ''
      if (!url || byUrl.has(url)) continue

      byUrl.set(url, {
        messageId: row.id,
        title: String(source?.title || url).trim() || url,
        url,
      })
    }
  }

  const candidates = [...byUrl.values()].slice(0, 24)
  const results: SourceCheckResult[] = []

  for (let index = 0; index < candidates.length; index += 6) {
    const batch = candidates.slice(index, index + 6)
    const checked = await Promise.all(batch.map(checkOneSource))
    results.push(...checked)
  }

  if (results.length > 0) {
    const { error: insertError } = await supabaseServer
      .from('WeeklySourceChecks')
      .insert(
        results.map((result) => ({
          weekly_run_id: weeklyRunId,
          message_id: result.messageId,
          source_title: result.title,
          source_url: result.url,
          status: result.status,
          http_status: result.httpStatus,
          final_url: result.finalUrl,
          error_text: result.errorText,
        }))
      )

    if (insertError) throw insertError
  }

  const issues = results.filter((result) => ISSUE_STATUSES.has(result.status))

  return {
    checkedCount: results.length,
    issueCount: issues.length,
    issues,
    redirectedCount: results.filter((result) => result.status === 'redirected').length,
  }
}
