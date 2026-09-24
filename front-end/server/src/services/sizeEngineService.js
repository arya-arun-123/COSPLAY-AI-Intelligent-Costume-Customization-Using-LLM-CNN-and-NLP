/**
 * COSPLAY-AI
 * Personalized Size Recommendation Engine
 *
 * All measurements are handled in inches.
 *
 * Responsibilities:
 * - Select the closest available size
 * - Support garment-specific measurements
 * - Consider fit preference
 * - Compare user measurements with selected size
 * - Detect possible alterations
 *
 * Accepted size chart shapes (both are normalized internally):
 *   { S: { chest: 37, waist: 31 }, M: { chest: 40, waist: 34 } }
 *   [ { label: "S", chest: [36, 38] }, { label: "M", chest: [39, 41] } ]
 *
 * A size value may be a number, a [min, max] range, or { min, max }.
 * Ranges are scored on their midpoint.
 */

const MEASUREMENT_RULES = Object.freeze({
  tops: ["chest", "waist", "shoulder", "sleeve"],
  bottoms: ["waist", "hip", "thigh", "inseam", "rise"],
  dresses: ["chest", "waist", "hip", "shoulder", "sleeve"],
  jackets: ["chest", "waist", "shoulder", "sleeve"]
});

// "shorts" (plural) is used on purpose so "short sleeve shirt" stays a top.
const BOTTOM_KEYWORDS = [
  "pant",
  "trouser",
  "jean",
  "shorts",
  "skirt",
  "legging",
  "jogger"
];

const JACKET_KEYWORDS = ["jacket", "coat"];


// =====================================================
// THRESHOLDS
// =====================================================

const GOOD_MATCH_THRESHOLD = 2;
const MODERATE_MATCH_THRESHOLD = 5;

// A body/garment measurement above this in inches is very likely centimetres.
const SUSPICIOUS_VALUE_LIMIT = 80;


// =====================================================
// FIT PREFERENCE
// =====================================================

const FIT_PREFERENCE = Object.freeze({
  slim: 0.5,
  regular: 0,
  loose: -0.5
});


// =====================================================
// HELPERS
// =====================================================

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function round2(value) {
  return Number(value.toFixed(2));
}

/**
 * Creates an Error carrying a machine-readable code and an HTTP-style
 * status, so the Express layer can map it without parsing messages.
 * It is still a normal Error with the same message text as before.
 */
export function createSizeError(message, code, details) {
  const error = new Error(message);
  error.name = "SizeEngineError";
  error.code = code;
  error.statusCode = 400;

  if (details !== undefined) {
    error.details = details;
  }

  return error;
}

/**
 * Finite positive number, or a numeric string such as "40".
 * Anything else (NaN, Infinity, 0, negatives, text) is treated as missing.
 */
function toPositiveNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

/**
 * Converts a raw value into one inch measurement.
 *  - number / numeric string -> the number
 *  - [min, max] or {min, max} -> midpoint
 *  - anything else -> null (missing)
 */
function resolveValue(value) {
  const single = toPositiveNumber(value);

  if (single !== null) {
    return single;
  }

  let low = null;
  let high = null;

  if (Array.isArray(value) && value.length === 2) {
    low = toPositiveNumber(value[0]);
    high = toPositiveNumber(value[1]);
  } else if (isPlainObject(value)) {
    low = toPositiveNumber(value.min);
    high = toPositiveNumber(value.max);
  } else {
    return null;
  }

  if (low === null || high === null) {
    return null;
  }

  return (low + high) / 2;
}

/**
 * Accepts the size chart as an object map or as an array of
 * { label | size, ...measurements } entries and returns an object map.
 */
export function normalizeSizeChart(sizeChart) {
  if (isPlainObject(sizeChart)) {
    return sizeChart;
  }

  if (!Array.isArray(sizeChart)) {
    return null;
  }

  const chart = {};

  for (const entry of sizeChart) {
    if (!isPlainObject(entry)) {
      continue;
    }

    const rawLabel = entry.label ?? entry.size;

    if (rawLabel === undefined || rawLabel === null) {
      continue;
    }

    const label = String(rawLabel).trim();

    if (label === "") {
      continue;
    }

    if (isPlainObject(entry.measurements)) {
      chart[label] = entry.measurements;
      continue;
    }

    const { label: _label, size: _size, ...measurements } = entry;
    chart[label] = measurements;
  }

  return chart;
}

