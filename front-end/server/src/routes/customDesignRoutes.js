import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================
// GET /api/v1/custom-designs
// Get all saved designs for the current user
//
// Frontend usage:
// GET /custom-designs?userId=USER_ID
// ============================================================

router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'userId is required',
      });
    }

    const customDesigns =
      await prisma.customDesign.findMany({
        where: {
          userId,
        },

        include: {
          alterations: {
            include: {
              measurementType: true,
            },
          },

          baseBrandSize: {
            include: {
              brand: true,
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

    return res.status(200).json({
      status: 'success',
      data: customDesigns,
    });
  } catch (error) {
    console.error(
      'Error fetching custom designs:',
      error
    );

    return res.status(500).json({
      status: 'error',
      message:
        error.message ||
        'Failed to fetch custom designs',
    });
  }
});

// ============================================================
// POST /api/v1/custom-designs
// Create and save a custom AI design
// ============================================================

router.post('/', async (req, res) => {
  try {
    const {
      userId,
      garmentType,
      designPrompt,
      referenceImages = [],
      baseBrandSizeId,
      alterations = [],
    } = req.body;

    // --------------------------------------------------------
    // Basic validation
    // --------------------------------------------------------

    if (
      !userId ||
      !garmentType ||
      !designPrompt ||
      !baseBrandSizeId
    ) {
      return res.status(400).json({
        status: 'error',
        message:
          'userId, garmentType, designPrompt and baseBrandSizeId are required',
      });
    }

    // --------------------------------------------------------
    // Find selected brand size and measurements
    // --------------------------------------------------------

    const baseSize =
      await prisma.brandSize.findUnique({
        where: {
          id: baseBrandSizeId,
        },

        include: {
          measurements: {
            include: {
              measurementType: true,
            },
          },
        },
      });

    if (!baseSize) {
      return res.status(404).json({
        status: 'error',
        message:
          'Selected brand size not found',
      });
    }

    // --------------------------------------------------------
    // Calculate alterations
    // --------------------------------------------------------

    const calculatedAlterations =
      alterations.map((alteration) => {
        const baseMeasurement =
          baseSize.measurements.find(
            (measurement) =>
              measurement.measurementTypeId ===
              alteration.measurementTypeId
          );

        if (!baseMeasurement) {
          throw new Error(
            `Measurement type ${alteration.measurementTypeId} is not available for the selected size`
          );
        }

        const adjustment = Number(
          alteration.adjustment
        );

        if (Number.isNaN(adjustment)) {
          throw new Error(
            `Invalid adjustment for measurement type ${alteration.measurementTypeId}`
          );
        }

        const finalValue =
          baseMeasurement.value +
          adjustment;

        return {
          measurementTypeId:
            alteration.measurementTypeId,

          alterationType:
            adjustment >= 0
              ? 'INCREASE'
              : 'DECREASE',

          adjustment:
            Math.abs(adjustment),

          baseValue:
            baseMeasurement.value,

          finalValue,
        };
      });

    // --------------------------------------------------------
    // Create custom design
    // --------------------------------------------------------

    const customDesign =
      await prisma.customDesign.create({
        data: {
          userId,
          garmentType,
          designPrompt,
          referenceImages,
          baseBrandSizeId,

          alterations: {
            create:
              calculatedAlterations,
          },
        },

        include: {
          alterations: {
            include: {
              measurementType: true,
            },
          },

          baseBrandSize: {
            include: {
              brand: true,
            },
          },
        },
      });

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    return res.status(201).json({
      status: 'success',
      data: customDesign,
    });
  } catch (error) {
    console.error(
      'Error creating custom design:',
      error
    );

    return res.status(500).json({
      status: 'error',
      message:
        error.message ||
        'Failed to create custom design',
    });
  }
});

// ============================================================
// GET /api/v1/custom-designs/:id
// Get one saved custom design
// ============================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: 'error',
        message:
          'Custom design ID is required',
      });
    }

    const customDesign =
      await prisma.customDesign.findUnique({
        where: {
          id,
        },

        include: {
          alterations: {
            include: {
              measurementType: true,
            },
          },

          baseBrandSize: {
            include: {
              brand: true,
            },
          },
        },
      });

    if (!customDesign) {
      return res.status(404).json({
        status: 'error',
        message:
          'Custom design not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: customDesign,
    });
  } catch (error) {
    console.error(
      'Error fetching custom design:',
      error
    );

    return res.status(500).json({
      status: 'error',
      message:
        error.message ||
        'Failed to fetch custom design',
    });
  }
});

export default router;