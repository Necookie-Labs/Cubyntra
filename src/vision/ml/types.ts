/**
 * Cubyntra - Machine Learning Cube & Face Detection Types
 * Necookie Labs (c) 2026
 */

export interface CubeMLFeatures {
  skinFraction: number;            // [0, 1] - Proportion of sampled pixels matching human skin chrominance
  meanSaturation: number;          // [0, 1] - Average HSV saturation across non-white cells
  minSaturation: number;           // [0, 1] - Minimum saturation among colored cells
  intraCellVarianceMean: number;   // [0, 1] - Normalized color variance within sticker patches
  intraCellVarianceMax: number;    // [0, 1] - Peak color variance within any single patch
  gridSeamContrast: number;        // [0, 1] - Intensity/edge drop along 1/3 and 2/3 internal grid seams
  meanColorConfidence: number;     // [0, 1] - Average Delta-E confidence against canonical cube plastics
  minColorConfidence: number;      // [0, 1] - Lowest patch classification confidence
  nonCubeColorPenalty: number;     // [0, 1] - Fraction of patches failing valid cube plastic criteria
  cubePaletteDiversity: number;    // [0, 1] - Normalized number of distinct cube colors in the 3x3 grid (1-6)
  luminanceUniformity: number;     // [0, 1] - Ratio of min to max cell luminance
  edgeGradientHorizontal: number;  // [0, 1] - Sobel horizontal boundary score
  edgeGradientVertical: number;    // [0, 1] - Sobel vertical boundary score
  skinLikelihoodCenter: number;    // [0, 1] - Skin probability of the central patch
  skinLikelihoodCorners: number;   // [0, 1] - Average skin probability of the 4 corner patches
  skinLikelihoodEdges: number;     // [0, 1] - Average skin probability of the 4 edge patches
  chromaPurity: number;            // [0, 1] - Distance from desaturated skin/earth tones
  faceDetectorSignal: number;      // [0, 1] - Hardware/API face detection activation (1.0 = face detected)
}

export type CubeClassificationType = 'cube' | 'face' | 'background' | 'unclear';

export interface CubeDetectionResult {
  isCube: boolean;
  cubeConfidence: number;          // [0, 1] - Probability that ROI contains a valid Rubik's Cube
  faceConfidence: number;          // [0, 1] - Probability that ROI contains a human face or skin
  classification: CubeClassificationType;
  reason: string;
  features: CubeMLFeatures;
}

export interface ModelLayerWeights {
  weights: number[][]; // [outputs][inputs]
  biases: number[];    // [outputs]
}

export interface TrainedModelParameters {
  layer1: ModelLayerWeights; // 18 -> 32
  layer2: ModelLayerWeights; // 32 -> 16
  layer3: ModelLayerWeights; // 16 -> 2
  featureMean: number[];     // Length 18
  featureStd: number[];      // Length 18
}
