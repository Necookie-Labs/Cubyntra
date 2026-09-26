/**
 * Cubyntra - Autonomous Machine Learning Model Trainer for Cube vs Face Detector
 * Necookie Labs (c) 2026
 *
 * Trains a Multi-Layer Perceptron (MLP) neural network to discriminate between:
 *  - Class 1: Valid Rubik's Cube faces (solid colors, scrambles, high saturation, grid seams)
 *  - Class 0: Human faces, skin, hands, and arbitrary background scenes
 *
 * Automatically outputs normalized parameters and trained weights to src/vision/ml/trainedWeights.ts
 */

import fs from 'fs';
import path from 'path';
import { TrainedModelParameters } from '../src/vision/ml/types';

interface DatasetSample {
  features: number[];
  label: number; // 1 = Cube, 0 = Face / Non-cube
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(val: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Synthesizes a realistic feature vector for a Rubik's Cube face.
 */
function generateCubeSample(): number[] {
  const isSolid = Math.random() < 0.35;
  const isWhiteFace = Math.random() < 0.18;

  const skinFraction = clamp(randRange(0.0, 0.08));
  const meanSaturation = isWhiteFace ? randRange(0.02, 0.15) : randRange(0.68, 0.95);
  const minSaturation = isWhiteFace ? randRange(0.01, 0.10) : randRange(0.55, 0.90);
  const intraCellVarianceMean = randRange(0.04, 0.18);
  const intraCellVarianceMax = intraCellVarianceMean + randRange(0.02, 0.12);
  const gridSeamContrast = randRange(0.45, 0.90);
  const meanColorConfidence = randRange(0.75, 0.98);
  const minColorConfidence = randRange(0.60, 0.92);
  const nonCubeColorPenalty = clamp(randRange(0.0, 0.11));
  const cubePaletteDiversity = isSolid ? 0.16 : randRange(0.33, 0.85);
  const luminanceUniformity = randRange(0.65, 0.95);
  const edgeGradientHorizontal = randRange(0.15, 0.65);
  const edgeGradientVertical = randRange(0.15, 0.65);
  const skinLikelihoodCenter = clamp(randRange(0.0, 0.05));
  const skinLikelihoodCorners = clamp(randRange(0.0, 0.05));
  const skinLikelihoodEdges = clamp(randRange(0.0, 0.05));
  const chromaPurity = isWhiteFace ? randRange(0.70, 0.95) : randRange(0.65, 0.98);
  const faceDetectorSignal = 0.0;

  return [
    skinFraction,
    meanSaturation,
    minSaturation,
    intraCellVarianceMean,
    intraCellVarianceMax,
    gridSeamContrast,
    meanColorConfidence,
    minColorConfidence,
    nonCubeColorPenalty,
    cubePaletteDiversity,
    luminanceUniformity,
    edgeGradientHorizontal,
    edgeGradientVertical,
    skinLikelihoodCenter,
    skinLikelihoodCorners,
    skinLikelihoodEdges,
    chromaPurity,
    faceDetectorSignal,
  ];
}

/**
 * Synthesizes a realistic feature vector for a Human Face or Skin region.
 */
function generateFaceSample(): number[] {
  const isDirectFace = Math.random() < 0.70;

  const skinFraction = isDirectFace ? randRange(0.55, 0.98) : randRange(0.35, 0.65);
  // Human skin has moderate saturation (0.22 - 0.50)
  const meanSaturation = randRange(0.24, 0.48);
  const minSaturation = randRange(0.12, 0.35);
  // Human faces have high intra-cell variance (eyes, nose, mouth, beard, pores)
  const intraCellVarianceMean = randRange(0.28, 0.70);
  const intraCellVarianceMax = intraCellVarianceMean + randRange(0.10, 0.25);
  // Faces lack straight 1/3 and 2/3 black plastic seams
  const gridSeamContrast = randRange(0.02, 0.22);
  // Matches against primary cube colors are mediocre
  const meanColorConfidence = randRange(0.25, 0.58);
  const minColorConfidence = randRange(0.10, 0.40);
  const nonCubeColorPenalty = randRange(0.45, 0.95);
  const cubePaletteDiversity = randRange(0.16, 0.33); // Mostly misclassified orange/yellow/red
  const luminanceUniformity = randRange(0.25, 0.65);
  const edgeGradientHorizontal = randRange(0.05, 0.30);
  const edgeGradientVertical = randRange(0.05, 0.30);
  const skinLikelihoodCenter = randRange(0.65, 0.98);
  const skinLikelihoodCorners = randRange(0.45, 0.90);
  const skinLikelihoodEdges = randRange(0.50, 0.92);
  const chromaPurity = randRange(0.18, 0.42);
  const faceDetectorSignal = isDirectFace && Math.random() < 0.75 ? 1.0 : 0.0;

  return [
    skinFraction,
    meanSaturation,
    minSaturation,
    intraCellVarianceMean,
    intraCellVarianceMax,
    gridSeamContrast,
    meanColorConfidence,
    minColorConfidence,
    nonCubeColorPenalty,
    cubePaletteDiversity,
    luminanceUniformity,
    edgeGradientHorizontal,
    edgeGradientVertical,
    skinLikelihoodCenter,
    skinLikelihoodCorners,
    skinLikelihoodEdges,
    chromaPurity,
    faceDetectorSignal,
  ];
}

/**
 * Synthesizes a realistic feature vector for Arbitrary Backgrounds (Walls, Furniture, Clothing).
 */
function generateBackgroundSample(): number[] {
  const skinFraction = clamp(randRange(0.0, 0.15));
  const meanSaturation = randRange(0.05, 0.35);
  const minSaturation = randRange(0.01, 0.20);
  const intraCellVarianceMean = randRange(0.05, 0.40);
  const intraCellVarianceMax = intraCellVarianceMean + randRange(0.05, 0.30);
  const gridSeamContrast = randRange(0.0, 0.20);
  const meanColorConfidence = randRange(0.15, 0.52);
  const minColorConfidence = randRange(0.05, 0.35);
  const nonCubeColorPenalty = randRange(0.55, 1.0);
  const cubePaletteDiversity = randRange(0.16, 0.50);
  const luminanceUniformity = randRange(0.20, 0.75);
  const edgeGradientHorizontal = randRange(0.02, 0.25);
  const edgeGradientVertical = randRange(0.02, 0.25);
  const skinLikelihoodCenter = clamp(randRange(0.0, 0.12));
  const skinLikelihoodCorners = clamp(randRange(0.0, 0.12));
  const skinLikelihoodEdges = clamp(randRange(0.0, 0.12));
  const chromaPurity = randRange(0.05, 0.32);
  const faceDetectorSignal = 0.0;

  return [
    skinFraction,
    meanSaturation,
    minSaturation,
    intraCellVarianceMean,
    intraCellVarianceMax,
    gridSeamContrast,
    meanColorConfidence,
    minColorConfidence,
    nonCubeColorPenalty,
    cubePaletteDiversity,
    luminanceUniformity,
    edgeGradientHorizontal,
    edgeGradientVertical,
    skinLikelihoodCenter,
    skinLikelihoodCorners,
    skinLikelihoodEdges,
    chromaPurity,
    faceDetectorSignal,
  ];
}

// ----------------- Neural Network Training Implementation -----------------

function relu(x: number): number {
  return Math.max(0, x);
}

function reluGrad(x: number): number {
  return x > 0 ? 1 : 0;
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exp = arr.map((x) => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((x) => x / sum);
}

function randomMatrix(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2.0 / cols); // He initialization
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale)
  );
}

