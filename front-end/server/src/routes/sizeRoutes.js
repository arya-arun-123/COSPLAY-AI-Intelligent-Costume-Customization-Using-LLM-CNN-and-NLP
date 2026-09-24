import express from 'express';
import { PrismaClient } from '@prisma/client';

import { getSizeRecommendation } from '../services/sizeRecommendationService.js';
import { retrieveRagContext } from '../services/ragClientService.js';
import { generateRecommendationExplanation } from '../services/llm/recommendationExplanationService.js';

const router = express.Router();
const prisma = new PrismaClient();

const CM_TO_INCH = 1 / 2.54;

/**
 * Convert numeric measurements from centimeters to inches.
 *
 * The Size Engine expects measurements in inches.
 */
function convertMeasurementsCmToInches(measurements) {
  const converted = {};

  for (const [key, value] of Object.entries(measurements || {})) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      converted[key] = Number((value * CM_TO_INCH).toFixed(2));
    } else {
      converted[key] = value;
    }
  }

  return converted;
}

/**
 * Convert Prisma BrandSize measurement records
 * into the format expected by the Size Engine.
 *
 * Example:
 *
 * [
 *   {
 *     measurementType: {
 *       key: "chest"
 *     },
 *     value: 40
 *   }
 * ]
 *
 * becomes:
 *
 * {
 *   chest: 40
 * }
 */
function buildMeasurementObject(measurements = []) {
  const result = {};

  for (const measurement of measurements) {
    let measurementName = measurement.measurementType?.key;

    if (!measurementName) {
      continue;
    }

    // Normalize database naming to Size Engine naming.
    if (measurementName === 'sleeve_length') {
      measurementName = 'sleeve';
    }

    const value = Number(measurement.value);

    if (Number.isFinite(value)) {
      result[measurementName] = value;
    }
  }

  return result;
}

/**
 * Convert Prisma BrandSize rows
 * into the Size Engine size chart format.
 *
 * Example:
 *
 * {
 *   S: {
 *     chest: 38,
 *     shoulder: 17
 *   },
 *   M: {
 *     chest: 40,
 *     shoulder: 18
 *   }
 * }
 */
function buildSizeChart(sizes = []) {
  const sizeChart = {};

  for (const size of sizes) {
    sizeChart[size.sizeLabel] = {};

    for (const measurement of size.measurements || []) {
      let measurementName = measurement.measurementType?.key;

      if (!measurementName) {
        continue;
      }

      if (measurementName === 'sleeve_length') {
        measurementName = 'sleeve';
      }

      const value = Number(measurement.value);

      if (Number.isFinite(value)) {
        sizeChart[size.sizeLabel][measurementName] = value;
      }
    }
  }

  return sizeChart;
}

/**
 * Normalize size labels for safe comparison.
 *
 * Examples:
 *   "S"      -> "S"
 *   " s "    -> "S"
 *   "medium" -> "MEDIUM"
 *   "M"      -> "M"
 */
function normalizeSizeLabel(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Find a target BrandSize using a normalized size label.
 *
 * This prevents failures caused by differences such as:
 *   "S" vs "s"
 *   " M " vs "M"
 *   "XL" vs "xl"
 */
function findMatchingTargetSize(targetSizes, recommendedSize) {
  const normalizedRecommendedSize =
    normalizeSizeLabel(recommendedSize);

  return targetSizes.find(
    (size) =>
      normalizeSizeLabel(size.sizeLabel) ===
      normalizedRecommendedSize
  );
}

// =====================================================
// GET SIZE MEASUREMENTS
// =====================================================

/**
 * GET /api/v1/sizes/:sizeId/measurements
 *
 * Returns the measurements belonging to a specific
 * brand size.
 */
router.get('/:sizeId/measurements', async (req, res) => {
  try {
    const { sizeId } = req.params;

    const size = await prisma.brandSize.findUnique({
      where: {
        id: sizeId,
      },

      include: {
        measurements: {
          include: {
            measurementType: true,
          },
        },
      },
    });

    if (!size) {
      return res.status(404).json({
        status: 'error',
        message: 'Size not found',
      });
    }

    return res.json({
      status: 'success',

      data: {
        sizeId: size.id,
        garmentType: size.garmentType,
        sizeLabel: size.sizeLabel,
        measurements: size.measurements,
      },
    });
  } catch (error) {
    console.error(
      'Error fetching size measurements:',
      error
    );

    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch size measurements',
    });
  }
});

