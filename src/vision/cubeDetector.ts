/**
 * Cubyntra - Unified Computer Vision Cube & Face Detection Engine
 * Necookie Labs (c) 2026
 *
 * Integrates:
 * 1. Native Shape Detection API (FaceDetector) when available in browser
 * 2. Statistical Skin Chrominance Modeling (Fitzpatrick I-VI)
 * 3. 18-Dimensional Feature Extraction (Intra-patch variance, grid seam contrast, chromatic purity)
 * 4. Trained Neural Network Classifier (MLP 18 -> 32 -> 16 -> 2)
 */

import { ROIBounds, StickerSample } from './types';
import { extractCubeFeatures } from './ml/featureExtractor';
import { evaluateCubePresence } from './ml/model';
import { CubeDetectionResult } from './ml/types';

interface DetectedFaceBox {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface NativeFaceDetectorInstance {
  detect(image: ImageBitmapSource): Promise<DetectedFaceBox[]>;
}

declare global {
  interface Window {
    FaceDetector?: {
      new (options?: { fastMode?: boolean; maxDetectedFaces?: number }): NativeFaceDetectorInstance;
    };
  }
}

let nativeDetectorInstance: NativeFaceDetectorInstance | null = null;
let nativeDetectorInitialized = false;

function getNativeFaceDetector(): NativeFaceDetectorInstance | null {
  if (nativeDetectorInitialized) {
    return nativeDetectorInstance;
  }
  nativeDetectorInitialized = true;

  if (typeof window !== 'undefined' && 'FaceDetector' in window && window.FaceDetector) {
    try {
      nativeDetectorInstance = new window.FaceDetector({
        fastMode: true,
        maxDetectedFaces: 2,
      });
    } catch {
      nativeDetectorInstance = null;
    }
  }
  return nativeDetectorInstance;
}

/**
 * Checks if a bounding box overlaps with the central Region of Interest.
 */
function boxOverlapsROI(box: DetectedFaceBox['boundingBox'], roi: ROIBounds): boolean {
  return !(
    box.x + box.width < roi.x ||
    box.x > roi.x + roi.size ||
    box.y + box.height < roi.y ||
    box.y > roi.y + roi.size
  );
}

/**
 * Analyzes the camera frame context and determines whether a Rubik's Cube is present vs a Face/Background.
 */
export async function detectCubeInROI(
  ctx: CanvasRenderingContext2D,
  roi: ROIBounds,
  samples: StickerSample[],
  videoElement?: HTMLVideoElement | null
): Promise<CubeDetectionResult> {
  let faceDetectorSignal = 0.0;

  // 1. Query browser native FaceDetector if supported
  const detector = getNativeFaceDetector();
  if (detector && videoElement && videoElement.readyState >= 2) {
    try {
      const faces = await detector.detect(videoElement);
      const faceInROI = faces.some((f) => boxOverlapsROI(f.boundingBox, roi));
      if (faceInROI) {
        faceDetectorSignal = 1.0;
      }
    } catch {
      // Gracefully continue with pure client-side ML pipeline
    }
  }

  // 2. Extract 18-dim feature vector
  const features = extractCubeFeatures(ctx, roi, samples, faceDetectorSignal);

  // 3. Evaluate Neural Network + Domain Defense-in-Depth
  return evaluateCubePresence(features);
}

/**
 * Synchronous evaluation of cube vs face presence using ML feature extraction and neural network.
 */
export function detectCubeInROISync(
  ctx: CanvasRenderingContext2D,
  roi: ROIBounds,
  samples: StickerSample[],
  faceDetectorSignal = 0.0
): CubeDetectionResult {
  const features = extractCubeFeatures(ctx, roi, samples, faceDetectorSignal);
  return evaluateCubePresence(features);
}


