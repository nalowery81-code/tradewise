import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function GET() {
  try {
    const vectorStore = await openai.vectorStores.create({
      name: 'Tradewise Manufacturer Manuals',
    })

    return Response.json({
      id: vectorStore.id,
      name: vectorStore.name,
    })
  } catch (error: any) {
    console.error('VECTOR STORE CREATE ERROR:', error)

    return Response.json(
      {
        error: error?.message || 'Could not create vector store.',
      },
      { status: 500 }
    )
  }
}
