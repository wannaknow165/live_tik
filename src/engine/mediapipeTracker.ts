import { FilesetResolver, FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { BodyTrackingFrame, NormalizedPoint2D } from './stageLayers';

const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export type TrackerRuntimeStatus = 'IDLE' | 'INITIALIZING' | 'LIVE_TRACKING' | 'UNAVAILABLE';

export interface TrackerStateSnapshot {
  status: TrackerRuntimeStatus;
  errorHe: string | null;
  frame: BodyTrackingFrame;
}

function toPoint(pt: { x: number; y: number; visibility?: number } | undefined): NormalizedPoint2D | undefined {
  if (!pt || Number.isNaN(pt.x) || Number.isNaN(pt.y)) return undefined;
  return {
    x: Math.max(0, Math.min(1, pt.x)),
    y: Math.max(0, Math.min(1, pt.y)),
    visibility: typeof pt.visibility === 'number' ? pt.visibility : undefined,
  };
}

/**
 * Real MediaPipe FaceLandmarker + PoseLandmarker tracker (loaded from local /mediapipe-wasm).
 * Zero pixel-brightness diff hacks: if WASM or task models cannot load, reports UNAVAILABLE explicitly.
 */
export class MediaPipeBodyTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private initPromise: Promise<boolean> | null = null;
  private status: TrackerRuntimeStatus = 'IDLE';
  private errorHe: string | null = null;
  private lastVideoTime = -1;

  getSnapshot(frame?: BodyTrackingFrame): TrackerStateSnapshot {
    return {
      status: this.status,
      errorHe: this.errorHe,
      frame: frame || {
        source: this.status === 'LIVE_TRACKING' ? 'MEDIAPIPE_LIVE' : 'UNAVAILABLE',
        hasFace: false,
        hasPose: false,
        confidence: 0,
        updatedAt: Date.now(),
        detectedGesture: null,
      },
    };
  }

  async init(): Promise<boolean> {
    if (this.faceLandmarker || this.poseLandmarker) {
      this.status = 'LIVE_TRACKING';
      return true;
    }
    if (this.initPromise) return this.initPromise;

    this.status = 'INITIALIZING';
    this.errorHe = null;

    this.initPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
        const [faceRes, poseRes] = await Promise.allSettled([
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL },
            runningMode: 'VIDEO',
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: POSE_LANDMARKER_MODEL_URL },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
        ]);

        if (faceRes.status === 'fulfilled') {
          this.faceLandmarker = faceRes.value;
        }
        if (poseRes.status === 'fulfilled') {
          this.poseLandmarker = poseRes.value;
        }

        if (!this.faceLandmarker && !this.poseLandmarker) {
          this.status = 'UNAVAILABLE';
          this.errorHe = 'לא ניתן לטעון מודלי מעקב פנים וגוף של MediaPipe (אין גישה למודלי הראייה).';
          return false;
        }

        this.status = 'LIVE_TRACKING';
        this.errorHe = null;
        return true;
      } catch (err: unknown) {
        this.status = 'UNAVAILABLE';
        this.errorHe =
          err instanceof Error
            ? `שגיאה באתחול MediaPipe: ${err.message}`
            : 'שגיאה באתחול מעקב ראש/פנים/גוף (MediaPipe).';
        return false;
      }
    })();

    return this.initPromise;
  }

  detectVideoFrame(video: HTMLVideoElement | null, nowMs: number): BodyTrackingFrame | null {
    if (!video || video.readyState < 2 || (!this.faceLandmarker && !this.poseLandmarker)) {
      return null;
    }
    if (video.currentTime === this.lastVideoTime) {
      return null;
    }
    this.lastVideoTime = video.currentTime;

    let hasFace = false;
    let hasPose = false;
    let headCrownNorm: NormalizedPoint2D | undefined;
    let faceCenterNorm: NormalizedPoint2D | undefined;
    let leftCheekNorm: NormalizedPoint2D | undefined;
    let rightCheekNorm: NormalizedPoint2D | undefined;
    let faceRadiusNorm: number | undefined;
    let leftShoulderNorm: NormalizedPoint2D | undefined;
    let rightShoulderNorm: NormalizedPoint2D | undefined;
    let leftWristNorm: NormalizedPoint2D | undefined;
    let rightWristNorm: NormalizedPoint2D | undefined;

    try {
      if (this.faceLandmarker) {
        const faceResult = this.faceLandmarker.detectForVideo(video, nowMs);
        const lm = faceResult.faceLandmarks?.[0];
        if (lm && lm.length >= 455) {
          hasFace = true;
          const noseTip = toPoint(lm[1]);
          const forehead = toPoint(lm[10]);
          const leftCheek = toPoint(lm[234]);
          const rightCheek = toPoint(lm[454]);
          faceCenterNorm = noseTip;
          headCrownNorm = forehead
            ? { x: forehead.x, y: Math.max(0.02, forehead.y - 0.045) }
            : undefined;
          leftCheekNorm = leftCheek;
          rightCheekNorm = rightCheek;
          if (leftCheek && rightCheek) {
            faceRadiusNorm = Math.max(0.05, Math.hypot(rightCheek.x - leftCheek.x, rightCheek.y - leftCheek.y) * 0.55);
          }
        }
      }

      if (this.poseLandmarker) {
        const poseResult = this.poseLandmarker.detectForVideo(video, nowMs);
        const pose = poseResult.landmarks?.[0];
        if (pose && pose.length >= 17) {
          hasPose = true;
          const nose = toPoint(pose[0]);
          leftShoulderNorm = toPoint(pose[11]);
          rightShoulderNorm = toPoint(pose[12]);
          leftWristNorm = toPoint(pose[15]);
          rightWristNorm = toPoint(pose[16]);

          if (!faceCenterNorm && nose) {
            faceCenterNorm = nose;
            headCrownNorm = { x: nose.x, y: Math.max(0.02, nose.y - 0.09) };
          }
        }
      }
    } catch {
      return null;
    }

    let detectedGesture: BodyTrackingFrame['detectedGesture'] = null;
    if (hasPose && leftShoulderNorm && rightShoulderNorm) {
      const leftHigh = Boolean(leftWristNorm && leftWristNorm.y < leftShoulderNorm.y - 0.07);
      const rightHigh = Boolean(rightWristNorm && rightWristNorm.y < rightShoulderNorm.y - 0.07);
      if (leftHigh && rightHigh) {
        detectedGesture = 'HANDS_UP_HYPE';
      } else if (leftHigh || rightHigh) {
        detectedGesture = 'TAP_CALLOUT_WAVE';
      }
    }
    if (!detectedGesture && faceRadiusNorm && faceRadiusNorm > 0.165) {
      detectedGesture = 'LEAN_IN_CLOSE';
    }

    return {
      source: 'MEDIAPIPE_LIVE',
      hasFace,
      hasPose,
      confidence: hasFace && hasPose ? 0.95 : hasFace || hasPose ? 0.72 : 0.15,
      updatedAt: Date.now(),
      headCrownNorm,
      faceCenterNorm,
      leftCheekNorm,
      rightCheekNorm,
      faceRadiusNorm,
      leftShoulderNorm,
      rightShoulderNorm,
      leftWristNorm,
      rightWristNorm,
      detectedGesture,
    };
  }

  dispose() {
    try {
      this.faceLandmarker?.close();
    } catch {
      // Ignore
    }
    try {
      this.poseLandmarker?.close();
    } catch {
      // Ignore
    }
    this.faceLandmarker = null;
    this.poseLandmarker = null;
    this.initPromise = null;
    this.status = 'IDLE';
  }
}
