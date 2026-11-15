import { MouseEvent, useEffect, useRef, useState } from 'react';
import { Crown, Eye, Flame, Radio, Sparkles, UserCheck } from 'lucide-react';
import {
  BattleState,
  PresenterGestureId,
  StageAvatarSpotlight,
  StageSupporterAvatar,
} from '../data/boosteraCatalog';
import { BoosteraVfxEngine } from '../engine/vfxRenderer';
import { videoVfxCompositor } from '../engine/videoVfxCompositor';
import { soundEngine } from '../engine/soundEngine';
import {
  BodyTrackingFrame,
  computeTrackedVfxAnchors,
  getObsLayerVisibility,
  getStudioLayerVisibility,
  ObsLayerType,
  shouldRenderAiClientVideoLayer,
  shouldRenderOpponentOverlay,
} from '../engine/stageLayers';
import { MediaPipeBodyTracker, TrackerRuntimeStatus } from '../engine/mediapipeTracker';

const PRESENTER_PORTRAIT_URL = '/src/assets/images/presenter_studio_portrait_1794720719224.jpg';
const STUDIO_BACKDROP_URL = '/src/assets/images/studio_backdrop_plate_1794720718630.jpg';

export interface StagePerfMetrics {
  fps: number;
  frameTimeMs: number;
}

interface TapRipple {
  x: number;
  y: number;
  bornAt: number;
  comboLabel: string;
}

interface BroadcastStageProps {
  battleState: BattleState;
  obsMode?: boolean;
  obsLayer?: ObsLayerType;
  showSafeZone?: boolean;
  showLayerFilter?: 'both' | 'back_only' | 'front_only';
  useLiveWebcam?: boolean;
  onWebcamError?: (msg: string) => void;
  onPerfSample?: (metrics: StagePerfMetrics) => void;
  onStageTap?: () => void;
  onGestureDetected?: (gesture: PresenterGestureId) => void;
}

function formatCompactPoints(pts: number): string {
  if (pts >= 1_000_000) return `${(pts / 1_000_000).toFixed(1)}M`;
  if (pts >= 1_000) return `${(pts / 1_000).toFixed(1)}K`;
  return String(Math.round(pts));
}

