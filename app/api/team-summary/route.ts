import OpenAI from 'openai'
import { NextResponse } from 'next/server'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const reflections = body?.reflections ?? []

    if (!Array.isArray(reflections) || reflections.length === 0) {
      return NextResponse.json(
        { error: 'No reflections provided.' },
        { status: 400 }
      )
    }

    const formatted = reflections
      .map((r: any, i: number) => {
        return `
Reflection ${i + 1}
Technician: ${r.technician_name}
Job Type: ${r.job_type}
Challenge: ${r.challenge}
Frustration: ${r.frustration}
Went Well: ${r.went_well}
        `
      })
      .join('\n')

    const response = await client.responses.create({
      model: 'gpt-5.4',
      input: `
You are helping a plumbing manager support technicians.

Give:
1. A short team summary
2. Top 3 coaching opportunities
3. Top 3 strengths
4. Any technicians that may need follow-up

Be clear and supportive.

${formatted}
      `,
    })

    return NextResponse.json({
      summary: response.output_text,
    })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}