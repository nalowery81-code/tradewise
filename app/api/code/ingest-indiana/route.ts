import OpenAI, { toFile } from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const VECTOR_STORE_NAME = 'Tradewise Indiana Plumbing Code'

const DOCUMENTS: Array<{
  url: string
  filename: string
  attributes: Record<string, string | number | boolean>
}> = [
  {
    url: 'https://archive.org/download/gov.law.icc.ipc.2006/icc.ipc.2006.pdf',
    filename: 'icc.ipc.2006.pdf',
    attributes: {
      authority_lane: 'indiana_code',
      document_type: 'adopted_base_code',
      jurisdiction: 'Indiana',
      code: 'IPC',
      edition: '2006',
      authority_rank: 2,
      title: '2006 International Plumbing Code',
    },
  },
  {
   url: 'https://laccqupnsredkuczkivd.supabase.co/storage/v1/object/public/tradewise-code/2012-IPC-IN-amendments.pdf',
    filename: '2012-Indiana-Plumbing-Code-Amendments.pdf',
    attributes: {
      authority_lane: 'indiana_code',
      document_type: 'state_amendment',
      jurisdiction: 'Indiana',
      citation: '675 IAC 16-1.4',
      authority_rank: 1,
      title: '2012 Indiana Plumbing Code Amendments',
    },
  },
]

export async function GET() {
  try {
    const stores = await openai.vectorStores.list({
      limit: 100,
    })

    let vectorStore = stores.data.find(
      (store) => store.name === VECTOR_STORE_NAME
    )

    if (!vectorStore) {
      vectorStore = await openai.vectorStores.create({
        name: VECTOR_STORE_NAME,
      })
    }

    const existingFiles = await openai.vectorStores.files.list(
      vectorStore.id
    )

    const results = []

    for (const document of DOCUMENTS) {
      const existing = existingFiles.data.find(
        (file) =>
          file.attributes?.title === document.attributes.title
      )

      if (existing) {
        results.push({
          title: document.attributes.title,
          vector_store_file_id: existing.id,
          status: existing.status,
          skipped: true,
        })

        continue
      }

      const response = await fetch(document.url)

      if (!response.ok) {
        throw new Error(
          `Could not download ${document.filename}: ${response.status}`
        )
      }

      const fileBytes = new Uint8Array(
        await response.arrayBuffer()
      )

      const file = await toFile(
        fileBytes,
        document.filename,
        {
          type: 'application/pdf',
        }
      )

      const uploadedFile = await openai.files.create({
        file,
        purpose: 'assistants',
      })

      const vectorFile =
        await openai.vectorStores.files.createAndPoll(
          vectorStore.id,
          {
            file_id: uploadedFile.id,
            attributes: document.attributes,
          }
        )

      if (vectorFile.status !== 'completed') {
        throw new Error(
          `${document.filename} processing ended with status: ${vectorFile.status}`
        )
      }

      results.push({
        title: document.attributes.title,
        openai_file_id: uploadedFile.id,
        vector_store_file_id: vectorFile.id,
        status: vectorFile.status,
        skipped: false,
      })
    }

    return Response.json({
      message: 'Indiana plumbing code sources successfully ingested.',
      vector_store_name: VECTOR_STORE_NAME,
      vector_store_id: vectorStore.id,
      files: results,
    })
  } catch (error: unknown) {
    console.error('INDIANA CODE INGEST ERROR:', error)

    const message =
      error instanceof Error
        ? error.message
        : 'Could not ingest Indiana plumbing code sources.'

    return Response.json(
      {
        error: message,
      },
      { status: 500 }
    )
  }
}
