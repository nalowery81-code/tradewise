import OpenAI from 'openai'
import { NextResponse } from 'next/server'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const managerReflection = body.managerReflection || ''
    const reflections = body.reflections || []
    const weeklySummary = body.weeklySummary || ''
    const overallSummary = body.overallSummary || ''

    const prompt = `
You are the manager insight layer for TradeWise, a human-first reflection and support system for the trades.

Write like a seasoned plumbing or HVAC field leader.
Be grounded, human, practical, and contractor-friendly.
Do not sound corporate, robotic, or overly polished.
Do not shame technicians or managers.
Be direct, supportive, and useful.

Return ONLY valid JSON with exactly these keys:
{
  "report_title": "string",
  "human_read": "string",
  "team_status": "string",
  "who_should_i_talk_to_tomorrow": [
    {
      "name": "string",
      "reason": "string",
      "risk": "Low | Medium | High"
    }
  ],
  "what_the_team_is_carrying": ["string"],
  "who_may_need_support": ["string"],
  "system_issues_to_watch": ["string"],
  "manager_moves": ["string"],
  "full_report": "string"
}

Manager Question:
${managerReflection || 'Give me a contractor-style read on what my team is dealing with and where I should focus next.'}

Weekly Summary:
${weeklySummary}

Overall Summary:
${overallSummary}

Recent Reflections:
${JSON.stringify(reflections, null, 2)}
`

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You must respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content || ''
    return NextResponse.json({
  DEBUG_RAW: raw
})

    console.log('TEAM SUMMARY RAW:', raw)

    if (!raw) {
      return NextResponse.json(
        { error: 'OpenAI returned no manager summary output.' },
        { status: 500 }
      )
    }

    let parsed: any

    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.error('JSON PARSE ERROR:', raw)
      return NextResponse.json(
        { error: 'Invalid JSON from AI', raw },
        { status: 500 }
      )
    }

    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('TEAM SUMMARY ROUTE ERROR:', err)

    return NextResponse.json(
      { error: err.message || 'AI generation failed' },
      { status: 500 }
    )
  }
}