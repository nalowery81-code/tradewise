import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const {
      managerReflection,
      reflections = [],
      weeklySummary = '',
      overallSummary = '',
    } = await req.json()

    const condensedReflections = reflections
      .slice(0, 25)
      .map((r: any, index: number) => {
        return `${index + 1}. Technician: ${r.technician_name || 'Unknown'}
Job Type: ${r.job_type || 'Unknown'}
Challenge: ${r.challenge || 'None shared'}
AI Manager Insight: ${r.manager_insight || 'None'}
Created At: ${r.created_at || 'Unknown'}`
      })
      .join('\n\n')

    const prompt = `
You are helping power TradeWise, an AI support platform for plumbing and trades teams.

You are writing a contractor-style manager report for a plumbing or HVAC service leader.

MANAGER QUESTION:
${managerReflection || 'Give me a practical read on what my team is dealing with right now.'}

WEEKLY SUMMARY:
${weeklySummary || 'No weekly summary provided.'}

OVERALL SUMMARY:
${overallSummary || 'No overall summary provided.'}

RECENT TEAM REFLECTIONS:
${condensedReflections || 'No recent reflections provided.'}

Return valid JSON with exactly these keys:
{
  "report_title": "...",
  "team_status": "...",
  "human_read": "...",
  "who_should_i_talk_to_tomorrow": [
    {
      "name": "...",
      "reason": "...",
      "risk": "Low | Medium | High"
    }
  ],
  "what_the_team_is_carrying": ["...", "...", "..."],
  "who_may_need_support": ["...", "..."],
  "system_issues_to_watch": ["...", "...", "..."],
  "manager_moves": ["...", "...", "..."],
  "full_report": "..."
}

Rules:
- Sound like an experienced contractor or field leader
- Be practical, direct, observant, and human
- No corporate jargon
- No HR tone
- No therapy tone
- Focus on workload, prep, communication, scheduling, callbacks, strain, support, and repeat patterns

Rules for human_read:
- This is the star of the report
- Write 4-6 sentences
- Sound like a real contractor reading between the lines
- Focus on what the week likely felt like for the technicians
- Reference real-life tradeoffs like long days, customer pressure, missed family time, fatigue, and carrying too much without saying much
- It should feel grounded and human, not analytical

Rules for who_should_i_talk_to_tomorrow:
- Return 0 to 3 people
- Only include someone if the reflections truly suggest they need a next-day check-in
- risk must be exactly Low, Medium, or High
- reason should be plainspoken and specific
- If no one clearly stands out, return an empty array

Important:
- Say clearly when an issue feels more like a systems problem than a people problem
- full_report should be 2 short paragraphs max
- Make the output useful for a real manager who wants to act tomorrow morning
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
    console.error('TEAM SUMMARY API ERROR:', error)

    return new Response(
      JSON.stringify({
        error: error?.message || 'Failed to generate team summary',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}