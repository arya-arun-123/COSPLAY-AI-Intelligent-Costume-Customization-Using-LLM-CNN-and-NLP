import { calculateSize, createSizeError } from "./sizeEngineService.js";

/**
 * Service used by the backend to generate
 * a personalized size recommendation.
 *
 * RAG/database logic should provide the
 * available size chart.
 *
 * Accepted input (existing names still work unchanged):
 *   measurements  (alias: userMeasurements)
 *   sizeChart     (alias: availableSizes)
 *                 object map { S: {...}, M: {...} }
 *                 or array   [{ label: "S", ... }, ...]
 *   garment
 *   fit           defaults to "Regular"
 *
 * All measurements are in inches.
 *
 * Errors are normal Error objects with the same messages as before, plus
 * `code` and `statusCode` (400) so the Express layer can respond cleanly.
 */

export function getSizeRecommendation({
  measurements,
  userMeasurements,
  sizeChart,
  availableSizes,
  garment,
  fit = "Regular"
} = {}) {
  const resolvedMeasurements = measurements ?? userMeasurements;
  const resolvedSizeChart = sizeChart ?? availableSizes;

  if (!resolvedMeasurements) {
    throw createSizeError(
      "User measurements are required.",
      "MISSING_MEASUREMENTS"
    );
  }

  if (!resolvedSizeChart) {
    throw createSizeError(
      "Size chart is required.",
      "MISSING_SIZE_CHART"
    );
  }

  if (!garment) {
    throw createSizeError(
      "Garment type is required.",
      "MISSING_GARMENT"
    );
  }

  return calculateSize(
    resolvedMeasurements,
    resolvedSizeChart,
    typeof garment === "string" ? garment.trim() : garment,
    fit ?? "Regular"
  );
}
