import express from 'express';
import { PrismaClient } from '@prisma/client';
import { getSizeRecommendation } from '../services/sizeRecommendationService.js';
import { retrieveRagContext } from '../services/ragClientService.js';
import { generateRecommendationExplanation } from '../services/llm/recommendationExplanationService.js';

const router = express.Router();
const prisma = new PrismaClient();

const CM_TO_INCH = 1 / 2.54;

function convertMeasurementsCmToInches(measurements) {
  const converted = {};

  for (const [key, value] of Object.entries(measurements)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      converted[key] = Number((value * CM_TO_INCH).toFixed(2));
    } else {
      converted[key] = value;
    }
  }

  return converted;
}


// =====================================================
// GET SIZE MEASUREMENTS
// =====================================================

// GET /api/v1/sizes/:sizeId/measurements
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

    res.json({
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

    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch size measurements',
    });
  }
});


// =====================================================
// SIZE RECOMMENDATION
// =====================================================

// POST /api/v1/sizes/recommend
router.post('/recommend', async (req, res) => {
  try {

    const {
      measurements,
      brandId,
      garment,
      fit = 'Regular'
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
    // CONVERT PRISMA DATA INTO SIZE ENGINE FORMAT
    // -------------------------------------------------

    // -------------------------------------------------
    // RETRIEVE RAG CONTEXT
    // -------------------------------------------------

    const ragDocuments = await retrieveRagContext({
      brand: brand.name,
      garment,
      chest: measurements.chest,
      height: measurements.height,
      fit,
      topK: 3,
    });

    const sizeChart = {};

    for (const size of sizes) {

      sizeChart[size.sizeLabel] = {};

      for (const measurement of size.measurements) {

        let measurementName =
          measurement.measurementType?.key;

        if (!measurementName) {
          continue;
        }

// Normalize database measurement names to the size engine names.
if (measurementName === 'sleeve_length') {
  measurementName = 'sleeve';
}

        sizeChart[size.sizeLabel][measurementName] =
          Number(measurement.value);
      }
    }


    // -------------------------------------------------
    // RUN SIZE ENGINE
    // -------------------------------------------------

    const measurementsInches = convertMeasurementsCmToInches(measurements);

    const result = getSizeRecommendation({
      measurements: measurementsInches,
      sizeChart,
      garment,
      fit
    });
       let explanation = null;

try {
  explanation = await generateRecommendationExplanation({
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

    res.status(200).json({
    status: 'success',
    data: {
      ...result,
      explanation: explanation?.explanation ?? null,
      ragContext: ragDocuments,
    }
  });

  } catch (error) {

    console.error(
      'Size recommendation error:',
      error
    );

    res.status(500).json({
      status: 'error',
      message: 'Failed to generate size recommendation',
    });
  }
});


export default router;
