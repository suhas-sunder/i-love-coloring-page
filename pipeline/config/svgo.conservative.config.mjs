// Conservative SVG optimization for coloring-page line art.
// The goal is safe metadata cleanup, not aggressive geometry rewriting.
export const disabledRiskyPlugins = {
  removeViewBox: false,
  removeDimensions: false,
  cleanupIds: false,
  mergePaths: false,
  convertPathData: false,
  removeUnknownsAndDefaults: false,
  removeUselessStrokeAndFill: false,
  convertStyleToAttrs: false,
  inlineStyles: false,
  minifyStyles: false,
};

export default {
  multipass: false,
  js2svg: {
    pretty: false,
    indent: 0,
  },
  plugins: [
    "removeMetadata",
    "removeDesc",
    {
      name: "removeComments",
      params: {
        preservePatterns: false,
      },
    },
    {
      name: "cleanupNumericValues",
      params: {
        floatPrecision: 3,
      },
    },

    // Keep scaling behavior stable for browser rendering and canvas export.
    { name: "removeViewBox", active: false },
    { name: "removeDimensions", active: false },

    // IDs may be useful for future SVG coloring/editing workflows.
    { name: "cleanupIds", active: false },

    // Merging paths can make future coloring/editing harder and may alter line art.
    { name: "mergePaths", active: false },

    // Aggressive path data conversion can damage fine line-art detail.
    { name: "convertPathData", active: false },

    // Preserve style, stroke, fill, and unknown attributes that may affect rendering.
    { name: "removeUnknownsAndDefaults", active: false },
    { name: "removeUselessStrokeAndFill", active: false },
    { name: "convertStyleToAttrs", active: false },
    { name: "inlineStyles", active: false },
    { name: "minifyStyles", active: false },
  ],
};
