/**
 * Cubyntra - Client-Side Machine Learning Inference Engine
 * Necookie Labs (c) 2026
 *
 * Runs ultrafast, zero-dependency forward inference on the trained neural network
 * combined with statistical skin rejection and grid seam invariants.
 */

import { featuresToVector } from './featureExtractor';
import { TRAINED_CUBE_DETECTOR_MODEL } from './trainedWeights';
import { CubeDetectionResult, CubeMLFeatures, TrainedModelParameters } from './types';

function relu(x: number): number {
  return Math.max(0, x);
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exp = arr.map((x) => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((x) => (sum > 0 ? x / sum : 0));
}

/**
 * Normalizes an 18-dim feature vector using training set mean and standard deviation.
 */
function normalizeFeatures(vector: number[], mean: number[], std: number[]): number[] {
  return vector.map((val, idx) => (val - mean[idx]) / (std[idx] || 1e-6));
}

/**
 * Runs forward inference through the 3-layer neural network (18 -> 32 -> 16 -> 2).
 */
export function runNeuralNetworkInference(
  vector: number[],
  model: TrainedModelParameters = TRAINED_CUBE_DETECTOR_MODEL
): [number, number] {
  const x = normalizeFeatures(vector, model.featureMean, model.featureStd);

  // Layer 1: 18 -> 32
  const a1 = model.layer1.weights.map((row, r) =>
    relu(row.reduce((acc, w, c) => acc + w * x[c], model.layer1.biases[r]))
  );

  // Layer 2: 32 -> 16
  const a2 = model.layer2.weights.map((row, r) =>
    relu(row.reduce((acc, w, c) => acc + w * a1[c], model.layer2.biases[r]))
  );

  // Layer 3: 16 -> 2 (Logits -> Softmax)
  const z3 = model.layer3.weights.map((row, r) =>
    row.reduce((acc, w, c) => acc + w * a2[c], model.layer3.biases[r])
  );

  const probs = softmax(z3);
  // [P(non-cube / face), P(cube)]
  return [probs[0], probs[1]];
}

/**
 * Evaluates whether an ROI contains a genuine Rubik's Cube vs a Human Face or Background.
 * Combines neural network probability with defense-in-depth domain heuristics.
 */
export function evaluateCubePresence(
  features: CubeMLFeatures,
  model: TrainedModelParameters = TRAINED_CUBE_DETECTOR_MODEL
): CubeDetectionResult {
  const vector = featuresToVector(features);
  const [probNonCube, probCube] = runNeuralNetworkInference(vector, model);

  // Defense-in-depth hard rule filters:
  // 1. Hardware / Browser Native Face Detection
  if (features.faceDetectorSignal >= 0.70) {
    return {
      isCube: false,
      cubeConfidence: 0.02,
      faceConfidence: 0.98,
      classification: 'face',
      reason: 'Human face detected in camera viewport',
      features,
    };
  }

  // 2. High Skin Chrominance Concentration (Face / Hand / Forehead)
  if (features.skinFraction > 0.40 || features.skinLikelihoodCenter > 0.55) {
    const faceProb = Math.max(probNonCube, features.skinFraction);
    return {
      isCube: false,
      cubeConfidence: Math.round((1 - faceProb) * 100) / 100,
      faceConfidence: Math.round(faceProb * 100) / 100,
      classification: 'face',
      reason: 'Human skin tones detected. Please align Rubik\'s Cube inside reticle.',
      features,
    };
  }

  // 3. Background scene (lack of cube colors or excessive desaturation)
  if (features.nonCubeColorPenalty > 0.55 && features.meanSaturation < 0.30) {
    return {
      isCube: false,
      cubeConfidence: Math.round(probCube * 100) / 100,
      faceConfidence: Math.round(probNonCube * 100) / 100,
      classification: 'background',
      reason: 'No Rubik\'s Cube detected. Place cube in reticle.',
      features,
    };
  }

  // 4. Missing internal grid boundaries (Rubik's cube has black plastic seams between stickers)
  if (features.gridSeamContrast < 0.12 && features.intraCellVarianceMean > 0.40) {
    return {
      isCube: false,
      cubeConfidence: 0.15,
      faceConfidence: 0.85,
      classification: 'face',
      reason: 'No 3x3 puzzle grid structure detected.',
      features,
    };
  }

  // 5. Neural Network Final Classification
  const isCube = probCube >= 0.65 && features.skinFraction < 0.25;
  const classification = isCube
    ? 'cube'
    : features.skinFraction > 0.20
    ? 'face'
    : 'background';

  const reason = isCube
    ? 'Rubik\'s Cube verified by ML model'
    : classification === 'face'
    ? 'Human face or skin detected. Please hold cube still.'
    : 'Align Rubik\'s Cube within reticle';

  return {
    isCube,
    cubeConfidence: Math.round(probCube * 100) / 100,
    faceConfidence: Math.round(probNonCube * 100) / 100,
    classification,
    reason,
    features,
  };
}
