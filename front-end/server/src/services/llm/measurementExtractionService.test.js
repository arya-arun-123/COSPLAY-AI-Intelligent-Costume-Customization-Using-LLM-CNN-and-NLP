import test from 'node:test';
import assert from 'node:assert/strict';

import { extractMeasurements } from './measurementExtractionService.js';

test('extracts metric measurements and fit preference', async () => {
  const result = await extractMeasurements(
    "I'm 178 cm tall, chest is around 96 centimeters and I prefer loose."
  );

  assert.equal(result.height, 178);
  assert.equal(result.chest, 96);
  assert.equal(result.fit, 'Loose');

  assert.equal(result.waist, null);
  assert.equal(result.hip, null);
});

test('converts inches to centimeters deterministically', async () => {
  const result = await extractMeasurements(
    "My chest is around 38 inches and I prefer regular fit."
  );

  assert.equal(result.fit, 'Regular');
  assert.ok(Math.abs(result.chest - 96.52) < 0.01);
});