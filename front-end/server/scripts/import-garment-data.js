import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(new URL(import.meta.url).pathname.substring(1));
const DATA_DIR = path.resolve(__dirname, "..", "data");

const CSV_FILES = [
  { file: "shirts.csv", garmentType: "SHIRT" },
  { file: "tshirts.csv", garmentType: "TSHIRT" },
  { file: "jeans.csv", garmentType: "JEANS" },
  { file: "hoodie.csv", garmentType: "HOODIE" },
  { file: "dress.csv", garmentType: "DRESS" },
];

const measurementMap = {
  chest: "chest_bust",
  bust: "chest_bust",
  waist: "waist",
  hip: "hip_seat",
  shoulder: "shoulder",
  sleeve_length: "sleeve",
  garment_length: "length",
  inseam_length: "inseam",
  rise: "rise",
  thigh: "thigh",
  leg_opening: "leg_opening",
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();

  try {
    console.log("Starting garment data import...\n");

    await client.query("BEGIN");

    // ------------------------------------------------------------
    // 1. Load all brands
    // ------------------------------------------------------------
    const brandResult = await client.query(`
      SELECT id, name
      FROM "Brand"
    `);

    const brandMap = new Map();

    for (const brand of brandResult.rows) {
      brandMap.set(brand.name, brand.id);
    }

    console.log(`Brands available: ${brandMap.size}`);

    // ------------------------------------------------------------
    // 2. Load all measurement types
    // ------------------------------------------------------------
    const measurementResult = await client.query(`
      SELECT id, key
      FROM "MeasurementType"
    `);

    const measurementTypeMap = new Map();

    for (const measurementType of measurementResult.rows) {
      measurementTypeMap.set(measurementType.key, measurementType.id);
    }

    console.log(
      `Measurement types available: ${measurementTypeMap.size}\n`
    );

    // ------------------------------------------------------------
    // 3. Import each CSV
    // ------------------------------------------------------------
    let totalRows = 0;
    let totalMeasurements = 0;
    let createdOrUpdatedSizes = 0;

    for (const item of CSV_FILES) {
      const filePath = path.join(DATA_DIR, item.file);

      const csvContent = fs.readFileSync(filePath, "utf8");

      const rows = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      console.log(
        `Importing ${item.file} -> ${item.garmentType} (${rows.length} rows)`
      );

      for (const row of rows) {
        const brandName = row.brand_name;
        const fitType = row.fit_name;
        const sizeLabel = row.size;

        const brandId = brandMap.get(brandName);

        if (!brandId) {
          throw new Error(
            `Brand not found in database: "${brandName}" (${item.file})`
          );
        }

        if (!fitType) {
          throw new Error(
            `Missing fit_name in ${item.file}`
          );
        }

        if (!sizeLabel) {
          throw new Error(
            `Missing size in ${item.file}`
          );
        }

        const measurements = JSON.parse(row.measurement_of_sizes);

        // --------------------------------------------------------
        // Create or reuse BrandSize
        // --------------------------------------------------------
        const brandSizeResult = await client.query(
          `
          INSERT INTO "BrandSize"
            (
              id,
              "brandId",
              "garmentType",
              "fitType",
              "sizeLabel",
              "createdAt",
              "updatedAt"
            )
          VALUES
            (
              gen_random_uuid(),
              $1,
              $2,
              $3,
              $4,
              NOW(),
              NOW()
            )
          ON CONFLICT
            ("brandId", "garmentType", "fitType", "sizeLabel")
          DO UPDATE SET
            "updatedAt" = NOW()
          RETURNING id
          `,
          [
            brandId,
            item.garmentType,
            fitType,
            sizeLabel,
          ]
        );

        const brandSizeId = brandSizeResult.rows[0].id;

        createdOrUpdatedSizes++;

        // --------------------------------------------------------
        // Insert measurements
        // --------------------------------------------------------
        for (const [csvKey, value] of Object.entries(measurements)) {
          const measurementKey = measurementMap[csvKey];

          // Ignore metadata such as:
          // unit, measurement_type, source
          if (!measurementKey) {
            continue;
          }

          if (typeof value !== "number") {
            throw new Error(
              `Non-numeric measurement "${csvKey}" in ${item.file}`
            );
          }

          const measurementTypeId =
            measurementTypeMap.get(measurementKey);

          if (!measurementTypeId) {
            throw new Error(
              `MeasurementType not found: "${measurementKey}"`
            );
          }

          await client.query(
            `
            INSERT INTO "BrandSizeMeasurement"
              (
                id,
                "brandSizeId",
                "measurementTypeId",
                value,
                "createdAt",
                "updatedAt"
              )
            VALUES
              (
                gen_random_uuid(),
                $1,
                $2,
                $3,
                NOW(),
                NOW()
              )
            ON CONFLICT
              ("brandSizeId", "measurementTypeId")
            DO UPDATE SET
              value = EXCLUDED.value,
              "updatedAt" = NOW()
            `,
            [
              brandSizeId,
              measurementTypeId,
              value,
            ]
          );

          totalMeasurements++;
        }

        totalRows++;

        if (totalRows % 100 === 0) {
          console.log(`  Processed ${totalRows} rows...`);
        }
      }

      console.log(`  Completed ${item.file}\n`);
    }

    await client.query("COMMIT");

    console.log("================================");
    console.log("GARMENT DATA IMPORT COMPLETE");
    console.log("================================");
    console.log(`CSV rows processed: ${totalRows}`);
    console.log(`BrandSize records processed: ${createdOrUpdatedSizes}`);
    console.log(`Measurements processed: ${totalMeasurements}`);
    console.log("\nDatabase transaction committed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("\nIMPORT FAILED.");
    console.error("Database transaction rolled back.");
    console.error(error.message);

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
