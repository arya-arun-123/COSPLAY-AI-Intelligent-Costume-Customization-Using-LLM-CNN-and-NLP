import express from 'express';
import { parseCustomizationPrompt } from '../services/llmParserService.js';
import { validateCustomizationInput } from '../validators/customizationValidation.js';

const router = express.Router();

/**
 * POST /api/v1/parse-customization
 * Body: { creativePrompt: string, garmentType?: string }
 */
router.post('/', async (req, res) => {
  try {
    const { creativePrompt, garmentType } = req.body;

    if (!creativePrompt || typeof creativePrompt !== 'string' || !creativePrompt.trim()) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PROMPT',
        message: 'A creative prompt is required to parse customizations.',
      });
    }

    // If garmentType is supplied, validate it first
    if (garmentType) {
      const inputValidation = validateCustomizationInput({
        garmentType,
        creativePrompt,
      });

      if (!inputValidation.valid) {
        return res.status(422).json({
          success: false,
          code: inputValidation.code,
          message: inputValidation.message,
        });
      }
    }

    const parsed = await parseCustomizationPrompt({
      prompt: creativePrompt,
      garmentType: garmentType || null,
    });

    return res.json({
      success: true,
      data: parsed,
    });
  } catch (error) {
    console.error('LLM parsing error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to parse customization prompt.',
    });
  }
});

export default router;
