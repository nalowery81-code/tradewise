import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) },
  })

type CostBucket = {
  start_time: number
  end_time: number
  results?: {
    amount?: { value?: number; currency?: string }
    line_item?: string | null
    project_id?: string | null
  }[]
}

type UsageBucket = {
  start_time: number
  end_time: number
  results?: {
    model?: string | null
    input_tokens?: number
    output_tokens?: number
    input_cached_tokens?: number
    num_model_requests?: number
  }[]
}

const sumCostBuckets = (buckets: CostBucket[]) =>
  buckets.reduce(
    (sum, bucket) =>
      sum +
      (bucket.results || []).reduce(
        (bucketSum, result) => bucketSum + Number(result.amount?.value || 0),
        0
      ),
    0
  )

const fetchOpenAI = async (url: string, adminKey: string) => {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `OpenAI API returned HTTP ${response.status}.`
    throw new Error(message)
  }
  return data
}

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const adminKey = process.env.OPENAI_ADMIN_KEY?.trim()
  if (!adminKey) {
    return jsonNoStore({
      configured: false,
      reason: 'OPENAI_ADMIN_KEY is not configured in the production environment.',
    })
  }

  try {
    const now = new Date()
    const endTime = Math.floor(now.getTime() / 1000)
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthStartTime = Math.floor(monthStart.getTime() / 1000)
    const fourteenDaysAgo = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000)
    fourteenDaysAgo.setUTCHours(0, 0, 0, 0)
    const fourteenDayStart = Math.floor(fourteenDaysAgo.getTime() / 1000)

    const costParams = new URLSearchParams({
      start_time: String(Math.min(monthStartTime, fourteenDayStart)),
      end_time: String(endTime),
      bucket_width: '1d',
      limit: '60',
    })
    costParams.append('group_by[]', 'line_item')

    const usageParams = new URLSearchParams({
      start_time: String(fourteenDayStart),
      end_time: String(endTime),
      bucket_width: '1d',
      limit: '14',
    })
    usageParams.append('group_by[]', 'model')

    const [costData, usageResult] = await Promise.all([
      fetchOpenAI(
        `https://api.openai.com/v1/organization/costs?${costParams.toString()}`,
        adminKey
      ),
      fetchOpenAI(
        `https://api.openai.com/v1/organization/usage/completions?${usageParams.toString()}`,
        adminKey
      ).catch((error: any) => ({
        data: [],
        usage_error: error?.message || 'Could not load model usage.',
      })),
    ])

    const costBuckets = (Array.isArray(costData?.data) ? costData.data : []) as CostBucket[]
    const usageBuckets = (Array.isArray(usageResult?.data) ? usageResult.data : []) as UsageBucket[]

    const dailyMap = new Map<number, number>()
    const lineItemMap = new Map<string, number>()

    for (const bucket of costBuckets) {
      const total = (bucket.results || []).reduce(
        (sum, result) => sum + Number(result.amount?.value || 0),
        0
      )
      dailyMap.set(bucket.start_time, (dailyMap.get(bucket.start_time) || 0) + total)

      for (const result of bucket.results || []) {
        const lineItem = String(result.line_item || 'Other')
        lineItemMap.set(
          lineItem,
          (lineItemMap.get(lineItem) || 0) + Number(result.amount?.value || 0)
        )
      }
    }

    const daily = [...dailyMap.entries()]
      .map(([startTime, cost]) => ({
        date: new Date(startTime * 1000).toISOString().slice(0, 10),
        cost,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const monthDaily = daily.filter(
      (item) => new Date(`${item.date}T00:00:00Z`).getTime() >= monthStart.getTime()
    )
    const last14Daily = daily.slice(-14)
    const todayKey = now.toISOString().slice(0, 10)
    const today = daily.find((item) => item.date === todayKey)?.cost || 0
    const last7 = daily.slice(-7).reduce((sum, item) => sum + item.cost, 0)
    const monthToDate = monthDaily.reduce((sum, item) => sum + item.cost, 0)

    const elapsedDays = Math.max(1, now.getUTCDate())
    const daysInMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
    ).getUTCDate()
    const projectedMonthEnd = (monthToDate / elapsedDays) * daysInMonth

    const modelMap = new Map<
      string,
      {
        model: string
        requests: number
        inputTokens: number
        cachedInputTokens: number
        outputTokens: number
      }
    >()

    for (const bucket of usageBuckets) {
      for (const result of bucket.results || []) {
        const model = String(result.model || 'Unknown model')
        const current =
          modelMap.get(model) || {
            model,
            requests: 0,
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
          }
        current.requests += Number(result.num_model_requests || 0)
        current.inputTokens += Number(result.input_tokens || 0)
        current.cachedInputTokens += Number(result.input_cached_tokens || 0)
        current.outputTokens += Number(result.output_tokens || 0)
        modelMap.set(model, current)
      }
    }

    const modelUsage = [...modelMap.values()].sort(
      (a, b) =>
        b.inputTokens +
        b.outputTokens -
        (a.inputTokens + a.outputTokens)
    )

    const lineItems = [...lineItemMap.entries()]
      .map(([name, cost]) => ({ name, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8)

    return jsonNoStore({
      configured: true,
      currency: 'usd',
      generatedAt: now.toISOString(),
      today,
      last7,
      monthToDate,
      projectedMonthEnd,
      daily: last14Daily,
      lineItems,
      modelUsage: modelUsage.slice(0, 8),
      usageError: usageResult?.usage_error || null,
      source: 'OpenAI organization Costs and Usage APIs',
    })
  } catch (error: any) {
    console.error('OPENAI COST TRACKER ERROR:', error)
    return jsonNoStore(
      {
        configured: true,
        error: error?.message || 'Could not load OpenAI cost data.',
      },
      { status: 502 }
    )
  }
}
