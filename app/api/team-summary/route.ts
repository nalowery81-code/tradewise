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

    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      instructions: `
You are the manager insight layer for TradeWise, a human-first reflection and support system for the trades.

Write like a seasoned plumbing or HVAC field leader.
Be grounded, human, practical, and contractor-friendly.
Do not sound corporate, robotic, or overly polished.
Do not shame technicians or managers.
Be direct, supportive, and useful.

Return valid JSON only.
`,
      input: `
Manager Question:
${managerReflection || 'Give me a contractor-style read on what my team is dealing with and where I should focus next.'}

Weekly Summary:
${weeklySummary}

Overall Summary:
${overallSummary}

Recent Reflections:
${JSON.stringify(reflections, null, 2)}
`,
      text: {
        format: {
          type: 'json_schema',
          name: 'manager_team_summary',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              report_title: { type: 'string' },
              human_read: { type: 'string' },
              team_status: { type: 'string' },
              who_should_i_talk_to_tomorrow: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    reason: { type: 'string' },
                    risk: { type: 'string' },
                  },
                  required: ['name', 'reason', 'risk'],
                },
              },
              what_the_team_is_carrying: {
                type: 'array',
                items: { type: 'string' },
              },
              who_may_need_support: {
                type: 'array',
                items: { type: 'string' },
              },
              system_issues_to_watch: {
                type: 'array',
                items: { type: 'string' },
              },
              manager_moves: {
                type: 'array',
                items: { type: 'string' },
              },
              full_report: { type: 'string' },
            },
            required: [
              'report_title',
              'human_read',
              'team_status',
              'who_should_i_talk_to_tomorrow',
              'what_the_team_is_carrying',
              'who_may_need_support',
              'system_issues_to_watch',
              'manager_moves',
              'full_report',
            ],
          },
        },
      },
    })

    const raw = response.output_text

    console.log('RAW AI OUTPUT:', raw)

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