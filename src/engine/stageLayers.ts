export type StageLayerId =
  | 'L8_INFO_PROMOTIONS'
  | 'L7_AI_CLIENT_VIDEO'
  | 'L6_OPPONENT_OVERLAY'
  | 'L5_TRACKED_FRONT_FX'
  | 'L4_STANDARD_FRONT_FX'
  | 'L3_PRESENTER_CAMERA'
  | 'L2_BACK_FX'
  | 'L1_PERMANENT_WALL';

export type ObsLayerType =
  | 'info'
  | 'ai_video'
  | 'opponent'
  | 'tracked_front'
  | 'front'
  | 'back'
  | 'composite';

export interface StageLayerSpec {
  id: StageLayerId;
  orderTopToBottom: number;
  zIndex: number;
  titleHe: string;
  obsLayerKey: ObsLayerType | 'camera' | 'wall';
  descHe: string;
}

/**
 * Exact 8-Layer Broadcast Compositing Stack — Top to Bottom.
 * Guaranteed ordering: Info/Promotions (z=70) > AI Client Video (z=60) > Opponent Overlay (z=50)
 * > Tracked Head/Face/Body Front FX (z=45) > Standard Front FX (z=40)
 * > Existing Presenter Camera (z=30) > Back FX (z=20) > Permanent Wall (z=10).
 */
export const STAGE_LAYER_STACK: StageLayerSpec[] = [
  {
    id: 'L8_INFO_PROMOTIONS',
    orderTopToBottom: 1,
    zIndex: 70,
    titleHe: '1. מידע וקידומים (פודיום תומכים, זמן קרב, קידומי טאפ)',
    obsLayerKey: 'info',
    descHe: 'שכבת HUD נפרדת לחלוטין מהאפקטים הקדמיים — זמינה גם כמקור OBS נפרד (?layer=info).',
  },
  {
    id: 'L7_AI_CLIENT_VIDEO',
    orderTopToBottom: 2,
    zIndex: 60,
    titleHe: '2. וידאו AI מתמונת לקוח (מוצג אך ורק כשהסרטון READY)',
    obsLayerKey: 'ai_video',
    descHe: 'מנגן סרטון AI שיוצר מתמונת לקוח רק לאחר שסטטוס הסרטון מוכן (READY).',
  },
  {
    id: 'L6_OPPONENT_OVERLAY',
    orderTopToBottom: 3,
    zIndex: 50,
    titleHe: '3. Overlay אוטומטי מקושר ליריב הנבחר',
    obsLayerKey: 'opponent',
    descHe: 'כרטיס סקור/שובר-ענן/טקטיקה שמקושר ישירות ל-activeOpponentUsername שנבחר.',
  },
  {
    id: 'L5_TRACKED_FRONT_FX',
    orderTopToBottom: 4,
    zIndex: 45,
    titleHe: '4. אפקטים קדמיים עם מעקב ראש, פנים וגוף (MediaPipe)',
    obsLayerKey: 'tracked_front',
    descHe: 'מונחים בזמן אמת לפי נקודות ראש, עיניים, כתפיים וגוף אמיתיות (ללא הפרש בהירות).',
  },
  {
    id: 'L4_STANDARD_FRONT_FX',
    orderTopToBottom: 5,
    zIndex: 40,
    titleHe: '5. אפקטים קדמיים רגילים (Front VFX)',
    obsLayerKey: 'front',
    descHe: 'תותחי CO₂, ניצוצות וגלי הדף בשכבת הקדמה — מופרד משכבת המידע והקידומים.',
  },
  {
    id: 'L3_PRESENTER_CAMERA',
    orderTopToBottom: 6,
    zIndex: 30,
    titleHe: '6. המצלמה הקיימת (שכבת המגיש המקורית)',
    obsLayerKey: 'camera',
    descHe: 'מצלמת המגיש הקיימת ללא שינוי בצילום או במסגור.',
  },
  {
    id: 'L2_BACK_FX',
    orderTopToBottom: 7,
    zIndex: 20,
    titleHe: '7. אפקטים אחוריים (Back VFX)',
    obsLayerKey: 'back',
    descHe: 'עשן אולפן, ברקים וחיות גרין-סקרין מאחורי המגיש.',
  },
  {
    id: 'L1_PERMANENT_WALL',
    orderTopToBottom: 8,
    zIndex: 10,
    titleHe: '8. קיר קבוע (תפאורת אולפן כהה)',
    obsLayerKey: 'wall',
    descHe: 'רקע קיר האולפן הקבוע מאחורי כל השכבות.',
  },
];

