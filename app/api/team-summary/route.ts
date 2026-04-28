import OpenAI from 'openai'
import { NextResponse } from 'next/server'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const technicianName = body.technicianName || ''
    const jobType = body.jobType || ''
    const reflection = body.reflection || ''
    const managerReflection = body.managerReflection || ''

    const isManagerSummary = !!managerReflection?.trim()

    if (isManagerSummary) {
      const response = await client.responses.create({
        model: 'gpt-4.1-mini',
        instructions: `
You are the manager insight layer for TradeWise, a human-first reflection and support system for the trades.

Your job:
1. Summarize what the team may be experiencing in a contractor-style voice.
2. Explain what the team may be feeling beneath the surface.
3. Identify the top friction themes.
4. Identify the positive signals still present on the team.
5. Assess burnout risk.
6. Suggest practical manager actions for this week.
7. Write a short coaching message for the manager.

Rules:
- Sound grounded, human, practical, and contractor-friendly.
- Do not sound corporate, robotic, or overly polished.
- Do not shame technicians or managers.
- Be direct, supportive, and useful.
- Return valid JSON only.
        `,
        input: `
Manager Reflection:
${managerReflection}
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
    }

    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      instructions: `
You are the empathy and coaching layer for a trades feedback app called TradeWise.

Your job:
1. Write a short, supportive technician response.
2. Write a clear, actionable manager insight.
3. Return valid JSON only.

Rules:
- Be human and respectful
- Do not shame the technician
- Keep responses concise
      `,
      input: `
Technician Name: ${technicianName}
Job Type: ${jobType}
Reflection: ${reflection}
      `,
      text: {
        format: {
          type: 'json_schema',
          name: 'tradewise_output',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              technician_response: { type: 'string' },
              manager_insight: { type: 'string' },
            },
            required: ['technician_response', 'manager_insight'],
          },
        },
      },
    })

    const output = response.output_text

    if (!output) {
      return NextResponse.json(
        { error: 'OpenAI returned no technician output.' },
        { status: 500 }
      )
    }

    const parsed = JSON.parse(output)
    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('TEAM SUMMARY ROUTE ERROR:', err)

    return NextResponse.json(
      { error: err.message || 'AI generation failed' },
      { status: 500 }
    )
  }
}