function AvatarCircle({
  avatarUrl,
  label,
  sizeClass,
  ringClass,
}: {
  avatarUrl?: string;
  label: string;
  sizeClass: string;
  ringClass: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials =
    (label || 'VIP')
      .replace(/^@/, '')
      .trim()
      .slice(0, 2)
      .toUpperCase() || 'VP';

  if (!avatarUrl || imgFailed) {
    return (
      <div
        className={`${sizeClass} ${ringClass} rounded-full bg-gradient-to-br from-[#1C2538] to-[#090D16] flex items-center justify-center font-mono font-bold text-[10px] text-amber-300 shrink-0 select-none`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={avatarUrl}
      alt={label}
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className={`${sizeClass} ${ringClass} rounded-full object-cover bg-[#0B0E14] shrink-0 select-none`}
    />
  );
}

/**
 * Layer 1 (Top): L8_INFO_PROMOTIONS (z-[70])
 * Strictly separated from L4_STANDARD_FRONT_FX, L5_TRACKED_FRONT_FX, and L6_OPPONENT_OVERLAY.
 */
function StageInfoAndPromotionsLayer({
  battleState,
  obsMode,
}: {
  battleState: BattleState;
  obsMode: boolean;
}) {
  const showAvatars = Boolean(battleState.avatarsOverlayEnabled);
  const top3: StageSupporterAvatar[] = showAvatars ? (battleState.topSupporters || []).slice(0, 3) : [];
  const spotlights: StageAvatarSpotlight[] = showAvatars ? (battleState.avatarSpotlights || []).slice(0, 2) : [];

  const leftSpot = spotlights.find((s) => s.side === 'LEFT') || spotlights[0] || null;
  const rightSpot =
    spotlights.find((s) => s.side === 'RIGHT' && s.id !== leftSpot?.id) ||
    (spotlights.length > 1 && spotlights[1].id !== leftSpot?.id ? spotlights[1] : null);

  const stimulusActive = battleState.tapStimulusActiveUntil > Date.now();

  return (
    <div
      data-layer-id="L8_INFO_PROMOTIONS"
      data-z-index="70"
      className="absolute inset-0 z-[70] pointer-events-none select-none overflow-hidden"
      dir="rtl"
    >
      {/* Top Safe-Zone Supporter Avatar Podium */}
      {top3.length > 0 && (
        <div className="absolute top-2.5 inset-x-2 flex items-center justify-center gap-1.5 transition-all duration-300">
          {top3.map((sup, idx) => {
            const isMvp = idx === 0;
            const ringStyle = isMvp
              ? 'ring-2 ring-amber-400 shadow-md'
              : idx === 1
                ? 'ring-2 ring-sky-400/90'
                : 'ring-2 ring-fuchsia-400/85';
            const pillBorder = isMvp
              ? 'bg-[#090D16]/90 border-amber-400/65'
              : idx === 1
                ? 'bg-[#090D16]/85 border-sky-400/45'
                : 'bg-[#090D16]/85 border-fuchsia-400/40';

            return (
              <div
                key={sup.userId || sup.username}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full border backdrop-blur-sm max-w-[33%] ${pillBorder}`}
              >
                <div className="relative shrink-0">
                  <AvatarCircle
                    avatarUrl={sup.avatarUrl}
                    label={sup.displayName || sup.username}
                    sizeClass={isMvp ? 'w-7 h-7' : 'w-6 h-6'}
                    ringClass={ringStyle}
                  />
                  <span
                    className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-extrabold ${
                      isMvp
                        ? 'bg-amber-400 text-slate-950'
                        : idx === 1
                          ? 'bg-sky-400 text-slate-950'
                          : 'bg-fuchsia-400 text-slate-950'
                    }`}
                  >
                    {isMvp ? <Crown className="w-2.5 h-2.5" /> : idx + 1}
                  </span>
                </div>

                <div className="min-w-0 leading-tight">
                  <div className="text-[10px] font-bold text-slate-100 truncate">
                    {sup.displayName || sup.username}
                  </div>
                  <div className="text-[9px] font-mono tabular-nums text-amber-300 font-semibold">
                    {formatCompactPoints(sup.points)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Promotions / Tap-Tap Stimulus Info Banner (Strictly in L8, NEVER inside L4 Front VFX canvas) */}
      {(stimulusActive || battleState.likeComboCount >= 10) && (
        <div
          className={`absolute inset-x-8 flex flex-col items-center gap-1 ${
            top3.length > 0 ? 'top-[54px]' : 'top-3'
          }`}
        >
          <div className="px-3 py-1 rounded-full bg-[#090D16]/85 border border-amber-400/60 text-[11px] font-mono font-bold text-amber-200 shadow">
            {stimulusActive && battleState.tapCalloutTextHe
              ? `${battleState.tapCalloutTextHe} · x${battleState.comboMultiplier}`
              : `COMBO STREAK x${battleState.likeComboCount}`}
          </div>
        </div>
      )}

      {/* Outer-Rail Participant Spotlights */}
      {leftSpot && (
        <div className="absolute left-2 bottom-12 max-w-[44%] bg-[#080C15]/90 border border-amber-400/65 rounded-xl p-1.5 backdrop-blur-sm shadow-lg flex items-center gap-2">
          <AvatarCircle
            avatarUrl={leftSpot.avatarUrl}
            label={leftSpot.displayName || leftSpot.username}
            sizeClass="w-8 h-8"
            ringClass={
              leftSpot.kind === 'WHALE_GIFT'
                ? 'ring-2 ring-amber-400'
                : leftSpot.kind === 'SHARE'
                  ? 'ring-2 ring-sky-400'
                  : 'ring-2 ring-emerald-400'
            }
          />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1">
              <Flame className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              <span className="text-[9px] font-mono font-extrabold text-amber-300 truncate">
                {leftSpot.badgeHe}
              </span>
            </div>
            <div className="text-[10px] font-bold text-slate-100 truncate">
              {leftSpot.displayName || leftSpot.username}
            </div>
            <div className="text-[9px] text-slate-300 truncate">{leftSpot.detailHe}</div>
          </div>
        </div>
      )}

      {rightSpot && (
        <div className="absolute right-2 bottom-24 max-w-[44%] bg-[#080C15]/90 border border-sky-400/60 rounded-xl p-1.5 backdrop-blur-sm shadow-lg flex items-center gap-2">
          <AvatarCircle
            avatarUrl={rightSpot.avatarUrl}
            label={rightSpot.displayName || rightSpot.username}
            sizeClass="w-8 h-8"
            ringClass={
              rightSpot.kind === 'WHALE_GIFT'
                ? 'ring-2 ring-amber-400'
                : rightSpot.kind === 'FOLLOW'
                  ? 'ring-2 ring-fuchsia-400'
                  : 'ring-2 ring-sky-400'
            }
          />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-sky-400 shrink-0" />
              <span className="text-[9px] font-mono font-extrabold text-sky-300 truncate">
                {rightSpot.badgeHe}
              </span>
            </div>
            <div className="text-[10px] font-bold text-slate-100 truncate">
              {rightSpot.displayName || rightSpot.username}
            </div>
            <div className="text-[9px] text-slate-300 truncate">{rightSpot.detailHe}</div>
          </div>
        </div>
      )}

      {/* Bottom Timecode / Battle State Info Strip (Studio or dedicated OBS Info source) */}
      {(!obsMode || stimulusActive) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3.5 py-2.5 flex items-center justify-between text-xs text-slate-200">
          {battleState.streamMode === 'SOLO' ? (
            <>
              <span className="font-semibold text-amber-300">שידור סולו חי</span>
              <span className="text-slate-300 tabular-nums">
                רצף טאפ x{battleState.likeComboCount} · בימוי פתוח
              </span>
            </>
          ) : (
            <>
              <span className="font-mono tabular-nums font-semibold">
                {String(Math.floor(battleState.elapsedSec / 60)).padStart(2, '0')}:
                {String(Math.floor(battleState.elapsedSec % 60)).padStart(2, '0')} / 04:00
              </span>
              <span className="text-slate-300 tabular-nums">
                {battleState.gloveRemainingSec > 0
                  ? `כפפה x5 (${Math.ceil(battleState.gloveRemainingSec)}s)`
                  : battleState.snipeWindowActive
                    ? 'חלון סנייפ פעיל!'
                    : `קומבו x${battleState.likeComboCount} · ${battleState.phase}`}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Layer 2: L7_AI_CLIENT_VIDEO (z-[60])
 * Displays AI-generated video from client photo ONLY when status === 'READY' and videoUrl exists.
 */
function StageAiClientVideoLayer({ battleState }: { battleState: BattleState }) {
  const ready = shouldRenderAiClientVideoLayer(battleState.aiClientVideo);
  if (!ready || !battleState.aiClientVideo?.videoUrl) return null;

  return (
    <div
      data-layer-id="L7_AI_CLIENT_VIDEO"
      data-z-index="60"
      className="absolute inset-0 z-[60] pointer-events-none select-none overflow-hidden"
    >
      <video
        src={battleState.aiClientVideo.videoUrl}
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover opacity-90"
      />
      <div className="absolute bottom-14 right-2 px-2 py-0.5 rounded bg-black/70 border border-fuchsia-400/50 text-[10px] font-mono text-fuchsia-200">
        AI VIDEO READY · L7
      </div>
    </div>
  );
}

/**
 * Layer 3: L6_OPPONENT_OVERLAY (z-[50])
 * Automatically linked strictly to selected opponent username (activeOpponentUsername / cloudRadar).
 */
function StageOpponentLinkedOverlayLayer({ battleState }: { battleState: BattleState }) {
  const selectedOpponent = (
    battleState.tiktokRoom?.activeOpponentUsername ||
    battleState.cloudRadar?.opponentUsername ||
    ''
  )
    .replace(/^@/, '')
    .trim();

  const visible = shouldRenderOpponentOverlay({
    selectedOpponentUsername: selectedOpponent,
    streamMode: battleState.streamMode,
  });

  if (!visible) return null;

  const cloud = battleState.cloudRadar;
  const isXrayActive = Boolean(cloud?.active);
  const myScore = isXrayActive ? cloud.myTrueScore : battleState.myScore;
  const oppScore = isXrayActive ? cloud.opponentTrueScore : battleState.opponentScore;
  const diff = myScore - oppScore;

  return (
    <div
      data-layer-id="L6_OPPONENT_OVERLAY"
      data-z-index="50"
      data-opponent={selectedOpponent}
      className="absolute inset-0 z-[50] pointer-events-none select-none overflow-hidden"
      dir="rtl"
    >
      <div
        className={`absolute inset-x-2 rounded-lg px-2.5 py-1.5 shadow-lg backdrop-blur-sm border ${
          isXrayActive
            ? 'top-[88px] bg-[#060A13]/92 border-cyan-400/80'
            : 'top-[88px] bg-[#080C16]/80 border-rose-400/50'
        }`}
      >
        <div className="flex items-center justify-between gap-1.5 text-[10px] pb-1 border-b border-white/10">
          <div className="flex items-center gap-1 font-bold truncate text-cyan-200">
            {isXrayActive ? (
              <Eye className="w-3 h-3 text-cyan-400 shrink-0 animate-pulse" />
            ) : (
              <UserCheck className="w-3 h-3 text-rose-400 shrink-0" />
            )}
            <span className="truncate">
              {isXrayActive ? 'שובר-ענן חי' : 'Overlay יריב מקושר'}: @{selectedOpponent}
            </span>
          </div>
          <span className="font-mono tabular-nums text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-400/40 rounded px-1.5 py-0.2 shrink-0">
            {isXrayActive ? `ענן ${Math.ceil(cloud.remainingSec)}s` : cloud?.opponentRoomConnected ? 'LIVE_SYNC' : 'LINKED'}
          </span>
        </div>

        <div className="grid grid-cols-3 items-center text-center pt-1 gap-1 tabular-nums">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
            <div className="text-[9px] text-amber-200/80 leading-tight">הניקוד שלי</div>
            <div className="text-xs font-mono font-extrabold text-amber-300 leading-tight">
              {myScore.toLocaleString()}
            </div>
          </div>
          <div className="px-1">
            <div className="text-[9px] text-slate-400 leading-tight">פער קרב</div>
            <div
              className={`text-xs font-mono font-extrabold leading-tight ${
                diff >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {diff >= 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
            </div>
          </div>
          <div className="bg-rose-500/10 border border-rose-500/30 rounded px-1.5 py-0.5">
            <div className="text-[9px] text-rose-200/80 leading-tight">@{selectedOpponent}</div>
            <div className="text-xs font-mono font-extrabold text-rose-300 leading-tight">
              {oppScore.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BroadcastStage9x16({
  battleState,
  obsMode = false,
  obsLayer = 'composite',
  showSafeZone = false,
  showLayerFilter = 'both',
  useLiveWebcam = false,
  onWebcamError,
  onPerfSample,
  onStageTap,
  onGestureDetected,
}: BroadcastStageProps) {
  const backCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<BoosteraVfxEngine | null>(null);
  const stateRef = useRef<BattleState>(battleState);
  const ripplesRef = useRef<TapRipple[]>([]);
  const trackingFrameRef = useRef<BodyTrackingFrame | null>(null);
  const trackerRef = useRef<MediaPipeBodyTracker | null>(null);

  const [backdropFailed, setBackdropFailed] = useState(false);
  const [presenterFailed, setPresenterFailed] = useState(false);
  const [trackerStatus, setTrackerStatus] = useState<TrackerRuntimeStatus>('IDLE');
  const [trackerErrorHe, setTrackerErrorHe] = useState<string | null>(null);

  stateRef.current = battleState;

  const vis = obsMode ? getObsLayerVisibility(obsLayer) : getStudioLayerVisibility(showLayerFilter);

  // Live camera feed + real MediaPipe FaceLandmarker & PoseLandmarker tracking (ZERO luminance diff!)
  useEffect(() => {
    if (!useLiveWebcam || obsMode) {
      setTrackerStatus('IDLE');
      setTrackerErrorHe(null);
      trackingFrameRef.current = null;
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let detectTimer: ReturnType<typeof setInterval> | null = null;
    let lastGestureTs = 0;

    const tracker = new MediaPipeBodyTracker();
    trackerRef.current = tracker;
    setTrackerStatus('INITIALIZING');

    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: false })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }

        const ok = await tracker.init();
        if (cancelled) return;
        const snap = tracker.getSnapshot();
        setTrackerStatus(snap.status);
        setTrackerErrorHe(snap.errorHe);

        if (!ok) {
          return;
        }

        detectTimer = setInterval(() => {
          const vid = videoRef.current;
          if (!vid || vid.readyState < 2) return;
          const now = performance.now();
          const frame = tracker.detectVideoFrame(vid, now);
          if (frame) {
            trackingFrameRef.current = frame;
            const epoch = Date.now();
            if (frame.detectedGesture && onGestureDetected && epoch - lastGestureTs > 3600) {
              lastGestureTs = epoch;
              onGestureDetected(frame.detectedGesture);
            }
          }
        }, 66);
      })
      .catch(() => {
        if (!cancelled) {
          setTrackerStatus('UNAVAILABLE');
          setTrackerErrorHe('אין הרשאת מצלמה — שכבת המעקב L5 ממתינה למצלמה אמיתית.');
          if (onWebcamError) {
            onWebcamError('לא ניתן לגשת למצלמה בדפדפן — מוצגת מצלמת הבמה הקיימת.');
          }
        }
      });

    return () => {
      cancelled = true;
      if (detectTimer) clearInterval(detectTimer);
      tracker.dispose();
      trackerRef.current = null;
      trackingFrameRef.current = null;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [useLiveWebcam, obsMode, onWebcamError, onGestureDetected]);

  // 60fps Canvas Physics (L2 Back, L4 Standard Front, L5 Tracked Front FX)
  useEffect(() => {
    const engine = new BoosteraVfxEngine();
    engineRef.current = engine;

    let rafId = 0;
    let frames = 0;
    let lastSampleTime = performance.now();
    let accumFrameMs = 0;

    const W = 540;
    const H = 960;

    if (backCanvasRef.current) {
      backCanvasRef.current.width = W;
      backCanvasRef.current.height = H;
    }
    if (frontCanvasRef.current) {
      frontCanvasRef.current.width = W;
      frontCanvasRef.current.height = H;
    }
    if (trackedCanvasRef.current) {
      trackedCanvasRef.current.width = W;
      trackedCanvasRef.current.height = H;
    }

    function computeCameraTransform(s: BattleState, nowMs: number) {
      if (s.cameraMode === 'LOCKED') {
        return { scale: 1, dx: 0, dy: 0, rotRad: 0, chromaticPx: 0, vignetteAlpha: 0 };
      }

      const hyperMult = s.cameraMode === 'HYPER_KINETIC' ? 1.35 : 1.0;
      let scale = 1.0 + Math.sin(nowMs * 0.0016) * 0.005 * hyperMult;
      let dx = 0;
      let dy = 0;
      let rotRad = 0;
      let chromaticPx = 0;
      let vignetteAlpha = 0;

      if (s.snipeWindowActive && s.streamMode === 'BATTLE') {
        const snipeProgress = Math.min(1, Math.max(0, (s.elapsedSec - 205) / 35));
        scale += snipeProgress * 0.065 * hyperMult;
        vignetteAlpha = Math.max(vignetteAlpha, snipeProgress * 0.28);
      }

      const ev = s.activeCameraEvent;
      if (ev) {
        const age = Date.now() - ev.triggeredAt;
        if (age >= 0 && age <= ev.durationMs) {
          const p = age / ev.durationMs;
          const decay = 1 - p;
          const k = ev.intensity * hyperMult;

          if (ev.preset === 'ZOOM_PUNCH') {
            const punch = Math.sin(Math.min(1, p * 3.2) * Math.PI) * decay;
            scale += 0.085 * punch * k;
            chromaticPx = 3.5 * punch * k;
          } else if (ev.preset === 'EARTHQUAKE_SHAKE') {
            const amp = 14 * decay * decay * k;
            dx += Math.sin(nowMs * 0.068) * amp + Math.cos(nowMs * 0.11) * (amp * 0.45);
            dy += Math.cos(nowMs * 0.079) * amp * 0.85;
            rotRad += Math.sin(nowMs * 0.052) * 0.018 * decay * k;
            chromaticPx = 5.0 * decay * k;
          } else if (ev.preset === 'BASS_PUMP') {
            const beatPulse = Math.pow(Math.max(0, Math.sin(nowMs * 0.014)), 4);
            scale += 0.032 * beatPulse * k;
          } else if (ev.preset === 'DUTCH_WHIP') {
            rotRad += Math.sin(p * Math.PI * 2) * 0.035 * decay * k;
            scale += 0.04 * decay * k;
          } else if (ev.preset === 'SNIPE_CREEP') {
            scale += 0.075 * Math.sin(p * Math.PI) * k;
            vignetteAlpha = Math.max(vignetteAlpha, 0.32 * decay);
          } else if (ev.preset === 'VACUUM_DROP') {
            scale -= 0.025 * Math.sin(p * Math.PI);
            vignetteAlpha = Math.max(vignetteAlpha, 0.42 * Math.sin(p * Math.PI));
          }
        }
      }

      return { scale, dx, dy, rotRad, chromaticPx, vignetteAlpha };
    }

    // Pure visual vignette + outer edge pulses + tap ripples on L4_STANDARD_FRONT_FX (NO text/HUD info!)
    function drawPureStandardFrontFx(
      ctx: CanvasRenderingContext2D,
      s: BattleState,
      cam: { chromaticPx: number; vignetteAlpha: number },
      nowPerf: number
    ) {
      const nowEpoch = Date.now();

      if (cam.vignetteAlpha > 0.01) {
        const grad = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.34, W * 0.5, H * 0.5, H * 0.62);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(4,6,12,${cam.vignetteAlpha.toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      if (cam.chromaticPx > 0.4) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = `rgba(245, 158, 11, ${Math.min(0.45, cam.chromaticPx * 0.08)})`;
        ctx.lineWidth = cam.chromaticPx * 1.6;
        ctx.strokeRect(cam.chromaticPx, cam.chromaticPx, W - cam.chromaticPx * 2, H - cam.chromaticPx * 2);
        ctx.strokeStyle = `rgba(56, 189, 248, ${Math.min(0.38, cam.chromaticPx * 0.07)})`;
        ctx.strokeRect(
          cam.chromaticPx * 2.2,
          cam.chromaticPx * 2.2,
          W - cam.chromaticPx * 4.4,
          H - cam.chromaticPx * 4.4
        );
        ctx.restore();
      }

      const stimulusActive = s.tapStimulusActiveUntil > nowEpoch;
      if (stimulusActive || s.likeComboCount >= 15) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const phaseWave = (nowPerf * 0.0032) % 1;
        const leftAnchorX = W * 0.13;
        const rightAnchorX = W * 0.87;
        const anchorY = H * 0.64;

        [leftAnchorX, rightAnchorX].forEach((ax, sideIdx) => {
          for (let r = 0; r < 2; r++) {
            const p = (phaseWave + r * 0.5 + sideIdx * 0.15) % 1;
            const radius = 14 + p * 44;
            const alpha = (1 - p) * (stimulusActive ? 0.52 : 0.25);
            ctx.beginPath();
            ctx.arc(ax, anchorY, radius, 0, Math.PI * 2);
            ctx.strokeStyle =
              r === 0 ? `rgba(251, 191, 36, ${alpha.toFixed(3)})` : `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 2.2 * (1 - p * 0.5);
            ctx.stroke();
          }

          const corePulse = 5 + Math.sin(nowPerf * 0.014) * 1.8;
          ctx.beginPath();
          ctx.arc(ax, anchorY, corePulse, 0, Math.PI * 2);
          ctx.fillStyle = stimulusActive ? 'rgba(253, 224, 71, 0.78)' : 'rgba(251, 191, 36, 0.42)';
          ctx.fill();
        });
        ctx.restore();
      }

      ripplesRef.current = ripplesRef.current.filter((rp) => nowPerf - rp.bornAt < 680);
      if (ripplesRef.current.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const rp of ripplesRef.current) {
          const p = (nowPerf - rp.bornAt) / 680;
          const radius = 10 + p * 78;
          const alpha = Math.pow(1 - p, 1.5) * 0.85;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(251, 191, 36, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 3 * (1 - p);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Layer 4 (L5_TRACKED_FRONT_FX): Draws ONLY when real MediaPipe head/face/body anchors exist
    function drawTrackedBodyFrontFx(
      ctx: CanvasRenderingContext2D,
      frame: BodyTrackingFrame | null,
      nowPerf: number
    ) {
      const anchors = computeTrackedVfxAnchors(frame, W, H);
      if (!anchors.active) return;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const pulse = 0.75 + Math.sin(nowPerf * 0.008) * 0.25;

      // Head Crown Halo anchored strictly above tracked forehead
      if (anchors.headCrownPx) {
        const rx = Math.max(36, anchors.faceRadiusPx * 0.95);
        const ry = Math.max(12, rx * 0.28);
        ctx.strokeStyle = `rgba(251, 191, 36, ${(0.82 * pulse).toFixed(2)})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.ellipse(anchors.headCrownPx.x, anchors.headCrownPx.y - 12, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(56, 189, 248, ${(0.45 * pulse).toFixed(2)})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(anchors.headCrownPx.x, anchors.headCrownPx.y - 16, rx * 1.18, ry * 1.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Cheek/Temple energy sparks aligned with real face landmarks
      [anchors.leftTemplePx, anchors.rightTemplePx].forEach((pt, idx) => {
        if (!pt) return;
        const grad = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, 26);
        grad.addColorStop(0, idx === 0 ? 'rgba(251,191,36,0.75)' : 'rgba(56,189,248,0.75)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 26, 0, Math.PI * 2);
        ctx.fill();
      });

      // Shoulder energy aura wings anchored to tracked left/right shoulders
      [anchors.leftShoulderPx, anchors.rightShoulderPx].forEach((sh, idx) => {
        if (!sh) return;
        const r = Math.max(26, anchors.shoulderSpanPx * 0.22);
        const grad = ctx.createRadialGradient(sh.x, sh.y, 4, sh.x, sh.y, r);
        grad.addColorStop(0, anchors.handsRaised ? 'rgba(244,63,94,0.65)' : 'rgba(56,189,248,0.48)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sh.x, sh.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = idx === 0 ? 'rgba(251,191,36,0.45)' : 'rgba(56,189,248,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sh.x, sh.y, r * 0.68, 0, Math.PI * 2);
        ctx.stroke();
      });

      ctx.restore();
    }

    function tick(now: number) {
      const t0 = performance.now();
      const s = stateRef.current;

      const renderInput = {
        elapsedSec: s.elapsedSec,
        phase: s.phase,
        likeEnergy: s.likeEnergy,
        roundPalette: s.roundPalette,
        activeEffects: s.activeEffects,
        streamMode: s.streamMode,
        gloveRemainingSec: s.gloveRemainingSec,
      };

      engine.step(W, H, renderInput, now);
      const cam = computeCameraTransform(s, now);

      const layerVis = obsMode ? getObsLayerVisibility(obsLayer) : getStudioLayerVisibility(showLayerFilter);

      if (backCanvasRef.current) {
        const bCtx = backCanvasRef.current.getContext('2d', { alpha: true });
        if (bCtx) {
          bCtx.clearRect(0, 0, W, H);
          if (layerVis.L2_BACK_FX) {
            bCtx.save();
            bCtx.translate(W * 0.5 + cam.dx, H * 0.5 + cam.dy);
            bCtx.rotate(cam.rotRad);
            bCtx.scale(cam.scale, cam.scale);
            bCtx.translate(-W * 0.5, -H * 0.5);
            engine.renderLayer(bCtx, W, H, 'BACK', renderInput, 'transparent', now);
            videoVfxCompositor.renderActiveVideoLayer(bCtx, W, H, 'BACK', s.activeEffects);
            bCtx.restore();
          }
        }
      }

      if (frontCanvasRef.current) {
        const fCtx = frontCanvasRef.current.getContext('2d', { alpha: true });
        if (fCtx) {
          fCtx.clearRect(0, 0, W, H);
          if (layerVis.L4_STANDARD_FRONT_FX) {
            fCtx.save();
            fCtx.translate(W * 0.5 + cam.dx, H * 0.5 + cam.dy);
            fCtx.rotate(cam.rotRad);
            fCtx.scale(cam.scale, cam.scale);
            fCtx.translate(-W * 0.5, -H * 0.5);
            engine.renderLayer(fCtx, W, H, 'FRONT', renderInput, 'transparent', now);
            videoVfxCompositor.renderActiveVideoLayer(fCtx, W, H, 'FRONT', s.activeEffects);
            fCtx.restore();

            drawPureStandardFrontFx(fCtx, s, cam, now);
          }
        }
      }

      if (trackedCanvasRef.current) {
        const tCtx = trackedCanvasRef.current.getContext('2d', { alpha: true });
        if (tCtx) {
          tCtx.clearRect(0, 0, W, H);
          if (layerVis.L5_TRACKED_FRONT_FX && trackingFrameRef.current) {
            drawTrackedBodyFrontFx(tCtx, trackingFrameRef.current, now);
          }
        }
      }

      const frameCost = performance.now() - t0;
      accumFrameMs += frameCost;
      frames += 1;

      if (now - lastSampleTime >= 750) {
        const fps = Math.min(60, Math.round((frames * 1000) / (now - lastSampleTime)));
        const avgMs = Number((accumFrameMs / Math.max(1, frames)).toFixed(2));
        if (onPerfSample) {
          onPerfSample({ fps, frameTimeMs: avgMs });
        }
        frames = 0;
        accumFrameMs = 0;
        lastSampleTime = now;
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [obsMode, obsLayer, showLayerFilter, onPerfSample]);

  const handleInteractiveStageTap = (e: MouseEvent<HTMLDivElement>) => {
    if (obsMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 540;
    const y = ((e.clientY - rect.top) / rect.height) * 960;

    soundEngine.ensureInitialized();
    soundEngine.triggerEffectSound('SND_TAP_DOPAMINE_PULSE', true);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(12);
      } catch {
        // Ignore if unsupported
      }
    }

    const nextCombo = (battleState.likeComboCount || 0) + 5;
    ripplesRef.current.push({
      x,
      y,
      bornAt: performance.now(),
      comboLabel: `+TAP x${nextCombo}`,
    });

    if (onStageTap) {
      onStageTap();
    }
  };

  if (obsMode) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-transparent pointer-events-none select-none">
        <div
          data-stage-mode="obs"
          data-obs-layer={obsLayer}
          className="relative h-screen aspect-[9/16] max-w-full bg-transparent overflow-hidden"
        >
          {vis.L2_BACK_FX && (
            <canvas
              ref={backCanvasRef}
              data-layer-id="L2_BACK_FX"
              data-z-index="20"
              className="absolute inset-0 w-full h-full z-[20] pointer-events-none"
            />
          )}
          {vis.L4_STANDARD_FRONT_FX && (
            <canvas
              ref={frontCanvasRef}
              data-layer-id="L4_STANDARD_FRONT_FX"
              data-z-index="40"
              className="absolute inset-0 w-full h-full z-[40] pointer-events-none"
            />
          )}
          {vis.L5_TRACKED_FRONT_FX && (
            <canvas
              ref={trackedCanvasRef}
              data-layer-id="L5_TRACKED_FRONT_FX"
              data-z-index="45"
              className="absolute inset-0 w-full h-full z-[45] pointer-events-none"
            />
          )}
          {vis.L6_OPPONENT_OVERLAY && <StageOpponentLinkedOverlayLayer battleState={battleState} />}
          {vis.L7_AI_CLIENT_VIDEO && <StageAiClientVideoLayer battleState={battleState} />}
          {vis.L8_INFO_PROMOTIONS && <StageInfoAndPromotionsLayer battleState={battleState} obsMode />}
        </div>
      </div>
    );
  }

  const camActive =
    battleState.activeCameraEvent &&
    Date.now() - battleState.activeCameraEvent.triggeredAt < battleState.activeCameraEvent.durationMs
      ? battleState.activeCameraEvent.preset
      : null;

  const presenterKineticClass =
    camActive === 'ZOOM_PUNCH'
      ? 'scale-105 transition-transform duration-150'
      : camActive === 'DUTCH_WHIP'
        ? 'scale-105 rotate-1 transition-transform duration-150'
        : camActive === 'EARTHQUAKE_SHAKE'
          ? 'scale-105 -rotate-1 transition-transform duration-75'
          : camActive === 'SNIPE_CREEP' || battleState.snipeWindowActive
            ? 'scale-105 transition-transform duration-700'
            : 'scale-100 transition-transform duration-300';

  return (
    <div
      onClick={handleInteractiveStageTap}
      data-stage-mode="studio"
      title="לחץ על המסך לבדיקת גירוי אצבע (Tap-Tap Dopamine) ורצף לייקים חי!"
      className="relative w-full max-w-[360px] mx-auto aspect-[9/16] rounded-xl overflow-hidden border border-[#1E2636] bg-[#07090E] select-none cursor-pointer"
    >
      {/* LAYER 8 (Bottom): L1_PERMANENT_WALL (z-[10]) */}
      {vis.L1_PERMANENT_WALL && (
        <div
          data-layer-id="L1_PERMANENT_WALL"
          data-z-index="10"
          className="absolute inset-0 z-[10] pointer-events-none"
        >
          {!backdropFailed ? (
            <img
              src={STUDIO_BACKDROP_URL}
              alt="קיר אולפן קבוע"
              referrerPolicy="no-referrer"
              onError={() => setBackdropFailed(true)}
              className={`w-full h-full object-cover opacity-55 ${presenterKineticClass}`}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-[#0F141F] via-[#090C12] to-[#05070B]" />
          )}
        </div>
      )}

      {/* LAYER 7: L2_BACK_FX (z-[20]) */}
      {vis.L2_BACK_FX && (
        <canvas
          ref={backCanvasRef}
          data-layer-id="L2_BACK_FX"
          data-z-index="20"
          className="absolute inset-0 w-full h-full z-[20] pointer-events-none"
        />
      )}

      {/* LAYER 6: L3_PRESENTER_CAMERA (z-[30]) — Existing Presenter Camera Preserved Untouched */}
      {vis.L3_PRESENTER_CAMERA && (
        <div
          data-layer-id="L3_PRESENTER_CAMERA"
          data-z-index="30"
          className={`absolute inset-0 z-[30] pointer-events-none flex items-end justify-center ${presenterKineticClass}`}
        >
          {useLiveWebcam ? (
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full h-full object-cover [mask-image:radial-gradient(ellipse_44%_52%_at_50%_54%,#000_64%,transparent_100%)]"
            />
          ) : !presenterFailed ? (
            <img
              src={PRESENTER_PORTRAIT_URL}
              alt="המצלמה הקיימת — מגיש שידור חי במרכז הפריים"
              referrerPolicy="no-referrer"
              onError={() => setPresenterFailed(true)}
              className="w-full h-full object-cover [mask-image:radial-gradient(ellipse_43%_50%_at_50%_56%,#000_66%,transparent_100%)]"
            />
          ) : (
            <div className="w-[48%] h-[68%] mb-6 rounded-t-full bg-gradient-to-b from-slate-700/70 to-slate-900/90 border border-slate-600/30 flex items-center justify-center text-xs text-slate-300">
              המצלמה הקיימת (אזור מרכזי)
            </div>
          )}
        </div>
      )}

      {/* LAYER 5: L4_STANDARD_FRONT_FX (z-[40]) */}
      {vis.L4_STANDARD_FRONT_FX && (
        <canvas
          ref={frontCanvasRef}
          data-layer-id="L4_STANDARD_FRONT_FX"
          data-z-index="40"
          className="absolute inset-0 w-full h-full z-[40] pointer-events-none"
        />
      )}

      {/* LAYER 4: L5_TRACKED_FRONT_FX (z-[45]) — MediaPipe Head/Face/Body Tracked Effects */}
      {vis.L5_TRACKED_FRONT_FX && (
        <div
          data-layer-id="L5_TRACKED_FRONT_FX"
          data-z-index="45"
          data-tracking-status={trackerStatus}
          className="absolute inset-0 z-[45] pointer-events-none"
        >
          <canvas ref={trackedCanvasRef} className="w-full h-full" />
          {useLiveWebcam && trackerStatus !== 'LIVE_TRACKING' && (
            <div className="absolute bottom-11 left-2 right-2 px-2 py-1 rounded bg-black/75 border border-amber-500/40 text-[10px] text-amber-200 flex items-center gap-1.5">
              <Radio className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {trackerStatus === 'INITIALIZING'
                  ? 'טוען מודלי MediaPipe למעקב ראש/פנים/גוף...'
                  : trackerErrorHe || 'מעקב MediaPipe לא זמין (ללא זיוף בהירות)'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* LAYER 3: L6_OPPONENT_OVERLAY (z-[50]) */}
      {vis.L6_OPPONENT_OVERLAY && <StageOpponentLinkedOverlayLayer battleState={battleState} />}

      {/* LAYER 2: L7_AI_CLIENT_VIDEO (z-[60]) */}
      {vis.L7_AI_CLIENT_VIDEO && <StageAiClientVideoLayer battleState={battleState} />}

      {/* LAYER 1 (Top): L8_INFO_PROMOTIONS (z-[70]) */}
      {vis.L8_INFO_PROMOTIONS && <StageInfoAndPromotionsLayer battleState={battleState} obsMode={false} />}

      {/* Optional Calibration Grid Overlay */}
      {showSafeZone && (
        <div className="absolute inset-0 z-[80] pointer-events-none">
          <div className="absolute inset-y-0 left-[26%] right-[26%] border-x border-dashed border-amber-400/70 bg-amber-500/[0.04] flex flex-col justify-between p-2">
            <span className="text-[11px] font-mono text-amber-300 bg-black/70 px-1.5 py-0.5 rounded self-center">
              SAFE ZONE 48% (פני מגיש)
            </span>
            <span className="text-[10px] font-mono text-amber-200/80 bg-black/70 px-1.5 py-0.5 rounded self-center">
              ללא חסימה רציפה
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
