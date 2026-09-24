import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const brands = [
  { name: "Levis", slug: "levis" },
  { name: "NorthRepublic", slug: "northrepublic" },
  { name: "Otto", slug: "otto" },
  { name: "PeterEngland", slug: "peterengland" },
  { name: "Puma", slug: "puma" },
  { name: "Adidas", slug: "adidas" },
  { name: "GAP", slug: "gap" },
  { name: "H&M", slug: "h-and-m" },
  { name: "Jack & Jones", slug: "jack-and-jones" },
  { name: "Levi's", slug: "levis-official" },
  { name: "Nike", slug: "nike" },
  { name: "Ralph Lauren", slug: "ralph-lauren" },
  { name: "Tommy Hilfiger", slug: "tommy-hilfiger" },
  { name: "Uniqlo", slug: "uniqlo" },
  { name: "Zara", slug: "zara" },
];

const measurementTypes = [
  { key: "chest_bust", label: "Chest / Bust" },
  { key: "hip_seat", label: "Hip / Seat" },
  { key: "inseam", label: "Inseam" },
  { key: "leg_opening", label: "Leg Opening" },
  { key: "length", label: "Length" },
  { key: "rise", label: "Rise" },
  { key: "shoulder", label: "Shoulder" },
  { key: "sleeve", label: "Sleeve" },
  { key: "thigh", label: "Thigh" },
  { key: "waist", label: "Waist" },
];

async function main() {
  const client = await pool.connect();

  try {
    console.log("[Garment Seed] Starting...");

    await client.query("BEGIN");

    for (const brand of brands) {
      await client.query(
        `
        INSERT INTO "Brand" (id, name, slug, "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
        ON CONFLICT (name)
        DO UPDATE SET
          slug = EXCLUDED.slug,
          "updatedAt" = NOW()
        `,
        [brand.name, brand.slug]
      );
    }

    console.log(`[Garment Seed] Brands ready: ${brands.length}`);

    for (const measurement of measurementTypes) {
      await client.query(
        `
        INSERT INTO "MeasurementType"
          (id, key, label, unit, "createdAt", "updatedAt")
        VALUES
          (gen_random_uuid(), $1, $2, 'inch', NOW(), NOW())
        ON CONFLICT (key)
        DO UPDATE SET
          label = EXCLUDED.label,
          unit = EXCLUDED.unit,
          "updatedAt" = NOW()
        `,
        [measurement.key, measurement.label]
      );
    }

    console.log(
      `[Garment Seed] Measurement types ready: ${measurementTypes.length}`
    );

    await client.query("COMMIT");

    console.log("[Garment Seed] Completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Garment Seed] Failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