// =====================================================
// SIZE RECOMMENDATION
// =====================================================

/**
 * POST /api/v1/sizes/recommend
 *
 * Existing endpoint.
 *
 * This endpoint accepts actual user measurements
 * and recommends a size using:
 *
 * 1. PostgreSQL structured size data
 * 2. RAG retrieval
 * 3. Deterministic Size Engine
 * 4. Gemini explanation
 */
router.post('/recommend', async (req, res) => {
  try {
    const {
      measurements,
      brandId,
      garment,
      fit = 'Regular',
    } = req.body;

    // -------------------------------------------------
    // VALIDATION
    // -------------------------------------------------

    if (!measurements) {
      return res.status(400).json({
        status: 'error',
        message: 'User measurements are required',
      });
    }

    if (!brandId) {
      return res.status(400).json({
        status: 'error',
        message: 'Brand ID is required',
      });
    }

    if (!garment) {
      return res.status(400).json({
        status: 'error',
        message: 'Garment type is required',
      });
    }

    // -------------------------------------------------
    // GET BRAND
    // -------------------------------------------------

    const brand = await prisma.brand.findUnique({
      where: {
        id: brandId,
      },
    });

    if (!brand) {
      return res.status(404).json({
        status: 'error',
        message: 'Brand not found',
      });
    }

    // -------------------------------------------------
    // GET BRAND SIZES
    // -------------------------------------------------

    const sizes = await prisma.brandSize.findMany({
      where: {
        brandId: brandId,
        garmentType: garment.toUpperCase(),
      },

      include: {
        measurements: {
          include: {
            measurementType: true,
          },
        },
      },
    });

    if (!sizes.length) {
      return res.status(404).json({
        status: 'error',
        message: 'No size data found for this brand',
      });
    }

    // -------------------------------------------------
    // RETRIEVE RAG CONTEXT
    // -------------------------------------------------

    let ragDocuments = [];

    try {
      ragDocuments = await retrieveRagContext({
        brand: brand.name,
        garment,
        chest: measurements.chest,
        height: measurements.height,
        fit,
        topK: 3,
      });
    } catch (error) {
      console.error(
        'Recommendation RAG retrieval unavailable:',
        error
      );

      // RAG provides contextual evidence.
      // The deterministic Size Engine can still
      // calculate a result using structured data.
      ragDocuments = [];
    }

    // -------------------------------------------------
    // BUILD SIZE CHART
    // -------------------------------------------------

    const sizeChart = buildSizeChart(sizes);

    // -------------------------------------------------
    // CONVERT USER MEASUREMENTS
    // -------------------------------------------------

    const measurementsInches =
      convertMeasurementsCmToInches(measurements);

    // -------------------------------------------------
    // RUN SIZE ENGINE
    // -------------------------------------------------

    const result = getSizeRecommendation({
      measurements: measurementsInches,
      sizeChart,
      garment,
      fit,
    });

    if (
      !result ||
      typeof result.recommendedSize !== 'string'
    ) {
      throw new Error(
        'Size engine did not return a valid recommended size'
      );
    }

    // -------------------------------------------------
    // GENERATE LLM EXPLANATION
    // -------------------------------------------------

    let explanation = null;

    try {
      explanation =
        await generateRecommendationExplanation({
          measurements,
          fit,
          ragContext: ragDocuments,
          sizeEngineResult: result,
        });
    } catch (error) {
      console.error(
        'Recommendation explanation unavailable:',
        error
      );
    }

    // -------------------------------------------------
    // RESPONSE
    // -------------------------------------------------

    return res.status(200).json({
      status: 'success',

      data: {
        ...result,

        explanation:
          explanation?.explanation ??
          'The recommendation was generated using the available structured size data.',

        ragContext: ragDocuments,
      },
    });
  } catch (error) {
    console.error(
      'Size recommendation error:',
      error
    );

    return res.status(500).json({
      status: 'error',
      message: 'Failed to generate size recommendation',
    });
  }
});

// =====================================================
// SIZE RECOMMENDATION FROM REFERENCE BRAND + SIZE
// =====================================================

