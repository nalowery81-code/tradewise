import OpenAI, { toFile } from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const VECTOR_STORE_ID = 'vs_6a98660446588191b62260aac59bbc6e'

const VESTA_MANUAL_URL =
  'https://www.vestahws.com/?act=common.download_act&bbs_seq=UGMGYlxjUTo%3D&file_path=AmdTaghmCClUYFV4AWxTPQZ3VDwCblQ%2BUGRZb1N%2FBwVXPFdLAV8FGgAGVw9WDABUWm1WaQFLAmUAO1ZKDzwHCgJSU30IdAgCVFxVBQF4UzAGMlRmAmVUBVBSWU1TJQc3VwdXRwF9BQ4AYFcDVhAAWVptVgoBbQJkADxWMA8%2FBx8Cb1NHCGEIFlRuVR4Bf1MfBmpUEwJ4VH9QdVlvUzY%3D'

export async function GET() {
  try {
    const existingFiles = await openai.vectorStores.files.list(
      VECTOR_STORE_ID
    )

    const existing = existingFiles.data.find(
      (file) =>
        file.attributes?.manufacturer === 'Vesta' &&
        file.attributes?.model === 'VRP PLUS-199' &&
        file.attributes?.document_type === 'installation_manual'
    )

    if (existing) {
      return Response.json({
        message: 'Vesta manual is already in the vector store.',
        vector_store_file_id: existing.id,
        status: existing.status,
      })
    }

    const manualResponse = await fetch(VESTA_MANUAL_URL)

    if (!manualResponse.ok) {
      throw new Error(
        `Could not download Vesta manual: ${manualResponse.status}`
      )
    }

    const manualBytes = new Uint8Array(
      await manualResponse.arrayBuffer()
    )

    const manualFile = await toFile(
      manualBytes,
      'Vesta_VRP_VRS_Installation_Manual.pdf',
      {
        type: 'application/pdf',
      }
    )

    const uploadedFile = await openai.files.create({
      file: manualFile,
      purpose: 'assistants',
    })

    const vectorFile =
      await openai.vectorStores.files.createAndPoll(
        VECTOR_STORE_ID,
        {
          file_id: uploadedFile.id,
          attributes: {
            manufacturer: 'Vesta',
            model: 'VRP PLUS-199',
            document_type: 'installation_manual',
            title: 'Vesta VRP/VRS Installation Manual',
          },
        }
      )

    if (vectorFile.status !== 'completed') {
      throw new Error(
        `Vector store processing ended with status: ${vectorFile.status}`
      )
    }

    return Response.json({
      message: 'Vesta manual successfully ingested.',
      openai_file_id: uploadedFile.id,
      vector_store_file_id: vectorFile.id,
      vector_store_id: VECTOR_STORE_ID,
      status: vectorFile.status,
    })
  } catch (error: any) {
    console.error('VESTA MANUAL INGEST ERROR:', error)

    return Response.json(
      {
        error:
          error?.message ||
          'Could not ingest the Vesta manual.',
      },
      { status: 500 }
    )
  }
}
