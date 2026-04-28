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

    const condensedReflections = reflections
      .slice(0, 25)
      .map((r: any, index: number) => {
        return `${index + 1}. Technician: ${r.technician_name || 'Unknown'}
Job Type: ${r.job_type || 'Unknown'}
Reflection: ${r.challenge || 'None shared'}
Manager Insight: ${r.manager_insight || 'None'}
Created At: ${r.created_at || 'Unknown'}`
      })
      .join('\n\n')

    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      instructions: `
You are the manager insight layer for TradeWise, a human-first reflection and support system for the trades.

Rules:
- Sound grounded, human, practical, and contractor-friendly.
- Do not sound corporate, robotic, or overly polished.
- Do not shame technicians or managers.
- Be direct, supportive, and useful.
- Return valid JSON only.
- Never invent technician names.
- Only use technician names that appear in the provided technician reflections.
- If no technician names are provided, return an empty array for who_should_i_talk_to_tomorrow.
- Only include someone in who_should_i_talk_to_tomorrow if their reflection suggests Medium or High concern.
      `,
      input: `
Manager Question:
${managerReflection || 'Give me a practical read on what my team is dealing with right now.'}

Weekly Summary:
${weeklySummary || 'No weekly summary provided.'}

Overall Summary:
${overallSummary || 'No overall summary provided.'}

Actual Recent Technician Reflections:
${condensedReflections || 'No actual technician reflections were provided.'}

Important:
Base the report only on the actual technician reflections above.
Do not make up people, names, events, or details.
If there is not enough data, say that clearly.
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

    const output = response.output_text

    if (!output) {
      return NextResponse.json(
        { error: 'OpenAI returned no manager summary output.' },
        { status: 500 }
      )
    }

    const parsed = JSON.parse(output)
    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('TEAM SUMMARY ROUTE ERROR:', err)

    return NextResponse.json(
      { error: err.message || 'Team summary failed' },
      { status: 500 }
    )
  }
}