/**
 * Normalize fit preference.
 */
function normalizeFit(fit) {
  if (!fit || typeof fit !== "string") {
    return "regular";
  }

  const normalizedFit = fit.trim().toLowerCase();

  if (FIT_PREFERENCE[normalizedFit] !== undefined) {
    return normalizedFit;
  }

  return "regular";
}


// =====================================================
// MEASUREMENT STATUS
// =====================================================

function getMeasurementStatus(difference) {
  if (difference <= GOOD_MATCH_THRESHOLD) {
    return "good";
  }

  if (difference <= MODERATE_MATCH_THRESHOLD) {
    return "moderate";
  }

  return "significant";
}


// =====================================================
// GARMENT-SPECIFIC MEASUREMENTS
// =====================================================

function getRelevantMeasurements(garment) {
  const normalizedGarment = garment.toLowerCase();

  if (BOTTOM_KEYWORDS.some((k) => normalizedGarment.includes(k))) {
    return MEASUREMENT_RULES.bottoms;
  }

  if (normalizedGarment.includes("dress")) {
    return MEASUREMENT_RULES.dresses;
  }

  if (JACKET_KEYWORDS.some((k) => normalizedGarment.includes(k))) {
    return MEASUREMENT_RULES.jackets;
  }

  return MEASUREMENT_RULES.tops;
}


// =====================================================
// DIFFERENCE
// =====================================================

function calculateDifference(userValue, sizeValue) {
  return Math.abs(userValue - sizeValue);
}


// =====================================================
// FIT-ADJUSTED SCORE
// =====================================================

function calculateFitAdjustedDifference(userValue, sizeValue, fit) {
  const fitAdjustment = FIT_PREFERENCE[fit];

  /*
   * Slim:
   * Slightly favors smaller/closer measurements.
   *
   * Regular:
   * Uses normal measurement difference.
   *
   * Loose:
   * Slightly favors measurements with more room.
   */

  let adjustedTarget = sizeValue;

  if (fit === "slim") {
    adjustedTarget = sizeValue - fitAdjustment;
  }

  if (fit === "loose") {
    adjustedTarget = sizeValue + Math.abs(fitAdjustment);
  }

  return calculateDifference(userValue, adjustedTarget);
}


// =====================================================
// SIZE SCORE
// =====================================================

function calculateSizeScore(
  userMeasurements,
  sizeMeasurements,
  relevantMeasurements,
  fit
) {
  let totalDifference = 0;
  let measurementCount = 0;

  for (const measurement of relevantMeasurements) {
    const userValue = resolveValue(userMeasurements[measurement]);
    const sizeValue = resolveValue(sizeMeasurements[measurement]);

    if (userValue === null || sizeValue === null) {
      continue;
    }

    totalDifference += calculateFitAdjustedDifference(
      userValue,
      sizeValue,
      fit
    );

    measurementCount++;
  }

  if (measurementCount === 0) {
    return null;
  }

  return totalDifference / measurementCount;
}


// =====================================================
// MEASUREMENT COMPARISON
// =====================================================

function compareMeasurements(
  userMeasurements,
  sizeMeasurements,
  relevantMeasurements
) {
  const comparison = {};

  for (const measurement of relevantMeasurements) {
    const userValue = resolveValue(userMeasurements[measurement]);
    const sizeValue = resolveValue(sizeMeasurements[measurement]);

    if (userValue === null || sizeValue === null) {
      continue;
    }

    const difference = calculateDifference(userValue, sizeValue);

    comparison[measurement] = {
      user: userValue,
      target: sizeValue,
      difference: round2(difference),
      status: getMeasurementStatus(difference)
    };
  }

  return comparison;
}


// =====================================================
// ALTERATION DETECTION
// =====================================================

function detectAlterations(measurementComparison) {
  const alterations = [];

  for (const [measurement, result] of Object.entries(
    measurementComparison
  )) {
    if (result.status === "significant") {
      alterations.push({
        measurement,
        difference: result.difference,
        recommendation: `Consider ${measurement} alteration`
      });
    }
  }

  return alterations;
}