export interface LayerVisibilityMap {
  L1_PERMANENT_WALL: boolean;
  L2_BACK_FX: boolean;
  L3_PRESENTER_CAMERA: boolean;
  L4_STANDARD_FRONT_FX: boolean;
  L5_TRACKED_FRONT_FX: boolean;
  L6_OPPONENT_OVERLAY: boolean;
  L7_AI_CLIENT_VIDEO: boolean;
  L8_INFO_PROMOTIONS: boolean;
}

export function getObsLayerVisibility(obsLayer: ObsLayerType): LayerVisibilityMap {
  const base: LayerVisibilityMap = {
    L1_PERMANENT_WALL: false,
    L2_BACK_FX: false,
    L3_PRESENTER_CAMERA: false,
    L4_STANDARD_FRONT_FX: false,
    L5_TRACKED_FRONT_FX: false,
    L6_OPPONENT_OVERLAY: false,
    L7_AI_CLIENT_VIDEO: false,
    L8_INFO_PROMOTIONS: false,
  };

  switch (obsLayer) {
    case 'info':
      return { ...base, L8_INFO_PROMOTIONS: true };
    case 'ai_video':
      return { ...base, L7_AI_CLIENT_VIDEO: true };
    case 'opponent':
      return { ...base, L6_OPPONENT_OVERLAY: true };
    case 'tracked_front':
      return { ...base, L5_TRACKED_FRONT_FX: true };
    case 'front':
      // Strictly separated from L8_INFO_PROMOTIONS, L6_OPPONENT_OVERLAY, and L7_AI_CLIENT_VIDEO!
      return { ...base, L4_STANDARD_FRONT_FX: true };
    case 'back':
      return { ...base, L2_BACK_FX: true };
    case 'composite':
    default:
      // In OBS transparent composite mode, wall & local camera come from OBS sources underneath,
      // while all 6 overlay layers render in exact top-to-bottom stack order with true alpha transparency.
      return {
        L1_PERMANENT_WALL: false,
        L2_BACK_FX: true,
        L3_PRESENTER_CAMERA: false,
        L4_STANDARD_FRONT_FX: true,
        L5_TRACKED_FRONT_FX: true,
        L6_OPPONENT_OVERLAY: true,
        L7_AI_CLIENT_VIDEO: true,
        L8_INFO_PROMOTIONS: true,
      };
  }
}

export function getStudioLayerVisibility(showLayerFilter: 'both' | 'back_only' | 'front_only'): LayerVisibilityMap {
  if (showLayerFilter === 'back_only') {
    return {
      L1_PERMANENT_WALL: true,
      L2_BACK_FX: true,
      L3_PRESENTER_CAMERA: true,
      L4_STANDARD_FRONT_FX: false,
      L5_TRACKED_FRONT_FX: false,
      L6_OPPONENT_OVERLAY: false,
      L7_AI_CLIENT_VIDEO: false,
      L8_INFO_PROMOTIONS: false,
    };
  }
  if (showLayerFilter === 'front_only') {
    return {
      L1_PERMANENT_WALL: true,
      L2_BACK_FX: false,
      L3_PRESENTER_CAMERA: true,
      L4_STANDARD_FRONT_FX: true,
      L5_TRACKED_FRONT_FX: true,
      L6_OPPONENT_OVERLAY: true,
      L7_AI_CLIENT_VIDEO: true,
      L8_INFO_PROMOTIONS: true,
    };
  }
  return {
    L1_PERMANENT_WALL: true,
    L2_BACK_FX: true,
    L3_PRESENTER_CAMERA: true,
    L4_STANDARD_FRONT_FX: true,
    L5_TRACKED_FRONT_FX: true,
    L6_OPPONENT_OVERLAY: true,
    L7_AI_CLIENT_VIDEO: true,
    L8_INFO_PROMOTIONS: true,
  };
}

export interface NormalizedPoint2D {
  x: number;
  y: number;
  visibility?: number;
}

