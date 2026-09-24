const MEASUREMENT_LIMITS = {
  height: { min: 50, max: 250 },
  chest: { min: 40, max: 200 },
  waist: { min: 40, max: 200 },
  hip: { min: 40, max: 220 },
  shoulder: { min: 20, max: 80 },
  sleeve: { min: 20, max: 120 },
  inseam: { min: 20, max: 130 },
};

const ALLOWED_FITS = new Set([
  'Slim',
  'Regular',
  'Loose',
]);

const MEASUREMENT_FIELDS = [
  'height',
  'chest',
  'waist',
  'hip',
  'shoulder',
  'sleeve',
  'inseam',
];

export function validateMeasurementExtraction(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      code: 'INVALID_EXTRACTION',
      message: 'Measurement extraction must return a JSON object.',
    };
  }

  for (const field of MEASUREMENT_FIELDS) {
    const value = data[field];

    if (value === null || value === undefined) {
      continue;
    }

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      return {
        valid: false,
        code: 'INVALID_MEASUREMENT',
        message: `${field} must be a positive number or null.`,
        field,
      };
    }

    const limits = MEASUREMENT_LIMITS[field];

    if (value < limits.min || value > limits.max) {
      return {
        valid: false,
        code: 'MEASUREMENT_OUT_OF_RANGE',
        message: `${field} is outside the accepted range.`,
        field,
      };
    }
  }

  if (
    data.fit !== null &&
    data.fit !== undefined &&
    !ALLOWED_FITS.has(data.fit)
  ) {
    return {
      valid: false,
      code: 'INVALID_FIT',
      message: 'Fit must be Slim, Regular, Loose, or null.',
      field: 'fit',
    };
  }

  return {
    valid: true,
    data: {
      height: data.height ?? null,
      chest: data.chest ?? null,
      waist: data.waist ?? null,
      hip: data.hip ?? null,
      shoulder: data.shoulder ?? null,
      sleeve: data.sleeve ?? null,
      inseam: data.inseam ?? null,
      fit: data.fit ?? null,
    },
  };
}