/**
 * POST /api/v1/sizes/recommend-from-reference
 *
 * This endpoint is used when the user does not provide
 * their actual body measurements.
 *
 * Example:
 *
 * User normally wears:
 *     Levi's S
 *
 * Target:
 *     Nike Hoodie
 *
 * The system:
 *
 * 1. Gets the measurement profile of Levi's S
 * 2. Retrieves RAG context for Nike Hoodie
 * 3. Gets Nike's available sizes
 * 4. Runs the deterministic Size Engine
 * 5. Generates a grounded explanation with Gemini
 * 6. Returns the recommended Nike size
 */
router.post(
  '/recommend-from-reference',
  async (req, res) => {
    try {
      const {
        referenceBrandId,
        referenceSizeId,
        targetBrandId,
        garment,
        fit = 'Regular',
      } = req.body;

      // -------------------------------------------------
      // VALIDATION
      // -------------------------------------------------

      if (!referenceBrandId) {
        return res.status(400).json({
          status: 'error',
          message: 'Usual brand is required',
        });
      }

      if (!referenceSizeId) {
        return res.status(400).json({
          status: 'error',
          message: 'Usual size is required',
        });
      }

      if (!targetBrandId) {
        return res.status(400).json({
          status: 'error',
          message: 'Target brand is required',
        });
      }

      if (!garment) {
        return res.status(400).json({
          status: 'error',
          message: 'Garment type is required',
        });
      }

      // -------------------------------------------------
      // NORMALIZE GARMENT
      // -------------------------------------------------

      const normalizedGarment =
        typeof garment === 'string'
          ? garment.trim().toUpperCase()
          : garment;

      // -------------------------------------------------
      // GET REFERENCE BRAND
      // -------------------------------------------------

      const referenceBrand =
        await prisma.brand.findUnique({
          where: {
            id: referenceBrandId,
          },
        });

      if (!referenceBrand) {
        return res.status(404).json({
          status: 'error',
          message: 'Usual brand not found',
        });
      }

      // -------------------------------------------------
      // GET REFERENCE SIZE
      // -------------------------------------------------

      const referenceSize =
        await prisma.brandSize.findUnique({
          where: {
            id: referenceSizeId,
          },

          include: {
            measurements: {
              include: {
                measurementType: true,
              },
            },
          },
        });

      if (!referenceSize) {
        return res.status(404).json({
          status: 'error',
          message: 'Usual size not found',
        });
      }

      // -------------------------------------------------
      // VALIDATE REFERENCE SIZE
      // -------------------------------------------------

      if (
        referenceSize.brandId !==
        referenceBrandId ||
        referenceSize.garmentType !==
        normalizedGarment
      ) {
        return res.status(400).json({
          status: 'error',
          message:
            'Selected usual size does not match the selected brand or garment',
        });
      }

      // -------------------------------------------------
      // GET TARGET BRAND
      // -------------------------------------------------

      const targetBrand =
        await prisma.brand.findUnique({
          where: {
            id: targetBrandId,
          },
        });

      if (!targetBrand) {
        return res.status(404).json({
          status: 'error',
          message: 'Target brand not found',
        });
      }

      // -------------------------------------------------
      // GET TARGET BRAND SIZES
      // -------------------------------------------------

      const targetSizes =
        await prisma.brandSize.findMany({
          where: {
            brandId: targetBrandId,
            garmentType: normalizedGarment,
          },

          include: {
            measurements: {
              include: {
                measurementType: true,
              },
            },
          },
        });

      if (!targetSizes.length) {
        return res.status(404).json({
          status: 'error',
          message:
            `No size data found for ${targetBrand.name}`,
        });
      }

      // -------------------------------------------------
      // BUILD REFERENCE MEASUREMENTS
      // -------------------------------------------------

      const referenceMeasurements =
        buildMeasurementObject(
          referenceSize.measurements
        );

      if (
        Object.keys(referenceMeasurements).length === 0
      ) {
        return res.status(404).json({
          status: 'error',
          message:
            'No usable measurements found for the selected usual size',
        });
      }

      console.log(
        '[Size Recommendation] Reference:',
        {
          brand: referenceBrand.name,
          size: referenceSize.sizeLabel,
          measurements: referenceMeasurements,
        }
      );

      // -------------------------------------------------
      // RETRIEVE RAG CONTEXT
      // -------------------------------------------------

      let ragDocuments = [];

      try {
        ragDocuments =
          await retrieveRagContext({
            brand: targetBrand.name,
            garment: normalizedGarment,

            chest:
              referenceMeasurements.chest ??
              null,

            height:
              referenceMeasurements.height ??
              null,

            fit,

            topK: 3,
          });
      } catch (error) {
        console.error(
          'Reference-size RAG retrieval unavailable:',
          error
        );

        /*
         * RAG provides contextual evidence.
         *
         * The deterministic Size Engine can still
         * calculate a result using the structured
         * PostgreSQL size data.
         */
        ragDocuments = [];
      }

      // -------------------------------------------------
      // BUILD TARGET SIZE CHART
      // -------------------------------------------------

      const sizeChart =
        buildSizeChart(targetSizes);

      // -------------------------------------------------
      // RUN SIZE ENGINE
      // -------------------------------------------------

      const result =
        getSizeRecommendation({
          measurements:
            referenceMeasurements,

          sizeChart,

          garment: normalizedGarment,

          fit,
        });

      // -------------------------------------------------
      // VALIDATE SIZE ENGINE RESULT
      // -------------------------------------------------

      if (
        !result ||
        typeof result.recommendedSize !==
        'string' ||
        !result.recommendedSize.trim()
      ) {
        throw new Error(
          'Size engine did not return a valid recommended size'
        );
      }

      console.log(
        '[Size Recommendation] Size Engine result:',
        result
      );

      // -------------------------------------------------
      // FIND RECOMMENDED TARGET SIZE
      // -------------------------------------------------

      const recommendedTargetSize =
        findMatchingTargetSize(
          targetSizes,
          result.recommendedSize
        );

      console.log(
        '[Size Recommendation] Available target sizes:',
        targetSizes.map((size) => ({
          id: size.id,
          sizeLabel: size.sizeLabel,
        }))
      );

      console.log(
        '[Size Recommendation] Matched target size:',
        recommendedTargetSize
          ? {
            id: recommendedTargetSize.id,
            sizeLabel:
              recommendedTargetSize.sizeLabel,
          }
          : null
      );

      // -------------------------------------------------
      // HANDLE TARGET SIZE MATCH FAILURE
      // -------------------------------------------------

      if (!recommendedTargetSize) {
        return res.status(422).json({
          status: 'error',
          message:
            `The Size Engine recommended "${result.recommendedSize}", but that size is not available for ${targetBrand.name}.`,
          data: {
            recommendedSize:
              result.recommendedSize,

            availableSizes:
              targetSizes.map(
                (size) => size.sizeLabel
              ),
          },
        });
      }

      // -------------------------------------------------
      // GENERATE LLM EXPLANATION
      // -------------------------------------------------

      let explanation = null;

      try {
        explanation =
          await generateRecommendationExplanation({
            measurements:
              referenceMeasurements,

            fit,

            ragContext:
              ragDocuments,

            sizeEngineResult:
              result,
          });
      } catch (error) {
        /*
         * Gemini is an explanation layer.
         *
         * It must NOT prevent the deterministic
         * Size Engine recommendation from being
         * returned.
         */
        console.error(
          'Reference-size explanation unavailable:',
          error
        );
      }

      // -------------------------------------------------
      // FALLBACK EXPLANATION
      // -------------------------------------------------

      const finalExplanation =
        explanation?.explanation ??
        `Based on your ${referenceBrand.name} ${referenceSize.sizeLabel} measurements, the recommended ${targetBrand.name} size is ${recommendedTargetSize.sizeLabel}.`;

      // -------------------------------------------------
      // RESPONSE
      // -------------------------------------------------

      return res.status(200).json({
        status: 'success',

        data: {
          recommendedSize:
            recommendedTargetSize.sizeLabel,

          fit,

          explanation:
            finalExplanation,

          reference: {
            brandId:
              referenceBrand.id,

            brandName:
              referenceBrand.name,

            sizeId:
              referenceSize.id,

            sizeLabel:
              referenceSize.sizeLabel,
          },

          target: {
            brandId:
              targetBrand.id,

            brandName:
              targetBrand.name,

            garment:
              normalizedGarment,
          },

          targetSizeId:
            recommendedTargetSize.id,

          ragContext:
            ragDocuments,
        },
      });
    } catch (error) {
      console.error(
        'Reference size recommendation error:',
        error
      );

      return res.status(500).json({
        status: 'error',
        message:
          'Failed to generate size recommendation',
      });
    }
  }
);

export default router;