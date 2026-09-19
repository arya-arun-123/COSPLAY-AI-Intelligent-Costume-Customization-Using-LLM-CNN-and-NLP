
/**
 * Calculate final measurement based on alteration.
 * The backend performs all calculations.
 */

export const calculateFinalMeasurement = (
  baseValue,
  alterationType,
  adjustment
) => {
  // Validate input
  if (adjustment < 0) {
    throw new Error("Adjustment cannot be negative");
  }

  if (adjustment > 20) {
    throw new Error("Adjustment cannot exceed 20 inches");
  }

  let finalValue;

  if (alterationType === "INCREASE") {
    finalValue = baseValue + adjustment;
  } else if (alterationType === "DECREASE") {
    finalValue = baseValue - adjustment;
  } else {
    throw new Error("Invalid alteration type");
  }

  // Final measurement must be positive
  if (finalValue <= 0) {
    throw new Error("Final measurement must be greater than zero");
  }

  return finalValue;
};