function randomVector(len: number): number[] {
  return Array.from({ length: len }, () => 0.0);
}

async function trainModel() {
  console.log('=== Cubyntra Machine Learning Model Training: Cube vs Face/Background ===');
  console.log('Ingesting empirical features from Kaggle dataset (bjoernjostein/rubix-cube)...');

  const datasetFeaturesPath = path.join(process.cwd(), 'src/vision/ml/datasetFeatures.json');
  let empiricalFeatures: number[][] = [];
  if (fs.existsSync(datasetFeaturesPath)) {
    try {
      empiricalFeatures = JSON.parse(fs.readFileSync(datasetFeaturesPath, 'utf8'));
      console.log(`Loaded ${empiricalFeatures.length} empirical feature vectors from Kaggle dataset.`);
    } catch {
      console.warn('Failed parsing datasetFeatures.json, using generative fallback.');
    }
  }

  // 1. Generate Training & Validation Data
  const trainCount = 6000;
  const testCount = 1500;
  const allSamples: DatasetSample[] = [];

  const halfTotal = (trainCount + testCount) / 2;
  for (let i = 0; i < halfTotal; i++) {
    // 50% Positive (Cubes from Kaggle dataset + augmentation)
    if (empiricalFeatures.length > 0 && i < empiricalFeatures.length * 6) {
      const baseFeat = empiricalFeatures[i % empiricalFeatures.length];
      // Apply slight lighting jitter augmentation
      const augmented = baseFeat.map((val, idx) => {
        if (idx === 17) return 0.0; // faceDetectorSignal always 0 for cube
        const noise = (Math.random() * 2 - 1) * 0.04;
        return clamp(val + noise, 0, 1);
      });
      allSamples.push({ features: augmented, label: 1 });
    } else {
      allSamples.push({ features: generateCubeSample(), label: 1 });
    }

    // 50% Negative (25% Faces, 25% Backgrounds)
    if (Math.random() < 0.6) {
      allSamples.push({ features: generateFaceSample(), label: 0 });
    } else {
      allSamples.push({ features: generateBackgroundSample(), label: 0 });
    }
  }

  // Shuffle
  for (let i = allSamples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allSamples[i], allSamples[j]] = [allSamples[j], allSamples[i]];
  }

  const trainData = allSamples.slice(0, trainCount);
  const testData = allSamples.slice(trainCount);

  // 2. Feature Normalization (Z-score)
  const numFeatures = 18;
  const featureMean = Array.from({ length: numFeatures }, () => 0);
  const featureStd = Array.from({ length: numFeatures }, () => 0);

  for (const s of trainData) {
    for (let f = 0; f < numFeatures; f++) {
      featureMean[f] += s.features[f];
    }
  }
  for (let f = 0; f < numFeatures; f++) {
    featureMean[f] /= trainData.length;
  }

  for (const s of trainData) {
    for (let f = 0; f < numFeatures; f++) {
      const diff = s.features[f] - featureMean[f];
      featureStd[f] += diff * diff;
    }
  }
  for (let f = 0; f < numFeatures; f++) {
    featureStd[f] = Math.sqrt(featureStd[f] / trainData.length) || 1e-6;
  }

  function normalize(features: number[]): number[] {
    return features.map((val, idx) => (val - featureMean[idx]) / featureStd[idx]);
  }

  // 3. Initialize Model Architecture: 18 -> 32 -> 16 -> 2
  const W1 = randomMatrix(32, 18);
  const b1 = randomVector(32);
  const W2 = randomMatrix(16, 32);
  const b2 = randomVector(16);
  const W3 = randomMatrix(2, 16);
  const b3 = randomVector(2);

  // Adam Optimizer state (MUST start at 0)
  const mW1 = Array.from({ length: 32 }, () => Array(18).fill(0));
  const vW1 = Array.from({ length: 32 }, () => Array(18).fill(0));
  const mb1 = Array(32).fill(0);
  const vb1 = Array(32).fill(0);

  const mW2 = Array.from({ length: 16 }, () => Array(32).fill(0));
  const vW2 = Array.from({ length: 16 }, () => Array(32).fill(0));
  const mb2 = Array(16).fill(0);
  const vb2 = Array(16).fill(0);

  const mW3 = Array.from({ length: 2 }, () => Array(16).fill(0));
  const vW3 = Array.from({ length: 2 }, () => Array(16).fill(0));
  const mb3 = Array(2).fill(0);
  const vb3 = Array(2).fill(0);

  let lr = 0.003;
  const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;
  let timestep = 0;

  const epochs = 50;
  const batchSize = 64;

  console.log(`Training dataset size: ${trainData.length}, Test size: ${testData.length}`);

  for (let epoch = 1; epoch <= epochs; epoch++) {
    let epochLoss = 0;
    let correctCount = 0;

    for (let i = 0; i < trainData.length; i += batchSize) {
      const batch = trainData.slice(i, i + batchSize);
      timestep++;

      // Gradient accumulators
      const dW1 = Array.from({ length: 32 }, () => Array(18).fill(0));
      const db1 = Array(32).fill(0);
      const dW2 = Array.from({ length: 16 }, () => Array(32).fill(0));
      const db2 = Array(16).fill(0);
      const dW3 = Array.from({ length: 2 }, () => Array(16).fill(0));
      const db3 = Array(2).fill(0);

      for (const sample of batch) {
        const x = normalize(sample.features);
        const y = sample.label; // 0 or 1

        // Forward Pass
        // Layer 1
        const z1 = Array(32).fill(0);
        const a1 = Array(32).fill(0);
        for (let r = 0; r < 32; r++) {
          let sum = b1[r];
          for (let c = 0; c < 18; c++) sum += W1[r][c] * x[c];
          z1[r] = sum;
          a1[r] = relu(sum);
        }

        // Layer 2
        const z2 = Array(16).fill(0);
        const a2 = Array(16).fill(0);
        for (let r = 0; r < 16; r++) {
          let sum = b2[r];
          for (let c = 0; c < 32; c++) sum += W2[r][c] * a1[c];
          z2[r] = sum;
          a2[r] = relu(sum);
        }

        // Layer 3 (Output logits & softmax)
        const z3 = Array(2).fill(0);
        for (let r = 0; r < 2; r++) {
          let sum = b3[r];
          for (let c = 0; c < 16; c++) sum += W3[r][c] * a2[c];
          z3[r] = sum;
        }
        const probs = softmax(z3); // [P(non-cube), P(cube)]

        const pred = probs[1] >= 0.5 ? 1 : 0;
        if (pred === y) correctCount++;

        // Cross-entropy loss: -log(probs[y])
        epochLoss += -Math.log(Math.max(1e-12, probs[y]));

        // Backward Pass
        const dz3 = [probs[0] - (y === 0 ? 1 : 0), probs[1] - (y === 1 ? 1 : 0)];

        for (let r = 0; r < 2; r++) {
          db3[r] += dz3[r];
          for (let c = 0; c < 16; c++) {
            dW3[r][c] += dz3[r] * a2[c];
          }
        }

        const da2 = Array(32).fill(0);
        for (let c = 0; c < 16; c++) {
          let sum = 0;
          for (let r = 0; r < 2; r++) sum += dz3[r] * W3[r][c];
          da2[c] = sum;
        }

        const dz2 = Array(16).fill(0);
        for (let r = 0; r < 16; r++) {
          dz2[r] = da2[r] * reluGrad(z2[r]);
          db2[r] += dz2[r];
          for (let c = 0; c < 32; c++) {
            dW2[r][c] += dz2[r] * a1[c];
          }
        }

        const da1 = Array(32).fill(0);
        for (let c = 0; c < 32; c++) {
          let sum = 0;
          for (let r = 0; r < 16; r++) sum += dz2[r] * W2[r][c];
          da1[c] = sum;
        }

        for (let r = 0; r < 32; r++) {
          const dz1 = da1[r] * reluGrad(z1[r]);
          db1[r] += dz1;
          for (let c = 0; c < 18; c++) {
            dW1[r][c] += dz1 * x[c];
          }
        }
      }

      // Adam Step
      const N = batch.length;
      function adamUpdate(param: number[][], grad: number[][], m: number[][], v: number[][]) {
        for (let r = 0; r < param.length; r++) {
          for (let c = 0; c < param[r].length; c++) {
            const g = grad[r][c] / N;
            m[r][c] = beta1 * m[r][c] + (1 - beta1) * g;
            v[r][c] = beta2 * v[r][c] + (1 - beta2) * g * g;
            const mHat = m[r][c] / (1 - Math.pow(beta1, timestep));
            const vHat = v[r][c] / (1 - Math.pow(beta2, timestep));
            param[r][c] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
          }
        }
      }

      function adamUpdateVec(param: number[], grad: number[], m: number[], v: number[]) {
        for (let r = 0; r < param.length; r++) {
          const g = grad[r] / N;
          m[r] = beta1 * m[r] + (1 - beta1) * g;
          v[r] = beta2 * v[r] + (1 - beta2) * g * g;
          const mHat = m[r] / (1 - Math.pow(beta1, timestep));
          const vHat = v[r] / (1 - Math.pow(beta2, timestep));
          param[r] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
        }
      }

      adamUpdate(W1, dW1, mW1, vW1);
      adamUpdateVec(b1, db1, mb1, vb1);
      adamUpdate(W2, dW2, mW2, vW2);
      adamUpdateVec(b2, db2, mb2, vb2);
      adamUpdate(W3, dW3, mW3, vW3);
      adamUpdateVec(b3, db3, mb3, vb3);
    }

    if (epoch % 10 === 0 || epoch === epochs) {
      const trainAcc = (correctCount / trainData.length) * 100;
      console.log(`Epoch ${epoch}/${epochs} - Loss: ${(epochLoss / trainData.length).toFixed(4)} - Train Acc: ${trainAcc.toFixed(2)}%`);
    }

    lr *= 0.96; // Learning rate decay
  }

  // 4. Evaluate on Test Dataset
  let testCorrect = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const sample of testData) {
    const x = normalize(sample.features);
    // Forward inference
    const a1 = W1.map((row, r) => relu(row.reduce((acc, w, c) => acc + w * x[c], b1[r])));
    const a2 = W2.map((row, r) => relu(row.reduce((acc, w, c) => acc + w * a1[c], b2[r])));
    const z3 = W3.map((row, r) => row.reduce((acc, w, c) => acc + w * a2[c], b3[r]));
    const probs = softmax(z3);

    const pred = probs[1] >= 0.5 ? 1 : 0;
    if (pred === sample.label) {
      testCorrect++;
    } else if (pred === 1 && sample.label === 0) {
      falsePositives++;
    } else {
      falseNegatives++;
    }
  }

  const testAcc = (testCorrect / testData.length) * 100;
  console.log(`--- Test Results: Accuracy: ${testAcc.toFixed(2)}% (${testCorrect}/${testData.length}) ---`);
  console.log(`False Positives (Face accepted as cube): ${falsePositives}`);
  console.log(`False Negatives (Cube rejected as face): ${falseNegatives}`);

  // 5. Serialize and write trained model to src/vision/ml/trainedWeights.ts
  const trainedParams: TrainedModelParameters = {
    layer1: { weights: W1, biases: b1 },
    layer2: { weights: W2, biases: b2 },
    layer3: { weights: W3, biases: b3 },
    featureMean,
    featureStd,
  };

  const fileContent = `/**
 * Cubyntra - Trained Machine Learning Model Parameters
 * Generated autonomously by scripts/train-cube-detector.ts
 * Necookie Labs (c) 2026
 *
 * Test Accuracy: ${testAcc.toFixed(2)}%
 */

import { TrainedModelParameters } from './types';

export const TRAINED_CUBE_DETECTOR_MODEL: TrainedModelParameters = ${JSON.stringify(
    trainedParams,
    null,
    2
  )};
`;

  const outputPath = path.join(process.cwd(), 'src/vision/ml/trainedWeights.ts');
  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`[SUCCESS] Trained model written to ${outputPath}`);
}

trainModel().catch((err) => {
  console.error('Model training failed:', err);
  process.exit(1);
});
