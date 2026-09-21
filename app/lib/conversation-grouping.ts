export type ConversationGroup<T> = {
  id: string
  primary: T
  items: T[]
}

const STOP_WORDS = new Set([
  'a','an','and','about','are','as','at','be','can','did','do','does','for','from','had','have',
  'i','in','is','it','me','my','of','on','or','that','the','this','to','was','we','what','when',
  'where','which','who','with','you','your','asked','asking','remember',
])

const normalizeTitle = (value: string) =>
  value
    .toLowerCase()
    .replace(/flushometer/g, 'flush valve')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word))
    .join(' ')
    .trim()

const tokenSet = (value: string) => new Set(normalizeTitle(value).split(/\s+/).filter(Boolean))

const similarity = (a: string, b: string) => {
  const left = tokenSet(a)
  const right = tokenSet(b)
  if (left.size === 0 || right.size === 0) return 0

  let intersection = 0
  for (const token of left) if (right.has(token)) intersection += 1

  const union = new Set([...left, ...right]).size
  const jaccard = union ? intersection / union : 0

  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  const containment =
    na && nb && (na.includes(nb) || nb.includes(na))
      ? Math.min(1, Math.min(na.length, nb.length) / Math.max(1, Math.max(na.length, nb.length)) + 0.35)
      : 0

  return Math.max(jaccard, containment)
}

export function groupSimilarConversations<T>(
  items: T[],
  options: {
    getId: (item: T) => string
    getTitle: (item: T) => string
    getTime: (item: T) => string
    getOwner: (item: T) => string
    maxHours?: number
    threshold?: number
  }
): ConversationGroup<T>[] {
  const maxMs = (options.maxHours ?? 12) * 60 * 60 * 1000
  const threshold = options.threshold ?? 0.6
  const groups: ConversationGroup<T>[] = []

  for (const item of items) {
    const itemTime = new Date(options.getTime(item)).getTime()
    const owner = options.getOwner(item)
    const title = options.getTitle(item)

    const match = groups.find((group) => {
      if (options.getOwner(group.primary) !== owner) return false
      const primaryTime = new Date(options.getTime(group.primary)).getTime()
      if (!Number.isFinite(itemTime) || !Number.isFinite(primaryTime) || Math.abs(primaryTime - itemTime) > maxMs) return false
      return similarity(options.getTitle(group.primary), title) >= threshold
    })

    if (match) {
      match.items.push(item)
    } else {
      groups.push({
        id: options.getId(item),
        primary: item,
        items: [item],
      })
    }
  }

  return groups
}