// =====================================================
// WARNINGS
// =====================================================

function collectWarnings(userMeasurements, relevantMeasurements) {
  const warnings = [];

  for (const measurement of relevantMeasurements) {
    const value = resolveValue(userMeasurements[measurement]);

    if (value !== null && value > SUSPICIOUS_VALUE_LIMIT) {
      warnings.push(
        `${measurement} value ${value} looks unusually large. ` +
          "Measurements must be in inches, not centimetres."
      );
    }
  }

  return warnings;
}


// =====================================================
// MAIN SIZE ENGINE
// =====================================================

export function calculateSize(
  userMeasurements,
  availableSizes,
  garment,
  fit = "Regular"
) {
  // ---------------------------------------------------
  // VALIDATION
  // ---------------------------------------------------

  if (!isPlainObject(userMeasurements)) {
    throw createSizeError(
      "User measurements are required.",
      "MISSING_MEASUREMENTS"
    );
  }

  const sizeChart = normalizeSizeChart(availableSizes);

  if (!sizeChart || Object.keys(sizeChart).length === 0) {
    throw createSizeError(
      "Available size data is required.",
      "MISSING_SIZE_CHART"
    );
  }

  if (!garment || typeof garment !== "string") {
    throw createSizeError(
      "Garment type is required.",
      "MISSING_GARMENT"
    );
  }


  // ---------------------------------------------------
  // NORMALIZE FIT + GET RELEVANT MEASUREMENTS
  // ---------------------------------------------------

  const normalizedFit = normalizeFit(fit);

  const relevantMeasurements = getRelevantMeasurements(garment);

  const missingMeasurements = relevantMeasurements.filter(
    (m) => resolveValue(userMeasurements[m]) === null
  );


  // ---------------------------------------------------
  // SCORE EVERY SIZE
  // ---------------------------------------------------

  const scoredSizes = [];

  for (const [size, sizeMeasurements] of Object.entries(sizeChart)) {
    if (!isPlainObject(sizeMeasurements)) {
      continue;
    }

    const score = calculateSizeScore(
      userMeasurements,
      sizeMeasurements,
      relevantMeasurements,
      normalizedFit
    );

    if (score === null) {
      continue;
    }

    scoredSizes.push({ size, score });
  }


  // ---------------------------------------------------
  // NO MATCH
  // ---------------------------------------------------

  if (scoredSizes.length === 0) {
    throw createSizeError(
      "Unable to determine a size from the provided measurements.",
      "NO_COMPARABLE_MEASUREMENTS",
      {
        garment,
        expectedMeasurements: relevantMeasurements,
        missingMeasurements
      }
    );
  }


  // ---------------------------------------------------
  // FIND BEST SIZE
  // Lowest score wins; the first listed size wins ties.
  // ---------------------------------------------------

  let best = scoredSizes[0];

  for (const candidate of scoredSizes) {
    if (candidate.score < best.score) {
      best = candidate;
    }
  }

  const recommendedSize = best.size;


  // ---------------------------------------------------
  // COMPARE SELECTED SIZE
  // ---------------------------------------------------

  const measurementComparison = compareMeasurements(
    userMeasurements,
    sizeChart[recommendedSize],
    relevantMeasurements
  );


  // ---------------------------------------------------
  // ALTERATIONS
  // ---------------------------------------------------

  const alterations = detectAlterations(measurementComparison);


  // ---------------------------------------------------
  // RESULT
  // Original fields first and unchanged; new fields are additive.
  // ---------------------------------------------------

  return {
    recommendedSize,

    fit:
      normalizedFit.charAt(0).toUpperCase() +
      normalizedFit.slice(1),

    garment,

    score: round2(best.score),

    measurementComparison,

    alterations,

    usedMeasurements: Object.keys(measurementComparison),

    missingMeasurements,

    allScores: [...scoredSizes]
      .sort((a, b) => a.score - b.score)
      .map(({ size, score }) => ({ size, score: round2(score) })),

    warnings: collectWarnings(userMeasurements, relevantMeasurements)
  };
}
