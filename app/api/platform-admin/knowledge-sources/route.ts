import { requirePlatformAdmin } from '../../../lib/platform-admin-auth'
import { supabaseServer } from '../../../lib/supabase-server'

export const dynamic = 'force-dynamic'

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init?.headers || {}) } })

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

async function audit(adminProfileId: string | null, entityType: string, entityId: string | null, action: string, afterState: unknown, note?: string) {
  const { error } = await supabaseServer.from('PlatformAdminKnowledgeAudit').insert({
    admin_profile_id: adminProfileId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    after_state: afterState,
    note: note || null,
  })
  if (error) console.error('KNOWLEDGE AUDIT ERROR:', error)
}

export async function GET(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const [documents, editions, sections, relationships, sourceChecks, manufacturers, products, facts, manufacturerDocuments] = await Promise.all([
    supabaseServer.from('VerifiedSourceDocuments')
      .select('id, code_edition_id, title, source_type, authority, source_url, content_rights, publication_date, effective_from, effective_to, status, last_verified_at, created_at')
      .order('created_at', { ascending: false }),
    supabaseServer.from('VerifiedCodeEditions')
      .select('id, jurisdiction_id, code_family, title, rule_citation, model_code_title, model_code_edition, effective_from, effective_to, status, source_authority, source_url, last_verified_at, created_at')
      .order('created_at', { ascending: false }),
    supabaseServer.from('VerifiedCodeSections')
      .select('id, source_document_id, code_edition_id, status, last_verified_at'),
    supabaseServer.from('VerifiedCodeRelationships').select('id'),
    supabaseServer.from('WeeklySourceChecks')
      .select('id, source_title, source_url, status, http_status, final_url, error_text, checked_at')
      .order('checked_at', { ascending: false })
      .limit(100),
    supabaseServer.from('Manufacturers')
      .select('id, name, slug, website_url, status, notes, created_at, updated_at')
      .order('name'),
    supabaseServer.from('ManufacturerProducts')
      .select('id, manufacturer_id, model, product_family, equipment_type, sku, status, last_verified_at, created_at, updated_at')
      .order('model')
      .limit(2000),
    supabaseServer.from('ManufacturerProductFacts')
      .select('id, product_id, fact_key, value_text, value_number, unit, value_json, source_document_id, source_locator, verification_status, confidence, last_verified_at')
      .order('fact_key')
      .limit(5000),
    supabaseServer.from('ManufacturerDocuments')
      .select('id, manufacturer_id, manufacturer, model, document_type, title, source_url, official_source_url, status, equipment_type, content_rights, last_verified_at, created_at')
      .order('created_at', { ascending: false })
      .limit(2000),
  ])

  const error = documents.error || editions.error || sections.error || relationships.error || sourceChecks.error ||
    manufacturers.error || products.error || facts.error || manufacturerDocuments.error
  if (error) {
    console.error('KNOWLEDGE SOURCES LOAD ERROR:', error)
    return jsonNoStore({ error: 'Could not load knowledge and source data.' }, { status: 500 })
  }

  const sectionRows = sections.data || []
  const documentRows = (documents.data || []).map((document) => ({
    ...document,
    sectionCount: sectionRows.filter((section) => section.source_document_id === document.id).length,
  }))
  const editionRows = (editions.data || []).map((edition) => ({
    ...edition,
    sectionCount: sectionRows.filter((section) => section.code_edition_id === edition.id).length,
    documentCount: documentRows.filter((document) => document.code_edition_id === edition.id).length,
  }))
  const checks = sourceChecks.data || []
  const issueStatuses = new Set(['dead', 'blocked', 'unreachable', 'invalid'])

  const manufacturerRows = (manufacturers.data || []).map((manufacturer) => {
    const manufacturerProducts = (products.data || []).filter((product) => product.manufacturer_id === manufacturer.id)
    const productIds = new Set(manufacturerProducts.map((product) => product.id))
    const manufacturerFacts = (facts.data || []).filter((fact) => productIds.has(fact.product_id))
    const manufacturerDocs = (manufacturerDocuments.data || []).filter((doc) => doc.manufacturer_id === manufacturer.id)
    return {
      ...manufacturer,
      productCount: manufacturerProducts.length,
      verifiedFactCount: manufacturerFacts.filter((fact) => fact.verification_status === 'verified').length,
      sourceCount: manufacturerDocs.length,
      readySourceCount: manufacturerDocs.filter((doc) => doc.status === 'ready').length,
    }
  })

  return jsonNoStore({
    generatedAt: new Date().toISOString(),
    documents: documentRows,
    editions: editionRows,
    recentChecks: checks,
    manufacturers: manufacturerRows,
    manufacturerProducts: products.data || [],
    manufacturerFacts: facts.data || [],
    manufacturerDocuments: manufacturerDocuments.data || [],
    summary: {
      documents: documentRows.length,
      currentDocuments: documentRows.filter((document) => document.status === 'current').length,
      editions: editionRows.length,
      currentEditions: editionRows.filter((edition) => edition.status === 'current').length,
      sections: sectionRows.length,
      currentSections: sectionRows.filter((section) => section.status === 'current').length,
      relationships: relationships.data?.length || 0,
      recentChecks: checks.length,
      recentCheckIssues: checks.filter((check) => issueStatuses.has(String(check.status || ''))).length,
      manufacturers: manufacturerRows.length,
      manufacturerProducts: products.data?.length || 0,
      verifiedManufacturerFacts: (facts.data || []).filter((fact) => fact.verification_status === 'verified').length,
      manufacturerSources: manufacturerDocuments.data?.length || 0,
    },
  })
}

