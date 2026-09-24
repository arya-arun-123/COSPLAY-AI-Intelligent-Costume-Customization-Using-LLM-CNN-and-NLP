import { calculateSize } from "../src/services/sizeEngineService.js";

// =====================================================
// TOP / HOODIE SIZE DATA
// =====================================================

const hoodieSizes = {
  S: {
    chest: 36,
    waist: 30,
    shoulder: 16,
    sleeve: 24
  },

  M: {
    chest: 40,
    waist: 32,
    shoulder: 17,
    sleeve: 25
  },

  L: {
    chest: 44,
    waist: 36,
    shoulder: 18,
    sleeve: 26
  }
};

// =====================================================
// JEANS / BOTTOM SIZE DATA
// =====================================================

const jeansSizes = {
  S: {
    waist: 30,
    hip: 38,
    thigh: 22,
    inseam: 30,
    rise: 9
  },

  M: {
    waist: 32,
    hip: 40,
    thigh: 23,
    inseam: 32,
    rise: 10
  },

  L: {
    waist: 36,
    hip: 44,
    thigh: 25,
    inseam: 34,
    rise: 11
  }
};

// =====================================================
// TEST CASES
// =====================================================

const testCases = [

  // ---------------------------------------------------
  // TOP TESTS
  // ---------------------------------------------------

  {
    name: "Exact M Hoodie match",
    garment: "Hoodie",

    measurements: {
      chest: 40,
      waist: 32,
      shoulder: 17,
      sleeve: 25
    },

    sizes: hoodieSizes
  },

  {
    name: "Between Hoodie sizes",
    garment: "Hoodie",

    measurements: {
      chest: 39,
      waist: 31,
      shoulder: 17,
      sleeve: 25
    },

    sizes: hoodieSizes
  },

  {
    name: "Significant sleeve difference",
    garment: "Hoodie",

    measurements: {
      chest: 40,
      waist: 32,
      shoulder: 17,
      sleeve: 34
    },

    sizes: hoodieSizes
  },

  // ---------------------------------------------------
  // BOTTOM TESTS
  // ---------------------------------------------------

  {
    name: "Exact M Jeans match",
    garment: "Jeans",

    measurements: {
      waist: 32,
      hip: 40,
      thigh: 23,
      inseam: 32,
      rise: 10
    },

    sizes: jeansSizes
  },

  {
    name: "Between Jeans sizes",
    garment: "Jeans",

    measurements: {
      waist: 33,
      hip: 41,
      thigh: 24,
      inseam: 33,
      rise: 10
    },

    sizes: jeansSizes
  },

  {
    name: "Significant inseam difference",
    garment: "Jeans",

    measurements: {
      waist: 32,
      hip: 40,
      thigh: 23,
      inseam: 42,
      rise: 10
    },

    sizes: jeansSizes
  }
];

// =====================================================
// RUN TESTS
// =====================================================

for (const testCase of testCases) {

  const result = calculateSize(
    testCase.measurements,
    testCase.sizes,
    testCase.garment,
    "Regular"
  );

  console.log("\n=================================");
  console.log(testCase.name);
  console.log("=================================");

  console.log("Garment:", testCase.garment);

  console.log(
    "User Measurements:",
    JSON.stringify(testCase.measurements, null, 2)
  );

  console.log(
    "Recommended Size:",
    result.recommendedSize
  );

  console.log(
    "Score:",
    result.score
  );

  console.log(
    "Measurement Comparison:",
    JSON.stringify(
      result.measurementComparison,
      null,
      2
    )
  );

  console.log(
    "Alterations:",
    JSON.stringify(
      result.alterations,
      null,
      2
    )
  );
}