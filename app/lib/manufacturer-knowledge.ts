import { supabaseServer } from './supabase-server'

export type VerifiedManufacturerSource = {
  title: string
  url?: string
  type: 'web' | 'file'
}

export type VerifiedManufacturerKnowledge = {
  manufacturerNames: string[]
  productLabels: string[]
  evidenceText: string
  sources: VerifiedManufacturerSource[]
}

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '')

const tokenCandidates = (text: string) =>
  [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((value) => normalize(value))
      .filter((value) => value.length >= 4)
  )].slice(0, 40)

export async function getVerifiedManufacturerKnowledge(
  text: string
): Promise<VerifiedManufacturerKnowledge> {
  const empty: VerifiedManufacturerKnowledge = {
    manufacturerNames: [],
    productLabels: [],
    evidenceText: '',
    sources: [],
  }

  const normalizedText = normalize(text)
  if (!normalizedText) return empty

  const [{ data: manufacturers, error: manufacturerError }, { data: aliases, error: aliasError }] =
    await Promise.all([
      supabaseServer
        .from('Manufacturers')
        .select('id, name, slug, website_url')
        .eq('status', 'active')
        .order('name'),
      supabaseServer
        .from('VerifiedManufacturerAliases')
        .select('alias_normalized, canonical_manufacturer, confidence')
        .eq('verification_status', 'verified')
        .order('confidence', { ascending: false })
        .limit(1000),
    ])

  if (manufacturerError) throw manufacturerError
  if (aliasError) throw aliasError

  const canonicalMatches = new Set<string>()
  for (const alias of aliases || []) {
    const aliasNormalized = String(alias.alias_normalized || '')
    if (aliasNormalized.length >= 4 && normalizedText.includes(aliasNormalized)) {
      canonicalMatches.add(String(alias.canonical_manufacturer || '').toLowerCase())
    }
  }

  const matchedManufacturers = (manufacturers || []).filter((manufacturer) => {
    const name = normalize(String(manufacturer.name || ''))
    const slug = normalize(String(manufacturer.slug || ''))
    return (
      (name.length >= 4 && normalizedText.includes(name)) ||
      (slug.length >= 4 && normalizedText.includes(slug)) ||
      canonicalMatches.has(String(manufacturer.name || '').toLowerCase())
    )
  })

  if (!matchedManufacturers.length) return empty

  const modelTokens = tokenCandidates(text)
  if (!modelTokens.length) {
    return {
      ...empty,
      manufacturerNames: matchedManufacturers.map((item) => item.name),
    }
  }

  const manufacturerIds = matchedManufacturers.map((item) => item.id)
  const { data: products, error: productError } = await supabaseServer
    .from('ManufacturerProducts')
    .select('id, manufacturer_id, model, product_family, equipment_type, status, last_verified_at, model_normalized')
    .in('manufacturer_id', manufacturerIds)
    .eq('status', 'active')
    .in('model_normalized', modelTokens)
    .limit(12)

  if (productError) throw productError
  if (!products?.length) {
    return {
      ...empty,
      manufacturerNames: matchedManufacturers.map((item) => item.name),
    }
  }

  const productIds = products.map((item) => item.id)
  const { data: facts, error: factsError } = await supabaseServer
    .from('ManufacturerProductFacts')
    .select('id, product_id, fact_key, value_text, value_number, unit, value_json, source_document_id, source_locator, confidence, last_verified_at')
    .in('product_id', productIds)
    .eq('verification_status', 'verified')
    .order('fact_key')
    .limit(120)

  if (factsError) throw factsError

  const sourceDocumentIds = [...new Set((facts || []).map((fact) => fact.source_document_id).filter(Boolean))]
  const { data: documents, error: documentError } = sourceDocumentIds.length
    ? await supabaseServer
        .from('ManufacturerDocuments')
        .select('id, manufacturer_id, title, status, source_url, official_source_url, last_verified_at, document_type')
        .in('id', sourceDocumentIds)
    : { data: [], error: null }

  if (documentError) throw documentError

  const documentById = new Map((documents || []).map((document) => [document.id, document]))
  const manufacturerById = new Map(matchedManufacturers.map((manufacturer) => [manufacturer.id, manufacturer]))

  const usableFacts = (facts || []).filter((fact) => {
    const document = documentById.get(fact.source_document_id)
    return document && String(document.status || '').toLowerCase() === 'ready'
  })

  const lines: string[] = []
  for (const product of products) {
    const manufacturer = manufacturerById.get(product.manufacturer_id)
    const productFacts = usableFacts.filter((fact) => fact.product_id === product.id)
    if (!manufacturer || !productFacts.length) continue

    lines.push(
      [
        `Manufacturer: ${manufacturer.name}`,
        `Model: ${product.model}`,
        product.product_family ? `Product family: ${product.product_family}` : '',
        product.equipment_type ? `Equipment type: ${product.equipment_type}` : '',
      ].filter(Boolean).join('\n')
    )

    for (const fact of productFacts) {
      let value = ''
      if (fact.value_text != null) value = String(fact.value_text)
      else if (fact.value_number != null) value = `${fact.value_number}${fact.unit ? ` ${fact.unit}` : ''}`
      else if (fact.value_json != null) value = JSON.stringify(fact.value_json)

      const document = documentById.get(fact.source_document_id)
      lines.push(
        `- ${fact.fact_key}: ${value}${fact.source_locator ? ` [${fact.source_locator}]` : ''}${document?.title ? ` — source: ${document.title}` : ''}`
      )
    }
    lines.push('')
  }

  const sources: VerifiedManufacturerSource[] = []
  for (const document of documents || []) {
    if (String(document.status || '').toLowerCase() !== 'ready') continue
    const url = document.official_source_url || document.source_url || undefined
    if (sources.some((source) => source.title === document.title && source.url === url)) continue
    sources.push({
      title: document.title,
      url,
      type: url ? 'web' : 'file',
    })
  }

  return {
    manufacturerNames: matchedManufacturers.map((item) => item.name),
    productLabels: products.map((product) => {
      const manufacturer = manufacturerById.get(product.manufacturer_id)
      return [manufacturer?.name, product.model].filter(Boolean).join(' ')
    }),
    evidenceText: lines.join('\n').trim(),
    sources,
  }
}
