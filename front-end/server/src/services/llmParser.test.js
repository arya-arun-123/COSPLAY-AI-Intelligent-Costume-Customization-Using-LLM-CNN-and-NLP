import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCustomizationWithRules, parseCustomizationPrompt } from './llmParserService.js';
import { validateParsedCustomization } from '../validators/customizationValidation.js';

test('Rule-based parser extracts tshirt with color, fit, style and artwork', () => {
  const prompt = 'Create a black oversized cyberpunk t-shirt with silver dragon embroidery on the chest.';
  const result = extractCustomizationWithRules(prompt);

  assert.equal(result.garmentType, 'TSHIRT');
  assert.equal(result.color, 'black');
  assert.equal(result.fit, 'oversized');
  assert.equal(result.style, 'cyberpunk');
  assert.equal(result.placement, 'chest');
  assert.equal(typeof result.design, 'string');

  const validation = validateParsedCustomization(result);
  assert.equal(validation.valid, true);
  assert.equal(validation.code, 'VALID_LLM_OUTPUT');
});

test('Rule-based parser extracts hoodie and respects garment hint', () => {
  const prompt = 'A vintage navy loose hoodie with minimalist logo on the back';
  const result = extractCustomizationWithRules(prompt, 'HOODIE');

  assert.equal(result.garmentType, 'HOODIE');
  assert.equal(result.color, 'navy');
  assert.equal(result.fit, 'loose');
  assert.equal(result.style, 'vintage');
  assert.equal(result.placement, 'back');

  const validation = validateParsedCustomization(result);
  assert.equal(validation.valid, true);
});

test('Rule-based parser extracts jeans with slim fit', () => {
  const prompt = 'Dark blue slim jeans with distressed knee patches';
  const result = extractCustomizationWithRules(prompt);

  assert.equal(result.garmentType, 'JEANS');
  assert.equal(result.color, 'blue');
  assert.equal(result.fit, 'slim');
  assert.equal(result.placement, 'knee');

  const validation = validateParsedCustomization(result);
  assert.equal(validation.valid, true);
});

test('parseCustomizationPrompt produces valid parsed schema conforming to COS-46', async () => {
  const prompt = 'Design a red anime streetwear shirt with gold foil print';
  const result = await parseCustomizationPrompt({ prompt, garmentType: 'SHIRT' });

  assert.equal(result.garmentType, 'SHIRT');
  assert.equal(result.creativePrompt, prompt);
  assert.ok(result.color);
  assert.ok(result.fit);
  assert.ok(result.style);
  assert.ok(result.design);

  const validation = validateParsedCustomization(result);
  assert.equal(validation.valid, true);
  assert.equal(validation.code, 'VALID_LLM_OUTPUT');
});
