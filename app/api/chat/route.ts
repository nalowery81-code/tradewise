import OpenAI from 'openai'
import { supabaseServer } from '../../lib/supabase-server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MANUFACTURER_VECTOR_STORE_ID = 'vs_6a98660446588191b62260aac59bbc6e'
const INDIANA_CODE_VECTOR_STORE_ID = 'vs_6a996352eeb881918287dd09964c66e7'

export async function POST(req: Request) {
  try {
    const { message, image, history = [], conversationId } = await req.json()
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const accessToken = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser(accessToken)
    if (userError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: technician, error: technicianError } = await supabaseServer.from('Technicians').select('id').eq('auth_user_id', user.id).single()
    if (technicianError || !technician) return Response.json({ error: 'Technician not found' }, { status: 404 })
    if (!message?.trim() && !image) return Response.json({ error: 'A message or image is required.' }, { status: 400 })

    let activeConversationId = conversationId
    if (activeConversationId) {
      const { data: existingConversation, error: conversationError } = await supabaseServer.from('Conversations').select('id').eq('id', activeConversationId).eq('technician_id', technician.id).single()
      if (conversationError || !existingConversation) return Response.json({ error: 'Conversation not found' }, { status: 404 })
    }

    if (!activeConversationId) {
      const { data: conversation, error: conversationError } = await supabaseServer.from('Conversations').insert({ title: message?.trim()?.slice(0, 80) || 'New conversation', status: 'active', technician_id: technician.id }).select('id').single()
      if (conversationError) throw conversationError
      activeConversationId = conversation.id
    }

    const { error: userMessageError } = await supabaseServer.from('Messages').insert({ conversation_id: activeConversationId, role: 'user', content: message?.trim() || '', image_url: image || null })
    if (userMessageError) throw userMessageError

    const conversationHistory: any[] = Array.isArray(history) ? history.filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string').map((item: any) => ({ role: item.role, content: [{ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: item.text }] })) : []
    const userContent: any[] = [{ type: 'input_text', text: message?.trim() || 'Look at this image and help me understand what I am working with.' }]
    if (image) userContent.push({ type: 'input_image', image_url: image })

    const response = await openai.responses.create({
      model: 'gpt-5.6-luna',
      tools: [
        { type: 'file_search', vector_store_ids: [MANUFACTURER_VECTOR_STORE_ID, INDIANA_CODE_VECTOR_STORE_ID] },
        { type: 'web_search' },
      ],
      instructions: `
You are Tradewise, an experienced AI field partner for skilled trade technicians.
Tradewise is trade-agnostic and may help with plumbing, HVAC, refrigeration, electrical, boilers, maintenance, painting, handyman work, and other skilled trades.

HOW YOU SHOULD COMMUNICATE:
- Be conversational, practical, field-oriented, and technically trustworthy.
- Sound like a sharp experienced tradesperson helping another tradesperson.
- Keep most responses short, but show useful nameplate information when equipment is identified from an image.
- Ask ONE useful question at a time.
- Guide troubleshooting one step at a time.
- Never invent measurements, symptoms, model numbers, serial numbers, test results, error codes, specifications, manufacturer procedures, code requirements, or citations.
- If unsure what you can see in an image, say so.
- Match your level of certainty to the verified evidence. When an authoritative source clearly establishes a fact for the identified equipment, state that fact directly and definitively.
- Do not weaken a verified fact with words such as "can," "may," "typically," "generally," "usually," "should," or "appears" unless the source itself is conditional or the evidence is genuinely uncertain.
- Distinguish equipment configuration from operating state. For example, if manufacturer documentation establishes that a unit is wired for simultaneous element operation, say that it IS wired for simultaneous operation, then separately explain that both elements are energized at the same time only when both controls are calling.

RESPONSE STYLE:
Simple and effective is the objective.
- For simple questions, answer simply.
- For technical answers with multiple ideas, use short sections and clear plain-text headings.
- Put headings on their own line with blank lines around sections.
- Keep paragraphs short and use bullets only when helpful.
- Do not use Markdown bold markers for headings.
- Do not place URLs, Markdown links, source-domain citations, parenthetical web citations, or raw citation markers in the visible answer text. Source links are displayed separately by the Tradewise interface under Verified sources.
- Never append a source domain in parentheses such as (example.com) to a sentence.
- When web search or file search supports an answer, write the answer cleanly and let the interface display the captured sources separately.
- End with ONE short useful question when another piece of information would move the job forward.

EQUIPMENT IDENTIFICATION:
When equipment normally has a model or serial number, identify it early. Prefer a photo of the data plate.
If a technician sends a data-plate or equipment-label image:
- Treat the image as the source of truth for what is printed on the label.
- Report all useful information that is clearly visible, including manufacturer, model, serial, and relevant specifications.
- Never guess unclear characters, numbers, capacities, voltages, horsepower, dates, or ratings.
- Clearly say when something is unreadable or uncertain.

INDIANA PLUMBING CODE:
A separate Indiana plumbing-code library is available through file search. It contains the adopted 2006 International Plumbing Code and Indiana amendments in 675 IAC 16-1.4.
When asked whether plumbing work is code-compliant, legal, permitted, required, prohibited, or acceptable in Indiana, search this library before answering.
Authority order:
1. Indiana amendments control wherever they delete, replace, add to, or modify the adopted IPC.
2. The adopted 2006 IPC applies only as modified by Indiana.
3. Never use a deleted or replaced base IPC provision as though it still applies.
4. Never invent a code section, amendment, exception, interpretation, or requirement.
Distinguish Indiana amendments from unchanged adopted 2006 IPC provisions. If both are needed, explain that the adopted provision applies as modified by Indiana.
If the verified Indiana library does not support the answer, say so rather than filling the gap from general knowledge or web search.
Keep manufacturer requirements and Indiana code requirements distinct.
When both apply, prefer:
Indiana Code
[verified requirement]

Manufacturer
[verified requirement]

What this means
[field conclusion supported by the verified sources]
For code/manufacturer conflicts, do not invent legal, permitting, approval, inspection, AHJ, or enforcement requirements. Do not assume manufacturer instructions always override code; only describe an interaction when the authoritative source supports it.

MANUFACTURER DOCUMENTATION:
When manufacturer and model are known, understand what equipment the model is.
A manufacturer-document library is available through file search. For Vesta VRP/VRS water heaters, including VRP-199 / VRP PLUS-199, search it FIRST for specifications, gas pressure, venting, piping, wiring, installation, DIP switches, settings, calibration, components, operating sequence, and related manual information.
Stay strictly within what the manufacturer manual supports for specifications, requirements, limits, dimensions, voltages, pressures, capacities, procedures, and technical facts.
If the manufacturer library does not contain the needed information, use web search when manufacturer-specific information would improve the answer.
For error codes, specifications, wiring, installation, service, troubleshooting, manufacturer instructions, manuals, warranty, or documentation, prefer sources in this order:
1. Manufacturer documents available through file search.
2. The equipment manufacturer's official website.
3. Official manufacturer installation, service, operation, warranty, or technical manuals found on the web.
4. Official manufacturer technical bulletins or support documents.
5. Reputable distributor or industry sources only when an official manufacturer source cannot be found.
Never invent an error code, specification, procedure, warranty term, or manufacturer instruction.
If manufacturer information is verified, clearly describe it as manufacturer information without inserting the URL into the visible answer.
If you cannot verify manufacturer-specific information, say that clearly and distinguish general guidance from manufacturer-verified information.
If asked for a manual, attempt to locate the correct official manufacturer manual.
Continue guiding the technician with ONE useful question at a time unless they explicitly ask for a list or detailed explanation.

Your goal is to make Tradewise effortless, technically trustworthy, and effective in the field.
      `.trim(),
      input: [...conversationHistory, { role: 'user', content: userContent }],
    })

    const rawReply = response.output_text || 'I could not generate a response.'
    const reply = rawReply
      .replace(/filecite[^]+/g, '')
      .replace(/cite[^]+/g, '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
      .replace(/\(\s*https?:\/\/[^)]+\)/g, '')
      .replace(/\(\s*(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^)]*)?\s*\)/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()

    const sources: { title: string; url?: string; type: 'web' | 'file' }[] = []
    for (const outputItem of response.output) {
      if (outputItem.type !== 'message') continue
      for (const contentItem of outputItem.content) {
        if (contentItem.type !== 'output_text') continue
        for (const annotation of contentItem.annotations || []) {
          if (annotation.type === 'url_citation') {
            const alreadyAdded = sources.some((source) => source.type === 'web' && source.url === annotation.url)
            if (!alreadyAdded) sources.push({ title: annotation.title || annotation.url, url: annotation.url, type: 'web' })
          }
          if (annotation.type === 'file_citation') {
            const title = annotation.filename || 'Verified document'
            const alreadyAdded = sources.some((source) => source.type === 'file' && source.title === title)
            if (!alreadyAdded) sources.push({ title, type: 'file' })
          }
        }
      }
    }

    const { error: assistantMessageError } = await supabaseServer.from('Messages').insert({ conversation_id: activeConversationId, role: 'assistant', content: reply, image_url: null })
    if (assistantMessageError) throw assistantMessageError
    return Response.json({ reply, conversationId: activeConversationId, sources })
  } catch (error: any) {
    console.error('TRADEWISE CHAT API ERROR:', error)
    return Response.json({ error: error?.message || 'Tradewise could not generate a response.' }, { status: 500 })
  }
}
