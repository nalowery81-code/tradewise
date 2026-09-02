import OpenAI from 'openai'
import { supabaseServer } from '../../lib/supabase-server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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

MANUFACTURER DOCUMENTATION:

When the manufacturer and model are known, understand what type of equipment the model actually is.

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

use web search when manufacturer-specific information would improve the answer.

Prefer sources in this order:

1. The equipment manufacturer's official website.
2. Official manufacturer installation, service, operation, or technical manuals.
3. Official manufacturer technical bulletins or support documents.
4. Reputable distributor or industry sources only when an official manufacturer source cannot be found.

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

    const reply =
      response.output_text ||
      'I could not generate a response.'

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
