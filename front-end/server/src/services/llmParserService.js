import { GoogleGenAI } from '@google/genai';
import { validateParsedCustomization } from '../validators/customizationValidation.js';

const KNOWN_COLORS = [
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple',
  'pink', 'grey', 'gray', 'brown', 'beige', 'navy', 'maroon', 'cream',
  'silver', 'gold', 'olive', 'teal', 'cyan', 'magenta', 'charcoal', 'indigo'
];

const KNOWN_FITS = [
  'oversized', 'loose', 'baggy', 'slim', 'tight', 'skinny', 'regular', 'relaxed', 'fitted', 'classic'
];

const KNOWN_STYLES = [
  'cyberpunk', 'anime', 'gothic', 'vintage', 'retro', 'minimal', 'minimalist',
  'streetwear', 'casual', 'futuristic', 'grunge', 'techwear', 'steampunk',
  'bohemian', 'classic', 'formal', 'athletic'
];

const GARMENT_MAPPINGS = [
  { match: ['t-shirt', 'tshirt', 'tee'], enum: 'TSHIRT' },
  { match: ['shirt', 'button-up', 'button-down'], enum: 'SHIRT' },
  { match: ['hoodie', 'hoody', 'sweatshirt'], enum: 'HOODIE' },
  { match: ['jean', 'jeans', 'denim'], enum: 'JEANS' },
  { match: ['pant', 'pants', 'trousers', 'joggers'], enum: 'PANTS' }
];

/**
 * Fallback NLP extractor when Gemini is unreachable or offline.
 */
export function extractCustomizationWithRules(prompt, fallbackGarmentType = null) {
  if (!prompt || typeof prompt !== 'string') {
    return null;
  }

  const lower = prompt.toLowerCase();

  // 1. Detect Garment
  let garmentType = fallbackGarmentType || null;
  if (!garmentType) {
    for (const item of GARMENT_MAPPINGS) {
      if (item.match.some((kw) => lower.includes(kw))) {
        garmentType = item.enum;
        break;
      }
    }
  }
  if (!garmentType) garmentType = 'TSHIRT';

  // 2. Detect Color
  let color = 'custom';
  for (const c of KNOWN_COLORS) {
    const regex = new RegExp(`\\b${c}\\b`, 'i');
    if (regex.test(lower)) {
      color = c;
      break;
    }
  }

  // 3. Detect Fit
  let fit = 'regular';
  for (const f of KNOWN_FITS) {
    const regex = new RegExp(`\\b${f}\\b`, 'i');
    if (regex.test(lower)) {
      fit = f;
      break;
    }
  }

  // 4. Detect Style
  let style = 'custom';
  for (const s of KNOWN_STYLES) {
    const regex = new RegExp(`\\b${s}\\b`, 'i');
    if (regex.test(lower)) {
      style = s;
      break;
    }
  }

  // 5. Detect Design / Details
  let design = prompt;
  // Try extracting artwork or specific descriptors
  const artworkMatch = prompt.match(/(?:with|featuring|has|having)\s+([^,.]+)/i);
  if (artworkMatch && artworkMatch[1]) {
    design = artworkMatch[1].trim();
  }

  // 6. Detect Placement
  let placement = 'front';
  const placements = ['chest', 'back', 'pocket', 'sleeve', 'sleeves', 'front', 'collar', 'thigh', 'knee'];
  for (const p of placements) {
    const regex = new RegExp(`\\b${p}\\b`, 'i');
    if (regex.test(lower)) {
      placement = p;
      break;
    }
  }

  return {
    garmentType,
    creativePrompt: prompt.trim(),
    color,
    fit,
    style,
    design,
    placement,
  };
}

/**
 * Parse a natural language prompt using Gemini LLM with structured output,
 * falling back to rule-based NLP extraction if LLM is not configured or errors.
 */
export async function parseCustomizationPrompt({ prompt, garmentType = null }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Creative prompt is required');
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `
You are an expert fashion designer and garment specification parser for COSPLAY-AI.
Parse the user's natural language customization request into structured fashion parameters.

Allowed garmentType values: "TSHIRT", "SHIRT", "HOODIE", "JEANS", "PANTS".
If the prompt does not specify a garment type and none was provided, choose the most likely or default to "TSHIRT".

Return a strictly valid JSON object with the following fields:
- garmentType (string: "TSHIRT" | "SHIRT" | "HOODIE" | "JEANS" | "PANTS")
- color (string: e.g. "black", "navy", "crimson", "silver")
- fit (string: e.g. "oversized", "slim", "regular", "loose", "relaxed")
- style (string: e.g. "cyberpunk", "anime", "minimal", "streetwear", "gothic", "vintage")
- design (string: description of specific graphic, embroidery, textures, patterns or artwork)
- placement (string: where the design/alteration is located, e.g. "chest", "back", "sleeve", "front", "all-over")
- creativePrompt (string: the original user prompt)
`;

      const userContent = `
User prompt: "${prompt}"
${garmentType ? `Garment type hint: ${garmentType}` : ''}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\n${userContent}` }],
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = response.text?.() || response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const parsedJson = JSON.parse(text);
        const result = {
          garmentType: (garmentType || parsedJson.garmentType || 'TSHIRT').toUpperCase(),
          creativePrompt: prompt.trim(),
          color: parsedJson.color || 'custom',
          fit: parsedJson.fit || 'regular',
          style: parsedJson.style || 'custom',
          design: parsedJson.design || prompt.trim(),
          placement: parsedJson.placement || 'front',
        };

        const validation = validateParsedCustomization(result);
        if (validation.valid) {
          return result;
        }
      }
    } catch (llmError) {
      console.warn('Gemini LLM parsing failed or timed out, falling back to rule-based parser:', llmError.message);
    }
  }

  // Fallback to rule-based NLP extraction
  const fallbackResult = extractCustomizationWithRules(prompt, garmentType);
  const validation = validateParsedCustomization(fallbackResult);
  if (!validation.valid) {
    throw new Error(`Failed to parse customization: ${validation.message}`);
  }

  return fallbackResult;
}
