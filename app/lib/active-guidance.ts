import { supabaseServer } from './supabase-server'

export type GuidanceScope = 'technician' | 'management'

export async function getActiveGuidance(scope: GuidanceScope) {
  const { data, error } = await supabaseServer
    .from('GuidanceLibrary')
    .select('id, title, guidance_text, topic, priority, scope')
    .eq('status', 'active')
    .in('scope', ['all', scope])
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(30)

  if (error) {
    console.error('ACTIVE GUIDANCE LOAD ERROR:', error)
    return ''
  }
  if (!data?.length) return ''

  return data.map((item, index) => {
    const topic = item.topic ? ` [${item.topic}]` : ''
    return `${index + 1}. ${item.title}${topic}: ${item.guidance_text}`
  }).join('\n')
}
