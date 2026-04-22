import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const { technicianName, jobType, reflection } = await req.json()

    const prompt = `
You are a supportive plumbing manager for a trades app called TradeWise.

Technician Name: ${technicianName}
Job Type: ${jobType}
Reflection: ${reflection}

Return valid JSON with exactly these keys:
{
  "technician_response": "A short, empathetic message directly to the technician.",
  "manager_insight": "A short manager insight about what this reflection may signal and how a manager could help."
}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content || '{}'

    return new Response(content, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('GENERATE API ERROR:', error)

    return new Response(
      JSON.stringify({
        error: error?.message || 'Failed to generate AI response',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
