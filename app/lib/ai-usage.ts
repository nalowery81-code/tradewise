import { supabaseServer } from './supabase-server'

type UsageInput = {
  feature: string
  endpoint: string
  model: string
  conversationType?: string | null
  conversationId?: string | null
  response?: any
  chatCompletion?: any
  metadata?: Record<string, unknown>
}

const countToolCalls = (response: any, type: string) => {
  const output = Array.isArray(response?.output) ? response.output : []
  return output.filter((item: any) => item?.type === type).length
}

export async function recordAIUsage(input: UsageInput) {
  try {
    const responseUsage = input.response?.usage || {}
    const completionUsage = input.chatCompletion?.usage || {}

    const inputTokens = Number(
      responseUsage.input_tokens ??
      completionUsage.prompt_tokens ??
      0
    )
    const cachedInputTokens = Number(
      responseUsage.input_tokens_details?.cached_tokens ??
      completionUsage.prompt_tokens_details?.cached_tokens ??
      0
    )
    const outputTokens = Number(
      responseUsage.output_tokens ??
      completionUsage.completion_tokens ??
      0
    )
    const totalTokens = Number(
      responseUsage.total_tokens ??
      completionUsage.total_tokens ??
      inputTokens + outputTokens
    )

    const { error } = await supabaseServer.from('AIUsageEvents').insert({
      feature: input.feature,
      endpoint: input.endpoint,
      model: input.model,
      conversation_type: input.conversationType || null,
      conversation_id: input.conversationId || null,
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      web_search_calls: input.response ? countToolCalls(input.response, 'web_search_call') : 0,
      file_search_calls: input.response ? countToolCalls(input.response, 'file_search_call') : 0,
      metadata: input.metadata || {},
    })

    if (error) console.error('AI USAGE LOG INSERT ERROR:', error)
  } catch (error) {
    console.error('AI USAGE LOG ERROR:', error)
  }
}