export async function POST(request: Request) {
  const access = await requirePlatformAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '')

  if (action === 'create_manufacturer') {
    const name = String(body.name || '').trim()
    if (!name) return jsonNoStore({ error: 'Manufacturer name is required.' }, { status: 400 })
    const row = {
      name,
      slug: slugify(name),
      website_url: String(body.websiteUrl || '').trim() || null,
      notes: String(body.notes || '').trim() || null,
      status: 'active',
    }
    const { data, error } = await supabaseServer.from('Manufacturers').insert(row).select('*').single()
    if (error) return jsonNoStore({ error: error.message }, { status: 400 })
    await audit(access.profileId || null, 'manufacturer', data.id, 'create', data)
    return jsonNoStore({ manufacturer: data })
  }

  if (action === 'create_product') {
    const manufacturerId = String(body.manufacturerId || '')
    const model = String(body.model || '').trim()
    if (!manufacturerId || !model) return jsonNoStore({ error: 'Manufacturer and model are required.' }, { status: 400 })
    const row = {
      manufacturer_id: manufacturerId,
      model,
      product_family: String(body.productFamily || '').trim() || null,
      equipment_type: String(body.equipmentType || '').trim() || null,
      sku: String(body.sku || '').trim() || null,
      description: String(body.description || '').trim() || null,
      status: 'active',
    }
    const { data, error } = await supabaseServer.from('ManufacturerProducts').insert(row).select('*').single()
    if (error) return jsonNoStore({ error: error.message }, { status: 400 })
    await audit(access.profileId || null, 'manufacturer_product', data.id, 'create', data)
    return jsonNoStore({ product: data })
  }

  if (action === 'register_source') {
    const manufacturerId = String(body.manufacturerId || '')
    const title = String(body.title || '').trim()
    const sourceUrl = String(body.sourceUrl || '').trim()
    if (!manufacturerId || !title || !sourceUrl) return jsonNoStore({ error: 'Manufacturer, title, and source URL are required.' }, { status: 400 })

    const { data: manufacturer, error: manufacturerError } = await supabaseServer
      .from('Manufacturers').select('id, name').eq('id', manufacturerId).single()
    if (manufacturerError || !manufacturer) return jsonNoStore({ error: 'Manufacturer not found.' }, { status: 404 })

    const row = {
      manufacturer_id: manufacturerId,
      manufacturer: manufacturer.name,
      model: String(body.model || '').trim() || null,
      document_type: String(body.documentType || '').trim() || 'Manufacturer source',
      title,
      source_url: sourceUrl,
      official_source_url: String(body.officialSourceUrl || '').trim() || sourceUrl,
      equipment_type: String(body.equipmentType || '').trim() || null,
      content_rights: String(body.contentRights || '').trim() || 'reference_only',
      status: 'queued',
      cache_status: 'pending',
      retention_status: 'reference_only',
    }
    const { data, error } = await supabaseServer.from('ManufacturerDocuments').insert(row).select('*').single()
    if (error) return jsonNoStore({ error: error.message }, { status: 400 })
    await audit(access.profileId || null, 'manufacturer_source', data.id, 'register', data)
    return jsonNoStore({ source: data })
  }

  if (action === 'create_fact') {
    const productId = String(body.productId || '')
    const sourceDocumentId = String(body.sourceDocumentId || '')
    const factKey = String(body.factKey || '').trim()
    const valueText = body.valueText == null ? '' : String(body.valueText).trim()
    if (!productId || !sourceDocumentId || !factKey || !valueText) {
      return jsonNoStore({ error: 'Product, source document, fact key, and value are required.' }, { status: 400 })
    }

    const [{ data: product }, { data: source }] = await Promise.all([
      supabaseServer.from('ManufacturerProducts').select('id, manufacturer_id').eq('id', productId).single(),
      supabaseServer.from('ManufacturerDocuments').select('id, manufacturer_id, status').eq('id', sourceDocumentId).single(),
    ])
    if (!product || !source) return jsonNoStore({ error: 'Product or source document not found.' }, { status: 404 })
    if (product.manufacturer_id !== source.manufacturer_id) return jsonNoStore({ error: 'The source must belong to the same manufacturer as the product.' }, { status: 400 })
    if (source.status !== 'ready') return jsonNoStore({ error: 'Only verified ready sources can support a product fact.' }, { status: 400 })

    const row = {
      product_id: productId,
      fact_key: factKey,
      value_text: valueText,
      unit: String(body.unit || '').trim() || null,
      source_document_id: sourceDocumentId,
      source_locator: String(body.sourceLocator || '').trim() || null,
      verification_status: 'verified',
      confidence: 1,
      last_verified_at: new Date().toISOString(),
    }
    const { data, error } = await supabaseServer.from('ManufacturerProductFacts').insert(row).select('*').single()
    if (error) return jsonNoStore({ error: error.message }, { status: 400 })
    await audit(access.profileId || null, 'manufacturer_fact', data.id, 'create_verified_fact', data)
    return jsonNoStore({ fact: data })
  }

  return jsonNoStore({ error: 'Unsupported action.' }, { status: 400 })
}
