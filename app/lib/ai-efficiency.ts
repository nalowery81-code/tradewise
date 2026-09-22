export type FeatureUsage = {
  feature: string
  calls: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  webSearchCalls: number
  fileSearchCalls: number
  models: string[]
}

export type EfficiencyRecommendation = {
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
}

export type EfficiencyAnalysis = {
  status: 'collecting' | 'ready'
  totalCalls: number
  minimumCalls: number
  recommendations: EfficiencyRecommendation[]
  message: string
}

const MIN_TOTAL_CALLS = 10
const MIN_FEATURE_CALLS = 5

const pct = (value: number) => `${Math.round(value * 100)}%`

export function analyzeAIEfficiency(features: FeatureUsage[]): EfficiencyAnalysis {
  const totalCalls = features.reduce((sum, feature) => sum + feature.calls, 0)

  if (totalCalls < MIN_TOTAL_CALLS) {
    return {
      status: 'collecting',
      totalCalls,
      minimumCalls: MIN_TOTAL_CALLS,
      recommendations: [],
      message: `Collecting evidence. CraftCompass has logged ${totalCalls} of the first ${MIN_TOTAL_CALLS} AI calls needed before efficiency recommendations become actionable.`,
    }
  }

  const recommendations: EfficiencyRecommendation[] = []

  for (const feature of features) {
    if (feature.calls < MIN_FEATURE_CALLS) continue

    const avgTokens = feature.totalTokens / Math.max(1, feature.calls)
    const webRate = feature.webSearchCalls / Math.max(1, feature.calls)
    const fileRate = feature.fileSearchCalls / Math.max(1, feature.calls)
    const cacheRate = feature.inputTokens > 0
      ? feature.cachedInputTokens / feature.inputTokens
      : 0

    if (feature.webSearchCalls >= 5 && webRate >= 0.5) {
      recommendations.push({
        id: `${feature.feature}:web-search`,
        feature: feature.feature,
        title: 'Review when web search is triggered',
        finding: `${feature.webSearchCalls} web searches were used across ${feature.calls} ${feature.feature.replace(/_/g, ' ')} calls (${pct(webRate)} of calls).`,
        action: 'Look for repeated manufacturer, product, or reference lookups that can reuse already-verified information before launching a new web search. Keep fresh searches for current availability, changing information, or questions that genuinely need the web.',
        evidence: `${feature.webSearchCalls} web searches / ${feature.calls} calls`,
        savingsEstimate: 'Potentially fewer paid web-search tool calls',
        savingsBasis: 'Opportunity only; measure before/after search-call count before claiming dollar savings.',
        qualityRisk: 'medium',
        priority: webRate >= 0.8 ? 'review' : 'opportunity',
      })
    }

    if (avgTokens >= 20000) {
      recommendations.push({
        id: `${feature.feature}:context`,
        feature: feature.feature,
        title: 'Inspect context size',
        finding: `${feature.feature.replace(/_/g, ' ')} is averaging ${Math.round(avgTokens).toLocaleString()} tokens per AI call.`,
        action: 'Inspect whether old conversation history, repeated instructions, or unrelated context can be removed before the model call. Preserve safety rules, active guidance, relevant job history, and verified technical evidence.',
        evidence: `${Math.round(avgTokens).toLocaleString()} average total tokens per call`,
        savingsEstimate: 'Potential token reduction if irrelevant context is found',
        savingsBasis: 'No savings percentage is shown until a before/after test measures token reduction without quality loss.',
        qualityRisk: 'medium',
        priority: avgTokens >= 40000 ? 'review' : 'opportunity',
      })
    }

    if (feature.inputTokens >= 50000 && cacheRate < 0.15) {
      recommendations.push({
        id: `${feature.feature}:cache`,
        feature: feature.feature,
        title: 'Check prompt-cache friendliness',
        finding: `Only ${pct(cacheRate)} of input tokens for ${feature.feature.replace(/_/g, ' ')} were reported as cached.`,
        action: 'Keep stable instructions and reusable guidance in a consistent prefix, and move turn-specific content later in the request where possible. Do not remove instructions simply to improve caching.',
        evidence: `${feature.cachedInputTokens.toLocaleString()} cached / ${feature.inputTokens.toLocaleString()} input tokens`,
        savingsEstimate: 'Potentially lower input-processing cost',
        savingsBasis: 'Opportunity only; caching depends on request structure and provider behavior, so validate with measured cached-token changes.',
        qualityRisk: 'low',
        priority: 'opportunity',
      })
    }

    if (feature.fileSearchCalls >= 5 && fileRate >= 0.8 && avgTokens >= 15000) {
      recommendations.push({
        id: `${feature.feature}:file-search`,
        feature: feature.feature,
        title: 'Review repeated file-search work',
        finding: `${feature.fileSearchCalls} file searches occurred across ${feature.calls} calls, while average call size is ${Math.round(avgTokens).toLocaleString()} tokens.`,
        action: 'Check whether the same verified manual/code passages are repeatedly retrieved during one conversation. Reuse already-retrieved evidence within the active thread when it is still applicable; do not cache across equipment or code contexts where accuracy could change.',
        evidence: `${feature.fileSearchCalls} file searches / ${feature.calls} calls`,
        savingsEstimate: 'Potentially fewer repeated retrieval/tool operations',
        savingsBasis: 'Measure retrieval count before and after; do not assume a dollar amount.',
        qualityRisk: 'medium',
        priority: 'opportunity',
      })
    }
  }

  const tech = features.find((feature) => feature.feature === 'technician_chat')
  const follow = features.find((feature) => feature.feature === 'technician_follow_up')
  if (tech && follow && tech.calls >= MIN_FEATURE_CALLS && follow.calls >= MIN_FEATURE_CALLS) {
    const followRate = follow.calls / Math.max(1, tech.calls)
    if (followRate >= 0.75) {
      recommendations.push({
        id: 'technician_follow_up:frequency',
        feature: 'technician_follow_up',
        title: 'Measure follow-up question value',
        finding: `A separate follow-up-generation call ran after ${pct(followRate)} of technician-chat calls.`,
        action: 'Compare follow-up usage with technician engagement before changing it. If many generated questions add little value, consider generating a follow-up only when the primary answer does not already contain a useful question.',
        evidence: `${follow.calls} follow-up calls / ${tech.calls} technician-chat calls`,
        savingsEstimate: 'Potentially fewer secondary model calls',
        savingsBasis: 'Do not reduce this behavior until engagement/quality evidence shows the second call is unnecessary.',
        qualityRisk: 'medium',
        priority: 'watch',
      })
    }
  }

  const reflection = features.find((feature) => feature.feature === 'reflection_extraction')
  if (tech && reflection && tech.calls >= MIN_FEATURE_CALLS && reflection.calls >= MIN_FEATURE_CALLS) {
    const reflectionRate = reflection.calls / Math.max(1, tech.calls)
    if (reflectionRate >= 0.8) {
      recommendations.push({
        id: 'reflection_extraction:frequency',
        feature: 'reflection_extraction',
        title: 'Evaluate reflection pre-filtering',
        finding: `Reflection extraction ran after ${pct(reflectionRate)} of technician-chat calls.`,
        action: 'Measure how often reflection extraction returns “capture: false.” If most calls produce no reflection, add a conservative deterministic pre-filter for clearly ordinary technical turns, while keeping AI review for ambiguous manager-relevant signals.',
        evidence: `${reflection.calls} reflection-extraction calls / ${tech.calls} technician-chat calls`,
        savingsEstimate: 'Potentially fewer background model calls',
        savingsBasis: 'Requires capture/no-capture outcome telemetry before estimating savings.',
        qualityRisk: 'medium',
        priority: 'watch',
      })
    }
  }

  const priorityOrder = { review: 0, opportunity: 1, watch: 2 }
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return {
    status: 'ready',
    totalCalls,
    minimumCalls: MIN_TOTAL_CALLS,
    recommendations: recommendations.slice(0, 8),
    message: recommendations.length
      ? 'Recommendations are based on CraftCompass feature telemetry only. They do not automatically change app behavior.'
      : 'Enough usage has been collected, but no current pattern crosses the conservative optimization thresholds.',
  }
}
