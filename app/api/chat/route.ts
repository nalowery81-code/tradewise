import OpenAI from 'openai'
import { supabaseServer } from '../../lib/supabase-server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const MANUFACTURER_VECTOR_STORE_ID =
  'vs_6a98660446588191b62260aac59bbc6e'

const INDIANA_CODE_VECTOR_STORE_ID =
  'vs_6a996352eeb881918287dd09964c66e7'

export async function POST(req: Request) {
  try {
    const { message, image, history = [], conversationId } = await req.json()

    const authHeader = req.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const accessToken = authHeader.replace('Bearer ', '')

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(accessToken)

    if (userError || !user) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: technician, error: technicianError } =
      await supabaseServer
        .from('Technicians')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

    if (technicianError || !technician) {
      return Response.json(
        { error: 'Technician not found' },
        { status: 404 }
      )
    }

    if (!message?.trim() && !image) {
      return Response.json(
        { error: 'A message or image is required.' },
        { status: 400 }
      )
    }

    let activeConversationId = conversationId

    if (activeConversationId) {
      const { data: existingConversation, error: conversationError } =
        await supabaseServer
          .from('Conversations')
          .select('id')
          .eq('id', activeConversationId)
          .eq('technician_id', technician.id)
          .single()

      if (conversationError || !existingConversation) {
        return Response.json(
          { error: 'Conversation not found' },
          { status: 404 }
        )
      }
    }

    if (!activeConversationId) {
      const { data: conversation, error: conversationError } =
        await supabaseServer
          .from('Conversations')
          .insert({
            title: message?.trim()?.slice(0, 80) || 'New conversation',
            status: 'active',
            technician_id: technician.id,
          })
          .select('id')
          .single()

      if (conversationError) {
        console.error('CONVERSATION CREATE ERROR:', conversationError)
        throw conversationError
      }

      activeConversationId = conversation.id
    }

    const { error: userMessageError } = await supabaseServer
      .from('Messages')
      .insert({
        conversation_id: activeConversationId,
        role: 'user',
        content: message?.trim() || '',
        image_url: image || null,
      })

    if (userMessageError) {
      console.error('USER MESSAGE SAVE ERROR:', userMessageError)
      throw userMessageError
    }

    const conversationHistory: any[] = Array.isArray(history)
      ? history
          .filter(
            (item: any) =>
              item &&
              (item.role === 'user' || item.role === 'assistant') &&
              typeof item.text === 'string'
          )
          .map((item: any) => ({
            role: item.role,
            content: [
              {
                type:
                  item.role === 'assistant'
                    ? 'output_text'
                    : 'input_text',
                text: item.text,
              },
            ],
          }))
      : []

    const userContent: any[] = [
      {
        type: 'input_text',
        text:
          message?.trim() ||
          'Look at this image and help me understand what I am working with.',
      },
    ]

    if (image) {
      userContent.push({
        type: 'input_image',
        image_url: image,
      })
    }

    const response = await openai.responses.create({
      model: 'gpt-5.6-luna',

      tools: [
        {
          type: 'file_search',
         vector_store_ids: [
  MANUFACTURER_VECTOR_STORE_ID,
  INDIANA_CODE_VECTOR_STORE_ID,
],
        },
        {
          type: 'web_search',
        },
      ],

      instructions: `
You are Tradewise, an experienced AI field partner for skilled trade technicians.

Tradewise is trade-agnostic. You may help technicians working in plumbing, HVAC, refrigeration, electrical, boilers, maintenance, painting, handyman work, and other skilled trades.

HOW YOU SHOULD COMMUNICATE:

- Be conversational, practical, and field-oriented.
- Sound like a sharp experienced tradesperson helping another tradesperson.
- Be empathetic, not sympathetic.
- Keep most responses short.
- Usually respond with about one short sentence.
- Ask ONE useful question at a time.
- Do not front-load information.
- Do not dump long checklists unless the technician asks for one.
- Do not over-explain.
- Respond naturally to exactly what the technician just told you.
- Guide troubleshooting one step at a time.
- Never invent measurements, symptoms, model numbers, serial numbers, conditions, test results, error codes, specifications, or manufacturer procedures.
- If you are unsure what you can see in an image, say so.

EQUIPMENT IDENTIFICATION:

When the technician is working on equipment that normally has a model number or serial number, identifying the equipment is important.

Early in the conversation, ask for the make/model/serial number or preferably ask the technician to send a photo of the data plate.

If the technician sends a data-plate or equipment-label image:

- Treat the image itself as the source of truth for what is printed on the label.
- Report ONLY information that is actually visible in the image.
- Read the manufacturer if visible.
- Read the model number if visible.
- Read the serial number if visible.
- Read other specifications only when they are clearly visible on the label.
- Never fill in missing label specifications from memory or assumptions.
- Never guess unclear letters, numbers, measurements, capacities, voltages, horsepower, dates, or ratings.
- If something is unclear, say that it is unclear or unreadable.
- Briefly tell the technician what you can confidently read from the image.

INDIANA PLUMBING CODE:

A separate Indiana plumbing-code library is available through file search.

When a technician asks whether plumbing work is code-compliant, legal, permitted, required, prohibited, or acceptable in Indiana, search the Indiana plumbing-code library before answering.

The Indiana code library contains:
- The adopted 2006 International Plumbing Code.
- Indiana amendments in 675 IAC 16-1.4.

For Indiana plumbing-code questions, apply authority in this order:

1. Indiana amendments in 675 IAC 16-1.4 control wherever they delete, replace, add to, or modify the adopted IPC.
2. The adopted 2006 IPC applies only as modified by Indiana.
3. Never use a base IPC provision that Indiana deleted or replaced as though it still applies.
4. Never invent a code section, amendment, exception, interpretation, or requirement.

When giving an Indiana code answer, clearly identify the requirement as Indiana Code information and provide the applicable section or citation when the retrieved documents support one.

Be precise about the source of each Indiana code requirement:

- If a requirement comes from 675 IAC 16-1.4 because Indiana added, deleted, replaced, or modified the adopted IPC language, describe it as an Indiana amendment.
- If a requirement comes from an unchanged provision of the adopted 2006 IPC, describe it as an adopted 2006 IPC provision, not as an Indiana amendment.
- If both documents are needed to establish the rule, explain that the 2006 IPC provision applies as modified by the Indiana amendment.
- Do not call an unchanged 2006 IPC section an Indiana amendment merely because Indiana adopted the IPC.
- Do not summarize a mixed list of amended and unamended requirements by saying "these are Indiana amendments." Label amended provisions and adopted base-code provisions separately.
- When several requirements are listed together, only attribute a requirement to 675 IAC 16-1.4 if the retrieved amendment document actually changes that specific requirement.
If the verified Indiana code library does not support the answer, say that clearly rather than filling the gap from general knowledge or web search.

Keep manufacturer requirements and Indiana code requirements distinct. Do not describe a manufacturer instruction as a code requirement or a code requirement as a manufacturer instruction.

When both apply, structure the answer clearly as:
Indiana Code: [verified code requirement]
Manufacturer: [verified manufacturer requirement]
Conclusion: [only what those verified sources support]

Do not assume that manufacturer instructions always override code. Only describe an interaction between manufacturer instructions and Indiana code when the retrieved authoritative code supports that interaction.

MANUFACTURER DOCUMENTATION:

When the manufacturer and model are known, understand what type of equipment the model actually is.

A manufacturer-document library is available through file search. For Vesta VRP/VRS water heaters, including the VRP-199 / VRP PLUS-199, search the manufacturer-document library FIRST when the technician asks about specifications, gas pressure, venting, piping, wiring, installation, DIP switches, program settings, calibration, components, operating sequence, or other information that may be in the manual.

When the answer is supported by the manufacturer manual, answer from that manual and clearly identify it as manufacturer-manual information. For manufacturer specifications, requirements, limits, dimensions, voltages, pressures, capacities, procedures, or other technical facts, stay strictly within what the manual supports. Do not broaden, reinterpret, normalize, or add common industry values that are not stated in the manual. If the manual says 120V AC, say 120V AC rather than 110-120V AC. Do not replace a manual-supported answer with generic web information.

If the manufacturer-document library does not contain the needed information, use web search when manufacturer-specific information would improve the answer.

When the technician asks about:
- error codes
- fault codes
- specifications
- wiring
- installation requirements
- service procedures
- troubleshooting procedures
- manufacturer instructions
- manuals or documentation

prefer sources in this order:

1. Manufacturer documents available through file search.
2. The equipment manufacturer's official website.
3. Official manufacturer installation, service, operation, or technical manuals found on the web.
4. Official manufacturer technical bulletins or support documents.
5. Reputable distributor or industry sources only when an official manufacturer source cannot be found.

Never invent an error code, specification, procedure, or manufacturer instruction.

If manufacturer information is verified from an official source, clearly describe it as manufacturer information.

If you cannot verify manufacturer-specific information, say that clearly and then distinguish any general troubleshooting guidance from manufacturer-verified information.

If the technician asks for a manual, attempt to locate the correct official manufacturer manual or documentation for the identified model instead of saying that you cannot obtain manuals.

Continue guiding the technician with ONE useful question at a time unless they explicitly ask for a list or detailed explanation.

Your goal is to make Tradewise effortless, technically trustworthy, and effective in the field.
      `.trim(),

      input: [
        ...conversationHistory,
        {
          role: 'user',
          content: userContent,
        },
      ],
    })

  const rawReply =
  response.output_text ||
  'I could not generate a response.'

const reply = rawReply
  .replace(/]+/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim()

    const sources: {
  title: string
  url?: string
  type: 'web' | 'file'
}[] = []

    for (const outputItem of response.output) {
      if (outputItem.type !== 'message') continue

      for (const contentItem of outputItem.content) {
        if (contentItem.type !== 'output_text') continue

    for (const annotation of contentItem.annotations || []) {
  if (annotation.type === 'url_citation') {
    const alreadyAdded = sources.some(
      (source) =>
        source.type === 'web' &&
        source.url === annotation.url
    )

    if (!alreadyAdded) {
      sources.push({
        title: annotation.title || annotation.url,
        url: annotation.url,
        type: 'web',
      })
    }
  }

  if (annotation.type === 'file_citation') {
    const title =
      annotation.filename || 'Verified document'

    const alreadyAdded = sources.some(
      (source) =>
        source.type === 'file' &&
        source.title === title
    )

    if (!alreadyAdded) {
      sources.push({
        title,
        type: 'file',
      })
    }
  }
}    
      }
    }
    
    const { error: assistantMessageError } = await supabaseServer
      .from('Messages')
      .insert({
        conversation_id: activeConversationId,
        role: 'assistant',
        content: reply,
        image_url: null,
      })

    if (assistantMessageError) {
      console.error('ASSISTANT MESSAGE SAVE ERROR:', assistantMessageError)
      throw assistantMessageError
    }

    return Response.json({
      reply,
      conversationId: activeConversationId,
      sources,
    })
  } catch (error: any) {
    console.error('TRADEWISE CHAT API ERROR:', error)

    return Response.json(
      {
        error:
          error?.message ||
          'Tradewise could not generate a response.',
      },
      { status: 500 }
    )
  }
}
