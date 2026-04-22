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
                team_summary: { type: 'string' },
                emotional_read: { type: 'string' },
                top_friction_themes: {
                  type: 'array',
                  items: { type: 'string' },
                },
                positive_signals: {
                  type: 'array',
                  items: { type: 'string' },
                },
                burnout_risk: { type: 'string' },
                likely_root_causes: {
                  type: 'array',
                  items: { type: 'string' },
                },
                manager_actions: {
                  type: 'array',
                  items: { type: 'string' },
                },
                coaching_message: { type: 'string' },
              },
              required: [
                'team_summary',
                'emotional_read',
                'top_friction_themes',
                'positive_signals',
                'burnout_risk',
                'likely_root_causes',
                'manager_actions',
                'coaching_message',
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