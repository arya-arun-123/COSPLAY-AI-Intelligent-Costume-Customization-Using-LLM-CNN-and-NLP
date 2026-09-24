import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not configured');
}

const ai = new GoogleGenAI({
  apiKey,
});

const EXPLANATION_PROMPT = `
You are explaining a clothing size recommendation.

The recommended size has already been calculated by a deterministic size engine.

IMPORTANT RULES:

1. Do NOT calculate a clothing size.
2. Do NOT change the recommended size.
3. Do NOT invent brand sizing information.
4. Do NOT invent measurements.
5. Use ONLY the supplied:
   - user measurements
   - fit preference
   - retrieved RAG context
   - size engine result
6. If the retrieved RAG context is insufficient, explicitly say that
   the available sizing evidence is insufficient.
7. Keep the explanation concise and factual.
8. Return JSON only.

The recommendedSize MUST exactly match the size engine result.

Return exactly:

{
  "recommendedSize": "...",
  "explanation": "..."
}
`;

function extractJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Gemini returned empty explanation output');
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
      'Gemini returned invalid JSON for recommendation explanation'
    );
  }
}

function validateExplanationResult(result, expectedSize) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(
      'Recommendation explanation must be a JSON object'
    );
  }

  if (
    typeof result.recommendedSize !== 'string' ||
    !result.recommendedSize.trim()
  ) {
    throw new Error(
      'Recommendation explanation returned an invalid recommended size'
    );
  }

  if (result.recommendedSize !== expectedSize) {
    throw new Error(
      'LLM changed the size engine recommendation'
    );
  }

  if (
    typeof result.explanation !== 'string' ||
    !result.explanation.trim()
  ) {
    throw new Error(
      'Recommendation explanation is empty'
    );
  }

  return {
    recommendedSize: expectedSize,
    explanation: result.explanation.trim(),
  };
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

export async function generateRecommendationExplanation({
  measurements,
  fit,
  ragContext,
  sizeEngineResult,
}) {
  if (
    !sizeEngineResult ||
    typeof sizeEngineResult !== 'object'
  ) {
    throw new Error('Size engine result is required');
  }

  const expectedSize = sizeEngineResult.recommendedSize;

  if (
    typeof expectedSize !== 'string' ||
    !expectedSize.trim()
  ) {
    throw new Error(
      'Size engine result must contain recommendedSize'
    );
  }

  if (
    !ragContext ||
    (typeof ragContext !== 'string' &&
      !Array.isArray(ragContext))
  ) {
    throw new Error('RAG context is required');
  }

  const response = await generateWithRetry({
    model: 'gemini-3.6-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${EXPLANATION_PROMPT}

USER MEASUREMENTS:
${JSON.stringify(measurements ?? {}, null, 2)}

FIT PREFERENCE:
${fit ?? 'Not specified'}

RETRIEVED RAG CONTEXT:
${JSON.stringify(ragContext, null, 2)}

SIZE ENGINE RESULT:
${JSON.stringify(sizeEngineResult, null, 2)}
`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
    },
  });

  const result = extractJson(response.text);

  return validateExplanationResult(
    result,
    expectedSize
  );
}
