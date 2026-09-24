require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Pool } = require("pg");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Generate a 3072-dimensional embedding
async function generateEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-embedding-001",
    });

    const result = await model.embedContent(text);

    return result.embedding.values;
  } catch (error) {
    console.error("Error generating embedding:", error.message);
    throw error;
  }
}

// Retrieve relevant documents from PostgreSQL
async function retrieveRelevantDocuments({
  brand,
  garment,
  chest,
  height,
  fit,
  topK = 3,
}) {
  try {
    // Map application fit terminology to the terminology
    // used by the RAG dataset.
    const fitMapping = {
      slim: "Slim Fit",
      regular: "Regular Fit",
      loose: "Oversized Fit",
    };

    const normalizedFit =
      typeof fit === "string"
        ? fit.trim().toLowerCase()
        : "regular";

    const fitLabel =
      fitMapping[normalizedFit] || "Regular Fit";

    // Create the search query
    const queryText =
      `${brand} ${garment} chest ${chest}cm ` +
      `height ${height}cm ${fitLabel}`;

    console.log("RAG Query:", queryText);

    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(queryText);

    console.log("Embedding dimensions:", queryEmbedding.length);

    // Convert embedding array to pgvector format
    const vectorString = `[${queryEmbedding.join(",")}]`;

    // Search using cosine similarity
    const query = `
      SELECT
        "id",
        "content",
        "brand",
        "garment",
        "documentType",
        1 - ("embedding" <=> $1::vector) AS similarity
      FROM "RagDocument"
      WHERE LOWER("brand") = LOWER($2)
        AND LOWER("garment") = LOWER($3)
      ORDER BY "embedding" <=> $1::vector ASC
      LIMIT $4;
    `;

    const result = await pool.query(query, [
      vectorString,
      brand,
      garment,
      topK,
    ]);

    return result.rows.map((row) => {
      const fitMatch = row.content.match(/Fit:\s*([^\n]+)/i);

      return {
        content: row.content,
        score: Number(row.similarity),
        metadata: {
          brand: row.brand,
          garment: row.garment,
          documentType: row.documentType,
          requestedFit: normalizedFit,
          retrievedFit: fitMatch
            ? fitMatch[1].trim()
            : null,
        },
      };
    });
  } catch (error) {
    console.error("Error retrieving documents:", error.message);
    throw error;
  }
}

module.exports = {
  generateEmbedding,
  retrieveRelevantDocuments,
};