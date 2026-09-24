import { GoogleGenAI } from '@google/genai';
import { validateMeasurementExtraction } from '../../validators/measurementExtractionValidator.js';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not configured');
}

const ai = new GoogleGenAI({
  apiKey,
});

const MEASUREMENT_FIELDS = [
  'height',
  'chest',
  'waist',
  'hip',
  'shoulder',
  'sleeve',
  'inseam',
];

const EXTRACTION_PROMPT = `
You extract clothing measurements from user text.

Return JSON only.

Extract these fields:
- height
- chest
- waist
- hip
- shoulder
- sleeve
- inseam
- fit

For every measurement that is mentioned, return:
- value: the number exactly as stated by the user
- unit: the original unit used by the user

Allowed units:
- cm
- m
- in

Do NOT convert units yourself.

Recognize approximate phrases such as:
- about 96 cm
- around 38 inches
- roughly 1.78 m

If a measurement is not mentioned, return null.

Allowed fit values:
- Slim
- Regular
- Loose

If no fit preference is provided, return null.

Do NOT calculate a clothing size.
Do NOT recommend a brand.
Do NOT invent missing measurements.

Return exactly:

{
  "height": null,
  "chest": null,
  "waist": null,
  "hip": null,
  "shoulder": null,
  "sleeve": null,
  "inseam": null,
  "fit": null
}

When a measurement exists, use:
{
  "value": 96,
  "unit": "cm"
}
`;

function extractJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Gemini returned empty extraction output');
  }

  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(
      'Gemini returned invalid JSON for measurement extraction'
    );
  }
}

function convertToCentimeters(value, unit) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Invalid measurement value');
  }

  const normalizedUnit = String(unit).trim().toLowerCase();

  switch (normalizedUnit) {
    case 'cm':
      return value;

    case 'm':
      return value * 100;

    case 'in':
      return value * 2.54;

    default:
      throw new Error(`Unsupported measurement unit: ${unit}`);
  }
}

function normalizeMeasurements(extracted) {
  const normalized = {
    height: null,
    chest: null,
    waist: null,
    hip: null,
    shoulder: null,
    sleeve: null,
    inseam: null,
    fit: extracted.fit ?? null,
  };

  for (const field of MEASUREMENT_FIELDS) {
    const measurement = extracted[field];

    if (measurement === null || measurement === undefined) {
      continue;
    }

    if (
      typeof measurement !== 'object' ||
      typeof measurement.value !== 'number' ||
      typeof measurement.unit !== 'string'
    ) {
      throw new Error(
        `Invalid extracted measurement format for ${field}`
      );
    }

    normalized[field] = Number(
      convertToCentimeters(
        measurement.value,
        measurement.unit
      ).toFixed(2)
    );
  }

  return normalized;
}

async function generateWithRetry(request, maxAttempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      lastError = error;

      const status = error?.status;
      const code = error?.code;

      const isRetryable =
        status === 'UNAVAILABLE' ||
        code === 503 ||
        code === 429;

      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, attempt * 1500);
      });
    }
  }

  throw lastError;
}

export async function extractMeasurements(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('Measurement text is required');
  }

  const response = await generateWithRetry({
    model: 'gemini-3.6-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${EXTRACTION_PROMPT}

User text:
${text.trim()}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
    },
  });

  const extracted = extractJson(response.text);

  const normalized = normalizeMeasurements(extracted);

  const validation = validateMeasurementExtraction(normalized);

  if (!validation.valid) {
    const error = new Error(validation.message);
    error.code = validation.code;
    error.field = validation.field;
    throw error;
  }

  return validation.data;
}