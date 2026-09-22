import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/v1/custom-designs
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      garmentType,
      designPrompt,
      referenceImages = [],
      generatedImageUrl = null,
      designArtworkUrl = null,
      baseBrandSizeId,
      alterations = [],
    } = req.body;

    // Basic validation
    if (!userId || !garmentType || !designPrompt || !baseBrandSizeId) {
      return res.status(400).json({
        status: 'error',
        message:
          'userId, garmentType, designPrompt and baseBrandSizeId are required',
      });
    }

    // Find the selected brand size and its measurements
    const baseSize = await prisma.brandSize.findUnique({
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
        message: 'Selected brand size not found',
      });
    }

    // Calculate alterations from database measurements
    const calculatedAlterations = alterations.map((alteration) => {
      const baseMeasurement = baseSize.measurements.find(
        (measurement) =>
          measurement.measurementTypeId === alteration.measurementTypeId
      );

      if (!baseMeasurement) {
        throw new Error(
          `Measurement type ${alteration.measurementTypeId} is not available for the selected size`
        );
      }

      const adjustment = Number(alteration.adjustment);

      if (Number.isNaN(adjustment)) {
        throw new Error(
          `Invalid adjustment for measurement type ${alteration.measurementTypeId}`
        );
      }

      const finalValue = baseMeasurement.value + adjustment;

      return {
        measurementTypeId: alteration.measurementTypeId,
        alterationType: adjustment >= 0 ? 'INCREASE' : 'DECREASE',
        adjustment: Math.abs(adjustment),
        baseValue: baseMeasurement.value,
        finalValue,
      };
    });

    // Create the custom design
    const customDesign = await prisma.customDesign.create({
      data: {
        userId,
        garmentType,
        designPrompt,
        referenceImages,
        generatedImageUrl,
        designArtworkUrl,
        baseBrandSizeId,
        alterations: {
          create: calculatedAlterations,
        },
      },
      include: {
        alterations: {
          include: {
            measurementType: true,
          },
        },
      },
    });

    res.status(201).json({
      status: 'success',
      data: customDesign,
    });
  } catch (error) {
    console.error('Error creating custom design:', error);

    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create custom design',
    });
  }
});

export default router;
