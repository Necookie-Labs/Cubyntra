/**
 * Cubyntra - ML Feature Extractor for Rubik's Cube vs Face/Background
 * Necookie Labs (c) 2026
 */

import { ROIBounds, StickerSample, RGBColor } from '../types';
import { computeRegionSkinFraction } from './skinModel';
import { CubeMLFeatures } from './types';

/**
 * Extracts normalized 18-dimensional feature vector from an active canvas ROI and sticker samples.
 */
export function extractCubeFeatures(
  ctx: CanvasRenderingContext2D,
  roi: ROIBounds,
  samples: StickerSample[],
  faceDetectorSignal = 0.0
): CubeMLFeatures {
  const cellSize = roi.size / 3;

  // 1. Collect pixels from each cell to measure intra-cell variance and skin probability
  let totalVariance = 0;
  let maxVariance = 0;
  const cellSkinProbs: number[] = [];
  const allSampledPixels: RGBColor[] = [];
  const nonWhiteSaturations: number[] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const sample = samples[idx];

      if (sample.predictedColor !== 'white') {
        nonWhiteSaturations.push(sample.hsv.s / 100);
      }

      // Sample a 12x12 patch in the cell to compute variance
      const patchSize = Math.max(8, Math.round(cellSize * 0.35));
      const cellCenterX = roi.x + col * cellSize + cellSize / 2;
      const cellCenterY = roi.y + row * cellSize + cellSize / 2;
      const startX = Math.round(cellCenterX - patchSize / 2);
      const startY = Math.round(cellCenterY - patchSize / 2);

      const imgData = ctx.getImageData(startX, startY, patchSize, patchSize);
      const data = imgData.data;

      let sumR = 0, sumG = 0, sumB = 0;
      const cellPixels: RGBColor[] = [];

      for (let i = 0; i < data.length; i += 4) {
        const p: RGBColor = { r: data[i], g: data[i + 1], b: data[i + 2] };
        cellPixels.push(p);
        allSampledPixels.push(p);
        sumR += p.r;
        sumG += p.g;
        sumB += p.b;
      }

      const count = cellPixels.length || 1;
      const meanR = sumR / count;
      const meanG = sumG / count;
      const meanB = sumB / count;

      // Variance calculation
      let varR = 0, varG = 0, varB = 0;
      for (const p of cellPixels) {
        varR += (p.r - meanR) * (p.r - meanR);
        varG += (p.g - meanG) * (p.g - meanG);
        varB += (p.b - meanB) * (p.b - meanB);
      }
      const cellVar = Math.sqrt((varR + varG + varB) / count);
      totalVariance += cellVar;
      if (cellVar > maxVariance) {
        maxVariance = cellVar;
      }

      // Skin probability for this cell
      const skinRes = computeRegionSkinFraction(cellPixels);
      cellSkinProbs.push(skinRes.averageSkinProbability);
    }
  }

  // 2. Skin Fraction across all sampled pixels
  const { skinFraction } = computeRegionSkinFraction(allSampledPixels);

  // 3. Grid Seam Contrast (Internal black plastic dividing lines at 1/3 and 2/3)
  const seamPositionsX = [
    Math.round(roi.x + cellSize),
    Math.round(roi.x + 2 * cellSize),
  ];
  const seamPositionsY = [
    Math.round(roi.y + cellSize),
    Math.round(roi.y + 2 * cellSize),
  ];

  let seamIntensitySum = 0;
  let seamSampleCount = 0;

  // Sample vertical seams
  for (const sx of seamPositionsX) {
    const seamData = ctx.getImageData(sx - 1, roi.y + 10, 3, roi.size - 20);
    const sData = seamData.data;
    for (let i = 0; i < sData.length; i += 4) {
      seamIntensitySum += 0.299 * sData[i] + 0.587 * sData[i + 1] + 0.114 * sData[i + 2];
      seamSampleCount++;
    }
  }

  // Sample horizontal seams
  for (const sy of seamPositionsY) {
    const seamData = ctx.getImageData(roi.x + 10, sy - 1, roi.size - 20, 3);
    const sData = seamData.data;
    for (let i = 0; i < sData.length; i += 4) {
      seamIntensitySum += 0.299 * sData[i] + 0.587 * sData[i + 1] + 0.114 * sData[i + 2];
      seamSampleCount++;
    }
  }

  const avgSeamIntensity = seamSampleCount > 0 ? seamIntensitySum / seamSampleCount : 128;

  // Cell centers average intensity
  const cellCenterIntensity =
    samples.reduce((acc, s) => acc + (0.299 * s.rgb.r + 0.587 * s.rgb.g + 0.114 * s.rgb.b), 0) /
    samples.length;

  // Real cube has darker seams than stickers: (centers - seams) / (centers + 1)
  const gridSeamContrast = Math.max(
    0,
    Math.min(1.0, (cellCenterIntensity - avgSeamIntensity + 30) / 120)
  );

  // 4. Color Confidences and Non-Cube Penalties
  const confidences = samples.map((s) => s.confidence);
  const meanColorConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const minColorConfidence = Math.min(...confidences);

  let nonCubeCount = 0;
  for (const s of samples) {
    const bestScore = s.colorScores[s.predictedColor];
    if (s.isCubeColor === false || bestScore < 45 || s.confidence < 0.40) {
      nonCubeCount++;
    }
  }
  const nonCubeColorPenalty = nonCubeCount / 9;

  // 5. Palette Diversity
  const uniqueColors = new Set(samples.map((s) => s.predictedColor));
  const cubePaletteDiversity = Math.min(1.0, uniqueColors.size / 6);

  // 6. Luminance Uniformity
  const luminances = samples.map((s) => 0.299 * s.rgb.r + 0.587 * s.rgb.g + 0.114 * s.rgb.b);
  const minLum = Math.min(...luminances);
  const maxLum = Math.max(...luminances);
  const luminanceUniformity = maxLum > 0 ? minLum / maxLum : 1.0;

  // 7. Edge Gradients (Difference across boundary cells)
  const edgeGradientHorizontal = Math.min(
    1.0,
    Math.abs(luminances[0] - luminances[1]) + Math.abs(luminances[1] - luminances[2]) / 255
  );
  const edgeGradientVertical = Math.min(
    1.0,
    Math.abs(luminances[0] - luminances[3]) + Math.abs(luminances[3] - luminances[6]) / 255
  );

  // 8. Regional Skin Likelihoods
  const skinLikelihoodCenter = cellSkinProbs[4] ?? 0;
  const skinLikelihoodCorners =
    ((cellSkinProbs[0] ?? 0) +
      (cellSkinProbs[2] ?? 0) +
      (cellSkinProbs[6] ?? 0) +
      (cellSkinProbs[8] ?? 0)) / 4;
  const skinLikelihoodEdges =
    ((cellSkinProbs[1] ?? 0) +
      (cellSkinProbs[3] ?? 0) +
      (cellSkinProbs[5] ?? 0) +
      (cellSkinProbs[7] ?? 0)) / 4;

  // 9. Chroma Purity (Distance from muted flesh/beige tones)
  let chromaPurity = 0;
  if (nonWhiteSaturations.length > 0) {
    const avgSat = nonWhiteSaturations.reduce((a, b) => a + b, 0) / nonWhiteSaturations.length;
    chromaPurity = Math.min(1.0, avgSat);
  } else {
    // If all white, purity is high if luminance is high and variance low
    chromaPurity = luminanceUniformity > 0.7 ? 0.9 : 0.4;
  }

  const meanSaturation =
    nonWhiteSaturations.length > 0
      ? nonWhiteSaturations.reduce((a, b) => a + b, 0) / nonWhiteSaturations.length
      : 0.1;
  const minSaturation =
    nonWhiteSaturations.length > 0 ? Math.min(...nonWhiteSaturations) : 0.1;

  // Normalize variances to [0, 1] range (cap at 60)
  const intraCellVarianceMean = Math.min(1.0, totalVariance / 9 / 60);
  const intraCellVarianceMax = Math.min(1.0, maxVariance / 80);

  return {
    skinFraction: Math.round(skinFraction * 1000) / 1000,
    meanSaturation: Math.round(meanSaturation * 1000) / 1000,
    minSaturation: Math.round(minSaturation * 1000) / 1000,
    intraCellVarianceMean: Math.round(intraCellVarianceMean * 1000) / 1000,
    intraCellVarianceMax: Math.round(intraCellVarianceMax * 1000) / 1000,
    gridSeamContrast: Math.round(gridSeamContrast * 1000) / 1000,
    meanColorConfidence: Math.round(meanColorConfidence * 1000) / 1000,
    minColorConfidence: Math.round(minColorConfidence * 1000) / 1000,
    nonCubeColorPenalty: Math.round(nonCubeColorPenalty * 1000) / 1000,
    cubePaletteDiversity: Math.round(cubePaletteDiversity * 1000) / 1000,
    luminanceUniformity: Math.round(luminanceUniformity * 1000) / 1000,
    edgeGradientHorizontal: Math.round(edgeGradientHorizontal * 1000) / 1000,
    edgeGradientVertical: Math.round(edgeGradientVertical * 1000) / 1000,
    skinLikelihoodCenter: Math.round(skinLikelihoodCenter * 1000) / 1000,
    skinLikelihoodCorners: Math.round(skinLikelihoodCorners * 1000) / 1000,
    skinLikelihoodEdges: Math.round(skinLikelihoodEdges * 1000) / 1000,
    chromaPurity: Math.round(chromaPurity * 1000) / 1000,
    faceDetectorSignal: Math.round(faceDetectorSignal * 1000) / 1000,
  };
}

/**
 * Converts a CubeMLFeatures record into an ordered array of 18 floating-point numbers.
 */
export function featuresToVector(f: CubeMLFeatures): number[] {
  return [
    f.skinFraction,
    f.meanSaturation,
    f.minSaturation,
    f.intraCellVarianceMean,
    f.intraCellVarianceMax,
    f.gridSeamContrast,
    f.meanColorConfidence,
    f.minColorConfidence,
    f.nonCubeColorPenalty,
    f.cubePaletteDiversity,
    f.luminanceUniformity,
    f.edgeGradientHorizontal,
    f.edgeGradientVertical,
    f.skinLikelihoodCenter,
    f.skinLikelihoodCorners,
    f.skinLikelihoodEdges,
    f.chromaPurity,
    f.faceDetectorSignal,
  ];
}
