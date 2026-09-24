import express from 'express';
import { PrismaClient } from '@prisma/client';
import { getSizeRecommendation } from '../services/sizeRecommendationService.js';

const router = express.Router();
const prisma = new PrismaClient();


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
    // GET BRAND SIZES
    // -------------------------------------------------

    const sizes = await prisma.brandSize.findMany({
      where: {
        brandId: brandId,
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

    const sizeChart = {};

    for (const size of sizes) {

      sizeChart[size.sizeLabel] = {};

      for (const measurement of size.measurements) {

        const measurementName =
          measurement.measurementType?.key;

        if (!measurementName) {
          continue;
        }

        sizeChart[size.sizeLabel][measurementName] =
          Number(measurement.value);
      }
    }


    // -------------------------------------------------
    // RUN SIZE ENGINE
    // -------------------------------------------------

    const result = getSizeRecommendation({
      measurements,
      sizeChart,
      garment,
      fit
    });


    // -------------------------------------------------
    // RESPONSE
    // -------------------------------------------------

    res.status(200).json({
      status: 'success',
      data: result
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