import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const { message, image } = await req.json()

    if (!message?.trim() && !image) {
      return Response.json(
        { error: 'A message or image is required.' },
        { status: 400 }
      )
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

If the technician sends a clear data-plate image:
- Read the manufacturer if visible.
- Read the model number if visible.
- Read the serial number if visible.
- Never guess characters that are unclear.
- Briefly tell the technician what you can confidently read.
- Then continue with ONE useful question about the job or problem.

Your goal is to make Tradewise effortless and effective in the field.
          `.trim(),
        },

        {
          role: 'user',
          content: userContent,
        },
      ],
    })

    const reply =
      completion.choices[0]?.message?.content ||
      'I could not generate a response.'

    return Response.json({ reply })
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
