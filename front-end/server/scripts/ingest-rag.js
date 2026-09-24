import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { GoogleGenAI } from "@google/genai";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(new URL(import.meta.url).pathname.substring(1));
const DATA_DIR = path.resolve(__dirname,"..", "..", "data");

const CSV_FILES = {
  shirts: "shirts.csv",
  tshirts: "tshirts.csv",
  jeans: "jeans.csv",
  hoodie: "hoodie.csv",
  dress: "dress.csv",
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

function formatMeasurement(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return `${value} in`;
}

function createChunk(brand, garment, fit, rows) {
  const lines = [
    `Brand: ${brand}`,
    `Garment: ${garment}`,
    `Fit: ${fit}`,
    `Measurement type: Finished garment`,
    `Unit: inches`,
    "",
    "Size chart:",
  ];

  for (const row of rows) {
    const measurements = JSON.parse(row.measurement_of_sizes);

    lines.push(`Size: ${row.size}`);

    for (const [key, value] of Object.entries(measurements)) {
      if (
        key === "unit" ||
        key === "measurement_type" ||
        key === "source"
      ) {
        continue;
      }

      const formatted = formatMeasurement(value);

      if (formatted) {
        const label = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());

        lines.push(`${label}: ${formatted}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

async function generateEmbedding(text) {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: {
      outputDimensionality: 3072,
    },
  });

  const values = response.embeddings?.[0]?.values;

  if (!values || values.length !== 3072) {
    throw new Error(
      `Expected 3072-dimensional embedding, received ${
        values?.length ?? 0
      } dimensions.`
    );
  }

  return values;
}

async function insertDocument(client, document) {
  const vectorString = `[${document.embedding.join(",")}]`;

  await client.query(
    `
      INSERT INTO "RagDocument"
      (
        "id",
        "content",
        "embedding",
        "brand",
        "garment",
        "documentType",
        "source",
        "metadata"
      )
      VALUES
      ($1, $2, $3::vector, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT ("id")
      DO UPDATE SET
        "content" = EXCLUDED."content",
        "embedding" = EXCLUDED."embedding",
        "brand" = EXCLUDED."brand",
        "garment" = EXCLUDED."garment",
        "documentType" = EXCLUDED."documentType",
        "source" = EXCLUDED."source",
        "metadata" = EXCLUDED."metadata"
    `,
    [
      document.id,
      document.content,
      vectorString,
      document.brand,
      document.garment,
      document.documentType,
      document.source,
      JSON.stringify(document.metadata),
    ]
  );
}

async function main() {
  console.log("Starting RAG CSV ingestion...\n");

  const client = await pool.connect();

  try {
    /*
     * Remove only documents previously created by this CSV ingestion script.
     * The original test records are left untouched for now.
     */
    await client.query(
      `DELETE FROM "RagDocument"
       WHERE "metadata"->>'dataSource' = 'project_csv_rag'`
    );

    const documents = [];

    for (const [garment, filename] of Object.entries(CSV_FILES)) {
      const filePath = path.join(DATA_DIR, filename);

      console.log(`Reading ${filename}...`);

      const csvText = fs.readFileSync(filePath, "utf8");

      const rows = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      /*
       * Group by brand + fit.
       * All sizes belonging to the same brand/garment/fit
       * stay together in one RAG chunk.
       */
      const groups = new Map();

      for (const row of rows) {
        const key = `${row.brand_name}|||${row.fit_name}`;

        if (!groups.has(key)) {
          groups.set(key, []);
        }

        groups.get(key).push(row);
      }

      for (const [key, groupRows] of groups) {
        const [brand, fit] = key.split("|||");

        const content = createChunk(
          brand,
          garment,
          fit,
          groupRows
        );

        documents.push({
          brand,
          garment,
          fit,
          rows: groupRows,
          content,
          source: `data/${filename}`,
        });
      }

      console.log(
        `  ${rows.length} rows → ${groups.size} chunks`
      );
    }

    console.log(`\nTotal RAG chunks: ${documents.length}\n`);

    let inserted = 0;

    for (const document of documents) {
      console.log(
        `Embedding ${inserted + 1}/${documents.length}: ` +
        `${document.brand} | ${document.garment} | ${document.fit}`
      );

      const embedding = await generateEmbedding(document.content);

      const id = `csv-rag-${document.garment}-${document.brand}-${document.fit}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const metadata = {
        dataSource: "project_csv_rag",
        sourceFile: document.source,
        brand: document.brand,
        garment: document.garment,
        fit: document.fit,
        sizeCount: document.rows.length,
        measurementSource: "synthetic_estimated",
        embeddingModel: "gemini-embedding-001",
        embeddingDimensions: 3072,
      };

      await insertDocument(client, {
        id,
        content: document.content,
        embedding,
        brand: document.brand,
        garment: document.garment,
        documentType: "size_chart",
        source: document.source,
        metadata,
      });

      inserted++;
    }

    console.log(`\nSuccessfully inserted ${inserted} RAG documents.`);

    const result = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM "RagDocument"
       WHERE "metadata"->>'dataSource' = 'project_csv_rag'`
    );

    console.log(
      `RAG documents currently in database: ${result.rows[0].count}`
    );

    const dimensionResult = await client.query(
      `SELECT vector_dims("embedding") AS dimensions
       FROM "RagDocument"
       WHERE "metadata"->>'dataSource' = 'project_csv_rag'
       LIMIT 1`
    );

    if (dimensionResult.rows.length > 0) {
      console.log(
        `Embedding dimensions in PostgreSQL: ${dimensionResult.rows[0].dimensions}`
      );
    }

    console.log("\nRAG ingestion completed successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nRAG ingestion failed:");
  console.error(error);
  process.exit(1);
});