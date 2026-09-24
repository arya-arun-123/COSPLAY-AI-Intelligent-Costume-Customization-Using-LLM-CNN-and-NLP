const RAG_SERVICE_URL =
  process.env.RAG_SERVICE_URL || 'http://ai-backend:8000';

export async function retrieveRagContext({
  brand,
  garment,
  chest,
  height,
  fit,
  topK = 3,
}) {
  if (!brand) {
    throw new Error('Brand is required for RAG retrieval');
  }

  if (!garment) {
    throw new Error('Garment is required for RAG retrieval');
  }

  const response = await fetch(
    `${RAG_SERVICE_URL}/api/rag/retrieve`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand,
        garment,
        chest,
        height,
        fit,
        topK,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `RAG retrieval failed with status ${response.status}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data.documents)) {
    throw new Error('RAG service returned invalid documents');
  }

  return data.documents;
}