export interface BodyTrackingFrame {
  source: 'MEDIAPIPE_LIVE' | 'MEDIAPIPE_PORTRAIT' | 'UNAVAILABLE';
  hasFace: boolean;
  hasPose: boolean;
  confidence: number;
  updatedAt: number;
  // Normalized [0..1] landmarks extracted strictly from MediaPipe FaceLandmarker + PoseLandmarker
  headCrownNorm?: NormalizedPoint2D;
  faceCenterNorm?: NormalizedPoint2D;
  leftCheekNorm?: NormalizedPoint2D;
  rightCheekNorm?: NormalizedPoint2D;
  faceRadiusNorm?: number;
  leftShoulderNorm?: NormalizedPoint2D;
  rightShoulderNorm?: NormalizedPoint2D;
  leftWristNorm?: NormalizedPoint2D;
  rightWristNorm?: NormalizedPoint2D;
  detectedGesture?: 'HANDS_UP_HYPE' | 'TAP_CALLOUT_WAVE' | 'LEAN_IN_CLOSE' | null;
}

export interface ProjectedTrackedAnchors {
  active: boolean;
  headCrownPx: { x: number; y: number } | null;
  faceCenterPx: { x: number; y: number } | null;
  faceRadiusPx: number;
  leftTemplePx: { x: number; y: number } | null;
  rightTemplePx: { x: number; y: number } | null;
  leftShoulderPx: { x: number; y: number } | null;
  rightShoulderPx: { x: number; y: number } | null;
  shoulderSpanPx: number;
  handsRaised: boolean;
}

export function computeTrackedVfxAnchors(
  frame: BodyTrackingFrame | null | undefined,
  stageW: number,
  stageH: number
): ProjectedTrackedAnchors {
  if (!frame || (!frame.hasFace && !frame.hasPose)) {
    return {
      active: false,
      headCrownPx: null,
      faceCenterPx: null,
      faceRadiusPx: 0,
      leftTemplePx: null,
      rightTemplePx: null,
      leftShoulderPx: null,
      rightShoulderPx: null,
      shoulderSpanPx: 0,
      handsRaised: false,
    };
  }

  const clampPx = (pt: NormalizedPoint2D | undefined) =>
    pt
      ? {
          x: Math.max(0, Math.min(stageW, pt.x * stageW)),
          y: Math.max(0, Math.min(stageH, pt.y * stageH)),
        }
      : null;

  const faceCenterPx = clampPx(frame.faceCenterNorm);
  const headCrownPx = clampPx(frame.headCrownNorm);
  const leftTemplePx = clampPx(frame.leftCheekNorm);
  const rightTemplePx = clampPx(frame.rightCheekNorm);
  const leftShoulderPx = clampPx(frame.leftShoulderNorm);
  const rightShoulderPx = clampPx(frame.rightShoulderNorm);
  const faceRadiusPx = Math.max(18, Math.round((frame.faceRadiusNorm || 0.11) * stageW));

  const shoulderSpanPx =
    leftShoulderPx && rightShoulderPx
      ? Math.hypot(rightShoulderPx.x - leftShoulderPx.x, rightShoulderPx.y - leftShoulderPx.y)
      : faceRadiusPx * 2.6;

  const handsRaised = Boolean(
    frame.hasPose &&
      ((frame.leftWristNorm && frame.leftShoulderNorm && frame.leftWristNorm.y < frame.leftShoulderNorm.y - 0.06) ||
        (frame.rightWristNorm && frame.rightShoulderNorm && frame.rightWristNorm.y < frame.rightShoulderNorm.y - 0.06))
  );

  return {
    active: true,
    headCrownPx,
    faceCenterPx,
    faceRadiusPx,
    leftTemplePx,
    rightTemplePx,
    leftShoulderPx,
    rightShoulderPx,
    shoulderSpanPx,
    handsRaised,
  };
}

export function shouldRenderOpponentOverlay(params: {
  selectedOpponentUsername: string | null | undefined;
  streamMode: 'BATTLE' | 'SOLO';
}): boolean {
  const clean = (params.selectedOpponentUsername || '').replace(/^@/, '').trim();
  return params.streamMode === 'BATTLE' && Boolean(clean);
}

export function shouldRenderAiClientVideoLayer(videoState?: {
  status?: 'IDLE' | 'GENERATING' | 'READY' | 'FAILED';
  videoUrl?: string | null;
}): boolean {
  return Boolean(videoState && videoState.status === 'READY' && videoState.videoUrl && videoState.videoUrl.trim());
}
