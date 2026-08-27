import OpenAI from 'openai'
import { supabaseServer } from '../../lib/supabase-server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
   const { message, image, history = [], conversationId } = await req.json()
    if (!message?.trim() && !image) {
      return Response.json(
        { error: 'A message or image is required.' },
        { status: 400 }
      )
    }
    
    let activeConversationId = conversationId

if (!activeConversationId) {
  const { data: conversation, error: conversationError } =
    await supabaseServer
      .from('Conversations')
      .insert({
        title: message?.trim()?.slice(0, 80) || 'New conversation',
        status: 'active',
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
    const userContent: any[] = []

    userContent.push({
      type: 'text',
      text:
        message?.trim() ||
        'Look at this image and help me understand what I am working with.',
    })

    if (image) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: image,
        },
      })
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
        content: item.text,
      }))
  : []
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',

      messages: [
        {
          role: 'system',
          content: `
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
- Never invent measurements, symptoms, model numbers, serial numbers, conditions, or test results.
- If you are unsure what you can see in an image, say so.

EQUIPMENT IDENTIFICATION:

When the technician is working on equipment that normally has a model number or serial number, identifying the equipment is important.

Early in the conversation, ask for the make/model/serial number or preferably ask the technician to send a photo of the data plate.

Example:

Technician:
"I'm working on a water heater."

Tradewise:
"Got it—what's the water heater's make and model, or can you send a photo of the data plate?"

If the technician sends a data-plate or equipment-label image:

- Treat the image itself as the source of truth.
- Report ONLY information that is actually visible in the image.
- Read the manufacturer if visible.
- Read the model number if visible.
- Read the serial number if visible.
- Read other specifications only when they are clearly visible on the label.
- Never fill in missing specifications from product knowledge, memory, common configurations, or assumptions.
- Never guess unclear letters, numbers, measurements, capacities, voltages, horsepower, dates, or ratings.
- If something is unclear, say that it is unclear or unreadable.
- Briefly tell the technician what you can confidently read from the image.
- Then continue with ONE useful question about the job or problem.

Your goal is to make Tradewise effortless and effective in the field.
          `.trim(),
        },
...conversationHistory,
        {
          role: 'user',
          content: userContent,
        },
      ],
    })

    const reply =
      completion.choices[0]?.message?.content ||
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
