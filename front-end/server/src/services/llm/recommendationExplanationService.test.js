import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateRecommendationExplanation,
} from './recommendationExplanationService.js';

test('generates a grounded explanation without changing the size engine result', async () => {
  const result = await generateRecommendationExplanation({
    measurements: {
      height: 178,
      chest: 96,
      waist: null,
      hip: null,
    },

    fit: 'Loose',

    ragContext: [
      {
        brand: 'Nike',
        garment: 'Hoodie',
        documentType: 'size_guide',
        content:
          'Nike hoodie chest measurements indicate that size M is appropriate for a chest measurement around 96 cm.',
      },
    ],

    sizeEngineResult: {
      recommendedSize: 'M',
      alterations: [],
    },
  });

  assert.equal(result.recommendedSize, 'M');
  assert.ok(typeof result.explanation === 'string');
  assert.ok(result.explanation.length > 0);
});

test('rejects an invalid or missing size engine result', async () => {
  await assert.rejects(
    () =>
      generateRecommendationExplanation({
        measurements: {
          height: 178,
          chest: 96,
        },
        fit: 'Loose',
        ragContext: [
          {
            brand: 'Nike',
            garment: 'Hoodie',
            documentType: 'size_guide',
            content:
              'Nike hoodie sizing information.',
          },
        ],
        sizeEngineResult: {},
      }),
    /recommendedSize/
  );
});