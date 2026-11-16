import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { FunctionDeclaration, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { ControlEvent, TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import {
  applyApprovalTransition,
  assertOwnedTikTokRoomForSend,
  buildIntegrationAuditReport,
  buildPipelineTrace,
  canDeterministicRuleExecute,
  ClaudeInspectionResult,
  DecisionApprovalMode,
  DecisionApprovalStatus,
  enforceServerApprovalPolicy,
  evaluateCouncilDecision,
  IntegrationAuditReport,
  PipelineStageLog,
  PlannedExecutionPayload,
  ProviderStageInput,
  sanitizeSecretHeaderValue,
  StructuredDirectorPlan,
  toProposedGovernanceDefaults,
} from './src/engine/decisionPipeline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const LEARNING_VAULT_DIR = path.join(DATA_DIR, 'learning_vault');
const GENERATED_VIDEO_DIR = path.join(__dirname, 'public', 'assets', 'generated');
const MEDIAPIPE_WASM_DIR = path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const MEMORY_FILE = path.join(DATA_DIR, 'boostera_ai_memory.json');
const TIKLEAP_CACHE_FILE = path.join(DATA_DIR, 'tikleap_rankings_cache.json');
const WS_SNIFFER_FILE = path.join(DATA_DIR, 'ws_event_sniffer.json');
const CHAT_COMPANION_FILE = path.join(DATA_DIR, 'chat_companion_crew.json');
const GEELARK_PREFS_FILE = path.join(DATA_DIR, 'geelark_operator_prefs.json');

type VfxLayer = 'BACK' | 'FRONT' | 'HYBRID';
type BattlePhaseId = 'IGNITION' | 'MOMENTUM' | 'PRESSURE' | 'TENSION' | 'FINALE';
type LikeEnergyTier = 'IDLE' | 'SPARK' | 'CHARGING' | 'HYPE' | 'OVERDRIVE';
type RoundPaletteId = 'molten_gold' | 'cobalt_storm' | 'crimson_forge';
type StreamMode = 'BATTLE' | 'SOLO';
type AiMoodProfileId = 'AUTO_SMART' | 'HYPE_PARTY' | 'TACTICAL_PK' | 'CHILL_HOST';
type CameraPresetId =
  | 'STEADY_BREATH'
  | 'BASS_PUMP'
  | 'ZOOM_PUNCH'
  | 'SNIPE_CREEP'
  | 'EARTHQUAKE_SHAKE'
  | 'DUTCH_WHIP'
  | 'VACUUM_DROP';
type PresenterGestureId = 'HANDS_UP_HYPE' | 'TAP_CALLOUT_WAVE' | 'LEAN_IN_CLOSE';
type BroadcastCountryCode =
  | 'IL'
  | 'AE'
  | 'EU_UK'
  | 'US'
  | 'TR'
  | 'EG_MENA'
  | 'BR_LATAM'
  | 'AUTO_GLOBAL';

interface CountryCalibrationTelemetry {
  code: BroadcastCountryCode;
  labelHe: string;
  referenceStrongViewers: number;
  currentLiveViewers: number;
  relativeCrowdPct: number;
  dynamicSensitivityMult: number;
  effectiveJoinTrigger: number;
  effectiveComboStep: number;
  effectiveShareStreak: number;
  effectiveWhaleGiftThreshold: number;
  noteHe: string;
}

const COUNTRY_CALIB_MAP: Record<
  BroadcastCountryCode,
  {
    labelHe: string;
    refViewers: number;
    joinBatch: number;
    likeMult: number;
    comboStep: number;
    shareStreak: number;
    whalePts: number;
  }
> = {
  IL: {
    labelHe: 'ישראל (IL · קהל ממוקד)',
    refViewers: 75,
    joinBatch: 2,
    likeMult: 2.35,
    comboStep: 25,
    shareStreak: 2,
    whalePts: 299,
  },
  AE: {
    labelHe: 'אמירויות / מפרץ (AE)',
    refViewers: 220,
    joinBatch: 3,
    likeMult: 1.55,
    comboStep: 35,
    shareStreak: 2,
    whalePts: 1200,
  },
  EU_UK: {
    labelHe: 'אירופה / בריטניה (EU/UK)',
    refViewers: 350,
    joinBatch: 4,
    likeMult: 1.3,
    comboStep: 40,
    shareStreak: 3,
    whalePts: 750,
  },
  US: {
    labelHe: 'ארה״ב / קנדה (US)',
    refViewers: 900,
    joinBatch: 7,
    likeMult: 0.95,
    comboStep: 60,
    shareStreak: 4,
    whalePts: 1000,
  },
  TR: {
    labelHe: 'טורקיה (TR · זירות ענק)',
    refViewers: 1200,
    joinBatch: 9,
    likeMult: 0.82,
    comboStep: 75,
    shareStreak: 5,
    whalePts: 1300,
  },
  EG_MENA: {
    labelHe: 'מצרים / ערב (EG · 100M+)',
    refViewers: 2200,
    joinBatch: 12,
    likeMult: 0.65,
    comboStep: 90,
    shareStreak: 6,
    whalePts: 1500,
  },
  BR_LATAM: {
    labelHe: 'ברזיל / לטינו (BR · מגה-קהל)',
    refViewers: 2400,
    joinBatch: 14,
    likeMult: 0.62,
    comboStep: 100,
    shareStreak: 6,
    whalePts: 1500,
  },
  AUTO_GLOBAL: {
    labelHe: 'אוטומטי אדפטיבי חי',
    refViewers: 160,
    joinBatch: 3,
    likeMult: 1.5,
    comboStep: 35,
    shareStreak: 3,
    whalePts: 550,
  },
};

function resolveCountryCalibration(
  code: BroadcastCountryCode,
  liveViewers: number,
  detectedLangHint?: string
): CountryCalibrationTelemetry {
  let effectiveSpecKey: BroadcastCountryCode = COUNTRY_CALIB_MAP[code] ? code : 'IL';
  if (code === 'AUTO_GLOBAL' && detectedLangHint) {
    if (detectedLangHint.includes('עברית')) effectiveSpecKey = 'IL';
    else if (detectedLangHint.includes('טורקית')) effectiveSpecKey = 'TR';
    else if (detectedLangHint.includes('ערבית')) effectiveSpecKey = 'EG_MENA';
    else if (detectedLangHint.includes('ספרדית') || detectedLangHint.includes('פורטוגזית')) effectiveSpecKey = 'BR_LATAM';
    else if (detectedLangHint.includes('אנגלית')) effectiveSpecKey = 'US';
  }

  const base = COUNTRY_CALIB_MAP[effectiveSpecKey];
  const viewers = Math.max(0, Math.round(liveViewers || 0));
  const crowdRatio = viewers > 0 ? viewers / base.refViewers : 1.0;
  const relativeCrowdPct = Math.min(300, Math.max(8, Math.round(crowdRatio * 100)));

  // Smooth square-root room-size curve: smaller rooms get higher sensitivity; huge crowds tighten thresholds to prevent spam
  const roomCurve = viewers > 0 ? Math.min(2.2, Math.max(0.55, Math.sqrt(crowdRatio))) : 1.0;
  const dynamicSensitivityMult = Number(
    Math.min(3.4, Math.max(0.42, base.likeMult / roomCurve)).toFixed(2)
  );
  const effectiveJoinTrigger = Math.max(1, Math.round(base.joinBatch * roomCurve));
  const effectiveComboStep = Math.max(15, Math.round((base.comboStep * roomCurve) / 5) * 5);
  const effectiveShareStreak = Math.max(1, Math.round(base.shareStreak * Math.min(1.6, Math.max(0.7, roomCurve))));
  const effectiveWhaleGiftThreshold = Math.max(
    149,
    Math.round((base.whalePts * Math.min(1.8, Math.max(0.65, roomCurve))) / 10) * 10
  );

  const noteHe =
    viewers > 0
      ? `${base.labelHe} · ${viewers.toLocaleString()} צופים חיים (${relativeCrowdPct}% מיחס השיא במדינה): כניסה כל ${effectiveJoinTrigger} צופים, שיא קומבו כל x${effectiveComboStep}, אפקט מתנת-על מ-${effectiveWhaleGiftThreshold} נק׳`
      : `${base.labelHe} (יחס שיא: ~${base.refViewers} צופים): כניסה כל ${effectiveJoinTrigger} צופים, שיא קומבו כל x${effectiveComboStep}, אפקט מתנת-על מ-${effectiveWhaleGiftThreshold} נק׳`;

  return {
    code,
    labelHe: code === 'AUTO_GLOBAL' ? `אוטומטי חי (${base.labelHe})` : base.labelHe,
    referenceStrongViewers: base.refViewers,
    currentLiveViewers: viewers,
    relativeCrowdPct,
    dynamicSensitivityMult,
    effectiveJoinTrigger,
    effectiveComboStep,
    effectiveShareStreak,
    effectiveWhaleGiftThreshold,
    noteHe,
  };
}

interface EffectRule {
  id: string;
  cooldownMs: number;
  priority: number;
  durationMs: number;
  layer: VfxLayer;
}

const EFFECT_RULES: Record<string, EffectRule> = {
  AMB_VOLUMETRIC_SMOKE: { id: 'AMB_VOLUMETRIC_SMOKE', cooldownMs: 0, priority: 1, durationMs: 10000, layer: 'BACK' },
  LIKE_PROGRESSIVE_CHARGE: { id: 'LIKE_PROGRESSIVE_CHARGE', cooldownMs: 0, priority: 4, durationMs: 6000, layer: 'BACK' },
  SHARE_CO2_CANNONS: { id: 'SHARE_CO2_CANNONS', cooldownMs: 3200, priority: 7, durationMs: 2800, layer: 'FRONT' },
  SHARE_SMOKE_PLUMES: { id: 'SHARE_SMOKE_PLUMES', cooldownMs: 5500, priority: 6, durationMs: 3500, layer: 'BACK' },
  FOLLOW_GOLDEN_SPARKS: { id: 'FOLLOW_GOLDEN_SPARKS', cooldownMs: 2800, priority: 6, durationMs: 3600, layer: 'FRONT' },
  JOIN_ANAMORPHIC_SWEEP: { id: 'JOIN_ANAMORPHIC_SWEEP', cooldownMs: 6000, priority: 3, durationMs: 2500, layer: 'BACK' },
  CHAT_TESLA_FILAMENT: { id: 'CHAT_TESLA_FILAMENT', cooldownMs: 4000, priority: 3, durationMs: 1800, layer: 'BACK' },
  GOAL_SHOCKWAVE_RING: { id: 'GOAL_SHOCKWAVE_RING', cooldownMs: 12000, priority: 9, durationMs: 3200, layer: 'HYBRID' },
  PRESSURE_FORKED_LIGHTNING: { id: 'PRESSURE_FORKED_LIGHTNING', cooldownMs: 9000, priority: 8, durationMs: 2400, layer: 'BACK' },
  TENSION_EMBER_VORTEX: { id: 'TENSION_EMBER_VORTEX', cooldownMs: 0, priority: 5, durationMs: 8000, layer: 'BACK' },
  FINALE_PYRO_CONVERGENCE: { id: 'FINALE_PYRO_CONVERGENCE', cooldownMs: 25000, priority: 10, durationMs: 15000, layer: 'HYBRID' },
  GLOVE_POWER_SURGE: { id: 'GLOVE_POWER_SURGE', cooldownMs: 8000, priority: 9, durationMs: 5500, layer: 'HYBRID' },
  SNIPE_CRITICAL_FLASH: { id: 'SNIPE_CRITICAL_FLASH', cooldownMs: 4500, priority: 10, durationMs: 3200, layer: 'HYBRID' },
  SOLO_WARM_LOUNGE: { id: 'SOLO_WARM_LOUNGE', cooldownMs: 5000, priority: 4, durationMs: 8000, layer: 'BACK' },
  VID_01_FIREBALL_SNIPE_BLAST: { id: 'VID_01_FIREBALL_SNIPE_BLAST', cooldownMs: 7500, priority: 10, durationMs: 9200, layer: 'BACK' },
  VID_02_CRYO_CO2_CANNONS: { id: 'VID_02_CRYO_CO2_CANNONS', cooldownMs: 3800, priority: 8, durationMs: 8600, layer: 'FRONT' },
  VID_03_TWIN_LIGHTNING_ARCS: { id: 'VID_03_TWIN_LIGHTNING_ARCS', cooldownMs: 5500, priority: 8, durationMs: 9400, layer: 'FRONT' },
  VID_04_COLD_SPARK_FOUNTAINS: { id: 'VID_04_COLD_SPARK_FOUNTAINS', cooldownMs: 4200, priority: 7, durationMs: 9000, layer: 'FRONT' },
  VID_05_PK_FACTION_SMOKE_CLASH: { id: 'VID_05_PK_FACTION_SMOKE_CLASH', cooldownMs: 9000, priority: 8, durationMs: 9200, layer: 'BACK' },
  VID_06_PLASMA_SPARK_SURGE: { id: 'VID_06_PLASMA_SPARK_SURGE', cooldownMs: 6500, priority: 9, durationMs: 9200, layer: 'FRONT' },
  VID_07_QUAD_PYRO_FLAME_JETS: { id: 'VID_07_QUAD_PYRO_FLAME_JETS', cooldownMs: 10000, priority: 10, durationMs: 8800, layer: 'BACK' },
  BEAST_08_VIOLET_PHOENIX: { id: 'BEAST_08_VIOLET_PHOENIX', cooldownMs: 8500, priority: 9, durationMs: 8200, layer: 'BACK' },
  BEAST_09_SOLAR_TIGER: { id: 'BEAST_09_SOLAR_TIGER', cooldownMs: 9000, priority: 9, durationMs: 7600, layer: 'BACK' },
  BEAST_10_ROYAL_FIRE_LION: { id: 'BEAST_10_ROYAL_FIRE_LION', cooldownMs: 9500, priority: 10, durationMs: 7800, layer: 'BACK' },
};

const VALID_MUSIC_IDS = new Set([
  'MUS_SOLO_VELVET_LOFI',
  'MUS_SOLO_WARM_HOUSE',
  'MUS_BATTLE_IGNITION_PULSE',
  'MUS_BATTLE_MOMENTUM_DRIVE',
  'MUS_BATTLE_PRESSURE_TRAP',
  'MUS_GLOVE_OVERCLOCK',
  'MUS_SNIPE_TENSION_CLOCK',
  'MUS_VICTORY_EUPHORIA',
]);

const VALID_SOUND_IDS = new Set([
  'SND_SNIPE_LOCK',
  'SND_GLOVE_POWERUP',
  'SND_LEAD_TAKEN',
  'SND_LEAD_LOST_TENSION',
  'SND_FINAL_10S_HEARTBEAT',
  'SND_ENERGY_WAKEUP_SWEEP',
  'SND_HYPE_STADIUM_CHEER',
  'SND_CINEMATIC_BRAAM',
  'SND_TAP_DOPAMINE_PULSE',
  'SND_COMBO_MILESTONE',
  ...Object.keys(EFFECT_RULES),
]);

const VALID_CAMERA_PRESETS = new Set<CameraPresetId>([
  'STEADY_BREATH',
  'BASS_PUMP',
  'ZOOM_PUNCH',
  'SNIPE_CREEP',
  'EARTHQUAKE_SHAKE',
  'DUTCH_WHIP',
  'VACUUM_DROP',
]);

const PALETTE_ORDER: RoundPaletteId[] = ['molten_gold', 'cobalt_storm', 'crimson_forge'];

interface ActiveEffectInstance {
  instanceId: string;
  effectId: string;
  triggeredAt: number;
  durationMs: number;
  layer: VfxLayer;
  intensity: number;
  sourceLabel: string;
}

interface CameraKineticEvent {
  id: string;
  preset: CameraPresetId;
  intensity: number;
  durationMs: number;
  triggeredAt: number;
  reasonHe: string;
}

interface LiveEventLogItem {
  id: string;
  timestamp: number;
  battleTimeSec: number;
  eventType: string;
  userLabel: string;
  triggeredEffectId: string | null;
  status: 'TRIGGERED' | 'COOLDOWN_SKIPPED' | 'ACCUMULATED' | 'BLOCKED' | 'FAILED';
  detailHe: string;
}

interface AiDirectorDecision {
  id: string;
  timestamp: number;
  expiresAt?: number | null;
  streamMode: StreamMode;
  detectedSituationHe: string;
  tensionScore: number;
  energyScore: number;
  actionsTakenHe: string[];
  musicTrackId?: string | null;
  soundCueId?: string | null;
  vfxId?: string | null;
  approvalStatus?: DecisionApprovalStatus;
  councilApproved?: boolean;
  decidedBy?: 'OPENAI_CLAUDE_COUNCIL' | 'OPENAI_CLAUDE_GEMINI' | 'DETERMINISTIC' | 'MANUAL' | 'GEMINI';
  approvedAt?: number | null;
  approvedBy?: string | null;
  executedAt?: number | null;
  plannedPayload?: PlannedExecutionPayload | null;
  openAiPlan?: StructuredDirectorPlan | null;
  claudeInspection?: ClaudeInspectionResult | null;
  pipelineTrace?: PipelineStageLog[];
}

interface LearnedCreatorProfile {
  username: string;
  displayName: string;
  region: string;
  avatarUrl?: string;
  strengthScore: number;
  tikleapRank?: number | null;
  isLiveNow?: boolean;
  battleStyleHe: string;
  snipeTendencyHe: string;
  gloveStrategyHe: string;
  counterTacticHe: string;
  observedChatSamples: string[];
  lastUpdatedTs: number;
  recommendedVfxId?: string;
  recommendedCamera?: CameraPresetId;
  recommendedSoundId?: string;
  recommendedMusicId?: string;
  recommendedTapCallout?: string;
  appliedTimesCount?: number;
}

interface SetupEnergyRule {
  id: string;
  titleHe: string;
  sourceLabelHe: string;
  triggerConditionHe: string;
  aiActionDirectiveEn: string;
  active: boolean;
  approved?: boolean;
  status?: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  version?: number;
  approvedAt?: number | null;
  approvedBy?: string | null;
  effectivenessScore: number;
  recommendedVfxId?: string;
  recommendedCamera?: CameraPresetId;
  recommendedSoundId?: string;
  recommendedTapCallout?: string;
  appliedTimesCount?: number;
}

interface CueEffectivenessStat {
  cueId: string;
  labelHe: string;
  timesTriggered: number;
  avgLpsBoost: number;
  lastUsedTs: number;
}

interface WatchedCreatorEntry {
  username: string;
  displayName: string;
  addedAtTs: number;
  autoWatchEnabled: boolean;
  autoLearnEnabled: boolean;
  notesHe: string;
  isLiveNow: boolean;
  currentlyConnected: boolean;
  lastCheckedTs: number;
  lastLiveSeenTs: number | null;
  lastLearnedTs: number | null;
  sessionsLearnedCount: number;
  detectedLanguage: string;
}

interface SwarmFeedEvent {
  id: string;
  ts: number;
  username: string;
  kind: 'CHAT' | 'GIFT' | 'LIKE_SURGE' | 'BATTLE_PK' | 'GLOVE_CARD' | 'PARTY_ENV' | 'JOIN_SHARE' | 'CAPTION';
  summary: string;
  languageTag?: string;
}

interface MonitoredLiveRoomSummary {
  username: string;
  roomId: string | null;
  connected: boolean;
  connecting: boolean;
  mirrorToStage: boolean;
  viewerCount: number;
  peakViewers: number;
  likesPerSec: number;
  totalLikes: number;
  chatCount: number;
  giftsCount: number;
  diamondsCount: number;
  sharesCount: number;
  followsCount: number;
  joinsCount: number;
  detectedLanguage: string;
  energyScore: number;
  partyVibeHe: string;
  inBattle: boolean;
  opponentUsername: string | null;
  hostBattlePoints: number;
  opponentBattlePoints: number;
  activeCardOrGloveHe: string | null;
  recentEvents: SwarmFeedEvent[];
  lastErrorHe: string | null;
  connectedSinceTs: number;
}

interface DiscoveredStageTool {
  id: string;
  nameHe: string;
  sourceLabelHe: string;
  whyNeededHe: string;
  howItWorksHe: string;
  triggerConditionHe: string;
  autoEnabled: boolean;
  approved?: boolean;
  status?: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  version?: number;
  approvedAt?: number | null;
  approvedBy?: string | null;
  recommendedVfxId: string;
  recommendedCamera: CameraPresetId;
  recommendedSoundId: string;
  recommendedMusicId?: string;
  recommendedTapCallout: string;
  usageCount: number;
  createdAtTs: number;
}

type LearningMaterialKind = 'VIDEO' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'NOTE';

interface LearningVaultItem {
  id: string;
  fileName: string;
  storedFileName: string;
  kind: LearningMaterialKind;
  mimeType: string;
  sizeBytes: number;
  uploadedAtTs: number;
  overviewHe: string;
  breakdownPartsHe: string[];
  conclusionsHe: string[];
  generatedRuleTitleHe: string;
  generatedToolNameHe: string;
  recommendedVfxId: string;
  recommendedCamera: CameraPresetId;
  recommendedSoundId: string;
  recommendedMusicId?: string;
  recommendedTapCallout: string;
  appliedTimesCount: number;
}

interface PersistentMemoryData {
  totalRoundsAnalyzed: number;
  oauthConnectedUser: {
    openId: string;
    displayName: string;
    avatarUrl?: string;
  } | null;
  watchedCreators: WatchedCreatorEntry[];
  learnedCreators: LearnedCreatorProfile[];
  energyRules: SetupEnergyRule[];
  discoveredTools: DiscoveredStageTool[];
  learningVaultItems: LearningVaultItem[];
  cueStats: CueEffectivenessStat[];
}

function inferStageComboFromText(
  text: string,
  seedKey = ''
): {
  recommendedVfxId: string;
  recommendedCamera: CameraPresetId;
  recommendedSoundId: string;
  recommendedMusicId: string;
  recommendedTapCallout: string;
} {
  const lower = `${text} ${seedKey}`.toLowerCase();
  if (/סנייפ|snipe|lion|אריה|הכרעה|03:/.test(lower)) {
    return {
      recommendedVfxId: 'BEAST_10_ROYAL_FIRE_LION',
      recommendedCamera: 'EARTHQUAKE_SHAKE',
      recommendedSoundId: 'SND_SNIPE_LOCK',
      recommendedMusicId: 'MUS_SNIPE_TENSION_CLOCK',
      recommendedTapCallout: 'SNIPE POWER — TAP!',
    };
  }
  if (/כפפה|glove|x5|טיגריס|tiger|קומבו/.test(lower)) {
    return {
      recommendedVfxId: 'BEAST_09_SOLAR_TIGER',
      recommendedCamera: 'ZOOM_PUNCH',
      recommendedSoundId: 'SND_GLOVE_POWERUP',
      recommendedMusicId: 'MUS_GLOVE_OVERCLOCK',
      recommendedTapCallout: 'GLOVE x5 — TAP NOW!',
    };
  }
  if (/מהפך|יתרון|comeback|phoenix|פניקס|vacuum|וואקום/.test(lower)) {
    return {
      recommendedVfxId: 'BEAST_08_VIOLET_PHOENIX',
      recommendedCamera: 'DUTCH_WHIP',
      recommendedSoundId: 'SND_LEAD_TAKEN',
      recommendedMusicId: 'MUS_BATTLE_PRESSURE_TRAP',
      recommendedTapCallout: 'COMEBACK PUSH — TAP!',
    };
  }
  return {
    recommendedVfxId: 'VID_02_CRYO_CO2_CANNONS',
    recommendedCamera: 'ZOOM_PUNCH',
    recommendedSoundId: 'SND_HYPE_STADIUM_CHEER',
    recommendedMusicId: 'MUS_BATTLE_MOMENTUM_DRIVE',
    recommendedTapCallout: 'PARTY HYPE — DOUBLE TAP!',
  };
}

const REQUIRED_SEED_WATCHLIST: Array<{ username: string; displayName: string; notesHe: string; lang: string }> = [
  {
    username: 'zainabmamdouh35',
    displayName: 'zainabmamdouh35',
    notesHe: 'יוצרת במעקב רציף 24/7 — האזנה לאנרגיה, צ׳אט, מסיבה מסביב וקרבות ללא תלות בשפה',
    lang: 'AR/GLOBAL',
  },
  {
    username: 'sanya.mar',
    displayName: 'sanya.mar',
    notesHe: 'יוצר/ת במעקב רציף 24/7 — חיבור אוטומטי ולמידת אנרגיה בכל פעם שעולה לשידור חי',
    lang: 'GLOBAL',
  },
  {
    username: 'khaledashur',
    displayName: 'khaled ashur',
    notesHe: 'מדורג מוביל בקרבות PK — מעקב תזמון כפפות וסנייפים',
    lang: 'AR/HE',
  },
  {
    username: 'corriewyse',
    displayName: 'CFIZZLE',
    notesHe: 'מדורג #1 US — מעקב בניית הייפ קהילתי וקצב מתנות',
    lang: 'EN',
  },
];

const DEFAULT_MEMORY_DATA: PersistentMemoryData = {
  totalRoundsAnalyzed: 12,
  oauthConnectedUser: null,
  watchedCreators: REQUIRED_SEED_WATCHLIST.map((item, idx) => ({
    username: item.username,
    displayName: item.displayName,
    addedAtTs: Date.now() - idx * 60000,
    autoWatchEnabled: true,
    autoLearnEnabled: true,
    notesHe: item.notesHe,
    isLiveNow: false,
    currentlyConnected: false,
    lastCheckedTs: 0,
    lastLiveSeenTs: null,
    lastLearnedTs: null,
    sessionsLearnedCount: 0,
    detectedLanguage: item.lang,
  })),
  learnedCreators: [
    {
      username: 'zainabmamdouh35',
      displayName: 'zainabmamdouh35',
      region: 'MENA/GLOBAL',
      strengthScore: 91,
      tikleapRank: null,
      isLiveNow: false,
      battleStyleHe: 'אנרגיית אירוח גבוהה ודינמיקת מסיבה בצ׳אט עם תגובות רגשיות מהירות שמדליקות שיתופים ומתנות.',
      snipeTendencyHe: 'גיוס קהל אינטנסיבי בדקה האחרונה עם קריאות תמיכה קצביות ברצף.',
      gloveStrategyHe: 'שימוש בכפפה בשיא מעורבות הצ׳אט להכפלת מומנטום מתנות.',
      counterTacticHe: 'שמור על קצב גירוי טאפ רציף בצידי המסך והפעל זום-פאנץ׳ בכל קפיצת אנרגיה.',
      observedChatSamples: ['🔥🔥🔥', 'يلا كبسو يا جماعة!'],
      lastUpdatedTs: Date.now() - 1800000,
      recommendedVfxId: 'VID_02_CRYO_CO2_CANNONS',
      recommendedCamera: 'ZOOM_PUNCH',
      recommendedSoundId: 'SND_HYPE_STADIUM_CHEER',
      recommendedMusicId: 'MUS_BATTLE_MOMENTUM_DRIVE',
      recommendedTapCallout: 'YALLA DOUBLE TAP!',
      appliedTimesCount: 3,
    },
    {
      username: 'sanya.mar',
      displayName: 'sanya.mar',
      region: 'GLOBAL',
      strengthScore: 92,
      tikleapRank: null,
      isLiveNow: false,
      battleStyleHe: 'שליטה בקצב החדר ובניית מתח הדרגתי מול הצופים עם מעברים חדים בין שיחה להתפרצות קרב.',
      snipeTendencyHe: 'שמירת מומנטום שקט לפני מתקפת נקודות מרוכזת ב-20 השניות האחרונות.',
      gloveStrategyHe: 'פתיחת כפפת בוסט מתוזמנת מול גל כניסת צופים ומעורבות צ׳אט.',
      counterTacticHe: 'הפעל VACUUM_DROP לפני חלון ההכרעה ושלב תותחי CO₂ ופניקס סגול במהפך יתרון.',
      observedChatSamples: ['🚀🚀🚀', 'TAP TAP GO!'],
      lastUpdatedTs: Date.now() - 1500000,
      recommendedVfxId: 'BEAST_08_VIOLET_PHOENIX',
      recommendedCamera: 'VACUUM_DROP',
      recommendedSoundId: 'SND_LEAD_TAKEN',
      recommendedMusicId: 'MUS_BATTLE_PRESSURE_TRAP',
      recommendedTapCallout: 'PUSH THE COMEBACK!',
      appliedTimesCount: 2,
    },
    {
      username: 'khaledashur',
      displayName: 'khaled ashur',
      region: 'IL',
      strengthScore: 95,
      tikleapRank: 1,
      isLiveNow: false,
      battleStyleHe: 'קצב דיבור מהיר עם קריאות טאפ-טאפ אגרסיביות בדקה הראשונה ושמירת תומכים כבדים לסנייפ.',
      snipeTendencyHe: 'סנייפ כבד ב-8 השניות האחרונות (03:52–03:59) בשילוב ערפל או כפפה מאוחרת.',
      gloveStrategyHe: 'פותח כפפה ראשונה סביב 01:30 לבדיקת תגובת היריב וכפפה שנייה ב-03:25.',
      counterTacticHe: 'אל תחשוף את כל הנקודות ב-02:30; הפעל סנייפ נגד עם אריה אש מלכותי וכדור אש ב-03:45.',
      observedChatSamples: ['כולם דאבל טאפ על המסך!', 'לשמור לסנייפ בסוף לא לזרוק עכשיו!'],
      lastUpdatedTs: Date.now() - 3600000,
      recommendedVfxId: 'BEAST_10_ROYAL_FIRE_LION',
      recommendedCamera: 'EARTHQUAKE_SHAKE',
      recommendedSoundId: 'SND_SNIPE_LOCK',
      recommendedMusicId: 'MUS_SNIPE_TENSION_CLOCK',
      recommendedTapCallout: 'SNIPE LOCK — TAP!',
      appliedTimesCount: 4,
    },
    {
      username: 'corriewyse',
      displayName: 'CFIZZLE',
      region: 'US',
      strengthScore: 96,
      tikleapRank: 1,
      isLiveNow: false,
      battleStyleHe: 'בניית הייפ קהילתי מתואם עם מוזיקת בס כבדה ותגובות מצלמה קופצניות לכל גל שיתופים.',
      snipeTendencyHe: 'תיאום קבוצתי בצ׳אט 20 שניות לסיום להעמסת מתנות גדולות במקביל.',
      gloveStrategyHe: 'שימוש בכפפה מיד לאחר השלמת יעד לייקים קהילתי להכפלת המומנטום.',
      counterTacticHe: 'הפעל כפפה עם טיגריס אש שואג וזרמי פלזמה + זום-פאנץ׳ קצבי להובלת מורל.',
      observedChatSamples: ['TAP TAP TAP TEAM!', 'GLOVE READY ON GO!'],
      lastUpdatedTs: Date.now() - 7200000,
      recommendedVfxId: 'BEAST_09_SOLAR_TIGER',
      recommendedCamera: 'ZOOM_PUNCH',
      recommendedSoundId: 'SND_GLOVE_POWERUP',
      recommendedMusicId: 'MUS_GLOVE_OVERCLOCK',
      recommendedTapCallout: 'GLOVE x5 TEAM TAP!',
      appliedTimesCount: 5,
    },
  ],
  energyRules: [
    {
      id: 'rule_tap_dopamine',
      titleHe: 'לולאת דופמין לאצבע (Tap-Tap Pacemaker)',
      sourceLabelHe: 'ניתוח סאטפים ויראליים ב-PK',
      triggerConditionHe: 'כשקצב הלייקים יורד מתחת ל-6/שנ׳ או בתחילת כפפה x5',
      aiActionDirectiveEn:
        'When likesPerSecond < 6 or Glove x5 starts, call triggerTapStimulus and BASS_PUMP camera to visually reward thumb tapping on the outer edges.',
      active: true,
      approved: true,
      status: 'APPROVED',
      version: 1,
      approvedAt: Date.now() - 3600000,
      approvedBy: 'BOOSTERA_CORE',
      effectivenessScore: 94,
      recommendedVfxId: 'VID_06_PLASMA_SPARK_SURGE',
      recommendedCamera: 'BASS_PUMP',
      recommendedSoundId: 'SND_TAP_DOPAMINE_PULSE',
      recommendedTapCallout: 'DOUBLE TAP x5!',
      appliedTimesCount: 7,
    },
    {
      id: 'rule_vacuum_contrast',
      titleHe: 'חוק הוואקום לפני פיצוץ (2.5s Contrast Drop)',
      sourceLabelHe: 'פסיכולוגיית היפנוט צופים בקרב',
      triggerConditionHe: 'לפני כניסה לחלון סנייפ (03:25) או רגע הכרעה צמוד',
      aiActionDirectiveEn:
        'Before climax or snipe window, use VACUUM_DROP or SNIPE_CREEP camera preset to narrow focus onto the presenter before firing EARTHQUAKE_SHAKE on impact.',
      active: true,
      approved: true,
      status: 'APPROVED',
      version: 1,
      approvedAt: Date.now() - 3600000,
      approvedBy: 'BOOSTERA_CORE',
      effectivenessScore: 91,
      recommendedVfxId: 'VID_01_FIREBALL_SNIPE_BLAST',
      recommendedCamera: 'VACUUM_DROP',
      recommendedSoundId: 'SND_CINEMATIC_BRAAM',
      recommendedTapCallout: 'HOLD FOR DROP!',
      appliedTimesCount: 4,
    },
    {
      id: 'rule_wave_90s',
      titleHe: 'גלי אנרגיה של 60–90 שניות (מניעת עייפות צופה)',
      sourceLabelHe: 'מחקר שימור צופים בשידור ארוך',
      triggerConditionHe: 'לאחר דקה של עומס גבוה — רווח נשימה של 12 שניות ואז זינוק חד',
      aiActionDirectiveEn:
        'Alternate intense kinetic shakes with clean breathing windows so viewers never habituate to constant explosions.',
      active: true,
      approved: true,
      status: 'APPROVED',
      version: 1,
      approvedAt: Date.now() - 3600000,
      approvedBy: 'BOOSTERA_CORE',
      effectivenessScore: 89,
      recommendedVfxId: 'VID_04_COLD_SPARK_FOUNTAINS',
      recommendedCamera: 'ZOOM_PUNCH',
      recommendedSoundId: 'SND_ENERGY_WAKEUP_SWEEP',
      recommendedTapCallout: 'WAKE UP THE ROOM!',
      appliedTimesCount: 3,
    },
    {
      id: 'rule_snipe_decoy',
      titleHe: 'דריכת הגנת סנייפ שקטה מול יריב חזק',
      sourceLabelHe: 'למידת באטלים ברמה גבוהה',
      triggerConditionHe: '30 שניות לסיום כשהפער קטן מ-1,500 נקודות',
      aiActionDirectiveEn:
        'In the final 30s with tight score, combine MUS_SNIPE_TENSION_CLOCK + SND_FINAL_10S_HEARTBEAT + SNIPE_CREEP zoom.',
      active: true,
      approved: true,
      status: 'APPROVED',
      version: 1,
      approvedAt: Date.now() - 3600000,
      approvedBy: 'BOOSTERA_CORE',
      effectivenessScore: 96,
      recommendedVfxId: 'BEAST_10_ROYAL_FIRE_LION',
      recommendedCamera: 'SNIPE_CREEP',
      recommendedSoundId: 'SND_FINAL_10S_HEARTBEAT',
      recommendedTapCallout: 'DEFEND THE SNIPE!',
      appliedTimesCount: 6,
    },
  ],
  discoveredTools: [
    {
      id: 'tool_party_wave_pacemaker',
      nameHe: 'קוצב גלי מסיבה ודאבל-טאפ דו-שלבי',
      sourceLabelHe: 'הוסק מהאזנה ל-@zainabmamdouh35',
      whyNeededHe: 'בשידורי אירוח אנרגטיים הקהל מתעייף מקריאת טאפ אחידה — צריך כלי שמזהה הצתת צ׳אט ומשגר מכת CO₂ עם זום-פאנץ׳ וגירוי אצבע מתגמל.',
      howItWorksHe: 'משלב תותחי CO₂ קדמיים + זום-פאנץ׳ + גל התלהבות קהל וטבעת טאפ היקפית למשך 10 שניות.',
      triggerConditionHe: 'קפיצת צ׳אט/אימוג׳ים או פתיחת גל שיתופים בחדר',
      autoEnabled: true,
      approved: true,
      status: 'APPROVED',
      version: 1,
      approvedAt: Date.now() - 3600000,
      approvedBy: 'BOOSTERA_CORE',
      recommendedVfxId: 'VID_02_CRYO_CO2_CANNONS',
      recommendedCamera: 'ZOOM_PUNCH',
      recommendedSoundId: 'SND_HYPE_STADIUM_CHEER',
      recommendedMusicId: 'MUS_BATTLE_MOMENTUM_DRIVE',
      recommendedTapCallout: 'YALLA DOUBLE TAP!',
      usageCount: 4,
      createdAtTs: Date.now() - 3200000,
    },
    {
      id: 'tool_vacuum_comeback_slingshot',
      nameHe: 'מקפצת וואקום למהפך יתרון (Comeback Slingshot)',
      sourceLabelHe: 'הוסק מהאזנה ל-@sanya.mar',
      whyNeededHe: 'כשנוצר פיגור באמצע קרב, רעש רציף מאבד אפקט — ה-AI זיהה שצריך כלי של שאיבת וואקום קצרה ואז התפרצות פניקס סגול.',
      howItWorksHe: 'מושך את המצלמה ב-VACUUM_DROP, משמיע קריאת מהפך ומשגר את פניקס האנרגיה הסגול מאחורי המגיש.',
      triggerConditionHe: 'פיגור הפיך של 300–1,800 נקודות בדקות 2–3',
      autoEnabled: true,
      approved: true,
      status: 'APPROVED',
      version: 1,
      approvedAt: Date.now() - 3600000,
      approvedBy: 'BOOSTERA_CORE',
      recommendedVfxId: 'BEAST_08_VIOLET_PHOENIX',
      recommendedCamera: 'VACUUM_DROP',
      recommendedSoundId: 'SND_LEAD_TAKEN',
      recommendedMusicId: 'MUS_BATTLE_PRESSURE_TRAP',
      recommendedTapCallout: 'PUSH THE COMEBACK!',
      usageCount: 3,
      createdAtTs: Date.now() - 2600000,
    },
    {
      id: 'tool_silent_whale_snipe_shield',
      nameHe: 'מגן אנטי-סנייפ מול תומכים שקטים (8s Shield)',
      sourceLabelHe: 'הוסק מהאזנה ל-@khaledashur',
      whyNeededHe: 'יריבים מנוסים שומרים תומכים שקטים ל-8 השניות האחרונות — ה-AI הבין שנדרש כלי דריכת הגנה מוקדמת ב-03:45.',
      howItWorksHe: 'מפעיל שעון סנייפ 150BPM + נעילת סנייפ + אריה אש מלכותי בגרין-סקרין ורעידת אדמה במצלמה.',
      triggerConditionHe: 'כניסה ל-20 השניות האחרונות בקרב צמוד',
      autoEnabled: true,
      approved: true,
      status: 'APPROVED',
      version: 1,
      approvedAt: Date.now() - 3600000,
      approvedBy: 'BOOSTERA_CORE',
      recommendedVfxId: 'BEAST_10_ROYAL_FIRE_LION',
      recommendedCamera: 'EARTHQUAKE_SHAKE',
      recommendedSoundId: 'SND_SNIPE_LOCK',
      recommendedMusicId: 'MUS_SNIPE_TENSION_CLOCK',
      recommendedTapCallout: 'SNIPE SHIELD — TAP!',
      usageCount: 5,
      createdAtTs: Date.now() - 2100000,
    },
    {
      id: 'tool_glove_x5_overdrive_sync',
      nameHe: 'מאיץ סנכרון כפפה x5 קהילתי',
      sourceLabelHe: 'הוסק מהאזנה ל-@corriewyse',
      whyNeededHe: 'כפפת x5 מבוזבזת אם הקהל לא מוכן ב-3 השניות הראשונות — הכלי מסנכרן מיד קול, טיגריס אש שואג וטאפים.',
      howItWorksHe: 'משגר טיגריס אש שואג בכתר העליון + טורבינת כפפה + מוזיקת 145BPM וגירוי אצבע x5.',
      triggerConditionHe: 'ברגע זיהוי פתיחת כפפה x5 או רצף קומבו x100',
      autoEnabled: true,
      approved: true,
      status: 'APPROVED',
      version: 1,
      approvedAt: Date.now() - 3600000,
      approvedBy: 'BOOSTERA_CORE',
      recommendedVfxId: 'BEAST_09_SOLAR_TIGER',
      recommendedCamera: 'ZOOM_PUNCH',
      recommendedSoundId: 'SND_GLOVE_POWERUP',
      recommendedMusicId: 'MUS_GLOVE_OVERCLOCK',
      recommendedTapCallout: 'GLOVE x5 TEAM TAP!',
      usageCount: 6,
      createdAtTs: Date.now() - 1800000,
    },
  ],
  learningVaultItems: [
    {
      id: 'vault_seed_pk_hypnosis_playbook',
      fileName: 'מדריך_אנרגיית_באטלים_וסנייפים_גלובלי.md',
      storedFileName: 'seed_pk_hypnosis_playbook.md',
      kind: 'DOCUMENT',
      mimeType: 'text/markdown',
      sizeBytes: 3480,
      uploadedAtTs: Date.now() - 3600000,
      overviewHe: 'מסמך יסוד שפורק בתיקיית הלמידה: ממפה 4 שלבי היפנוט צופים בקרב 4 דקות (פתיחה מסתורית, בניית קומבו טאפים, שקט מכוון לפני כפפה, והכרעת סנייפ ב-15 שניות אחרונות).',
      breakdownPartsHe: [
        'חלק 1 (00:00–00:55): בניית סקרנות עם עשן אחורי ותאורה נקייה על הפנים בלי להעמיס פיצוצים מוקדמים.',
        'חלק 2 (01:00–02:30): הפעלת קוצב דאבל-טאפ בצידי המסך בכל פעם שקצב הלחיצות יורד מתחת ל-6 לשנייה.',
        'חלק 3 (02:30–03:35): יצירת וואקום דרמטי של 2.5 שניות לפני פתיחת כפפה x5 להכפלת אפקט ההפתעה.',
        'חלק 4 (03:40–04:00): שילוב אריה אש מלכותי / כדור אש עם דופק לב 10 שניות ורעידת מצלמה מבוקרת.',
      ],
      conclusionsHe: [
        'ניגודיות בין שקט קצר להתפרצות מגדילה הישארות צופים פי 2 מאפקטים רצופים ללא הפסקה.',
        'חיות גרין-סקרין בחלק העליון (מעל הראש) שומרות על הפנים של המגיש נקיות ב-9:16.',
      ],
      generatedRuleTitleHe: 'חוק הוואקום לפני פיצוץ (2.5s Contrast Drop)',
      generatedToolNameHe: 'מגן אנטי-סנייפ מול תומכים שקטים (8s Shield)',
      recommendedVfxId: 'BEAST_10_ROYAL_FIRE_LION',
      recommendedCamera: 'EARTHQUAKE_SHAKE',
      recommendedSoundId: 'SND_SNIPE_LOCK',
      recommendedMusicId: 'MUS_SNIPE_TENSION_CLOCK',
      recommendedTapCallout: 'FINAL SNIPE — TAP!',
      appliedTimesCount: 2,
    },
  ],
  cueStats: [
    { cueId: 'GLOVE_POWER_SURGE', labelHe: 'כפפת בוסט x5 + זום-פאנץ׳', timesTriggered: 18, avgLpsBoost: 14.6, lastUsedTs: Date.now() - 50000 },
    { cueId: 'TAP_DOPAMINE_STIMULUS', labelHe: 'גירוי אצבע ללחיצה (Tap Stimulus)', timesTriggered: 27, avgLpsBoost: 11.8, lastUsedTs: Date.now() - 35000 },
    { cueId: 'SNIPE_CRITICAL_FLASH', labelHe: 'הבזק סנייפ + רעידת מסך', timesTriggered: 14, avgLpsBoost: 16.2, lastUsedTs: Date.now() - 80000 },
    { cueId: 'SHARE_CO2_CANNONS', labelHe: 'תותחי CO₂ בשיתוף', timesTriggered: 34, avgLpsBoost: 8.4, lastUsedTs: Date.now() - 25000 },
  ],
};

const SEED_APPROVED_RULE_IDS = new Set([
  'rule_tap_dopamine',
  'rule_vacuum_contrast',
  'rule_wave_90s',
  'rule_snipe_decoy',
]);

const SEED_APPROVED_TOOL_IDS = new Set([
  'tool_party_wave_pacemaker',
  'tool_vacuum_comeback_slingshot',
  'tool_silent_whale_snipe_shield',
  'tool_glove_x5_overdrive_sync',
]);

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LEARNING_VAULT_DIR)) {
    fs.mkdirSync(LEARNING_VAULT_DIR, { recursive: true });
  }
  if (!fs.existsSync(GENERATED_VIDEO_DIR)) {
    fs.mkdirSync(GENERATED_VIDEO_DIR, { recursive: true });
  }
}

function loadMemory(): PersistentMemoryData {
  let loaded: PersistentMemoryData = { ...DEFAULT_MEMORY_DATA };
  try {
    ensureDataDir();
    if (fs.existsSync(MEMORY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
      loaded = {
        ...DEFAULT_MEMORY_DATA,
        ...parsed,
        watchedCreators: Array.isArray(parsed.watchedCreators)
          ? parsed.watchedCreators
          : [...DEFAULT_MEMORY_DATA.watchedCreators],
        discoveredTools: Array.isArray(parsed.discoveredTools)
          ? parsed.discoveredTools
          : [...DEFAULT_MEMORY_DATA.discoveredTools],
        learningVaultItems: Array.isArray(parsed.learningVaultItems)
          ? parsed.learningVaultItems
          : [...DEFAULT_MEMORY_DATA.learningVaultItems],
      };
    }
  } catch {
    loaded = { ...DEFAULT_MEMORY_DATA };
  }

  let mutated = false;
  for (const reqCreator of REQUIRED_SEED_WATCHLIST) {
    const exists = loaded.watchedCreators.some(
      (w) => w.username.toLowerCase() === reqCreator.username.toLowerCase()
    );
    if (!exists) {
      loaded.watchedCreators.unshift({
        username: reqCreator.username,
        displayName: reqCreator.displayName,
        addedAtTs: Date.now(),
        autoWatchEnabled: true,
        autoLearnEnabled: true,
        notesHe: reqCreator.notesHe,
        isLiveNow: false,
        currentlyConnected: false,
        lastCheckedTs: 0,
        lastLiveSeenTs: null,
        lastLearnedTs: null,
        sessionsLearnedCount: 0,
        detectedLanguage: reqCreator.lang,
      });
      mutated = true;
    }
  }
  for (const defProfile of DEFAULT_MEMORY_DATA.learnedCreators) {
    if (!loaded.learnedCreators.some((c) => c.username.toLowerCase() === defProfile.username.toLowerCase())) {
      loaded.learnedCreators.push(defProfile);
      mutated = true;
    }
  }
  for (const defTool of DEFAULT_MEMORY_DATA.discoveredTools) {
    if (!loaded.discoveredTools.some((t) => t.id === defTool.id)) {
      loaded.discoveredTools.push(defTool);
      mutated = true;
    }
  }
  if (loaded.learningVaultItems.length === 0) {
    loaded.learningVaultItems = [...DEFAULT_MEMORY_DATA.learningVaultItems];
    mutated = true;
  }

  // Backfill concrete stage combos on any older saved profiles & rules
  loaded.learnedCreators.forEach((c) => {
    if (!c.recommendedVfxId || !c.recommendedCamera || !c.recommendedSoundId) {
      const combo = inferStageComboFromText(
        `${c.counterTacticHe} ${c.snipeTendencyHe} ${c.gloveStrategyHe}`,
        c.username
      );
      c.recommendedVfxId = c.recommendedVfxId || combo.recommendedVfxId;
      c.recommendedCamera = c.recommendedCamera || combo.recommendedCamera;
      c.recommendedSoundId = c.recommendedSoundId || combo.recommendedSoundId;
      c.recommendedMusicId = c.recommendedMusicId || combo.recommendedMusicId;
      c.recommendedTapCallout = c.recommendedTapCallout || combo.recommendedTapCallout;
      c.appliedTimesCount = c.appliedTimesCount ?? 1;
      mutated = true;
    }
  });

  loaded.energyRules.forEach((r) => {
    if (!r.recommendedVfxId || !r.recommendedCamera || !r.recommendedSoundId) {
      const combo = inferStageComboFromText(`${r.titleHe} ${r.aiActionDirectiveEn}`, r.id);
      r.recommendedVfxId = r.recommendedVfxId || combo.recommendedVfxId;
      r.recommendedCamera = r.recommendedCamera || combo.recommendedCamera;
      r.recommendedSoundId = r.recommendedSoundId || combo.recommendedSoundId;
      r.recommendedTapCallout = r.recommendedTapCallout || combo.recommendedTapCallout;
      r.appliedTimesCount = r.appliedTimesCount ?? 1;
      mutated = true;
    }
    if (SEED_APPROVED_RULE_IDS.has(r.id)) {
      if (r.approved !== true || r.status !== 'APPROVED' || !r.version) {
        r.approved = true;
        r.status = 'APPROVED';
        r.version = r.version || 1;
        r.approvedBy = r.approvedBy || 'BOOSTERA_CORE';
        mutated = true;
      }
    } else if (r.approved !== true) {
      r.approved = false;
      r.status = r.status === 'REJECTED' ? 'REJECTED' : 'PROPOSED';
      r.version = r.version || 1;
      if (r.active) {
        r.active = false;
        mutated = true;
      }
    }
  });

  loaded.discoveredTools.forEach((t) => {
    if (SEED_APPROVED_TOOL_IDS.has(t.id)) {
      if (t.approved !== true || t.status !== 'APPROVED' || !t.version) {
        t.approved = true;
        t.status = 'APPROVED';
        t.version = t.version || 1;
        t.approvedBy = t.approvedBy || 'BOOSTERA_CORE';
        mutated = true;
      }
    } else if (t.approved !== true) {
      t.approved = false;
      t.status = t.status === 'REJECTED' ? 'REJECTED' : 'PROPOSED';
      t.version = t.version || 1;
      if (t.autoEnabled) {
        t.autoEnabled = false;
        mutated = true;
      }
    }
  });

  loaded.watchedCreators.forEach((w) => {
    w.currentlyConnected = false;
  });
  if (mutated || !fs.existsSync(MEMORY_FILE)) {
    saveMemory(loaded);
  }
  return loaded;
}

function saveMemory(mem: PersistentMemoryData) {
  try {
    ensureDataDir();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2), 'utf-8');
  } catch {
    // Non-fatal in read-only environments
  }
}

const aiMemory: PersistentMemoryData = loadMemory();

interface TikLeapCacheStore {
  byRegion: Record<
    string,
    {
      fetchedAt: number;
      items: Array<{ rank: number; name: string; username: string; avatar?: string }>;
    }
  >;
}

const SEED_TIKLEAP_CACHE: TikLeapCacheStore = {
  byRegion: {
    il: {
      fetchedAt: Date.now() - 15 * 60 * 1000,
      items: [{ rank: 1, name: 'khaled ashur', username: 'khaledashur' }],
    },
    us: {
      fetchedAt: Date.now() - 15 * 60 * 1000,
      items: [{ rank: 1, name: 'CFIZZLE', username: 'corriewyse' }],
    },
  },
};

function loadTikLeapCache(): TikLeapCacheStore {
  try {
    ensureDataDir();
    if (fs.existsSync(TIKLEAP_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(TIKLEAP_CACHE_FILE, 'utf-8'));
    }
  } catch {
    // Ignore
  }
  return SEED_TIKLEAP_CACHE;
}

function saveTikLeapCache(cache: TikLeapCacheStore) {
  try {
    ensureDataDir();
    fs.writeFileSync(TIKLEAP_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // Ignore
  }
}

const tikleapCache = loadTikLeapCache();

interface ServerBattleState {
  streamMode: StreamMode;
  isRunning: boolean;
  elapsedSec: number;
  roundNumber: number;
  roundPalette: RoundPaletteId;
  phase: BattlePhaseId;
  likeEnergy: number;
  likesPerSecond: number;
  likeTier: LikeEnergyTier;
  likeComboCount: number;
  comboMultiplier: number;
  tapStimulusActiveUntil: number;
  tapCalloutTextHe: string;
  cameraMode: 'AI_DYNAMIC' | 'HYPER_KINETIC' | 'LOCKED';
  activeCameraEvent: CameraKineticEvent | null;
  lastGesture: { gesture: PresenterGestureId; ts: number; labelHe: string } | null;
  totalLikes: number;
  totalShares: number;
  totalFollowers: number;
  totalViewersJoined: number;
  goalsCompleted: number;
  myScore: number;
  opponentScore: number;
  gloveRemainingSec: number;
  snipeWindowActive: boolean;
  activeMusicTrackId: string;
  musicVolumePct: number;
  aiAutopilot: boolean;
  aiMoodProfile: AiMoodProfileId;
  aiTensionScore: number;
  aiEnergyScore: number;
  approvalMode?: DecisionApprovalMode;
  integrationAudit?: IntegrationAuditReport;
  providerDiagnostics?: {
    checkedAt: number;
    openai: Record<string, unknown>;
    claude: Record<string, unknown>;
    gemini: Record<string, unknown>;
    geelark: Record<string, unknown>;
  } | null;
  geelarkDevices?: Array<{
    id: string;
    serialName: string;
    status: string;
    envName?: string;
    remark?: string;
    groupName?: string;
    tags?: string[];
    detectedTikTokHandle?: string | null;
  }>;
  geelarkRpaFlows?: Array<{ id: string; title: string; desc?: string; params?: string[] }>;
  geelarkRpaReady?: boolean;
  geelarkConfig?: {
    selectedDeviceId: string;
    selectedFlowId: string;
    ownedLiveUsername: string;
    selectedLiveRoom: string;
    updatedAt: number;
  };
  geelarkCapabilityReport?: {
    checkedAt: number;
    targetDeviceVerified: boolean;
    targetDeviceId: string;
    targetDeviceName: string | null;
    targetDeviceStatus: string | null;
    detectedTikTokHandleOnDevice: string | null;
    installedTikTokPackage?: string | null;
    rpaFlowList: { ok: boolean; count: number; detailHe: string };
    customFlowCreationApi: {
      supported: boolean;
      httpStatus: number;
      code?: number;
      createdFlowId?: string | null;
      detailHe: string;
    };
    shellAccess?: { ok: boolean; httpStatus: number; code?: number; detailHe: string };
    adbAccess: { ok: boolean; httpStatus: number; code?: number; adbBinaryInContainer: boolean; detailHe: string };
    missingRequirementsHe: string[];
  } | null;
  aiClientVideo?: {
    status: 'IDLE' | 'GENERATING' | 'READY' | 'FAILED';
    sourceImageUrl?: string | null;
    videoUrl?: string | null;
    promptHe?: string | null;
    errorHe?: string | null;
    updatedAt: number;
  };
  recentChatMessages: { user: string; text: string; ts: number; source?: string; avatarUrl?: string }[];
  aiDecisions: AiDirectorDecision[];
  tiktokRoom: {
    connected: boolean;
    connecting: boolean;
    targetUsername: string | null;
    listenMode: 'MY_BROADCAST' | 'OBSERVER_LEARN';
    roomId: string | null;
    viewerCount: number;
    streamLikesCount: number;
    chatMessagesCount: number;
    activeOpponentUsername: string | null;
    liveBattleDetected: boolean;
    lastErrorHe: string | null;
    autoWatchRadarEnabled: boolean;
    autoDiscoverOpponents: boolean;
    lastRadarScanTs: number;
    monitoredRooms: MonitoredLiveRoomSummary[];
    swarmRecentFeed: SwarmFeedEvent[];
    lastSwarmSynthesisHe: string | null;
    oauthConnectedUser: {
      openId: string;
      displayName: string;
      avatarUrl?: string;
    } | null;
    oauthConfigured: boolean;
  };
  memorySummary: {
    totalRoundsAnalyzed: number;
    watchedCreators: WatchedCreatorEntry[];
    learnedCreators: LearnedCreatorProfile[];
    energyRules: SetupEnergyRule[];
    discoveredTools: DiscoveredStageTool[];
    learningVaultItems: LearningVaultItem[];
    cueStats: CueEffectivenessStat[];
  };
  broadcastCountryCode: BroadcastCountryCode;
  countryCalibration: CountryCalibrationTelemetry;
  avatarsOverlayEnabled: boolean;
  topSupporters: StageSupporterAvatar[];
  avatarSpotlights: StageAvatarSpotlight[];
  cloudRadar: OpponentCloudRadarState;
  wsSniffer: WsSnifferState;
  chatCompanion: ChatCompanionState;
  crowdTestActive: boolean;
  connectedClients: number;
  activeEffects: ActiveEffectInstance[];
  recentLogs: LiveEventLogItem[];
}

type WsCollectedEventCategory =
  | 'BATTLE_PK'
  | 'CARDS_BOOSTS'
  | 'GIFTS_DIAMONDS'
  | 'CROWD_SOCIAL'
  | 'RANKS_GOALS'
  | 'EXTERNAL_CUSTOM';

type WsSpecialStageAction =
  | 'NONE'
  | 'CLOUD_XRAY'
  | 'GLOVE_30S'
  | 'SNIPE_WINDOW'
  | 'AVATAR_SPOTLIGHT'
  | 'TAP_BOOST_BANNER';

type WsTriggerScope = 'MIRRORED_ONLY' | 'ALL_CONNECTED_SOCKETS';

interface WsEventTriggerBinding {
  enabled: boolean;
  vfxId: string;
  cameraPreset: CameraPresetId | 'NONE';
  soundCueId: string;
  musicTrackId: string;
  specialAction: WsSpecialStageAction;
  calloutTextHe: string;
  cooldownSec: number;
  minNumericValue: number;
  scope: WsTriggerScope;
  lastTriggeredTs: number;
  triggeredCount: number;
}

interface DiscoveredWsEventRecord {
  eventKey: string;
  rawEventName: string;
  labelHe: string;
  descriptionHe: string;
  category: WsCollectedEventCategory;
  seenCount: number;
  firstSeenTs: number;
  lastSeenTs: number;
  lastSourceLabel: string;
  lastSampleSummaryHe: string;
  detectedFields: string[];
  lastPayloadPreview: string;
  binding: WsEventTriggerBinding;
}

interface RecentCapturedWsPacket {
  id: string;
  ts: number;
  eventKey: string;
  labelHe: string;
  sourceLabel: string;
  summaryHe: string;
  numericValue: number;
  autoTriggered: boolean;
  triggeredActionsSummaryHe: string | null;
}

interface ExternalWsBridgeStatus {
  url: string;
  mode: 'SERVER' | 'BROWSER_LOCAL';
  connected: boolean;
  connecting: boolean;
  messagesReceived: number;
  lastErrorHe: string | null;
  connectedSinceTs: number | null;
}

interface WsSnifferState {
  snifferActive: boolean;
  autoExecuteBoundTriggers: boolean;
  globalScopeOverride: 'RESPECT_BINDING' | 'ALL_CONNECTED_SOCKETS' | 'MIRRORED_ONLY';
  totalPacketsCaptured: number;
  uniqueEventTypesCount: number;
  activeTikTokSocketsCount: number;
  externalBridges: ExternalWsBridgeStatus[];
  discoveredEvents: DiscoveredWsEventRecord[];
  recentPackets: RecentCapturedWsPacket[];
}

type CompanionRoleId = 'TACTICAL_SNIPE' | 'VIBE_HYPE' | 'MOD_SHIELD' | 'WELCOME_VIP';

type ChatMomentType =
  | 'OPENING_WARMUP'
  | 'DEAD_AIR_ICEBREAKER'
  | 'GLOVE_X5_PUSH'
  | 'CLOUD_DEFENSE'
  | 'FINAL_30S_SNIPE'
  | 'VIP_THANK_YOU'
  | 'ANTI_TROLL_SHIELD';

interface CompanionAccountSlot {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  role: CompanionRoleId;
  enabled: boolean;
  connectionStatus: 'SLOT_READY' | 'WS_BRIDGE_ACTIVE';
  externalWebhookOrWsTag: string;
  toneNotesHe: string;
  messagesDispatched: number;
  moderationsTriggered: number;
}

interface LearnedChatModeratorPattern {
  id: string;
  moment: ChatMomentType;
  role: CompanionRoleId;
  sourceStreamHe: string;
  whatObservedHe: string;
  hebrewLines: string[];
  effectivenessScore: number;
  autoDispatchEnabled: boolean;
  usedCount: number;
  updatedAtTs: number;
}

interface ChatModerationFlagItem {
  id: string;
  ts: number;
  sourceRoom: string;
  offenderUser: string;
  rawMessage: string;
  reasonType: 'OPPONENT_TROLL' | 'TOXIC_NEGATIVE' | 'SPAM_BOT' | 'CLOUD_BAIT';
  reasonHe: string;
  recommendedAction: 'MUTE_AND_DELETE' | 'POSITIVE_FLOOD' | 'HIDE_USER';
  counterFloodLineHe: string;
  resolved: boolean;
}

interface CompanionDispatchActionItem {
  id: string;
  ts: number;
  accountId: string;
  accountHandle: string;
  accountDisplayName: string;
  role: CompanionRoleId;
  kind: 'CHAT_VIBE_LINE' | 'MOD_CLEANUP';
  momentLabelHe: string;
  messageTextHe: string;
  targetOffender?: string;
  dispatchedToBridge: boolean;
}

interface ChatCompanionState {
  autoCompanionEnabled: boolean;
  autoModerationShieldEnabled: boolean;
  autoLearnFromLiveChat: boolean;
  chatVelocityPerMin: number;
  detectedRoomMoodHe: string;
  accounts: CompanionAccountSlot[];
  learnedPatterns: LearnedChatModeratorPattern[];
  moderationFlags: ChatModerationFlagItem[];
  recentDispatches: CompanionDispatchActionItem[];
}

interface StageSupporterAvatar {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  points: number;
  giftsCount: number;
  likesCount: number;
  tier: 'MVP_CROWN' | 'ROYAL_GOLD' | 'PLASMA_STAR' | 'SPARK_PARTICIPANT';
  lastActionHe: string;
  updatedAt: number;
}

interface StageAvatarSpotlight {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  kind: 'WHALE_GIFT' | 'GIFT' | 'COMBO_LIKE' | 'SHARE' | 'FOLLOW' | 'CHAT_HYPE';
  badgeHe: string;
  detailHe: string;
  pointsDelta?: number;
  side: 'LEFT' | 'RIGHT';
  triggeredAt: number;
  durationMs: number;
}

interface OpponentCloudRadarState {
  autoDetectEnabled: boolean;
  active: boolean;
  expiresAt: number;
  remainingSec: number;
  opponentUsername: string | null;
  opponentRoomConnected: boolean;
  detectedReasonHe: string | null;
  myTrueScore: number;
  opponentTrueScore: number;
  scoreDiff: number;
  triggeredCount: number;
}

function buildBroadcastAvatarCrestUri(label: string, variantIdx = 0): string {
  const palettes = [
    { bg1: '#1E1508', bg2: '#0B0E14', ring: '#F59E0B', text: '#FDE68A' },
    { bg1: '#0A1926', bg2: '#0B0E14', ring: '#38BDF8', text: '#BAE6FD' },
    { bg1: '#1B0F26', bg2: '#0B0E14', ring: '#A855F7', text: '#E9D5FF' },
    { bg1: '#092218', bg2: '#0B0E14', ring: '#10B981', text: '#A7F3D0' },
  ];
  const pal = palettes[Math.abs(variantIdx) % palettes.length];
  const clean = String(label || 'VIP')
    .replace(/^@+/, '')
    .trim();
  const initials = Array.from(clean).slice(0, 2).join('').toUpperCase() || 'VP';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><radialGradient id="g" cx="50%" cy="32%" r="70%"><stop offset="0%" stop-color="${pal.bg1}"/><stop offset="100%" stop-color="${pal.bg2}"/></radialGradient></defs><circle cx="48" cy="48" r="46" fill="url(#g)" stroke="${pal.ring}" stroke-width="3.5"/><circle cx="48" cy="48" r="39" fill="none" stroke="${pal.ring}" stroke-opacity="0.32" stroke-width="1.2"/><text x="48" y="56" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="28" fill="${pal.text}">${initials.replace(/[<>&"']/g, '')}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function extractTikTokUserAvatar(userObj: any, fallbackLabel: string): string {
  const candidates = [
    userObj?.avatarLarge?.urlList?.[0],
    userObj?.avatarMedium?.urlList?.[0],
    userObj?.avatarThumb?.urlList?.[0],
    userObj?.avatarThumb?.url?.[0],
    userObj?.profilePictureUrl,
    userObj?.avatarUrl,
    userObj?.avatar,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) {
      return c;
    }
  }
  let hash = 0;
  for (let i = 0; i < fallbackLabel.length; i++) {
    hash = (hash * 31 + fallbackLabel.charCodeAt(i)) | 0;
  }
  return buildBroadcastAvatarCrestUri(fallbackLabel, hash);
}

function buildMemorySummary() {
  return {
    totalRoundsAnalyzed: aiMemory.totalRoundsAnalyzed,
    watchedCreators: aiMemory.watchedCreators,
    learnedCreators: aiMemory.learnedCreators.slice(0, 24),
    energyRules: aiMemory.energyRules,
    discoveredTools: aiMemory.discoveredTools.slice(0, 20),
    learningVaultItems: aiMemory.learningVaultItems.slice(0, 30),
    cueStats: aiMemory.cueStats.slice(0, 12),
  };
}

function makeDefaultBinding(partial: Partial<WsEventTriggerBinding>): WsEventTriggerBinding {
  return {
    enabled: false,
    vfxId: 'NONE',
    cameraPreset: 'NONE',
    soundCueId: 'NONE',
    musicTrackId: 'KEEP',
    specialAction: 'NONE',
    calloutTextHe: '',
    cooldownSec: 6,
    minNumericValue: 0,
    scope: 'ALL_CONNECTED_SOCKETS',
    lastTriggeredTs: 0,
    triggeredCount: 0,
    ...partial,
  };
}

const DEFAULT_WS_DISCOVERED_EVENTS: DiscoveredWsEventRecord[] = [
  {
    eventKey: 'WebcastLinkMicBattleItemCard:SMOKE_CLOUD',
    rawEventName: 'linkMicBattleItemCard',
    labelHe: 'פתיחת ענן הסתרת סקור (Smoke / Mist Card)',
    descriptionHe: 'מזוהה כשמופעל קלף ענן/ערפל בקרב — מפעיל אוטומטית רנטגן סקור מחדר היריב',
    category: 'CARDS_BOOSTS',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין לזיהוי useSmokeCard / fuzzyDisplayConfig',
    detectedFields: ['useSmokeCard', 'cardInfo.effectLastDuration', 'anchorId'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'VID_03_TWIN_LIGHTNING_ARCS',
      cameraPreset: 'SNIPE_CREEP',
      soundCueId: 'SND_SNIPE_LOCK',
      specialAction: 'CLOUD_XRAY',
      calloutTextHe: 'CLOUD X-RAY — PUSH SCORE!',
      cooldownSec: 12,
    }),
  },
  {
    eventKey: 'WebcastLinkMicBattleItemCard:GLOVE_X5',
    rawEventName: 'linkMicBattleItemCard',
    labelHe: 'פתיחת כפפת בוסט / מכה קריטית x5 (Glove Card)',
    descriptionHe: 'מזוהה ברגע פתיחת כפפה או קלף הכפלה ב-30 שניות בבאטל',
    category: 'CARDS_BOOSTS',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין לזיהוי useVaultGloveCard / useCriticalStrikeCard',
    detectedFields: ['useVaultGloveCard', 'useCriticalStrikeCard', 'cardInfo'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'BEAST_09_SOLAR_TIGER',
      cameraPreset: 'ZOOM_PUNCH',
      soundCueId: 'SND_GLOVE_POWERUP',
      musicTrackId: 'MUS_GLOVE_OVERCLOCK',
      specialAction: 'GLOVE_30S',
      calloutTextHe: 'GLOVE x5 — TAP NOW!',
      cooldownSec: 15,
    }),
  },
  {
    eventKey: 'WebcastBoostCardMessage',
    rawEventName: 'boostCard',
    labelHe: 'קלף חשיפה / Flare Boost של טיקטוק (Boost Card)',
    descriptionHe: 'אירוע WebSocket כשנפתח קלף האצת תנועה וצופים חדשים בחדר',
    category: 'CARDS_BOOSTS',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין לזיהוי WebcastBoostCardMessage',
    detectedFields: ['cards', 'boostEndTime', 'taskSource'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'VID_02_CRYO_CO2_CANNONS',
      cameraPreset: 'BASS_PUMP',
      soundCueId: 'SND_HYPE_STADIUM_CHEER',
      specialAction: 'TAP_BOOST_BANNER',
      calloutTextHe: 'BOOST ACTIVE — SHARE & TAP!',
      cooldownSec: 12,
    }),
  },
  {
    eventKey: 'WebcastLinkMicBattleTaskMessage',
    rawEventName: 'linkMicBattleTask',
    labelHe: 'משימת מהירות / בונוס קרב (PK Speed / Bonus Task)',
    descriptionHe: 'אירוע משימת קרב מיוחדת של טיקטוק (כמו Speed Challenge ללייקים או מתנות קטנות)',
    category: 'BATTLE_PK',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין לזיהוי WebcastLinkMicBattleTaskMessage',
    detectedFields: ['battleTaskMessageType', 'taskStart', 'rewardSettle'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'VID_06_PLASMA_SPARK_SURGE',
      cameraPreset: 'ZOOM_PUNCH',
      soundCueId: 'SND_GLOVE_POWERUP',
      specialAction: 'TAP_BOOST_BANNER',
      calloutTextHe: 'SPEED CHALLENGE — DOUBLE TAP!',
      cooldownSec: 10,
    }),
  },
  {
    eventKey: 'WebcastGiftMessage:WHALE',
    rawEventName: 'gift',
    labelHe: 'מתנת לווייתן / סנייפ כבד (Whale Gift)',
    descriptionHe: 'מתנה גדולה שחוצה את סף הלווייתן המכויל למדינה (למשל 299+ נק׳ בישראל)',
    category: 'GIFTS_DIAMONDS',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין למתנה כבדה ב-WebSocket',
    detectedFields: ['giftName', 'diamondCount', 'repeatCount', 'user.nickname'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'BEAST_10_ROYAL_FIRE_LION',
      cameraPreset: 'EARTHQUAKE_SHAKE',
      soundCueId: 'SND_CINEMATIC_BRAAM',
      specialAction: 'AVATAR_SPOTLIGHT',
      calloutTextHe: 'MVP WHALE IN THE HOUSE!',
      cooldownSec: 4,
      minNumericValue: 100,
    }),
  },
  {
    eventKey: 'WebcastGiftMessage:MEDIUM',
    rawEventName: 'gift',
    labelHe: 'מתנה בינונית / הרמת קצב (20–298 יהלומים)',
    descriptionHe: 'מתנות ביניים שמניעות מומנטום באמצע סיבוב',
    category: 'GIFTS_DIAMONDS',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין למתנת ביניים ב-WebSocket',
    detectedFields: ['giftName', 'diamondCount', 'repeatCount', 'user.nickname'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'VID_07_QUAD_PYRO_FLAME_JETS',
      cameraPreset: 'ZOOM_PUNCH',
      soundCueId: 'SND_HYPE_STADIUM_CHEER',
      specialAction: 'AVATAR_SPOTLIGHT',
      calloutTextHe: 'FIRE SUPPORT!',
      cooldownSec: 5,
      minNumericValue: 20,
    }),
  },
  {
    eventKey: 'WebcastLinkMicBattle',
    rawEventName: 'linkMicBattle',
    labelHe: 'פתיחת קרב PK חדש (Battle Start)',
    descriptionHe: 'מזוהה מיד כשמתחיל קרב חדש בין שני שדרנים ב-WebSocket',
    category: 'BATTLE_PK',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין לתחילת קרב PK',
    detectedFields: ['anchorsInfo', 'battleId', 'duration'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'VID_05_PK_FACTION_SMOKE_CLASH',
      cameraPreset: 'DUTCH_WHIP',
      soundCueId: 'SND_CINEMATIC_BRAAM',
      musicTrackId: 'MUS_BATTLE_IGNITION_PULSE',
      specialAction: 'TAP_BOOST_BANNER',
      calloutTextHe: 'BATTLE STARTED — FAST TAPS!',
      cooldownSec: 15,
    }),
  },
  {
    eventKey: 'WebcastLinkMicArmies:LEAD_FLIP_US',
    rawEventName: 'linkMicArmies',
    labelHe: 'מהפך יתרון לטובתנו בקרב! (Lead Taken)',
    descriptionHe: 'מזוהה כשעדכון הניקוד ב-WebSocket מעביר אותנו מפיגור להובלה',
    category: 'BATTLE_PK',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין למהפך בניקוד הקרב',
    detectedFields: ['armies', 'hostscore', 'userArmies'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'BEAST_08_VIOLET_PHOENIX',
      cameraPreset: 'DUTCH_WHIP',
      soundCueId: 'SND_LEAD_TAKEN',
      specialAction: 'NONE',
      calloutTextHe: 'WE TOOK THE LEAD!',
      cooldownSec: 8,
    }),
  },
  {
    eventKey: 'WebcastSubNotifyMessage',
    rawEventName: 'subNotify',
    labelHe: 'מנוי VIP / SuperFan חדש בחדר (Subscriber / SuperFan)',
    descriptionHe: 'אירוע הצטרפות מנוי בתשלום או חידוש מנוי בשידור',
    category: 'CROWD_SOCIAL',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין לאירוע מנוי/SuperFan',
    detectedFields: ['user.nickname', 'subscribeType', 'subMonth'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'VID_04_COLD_SPARK_FOUNTAINS',
      cameraPreset: 'ZOOM_PUNCH',
      soundCueId: 'SND_HYPE_STADIUM_CHEER',
      specialAction: 'AVATAR_SPOTLIGHT',
      calloutTextHe: 'NEW VIP SUBSCRIBER!',
      cooldownSec: 5,
    }),
  },
  {
    eventKey: 'WebcastEnvelopeMessage',
    rawEventName: 'envelope',
    labelHe: 'פתיחת תיבת אוצר / מעטפת מטבעות (Treasure Envelope)',
    descriptionHe: 'כשנזרקת תיבת אוצר בחדר וכל הצופים מתנפלים',
    category: 'RANKS_GOALS',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין לתיבת אוצר',
    detectedFields: ['envelopeInfo', 'diamondCount', 'peopleCount'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'GOAL_SHOCKWAVE_RING',
      cameraPreset: 'BASS_PUMP',
      soundCueId: 'SND_HYPE_STADIUM_CHEER',
      specialAction: 'NONE',
      calloutTextHe: 'TREASURE BOX LIVE!',
      cooldownSec: 8,
    }),
  },
  {
    eventKey: 'WebcastHourlyRankMessage',
    rawEventName: 'hourlyRank',
    labelHe: 'עלייה בדירוג השעתי / טופ מדינה (Hourly Rank Update)',
    descriptionHe: 'עדכון מיקום בדירוג השעתי של טיקטוק בלייב',
    category: 'RANKS_GOALS',
    seenCount: 0,
    firstSeenTs: Date.now(),
    lastSeenTs: 0,
    lastSourceLabel: 'מוכן לקליטה חיה',
    lastSampleSummaryHe: 'ממתין לעדכון דירוג שעתי',
    detectedFields: ['data', 'rankType', 'ownerRank'],
    lastPayloadPreview: '{}',
    binding: makeDefaultBinding({
      enabled: true,
      vfxId: 'FOLLOW_GOLDEN_SPARKS',
      cameraPreset: 'ZOOM_PUNCH',
      soundCueId: 'SND_LEAD_TAKEN',
      specialAction: 'TAP_BOOST_BANNER',
      calloutTextHe: 'CLIMBING TOP RANK!',
      cooldownSec: 15,
    }),
  },
];

function loadPersistedWsSniffer(): DiscoveredWsEventRecord[] {
  try {
    if (fs.existsSync(WS_SNIFFER_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(WS_SNIFFER_FILE, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = [...parsed];
        for (const def of DEFAULT_WS_DISCOVERED_EVENTS) {
          if (!merged.some((e) => e.eventKey === def.eventKey)) {
            merged.push(def);
          }
        }
        return merged;
      }
    }
  } catch {
    // Ignore corrupt file
  }
  return DEFAULT_WS_DISCOVERED_EVENTS.map((d) => ({ ...d, binding: { ...d.binding } }));
}

function savePersistedWsSniffer(records: DiscoveredWsEventRecord[]) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(WS_SNIFFER_FILE, JSON.stringify(records.slice(0, 90), null, 2), 'utf8');
  } catch {
    // Ignore write error
  }
}

const DEFAULT_COMPANION_ACCOUNTS: CompanionAccountSlot[] = [
  {
    id: 'comp_tactical_1',
    handle: 'kobi_pk_commander',
    displayName: 'קובי · קצין קרב וסנייפ',
    avatarUrl: buildBroadcastAvatarCrestUri('קב', 0),
    role: 'TACTICAL_SNIPE',
    enabled: true,
    connectionStatus: 'SLOT_READY',
    externalWebhookOrWsTag: 'ws://companion-slot-1',
    toneNotesHe: 'חד, טקטי, סופר שניות לכפפה, מתריע מיד על ענן יריב ומדרבן בשניות ההכרעה.',
    messagesDispatched: 4,
    moderationsTriggered: 0,
  },
  {
    id: 'comp_hype_2',
    handle: 'maya_vibe_boost',
    displayName: 'מאיה · הרמת אווירה וצ׳אט',
    avatarUrl: buildBroadcastAvatarCrestUri('מי', 1),
    role: 'VIBE_HYPE',
    enabled: true,
    connectionStatus: 'SLOT_READY',
    externalWebhookOrWsTag: 'ws://companion-slot-2',
    toneNotesHe: 'אנרגטית, חמה, שוברת שתיקות עם שאלות לקהל ומרימה רצפי דאבל-טאפ ושיתופים.',
    messagesDispatched: 6,
    moderationsTriggered: 0,
  },
  {
    id: 'comp_shield_3',
    handle: 'ori_room_shield',
    displayName: 'אורי · מגן חדר וניקוי רעשים',
    avatarUrl: buildBroadcastAvatarCrestUri('אר', 2),
    role: 'MOD_SHIELD',
    enabled: true,
    connectionStatus: 'SLOT_READY',
    externalWebhookOrWsTag: 'ws://companion-slot-3',
    toneNotesHe: 'מזהה טרולים מהחדר היריב, הודעות שליליות וספאם — מסמן להשתקה ומציף אנרגיה חיובית.',
    messagesDispatched: 2,
    moderationsTriggered: 3,
  },
  {
    id: 'comp_vip_4',
    handle: 'shir_vip_hostess',
    displayName: 'שיר · קבלת פנים ותודות VIP',
    avatarUrl: buildBroadcastAvatarCrestUri('שר', 3),
    role: 'WELCOME_VIP',
    enabled: true,
    connectionStatus: 'SLOT_READY',
    externalWebhookOrWsTag: 'ws://companion-slot-4',
    toneNotesHe: 'נותנת כבוד אישי לתומכים, מברכת מצטרפים חדשים וגורמת לכל תומך להרגיש מלך בחדר.',
    messagesDispatched: 5,
    moderationsTriggered: 0,
  },
];

const DEFAULT_LEARNED_CHAT_PATTERNS: LearnedChatModeratorPattern[] = [
  {
    id: 'cpat_glove_1',
    moment: 'GLOVE_X5_PUSH',
    role: 'TACTICAL_SNIPE',
    sourceStreamHe: 'נלמד ממנחי באטלים מובילים',
    whatObservedHe: 'מנחה מלווה לא כותב סתם "תזרקו" — הוא מבקש להכין ורדים/מתנות קטנות ב-5 השניות הראשונות של הכפפה כדי לפתוח מכפיל x5.',
    hebrewLines: [
      'כפפה פתוחה 30 שניות!! כולם לזרוק אפילו ורד אחד עכשיו לתפוס מכפיל x5! 🥊🔥',
      'חלון x5 באוויר! כל לחיצה וכל מתנה קטנה עכשיו שווה פי 5 — בואו נפתח פער!',
    ],
    effectivenessScore: 96,
    autoDispatchEnabled: true,
    usedCount: 3,
    updatedAtTs: Date.now() - 60000,
  },
  {
    id: 'cpat_cloud_2',
    moment: 'CLOUD_DEFENSE',
    role: 'TACTICAL_SNIPE',
    sourceStreamHe: 'נלמד מהגנות ענן בזירות PK',
    whatObservedHe: 'כשהיריב פותח ענן הסתרת סקור, הקהל נוטה לקפוא מחוסר ודאות. מנחה חזק מרגיע מיד ומכוון לשמירת תחמושת לסנייפ.',
    hebrewLines: [
      'היריב פתח ענן כי הוא בלחץ! אנחנו רואים את הסקור האמיתי — להמשיך דאבל טאפ ולשמור סנייפ ל-8 שניות אחרונות! 🎯⚡',
      'לא לעצור בגלל הענן חברים! כל נקודה נספרת עכשיו בשקט — תנו עבודה על המסך!',
    ],
    effectivenessScore: 95,
    autoDispatchEnabled: true,
    usedCount: 2,
    updatedAtTs: Date.now() - 50000,
  },
  {
    id: 'cpat_deadair_3',
    moment: 'DEAD_AIR_ICEBREAKER',
    role: 'VIBE_HYPE',
    sourceStreamHe: 'נלמד ממרימי אווירה בלייבים',
    whatObservedHe: 'ברגע שהצ׳אט מאט ל-15 שניות, שאלת מיקרו קצרה (מאיפה צופים / דירוג 1-10) מקפיצה את האלגוריתם של טיקטוק פי 3.',
    hebrewLines: [
      'בדיקת נוכחות מהירה בצ׳אט — מאיזה עיר אתם איתנו עכשיו בלייב? תכתבו! 👇🔥',
      'כל מי שאיתנו בחדר תנו "1" בצ׳אט ושיתוף אחד לחבר, בואו נראה כמה כוח יש פה הערב! 🚀',
    ],
    effectivenessScore: 91,
    autoDispatchEnabled: true,
    usedCount: 4,
    updatedAtTs: Date.now() - 40000,
  },
  {
    id: 'cpat_shield_4',
    moment: 'ANTI_TROLL_SHIELD',
    role: 'MOD_SHIELD',
    sourceStreamHe: 'נלמד ממודרטורים בזירות תחרותיות',
    whatObservedHe: 'כשנכנסים צופים של היריב להוריד מורל, לא עונים להם ישירות (זה מעלה להם חשיפה) — מסמנים להשתקה ומציפים מיד 2 שורות חיוביות.',
    hebrewLines: [
      'רק אנרגיות טובות בחדר שלנו 👑 כולם להציף לבבות כתומים בצ׳אט ולדחוף קדימה! 🧡🔥',
      'המשפחה פה הכי חזקה שיש — מתרכזים אך ורק בניצחון ובדאבל טאפ על המסך! 💪✨',
    ],
    effectivenessScore: 94,
    autoDispatchEnabled: true,
    usedCount: 2,
    updatedAtTs: Date.now() - 30000,
  },
  {
    id: 'cpat_vip_5',
    moment: 'VIP_THANK_YOU',
    role: 'WELCOME_VIP',
    sourceStreamHe: 'נלמד מחדרי VIP במפרץ ובישראל',
    whatObservedHe: 'אזכור שם התומך בצ׳אט תוך 2 שניות מהמתנה גורם ל-40% יותר מתנות המשך באותו סיבוב.',
    hebrewLines: [
      'כבוד ענק ל-{{USER}} על התמיכה המטורפת!! כולם לפרגן לו בלבבות בצ׳אט! 👑🔥',
      'איזו כניסה מלכותית של {{USER}}! מרים את כל החדר באוויר 🙌💎',
    ],
    effectivenessScore: 93,
    autoDispatchEnabled: true,
    usedCount: 3,
    updatedAtTs: Date.now() - 20000,
  },
];

function loadPersistedChatCompanion(): {
  accounts: CompanionAccountSlot[];
  learnedPatterns: LearnedChatModeratorPattern[];
} {
  try {
    if (fs.existsSync(CHAT_COMPANION_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CHAT_COMPANION_FILE, 'utf8'));
      if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.learnedPatterns)) {
        return {
          accounts: parsed.accounts.length > 0 ? parsed.accounts : DEFAULT_COMPANION_ACCOUNTS,
          learnedPatterns:
            parsed.learnedPatterns.length > 0 ? parsed.learnedPatterns : DEFAULT_LEARNED_CHAT_PATTERNS,
        };
      }
    }
  } catch {
    // Ignore corrupt file
  }
  return {
    accounts: DEFAULT_COMPANION_ACCOUNTS.map((a) => ({ ...a })),
    learnedPatterns: DEFAULT_LEARNED_CHAT_PATTERNS.map((p) => ({ ...p, hebrewLines: [...p.hebrewLines] })),
  };
}

function savePersistedChatCompanion(state: ChatCompanionState) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      CHAT_COMPANION_FILE,
      JSON.stringify(
        {
          accounts: state.accounts,
          learnedPatterns: state.learnedPatterns.slice(0, 40),
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {
    // Ignore write error
  }
}

const persistedWsEvents = loadPersistedWsSniffer();
const persistedCompanion = loadPersistedChatCompanion();

const battleState: ServerBattleState = {
  streamMode: 'BATTLE',
  isRunning: true,
  elapsedSec: 0,
  roundNumber: 1,
  roundPalette: 'molten_gold',
  phase: 'IGNITION',
  likeEnergy: 22,
  likesPerSecond: 4,
  likeTier: 'SPARK',
  likeComboCount: 12,
  comboMultiplier: 1,
  tapStimulusActiveUntil: 0,
  tapCalloutTextHe: 'TAP-TAP BOOST',
  cameraMode: 'AI_DYNAMIC',
  activeCameraEvent: null,
  lastGesture: null,
  totalLikes: 0,
  totalShares: 0,
  totalFollowers: 0,
  totalViewersJoined: 0,
  goalsCompleted: 0,
  myScore: 1450,
  opponentScore: 1320,
  gloveRemainingSec: 0,
  snipeWindowActive: false,
  activeMusicTrackId: 'MUS_BATTLE_IGNITION_PULSE',
  musicVolumePct: 36,
  aiAutopilot: true,
  aiMoodProfile: 'AUTO_SMART',
  aiTensionScore: 32,
  aiEnergyScore: 40,
  approvalMode: 'AUTO_EXECUTE',
  geelarkDevices: [],
  geelarkRpaFlows: [],
  geelarkRpaReady: false,
  geelarkConfig: {
    selectedDeviceId: sanitizeSecretHeaderValue(process.env.GEELARK_ENV_ID, 'GEELARK_ENV_ID').value || '646174035834568877',
    selectedFlowId: sanitizeSecretHeaderValue(process.env.GEELARK_CHAT_FLOW_ID, 'GEELARK_CHAT_FLOW_ID').value || '',
    ownedLiveUsername: (sanitizeSecretHeaderValue(process.env.TIKTOK_OWNED_ROOM_USERNAME, 'TIKTOK_OWNED_ROOM_USERNAME').value || '').replace(/^@/, '').trim(),
    selectedLiveRoom: '',
    updatedAt: Date.now(),
  },
  geelarkCapabilityReport: null,
  aiClientVideo: { status: 'IDLE', updatedAt: Date.now() },
  providerDiagnostics: null,
  recentChatMessages: [
    { user: 'דניאל_לייב', text: 'יאללה פותחים חזק דאבל טאפ על המסך!', ts: Date.now() - 8000 },
    { user: 'נועה_כהן', text: 'שומרים כפפה לדקה האחרונה תזכרו', ts: Date.now() - 3000 },
  ],
  aiDecisions: [
    {
      id: 'ai_boot_1',
      timestamp: Date.now(),
      streamMode: 'BATTLE',
      detectedSituationHe: 'טייס אוטומטי AI קבוע פעיל 24/7 במוד חכם — שולט אוטונומית ב-7 סרטוני ה-VFX, המוזיקה, הסאונד, המצלמה ורדאר הלמידה הרב-לשוני.',
      tensionScore: 32,
      energyScore: 40,
      actionsTakenHe: [
        '7 סרטוני VFX מרונדרים טעונים עם חיתוך כרומה #00FF00 והתאמת אזור בטוח 9:16',
        `ברשימת המעקב האוטומטית: ${aiMemory.watchedCreators.map((w) => '@' + w.username).slice(0, 5).join(', ')}`,
      ],
      musicTrackId: 'MUS_BATTLE_IGNITION_PULSE',
      soundCueId: null,
      vfxId: null,
    },
  ],
  tiktokRoom: {
    connected: false,
    connecting: false,
    targetUsername: null,
    listenMode: 'OBSERVER_LEARN',
    roomId: null,
    viewerCount: 0,
    streamLikesCount: 0,
    chatMessagesCount: 0,
    activeOpponentUsername: null,
    liveBattleDetected: false,
    lastErrorHe: null,
    autoWatchRadarEnabled: true,
    autoDiscoverOpponents: true,
    lastRadarScanTs: 0,
    monitoredRooms: [],
    swarmRecentFeed: [],
    lastSwarmSynthesisHe: null,
    oauthConnectedUser: aiMemory.oauthConnectedUser,
    oauthConfigured: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_KEY !== 'MY_TIKTOK_CLIENT_KEY'),
  },
  memorySummary: buildMemorySummary(),
  broadcastCountryCode: 'IL',
  countryCalibration: resolveCountryCalibration('IL', 0),
  avatarsOverlayEnabled: true,
  topSupporters: [
    {
      userId: 'seed_mvp_1',
      username: 'almog_king99',
      displayName: 'אלמוג VIP',
      avatarUrl: buildBroadcastAvatarCrestUri('אל', 0),
      points: 4250,
      giftsCount: 6,
      likesCount: 140,
      tier: 'MVP_CROWN',
      lastActionHe: 'שלח אריה אש +2,400',
      updatedAt: Date.now() - 12000,
    },
    {
      userId: 'seed_mvp_2',
      username: 'noa_live_boost',
      displayName: 'נועה כהן',
      avatarUrl: buildBroadcastAvatarCrestUri('נע', 1),
      points: 2180,
      giftsCount: 4,
      likesCount: 95,
      tier: 'ROYAL_GOLD',
      lastActionHe: 'כפפת בוסט +1,100',
      updatedAt: Date.now() - 24000,
    },
    {
      userId: 'seed_mvp_3',
      username: 'daniel_snipe',
      displayName: 'דניאל סנייפ',
      avatarUrl: buildBroadcastAvatarCrestUri('דנ', 2),
      points: 1390,
      giftsCount: 3,
      likesCount: 80,
      tier: 'PLASMA_STAR',
      lastActionHe: 'קומבו דאבל-טאפ x120',
      updatedAt: Date.now() - 35000,
    },
  ],
  avatarSpotlights: [],
  cloudRadar: {
    autoDetectEnabled: true,
    active: false,
    expiresAt: 0,
    remainingSec: 0,
    opponentUsername: null,
    opponentRoomConnected: false,
    detectedReasonHe: null,
    myTrueScore: 1450,
    opponentTrueScore: 1320,
    scoreDiff: 130,
    triggeredCount: 0,
  },
  wsSniffer: {
    snifferActive: true,
    autoExecuteBoundTriggers: true,
    globalScopeOverride: 'ALL_CONNECTED_SOCKETS',
    totalPacketsCaptured: 0,
    uniqueEventTypesCount: persistedWsEvents.length,
    activeTikTokSocketsCount: 0,
    externalBridges: [],
    discoveredEvents: persistedWsEvents,
    recentPackets: [],
  },
  chatCompanion: {
    autoCompanionEnabled: true,
    autoModerationShieldEnabled: true,
    autoLearnFromLiveChat: true,
    chatVelocityPerMin: 6,
    detectedRoomMoodHe: 'פעיל — עוקב אחר צ׳אט חי, לומד מנחים מלווים ומסנן רעשים',
    accounts: persistedCompanion.accounts,
    learnedPatterns: persistedCompanion.learnedPatterns,
    moderationFlags: [],
    recentDispatches: [],
  },
  crowdTestActive: false,
  connectedClients: 0,
  activeEffects: [],
  recentLogs: [],
};

const lastTriggeredByEffect = new Map<string, number>();
const shareTimestamps: number[] = [];
const likeTimestamps: { ts: number; count: number }[] = [];
let lastLikeReceivedTs = Date.now();
let lastMilestoneTier = 0;
let pendingJoinsBatch = 0;
let finaleTriggeredForRound = 0;
let pressureEntryStrikeRound = 0;
let snipeAlertTriggeredRound = 0;
let heartbeat10sTriggeredRound = 0;
let aiMoodBias = { tension: 0, energy: 0, updatedAt: 0 };
let seqCounter = 1;
let avatarSpotlightSideToggle: 'LEFT' | 'RIGHT' = 'RIGHT';

function recordStageParticipantAvatar(opts: {
  userId?: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  pointsDelta?: number;
  giftsDelta?: number;
  likesDelta?: number;
  actionHe: string;
  spotlight?: {
    kind: StageAvatarSpotlight['kind'];
    badgeHe: string;
    durationMs?: number;
  };
}) {
  const now = Date.now();
  const cleanHandle = String(opts.username || 'viewer').replace(/^@+/, '').trim() || 'viewer';
  const disp = String(opts.displayName || cleanHandle).trim();
  const key = (opts.userId || cleanHandle).toLowerCase();
  const resolvedAvatar =
    opts.avatarUrl && opts.avatarUrl.startsWith('http')
      ? opts.avatarUrl
      : extractTikTokUserAvatar(null, disp);

  let entry = battleState.topSupporters.find(
    (s) => s.userId.toLowerCase() === key || s.username.toLowerCase() === cleanHandle.toLowerCase()
  );
  if (!entry) {
    entry = {
      userId: key,
      username: cleanHandle,
      displayName: disp,
      avatarUrl: resolvedAvatar,
      points: 0,
      giftsCount: 0,
      likesCount: 0,
      tier: 'SPARK_PARTICIPANT',
      lastActionHe: opts.actionHe,
      updatedAt: now,
    };
    battleState.topSupporters.push(entry);
  } else {
    if (opts.avatarUrl && opts.avatarUrl.startsWith('http')) {
      entry.avatarUrl = opts.avatarUrl;
    }
    if (opts.displayName) {
      entry.displayName = disp;
    }
    entry.lastActionHe = opts.actionHe;
    entry.updatedAt = now;
  }

  entry.points += Math.max(0, Math.round(opts.pointsDelta || 0));
  entry.giftsCount += Math.max(0, opts.giftsDelta || 0);
  entry.likesCount += Math.max(0, opts.likesDelta || 0);

  battleState.topSupporters.sort((a, b) => b.points - a.points || b.updatedAt - a.updatedAt);
  if (battleState.topSupporters.length > 10) {
    battleState.topSupporters.length = 10;
  }
  battleState.topSupporters.forEach((s, idx) => {
    s.tier =
      idx === 0
        ? 'MVP_CROWN'
        : idx === 1
          ? 'ROYAL_GOLD'
          : idx === 2
            ? 'PLASMA_STAR'
            : 'SPARK_PARTICIPANT';
  });

  if (opts.spotlight && battleState.avatarsOverlayEnabled) {
    avatarSpotlightSideToggle = avatarSpotlightSideToggle === 'RIGHT' ? 'LEFT' : 'RIGHT';
    const spot: StageAvatarSpotlight = {
      id: nextId('av_spot'),
      username: cleanHandle,
      displayName: disp,
      avatarUrl: entry.avatarUrl,
      kind: opts.spotlight.kind,
      badgeHe: opts.spotlight.badgeHe,
      detailHe: opts.actionHe,
      pointsDelta: opts.pointsDelta,
      side: avatarSpotlightSideToggle,
      triggeredAt: now,
      durationMs: opts.spotlight.durationMs || 4600,
    };
    battleState.avatarSpotlights.unshift(spot);
    if (battleState.avatarSpotlights.length > 4) {
      battleState.avatarSpotlights.length = 4;
    }
  }
}

// Multi-Stream Parallel TikTok Live Swarm Manager (supports up to 10 concurrent rooms across all languages)
interface ManagedLiveRoom {
  username: string;
  conn: TikTokLiveConnection;
  listenMode: 'MY_BROADCAST' | 'OBSERVER_LEARN';
  summary: MonitoredLiveRoomSummary;
  hostAnchorId?: string;
  opponentAnchorId?: string;
  likeWindow: Array<{ ts: number; count: number }>;
  chatSamples: string[];
  captionSamples: string[];
  giftSamples: string[];
  opponentsSeen: string[];
  unsynthesizedEventCount: number;
  lastSynthesizedTs: number;
}

const MAX_CONCURRENT_SWARM_ROOMS = 10;
const activeSwarmRooms = new Map<string, ManagedLiveRoom>();

function nextId(prefix: string): string {
  seqCounter += 1;
  return `${prefix}_${Date.now()}_${seqCounter}`;
}

function trackCueEffectiveness(cueId: string, labelHe: string) {
  const baselineLps = battleState.likesPerSecond;
  setTimeout(() => {
    const afterLps = battleState.likesPerSecond;
    const delta = Math.max(0.5, Number((afterLps - baselineLps + 2.2).toFixed(1)));
    const existing = aiMemory.cueStats.find((c) => c.cueId === cueId);
    if (existing) {
      existing.avgLpsBoost = Number(
        ((existing.avgLpsBoost * existing.timesTriggered + delta) / (existing.timesTriggered + 1)).toFixed(1)
      );
      existing.timesTriggered += 1;
      existing.lastUsedTs = Date.now();
    } else {
      aiMemory.cueStats.unshift({
        cueId,
        labelHe,
        timesTriggered: 1,
        avgLpsBoost: delta,
        lastUsedTs: Date.now(),
      });
    }
    battleState.memorySummary = buildMemorySummary();
    saveMemory(aiMemory);
  }, 4000);
}

function computePhase(sec: number): BattlePhaseId {
  if (sec < 55) return 'IGNITION';
  if (sec < 115) return 'MOMENTUM';
  if (sec < 175) return 'PRESSURE';
  if (sec < 225) return 'TENSION';
  return 'FINALE';
}

function computeLikeTier(energy: number, sec: number): LikeEnergyTier {
  const overdriveCutoff = sec >= 104 && sec <= 115 ? 92 : 85;
  if (energy >= overdriveCutoff) return 'OVERDRIVE';
  if (energy >= 60) return 'HYPE';
  if (energy >= 35) return 'CHARGING';
  if (energy >= 15) return 'SPARK';
  return 'IDLE';
}

function pushLog(item: Omit<LiveEventLogItem, 'id' | 'timestamp' | 'battleTimeSec'>) {
  battleState.recentLogs.unshift({
    id: nextId('log'),
    timestamp: Date.now(),
    battleTimeSec: Number(battleState.elapsedSec.toFixed(1)),
    ...item,
  });
  if (battleState.recentLogs.length > 35) {
    battleState.recentLogs.length = 35;
  }
}

let geelarkLastErrorHe: string | null = null;

function readEnvClean(name: string) {
  return sanitizeSecretHeaderValue(process.env[name], name);
}

function toSafeKeyDiagnostic(info: ReturnType<typeof readEnvClean>) {
  return {
    present: info.present,
    hadKeyPrefix: info.hadKeyPrefix,
    hadBearerPrefix: info.hadBearerPrefix,
    hadQuotes: info.hadQuotes,
    hasNonAscii: info.hasNonAscii,
    length: info.length,
  };
}

function getConfiguredOpenAiModel(): string {
  return readEnvClean('OPENAI_MODEL').value || 'gpt-6-astra';
}

function getConfiguredAnthropicModel(): string {
  return readEnvClean('ANTHROPIC_MODEL').value || 'claude-fable-5-2';
}

function normalizeGeeLarkOrigin(rawUrl: string): string {
  const cleaned = (rawUrl || 'https://openapi.geelark.com').trim().replace(/\/+$/, '');
  return cleaned.replace(/\/open\/v1(?:\/.*)?$/i, '');
}

function isGeeLarkConfigured(): boolean {
  return Boolean(readEnvClean('GEELARK_API_KEY').value && readEnvClean('GEELARK_APP_ID').value);
}

function loadPersistedGeeLarkConfig() {
  const fallback = {
    selectedDeviceId: readEnvClean('GEELARK_ENV_ID').value || '646174035834568877',
    selectedFlowId: readEnvClean('GEELARK_CHAT_FLOW_ID').value || '',
    ownedLiveUsername: (readEnvClean('TIKTOK_OWNED_ROOM_USERNAME').value || '').replace(/^@/, '').trim(),
    selectedLiveRoom: '',
    updatedAt: Date.now(),
  };
  try {
    ensureDataDir();
    if (fs.existsSync(GEELARK_PREFS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(GEELARK_PREFS_FILE, 'utf-8'));
      return {
        selectedDeviceId: String(parsed.selectedDeviceId || fallback.selectedDeviceId).trim(),
        selectedFlowId: String(parsed.selectedFlowId ?? fallback.selectedFlowId).trim(),
        ownedLiveUsername: String(parsed.ownedLiveUsername ?? fallback.ownedLiveUsername)
          .replace(/^@/, '')
          .trim(),
        selectedLiveRoom: String(parsed.selectedLiveRoom ?? '').replace(/^@/, '').trim(),
        updatedAt: Number(parsed.updatedAt || Date.now()),
      };
    }
  } catch {
    // Ignore read errors
  }
  return fallback;
}

function savePersistedGeeLarkConfig(cfg: NonNullable<ServerBattleState['geelarkConfig']>) {
  try {
    ensureDataDir();
    fs.writeFileSync(GEELARK_PREFS_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

battleState.geelarkConfig = loadPersistedGeeLarkConfig();

function getConfiguredOwnedRoomCsv(): string | null {
  const envOwned = (readEnvClean('TIKTOK_OWNED_ROOM_USERNAME').value || '').trim();
  const savedOwned = (battleState.geelarkConfig?.ownedLiveUsername || '').replace(/^@/, '').trim();
  const combined = [envOwned, savedOwned].filter(Boolean).join(',');
  return combined || null;
}

function extractTikTokHandleHint(text: string): string | null {
  if (!text) return null;
  const atMatch = text.match(/@([a-zA-Z0-9._]{3,30})/);
  if (atMatch?.[1]) return atMatch[1];
  const tikMatch = text.match(/tiktok[:=\s]+@?([a-zA-Z0-9._]{3,30})/i);
  if (tikMatch?.[1]) return tikMatch[1];
  return null;
}

function computeIntegrationAudit(): IntegrationAuditReport {
  const externalConnected = battleState.wsSniffer.externalBridges.filter((b) => b.connected).length;
  const ownedPrimary =
    (battleState.geelarkConfig?.ownedLiveUsername || '').replace(/^@/, '').trim() ||
    (readEnvClean('TIKTOK_OWNED_ROOM_USERNAME').value || '').split(',')[0]?.replace(/^@/, '').trim() ||
    null;
  const rpaFlowsCount = (battleState.geelarkRpaFlows || []).length;
  return buildIntegrationAuditReport({
    geelarkConfigured: isGeeLarkConfigured(),
    geelarkDevicesCount: (battleState.geelarkDevices || []).length,
    geelarkLastErrorHe,
    geelarkRpaReady: Boolean(battleState.geelarkRpaReady),
    geelarkRpaNoteHe:
      rpaFlowsCount > 0
        ? `נמצאו ${rpaFlowsCount} תהליכי Custom Flow זמינים ב-GeeLark לשליחת צ׳אט`
        : 'טרם הוגדר Custom Flow בחשבון GeeLark — ניתן לבנות ולייבא תהליך אוטומטית מהממשק בלחיצה אחת דרך /open/v1/task/flow/import.',
    tiktokOauthConfigured: battleState.tiktokRoom.oauthConfigured,
    tiktokOauthUser: battleState.tiktokRoom.oauthConnectedUser?.displayName || null,
    tiktokWebcastConnected: battleState.tiktokRoom.connected,
    tiktokWebcastUsername: battleState.tiktokRoom.targetUsername,
    tiktokWebcastRoomId: battleState.tiktokRoom.roomId,
    tiktokWebcastViewers: battleState.tiktokRoom.viewerCount,
    tiktokOwnedRoomUsername: ownedPrimary,
    openaiConfigured: Boolean(readEnvClean('OPENAI_API_KEY').value),
    claudeConfigured: Boolean(readEnvClean('ANTHROPIC_API_KEY').value),
    geminiConfigured: Boolean(readEnvClean('GEMINI_API_KEY').value),
    openaiRequestedModel: getConfiguredOpenAiModel(),
    claudeRequestedModel: getConfiguredAnthropicModel(),
    externalWsConnectedCount: externalConnected,
  });
}

async function callGeeLarkApi<T = unknown>(
  endpointPath: string,
  bodyObj: Record<string, unknown>,
  timeoutMs = 9000
): Promise<{
  ok: boolean;
  httpStatus: number;
  code?: number;
  msg?: string;
  data?: T;
  endpointUrl: string;
  errorHe: string | null;
}> {
  const appId = readEnvClean('GEELARK_APP_ID').value;
  const apiKey = readEnvClean('GEELARK_API_KEY').value;
  const baseOrigin = normalizeGeeLarkOrigin(readEnvClean('GEELARK_API_URL').value);
  const endpointUrl = `${baseOrigin}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`;
  const traceId = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  const ts = String(Date.now());
  const nonce = traceId.slice(0, 6);
  const sign = crypto
    .createHash('sha256')
    .update(`${appId}${traceId}${ts}${nonce}${apiKey}`)
    .digest('hex')
    .toUpperCase();

  try {
    const resp = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        appId,
        traceId,
        ts,
        nonce,
        sign,
      },
      body: JSON.stringify(bodyObj),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const rawText = await resp.text();
    let json: { code?: number; msg?: string; data?: T } | null = null;
    try {
      json = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        httpStatus: resp.status,
        endpointUrl,
        errorHe: `תשובה לא תקינה מ-GeeLark (HTTP ${resp.status} מ-${endpointPath}): ${rawText.slice(0, 140)}`,
      };
    }

    if (!resp.ok || !json || (typeof json.code === 'number' && json.code !== 0)) {
      return {
        ok: false,
        httpStatus: resp.status,
        code: json?.code,
        msg: json?.msg,
        data: json?.data,
        endpointUrl,
        errorHe: json?.msg ? `${json.msg} (code=${json.code ?? resp.status})` : `HTTP ${resp.status}`,
      };
    }

    return {
      ok: true,
      httpStatus: resp.status,
      code: json.code,
      msg: json.msg,
      data: json.data,
      endpointUrl,
      errorHe: null,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      httpStatus: 0,
      endpointUrl,
      errorHe: err instanceof Error ? err.message : 'שגיאת תקשורת מול GeeLark OpenAPI',
    };
  }
}

async function probeGeeLarkRpaFlows(): Promise<{
  ok: boolean;
  httpStatus: number;
  code?: number;
  flows: Array<{ id: string; title: string; desc?: string; params?: string[] }>;
  errorHe: string | null;
}> {
  if (!isGeeLarkConfigured()) return { ok: false, httpStatus: 0, flows: [], errorHe: 'GeeLark לא מוגדר' };
  const res = await callGeeLarkApi<{
    total?: number;
    items?: Array<{ id?: string; flowId?: string; title?: string; name?: string; desc?: string; params?: string[] }>;
    list?: Array<{ id?: string; flowId?: string; title?: string; name?: string; desc?: string; params?: string[] }>;
  }>('/open/v1/task/flow/list', { page: 1, pageSize: 50 });

  if (!res.ok) {
    return { ok: false, httpStatus: res.httpStatus, code: res.code, flows: [], errorHe: res.errorHe };
  }
  const rawItems = res.data?.items || res.data?.list || [];
  const flows = rawItems
    .map((f) => ({
      id: String(f.id || f.flowId || ''),
      title: String(f.title || f.name || f.id || 'Custom Flow'),
      desc: f.desc ? String(f.desc) : undefined,
      params: Array.isArray(f.params) ? f.params.map((p) => String(p)) : undefined,
    }))
    .filter((f) => Boolean(f.id));
  return { ok: true, httpStatus: res.httpStatus, code: res.code, flows, errorHe: null };
}

function buildBoosteraTikTokLiveChatFlowGal(packageName = 'com.zhiliaoapp.musically'): string {
  const galObject = {
    title: 'BOOSTERA TikTok Live Chat',
    desc: 'BOOSTERA automated TikTok LIVE approved comment sender (targetRoom + messageText)',
    content: {
      contentType: 'phone',
      errorType: 'skip',
      isDebug: false,
      timeOut: '30',
      params: [
        { name: 'targetRoom', type: 'string', defaultValue: '' },
        { name: 'messageText', type: 'string', defaultValue: '' },
      ],
      contents: [
        {
          type: 'openApp',
          config: {
            packgename: packageName,
            remark: 'Open TikTok app on GeeLark cloud phone',
            timeout: 30000,
          },
        },
        {
          type: 'waitTime',
          config: {
            remark: 'Wait for TikTok LIVE UI to settle',
            timeout: 4000,
            timeoutMax: 300000,
            timeoutMin: 1000,
            timeoutType: 'fixedValue',
          },
        },
        {
          type: 'click',
          config: {
            filters: [
              { content: 'Add comment...', type: 'text' },
              { content: 'Add comment', type: 'text' },
              { content: 'הוסף תגובה...', type: 'text' },
            ],
            remark: 'Tap TikTok LIVE comment input bar',
            searchTime: 4000,
            serial: 1,
            serialMax: 50,
            serialMin: 1,
            serialType: 'fixedValue',
            variable: '',
          },
        },
        {
          type: 'waitTime',
          config: {
            remark: 'Wait for soft keyboard & input box',
            timeout: 1500,
            timeoutMax: 300000,
            timeoutMin: 1000,
            timeoutType: 'fixedValue',
          },
        },
        {
          type: 'input',
          config: {
            content: '${messageText}',
            inputType: 'variable',
            variable: 'messageText',
            remark: 'Enter approved chat message text',
          },
        },
        {
          type: 'waitTime',
          config: {
            remark: 'Short pause before tapping Send',
            timeout: 1000,
            timeoutMax: 300000,
            timeoutMin: 1000,
            timeoutType: 'fixedValue',
          },
        },
        {
          type: 'click',
          config: {
            filters: [
              { content: 'Send', type: 'text' },
              { content: 'שלח', type: 'text' },
            ],
            remark: 'Tap Send button in TikTok LIVE chat',
            searchTime: 3000,
            serial: 1,
            serialMax: 50,
            serialMin: 1,
            serialType: 'fixedValue',
            variable: '',
          },
        },
      ],
    },
  };
  return JSON.stringify(galObject);
}

async function ensureOrImportTikTokLiveChatFlow(
  existingFlowId?: string,
  forceCreateBoostera = false
): Promise<{
  ok: boolean;
  flowId: string | null;
  createdNew: boolean;
  httpStatus: number;
  code?: number;
  detailHe: string;
}> {
  if (!isGeeLarkConfigured()) {
    return {
      ok: false,
      flowId: null,
      createdNew: false,
      httpStatus: 0,
      detailHe: 'GeeLark אינו מוגדר בסביבה.',
    };
  }

  const listProbe = await probeGeeLarkRpaFlows();
  if (!forceCreateBoostera && listProbe.ok && listProbe.flows.length > 0) {
    // Only reuse an existing flow if it is explicitly a BOOSTERA / TikTok chat flow or accepts messageText
    const dedicatedChatFlow = listProbe.flows.find(
      (f) =>
        /boostera|tiktok.*(live|chat|comment)/i.test(`${f.title} ${f.desc || ''}`) ||
        (Array.isArray(f.params) && f.params.some((p) => /messageText|comment/i.test(p)))
    );
    if (dedicatedChatFlow) {
      const prev = battleState.geelarkConfig || loadPersistedGeeLarkConfig();
      battleState.geelarkConfig = { ...prev, selectedFlowId: dedicatedChatFlow.id, updatedAt: Date.now() };
      savePersistedGeeLarkConfig(battleState.geelarkConfig);
      return {
        ok: true,
        flowId: dedicatedChatFlow.id,
        createdNew: false,
        httpStatus: listProbe.httpStatus,
        code: listProbe.code,
        detailHe: `נמצא Custom Flow ייעודי לשליחת צ׳אט בלייב: ${dedicatedChatFlow.title} (FLOW_ID=${dedicatedChatFlow.id}).`,
      };
    }
  }

  const installedPkg = battleState.geelarkCapabilityReport?.installedTikTokPackage || 'com.zhiliaoapp.musically';
  const galPayload = buildBoosteraTikTokLiveChatFlowGal(installedPkg);
  const importRes = await callGeeLarkApi<{ id?: string }>('/open/v1/task/flow/import', {
    gal: galPayload,
  });

  if (importRes.ok && importRes.data?.id) {
    const newFlowId = String(importRes.data.id).trim();
    const prev = battleState.geelarkConfig || loadPersistedGeeLarkConfig();
    battleState.geelarkConfig = {
      ...prev,
      selectedFlowId: newFlowId,
      updatedAt: Date.now(),
    };
    savePersistedGeeLarkConfig(battleState.geelarkConfig);
    await probeGeeLarkDevices(false);
    return {
      ok: true,
      flowId: newFlowId,
      createdNew: true,
      httpStatus: importRes.httpStatus,
      code: importRes.code,
      detailHe: `נבנה ויובא אוטומטית Custom Flow חדש ב-GeeLark (/open/v1/task/flow/import): BOOSTERA TikTok Live Chat (FLOW_ID=${newFlowId}).`,
    };
  }

  // Fallback to an explicitly selected existing flow if import failed due to plan/permission limits
  const fallbackExisting =
    (existingFlowId && listProbe.flows.find((f) => f.id === existingFlowId)) || null;

  return {
    ok: false,
    flowId: fallbackExisting?.id || null,
    createdNew: false,
    httpStatus: importRes.httpStatus,
    code: importRes.code,
    detailHe: `בנייה וייבוא של Custom Flow דרך /open/v1/task/flow/import החזירה: ${
      importRes.errorHe || `HTTP ${importRes.httpStatus}`
    }`,
  };
}

const TARGET_GEELARK_DEVICE_ID = '646174035834568877';

async function probeGeeLarkDevices(autoBuildFlowIfEmpty = false): Promise<{
  configured: boolean;
  connected: boolean;
  devices: NonNullable<ServerBattleState['geelarkDevices']>;
  flows: Array<{ id: string; title: string; desc?: string; params?: string[] }>;
  capabilityReport: ServerBattleState['geelarkCapabilityReport'];
  errorHe: string | null;
  endpointUsed?: string;
}> {
  if (!isGeeLarkConfigured()) {
    geelarkLastErrorHe = null;
    battleState.geelarkDevices = [];
    battleState.geelarkRpaFlows = [];
    battleState.geelarkRpaReady = false;
    battleState.geelarkCapabilityReport = null;
    battleState.integrationAudit = computeIntegrationAudit();
    return {
      configured: false,
      connected: false,
      devices: [],
      flows: [],
      capabilityReport: null,
      errorHe: 'לא מוגדרים GEELARK_APP_ID ו-GEELARK_API_KEY בסביבת השרת.',
    };
  }

  const phoneRes = await callGeeLarkApi<{
    items?: Array<{
      id?: string;
      serialName?: string;
      status?: number | string;
      envName?: string;
      remark?: string;
      group?: { name?: string };
      groupName?: string;
      tags?: Array<{ name?: string } | string>;
    }>;
  }>('/open/v1/phone/list', { page: 1, pageSize: 50 });

  if (!phoneRes.ok) {
    geelarkLastErrorHe = phoneRes.errorHe;
    battleState.geelarkDevices = [];
    battleState.geelarkRpaFlows = [];
    battleState.geelarkRpaReady = false;
    battleState.geelarkCapabilityReport = null;
    battleState.integrationAudit = computeIntegrationAudit();
    return {
      configured: true,
      connected: false,
      devices: [],
      flows: [],
      capabilityReport: null,
      errorHe: geelarkLastErrorHe,
      endpointUsed: phoneRes.endpointUrl,
    };
  }

  const devices: NonNullable<ServerBattleState['geelarkDevices']> = (phoneRes.data?.items || []).map((d) => {
    const tags = Array.isArray(d.tags)
      ? d.tags.map((t) => (typeof t === 'string' ? t : String(t?.name || ''))).filter(Boolean)
      : [];
    const remark = d.remark ? String(d.remark) : undefined;
    const groupName = d.groupName || d.group?.name || undefined;
    const serialName = String(d.serialName || d.id || 'cloud-phone');
    const detectedTikTokHandle = extractTikTokHandleHint(
      [serialName, d.envName || '', remark || '', groupName || '', ...tags].join(' ')
    );
    return {
      id: String(d.id || ''),
      serialName,
      status: String(d.status ?? 'unknown'),
      envName: d.envName,
      remark,
      groupName,
      tags,
      detectedTikTokHandle,
    };
  });

  const targetDev =
    devices.find((d) => d.id === TARGET_GEELARK_DEVICE_ID) ||
    devices.find((d) => d.id === battleState.geelarkConfig?.selectedDeviceId) ||
    devices[0] ||
    null;

  // Query GeeLark Analytics TikTok Accounts list (channel=0: TikTok) for registered TikTok account handles
  let analyticsTikTokAccount: string | null = null;
  const accountsProbe = await callGeeLarkApi<{
    items?: Array<{ account?: string; channel?: number; remark?: string }>;
  }>('/open/v1/analytics/accounts/list', { page: 1, pageSize: 20, channel: 0 }, 6000);
  if (accountsProbe.ok && Array.isArray(accountsProbe.data?.items) && accountsProbe.data.items.length > 0) {
    const firstAcc = String(accountsProbe.data.items[0]?.account || '')
      .replace(/^@/, '')
      .trim();
    if (firstAcc) {
      analyticsTikTokAccount = firstAcc;
      if (targetDev && !targetDev.detectedTikTokHandle) {
        targetDev.detectedTikTokHandle = firstAcc;
      }
    }
  }

  // Read-only probe of Cloud Phone Shell API to detect installed TikTok package on device 646174035834568877
  let installedTikTokPackage: string | null = null;
  let shellDetailHe = 'אין מכשיר פעיל לבדיקת /open/v1/shell/execute';
  let shellOk = false;
  let shellHttpStatus = 0;
  let shellCode: number | undefined = undefined;

  if (targetDev) {
    const shellProbe = await callGeeLarkApi<{ status?: boolean; output?: string }>(
      '/open/v1/shell/execute',
      { id: targetDev.id, cmd: 'pm list packages' },
      7000
    );
    shellHttpStatus = shellProbe.httpStatus;
    shellCode = shellProbe.code;
    if (shellProbe.ok && shellProbe.data?.status) {
      shellOk = true;
      const out = String(shellProbe.data.output || '');
      if (out.includes('com.zhiliaoapp.musically')) {
        installedTikTokPackage = 'com.zhiliaoapp.musically';
      } else if (out.includes('com.ss.android.ugc.trill')) {
        installedTikTokPackage = 'com.ss.android.ugc.trill';
      }
      shellDetailHe = installedTikTokPackage
        ? `גישת Shell פעילה במכשיר (${installedTikTokPackage} מותקן).`
        : 'גישת Shell פעילה במכשיר, אך חבילת TikTok לא נמצאה ברשימת החבילות.';
    } else {
      shellDetailHe = `פקודות Shell במכשיר (/open/v1/shell/execute): ${
        shellProbe.errorHe || `status=${String(shellProbe.data?.status ?? false)}`
      }`;
    }
  }

  let flowProbe = await probeGeeLarkRpaFlows();
  let flowImportOutcome: {
    supported: boolean;
    httpStatus: number;
    code?: number;
    createdFlowId?: string | null;
    detailHe: string;
  } = {
    supported: flowProbe.ok,
    httpStatus: flowProbe.httpStatus,
    code: flowProbe.code,
    createdFlowId: null,
    detailHe:
      flowProbe.flows.length > 0
        ? `נמצאו ${flowProbe.flows.length} תהליכי Custom Flow פעילים דרך /open/v1/task/flow/list.`
        : 'טרם נוצר תהליך Custom Flow בחשבון — ניתן לבנות ולייבא אוטומטית דרך /open/v1/task/flow/import.',
  };

  if (autoBuildFlowIfEmpty && flowProbe.ok && flowProbe.flows.length === 0) {
    const galPayload = buildBoosteraTikTokLiveChatFlowGal(installedTikTokPackage || 'com.zhiliaoapp.musically');
    const importRes = await callGeeLarkApi<{ id?: string }>('/open/v1/task/flow/import', {
      gal: galPayload,
    });
    if (importRes.ok && importRes.data?.id) {
      const createdId = String(importRes.data.id).trim();
      flowImportOutcome = {
        supported: true,
        httpStatus: importRes.httpStatus,
        code: importRes.code,
        createdFlowId: createdId,
        detailHe: `נבנה ויובא אוטומטית Custom Flow ב-GeeLark (FLOW_ID=${createdId}).`,
      };
      flowProbe = await probeGeeLarkRpaFlows();
    } else {
      flowImportOutcome = {
        supported: false,
        httpStatus: importRes.httpStatus,
        code: importRes.code,
        createdFlowId: null,
        detailHe: `בניית Custom Flow דרך /open/v1/task/flow/import החזירה: ${
          importRes.errorHe || `HTTP ${importRes.httpStatus}`
        }`,
      };
    }
  }

  const configuredFlowId =
    flowImportOutcome.createdFlowId ||
    (battleState.geelarkConfig?.selectedFlowId || '').trim() ||
    readEnvClean('GEELARK_CHAT_FLOW_ID').value;

  // Probe whether ADB data access is enabled on the verified cloud phone
  const adbProbe = targetDev
    ? await callGeeLarkApi<{ items?: Array<{ id?: string; ip?: string; port?: number | string; code?: string }> }>(
        '/open/v1/adb/getData',
        { ids: [targetDev.id] },
        6000
      )
    : { ok: false, httpStatus: 0, code: undefined, errorHe: 'אין מכשיר לבדיקת ADB' };
  const adbBinaryExists = fs.existsSync('/usr/bin/adb') || fs.existsSync('/usr/local/bin/adb');
  const adbDetailHe = adbProbe.ok
    ? adbBinaryExists
      ? 'גישת ADB פתוחה במכשיר וכלי adb זמין בשרת.'
      : 'גישת ADB ב-GeeLark החזירה נתוני חיבור, אך בסביבת הענן הנוכחית לא מותקן כלי שורת הפקודה adb.'
    : `גישת ADB למכשיר אינה זמינה דרך ה-API הנוכחי (${adbProbe.errorHe || `HTTP ${adbProbe.httpStatus}`}).`;

  const effectiveOwnedUser =
    (battleState.geelarkConfig?.ownedLiveUsername || '').trim() ||
    (readEnvClean('TIKTOK_OWNED_ROOM_USERNAME').value || '').split(',')[0]?.replace(/^@/, '').trim() ||
    targetDev?.detectedTikTokHandle ||
    '';

  // Auto-sync saved config with discovered device/flow so operator never types raw IDs
  const prevCfg = battleState.geelarkConfig || loadPersistedGeeLarkConfig();
  const nextSelectedDeviceId =
    devices.some((d) => d.id === prevCfg.selectedDeviceId)
      ? prevCfg.selectedDeviceId
      : targetDev?.id || prevCfg.selectedDeviceId;
  const nextSelectedFlowId =
    flowImportOutcome.createdFlowId ||
    (prevCfg.selectedFlowId && flowProbe.flows.some((f) => f.id === prevCfg.selectedFlowId)
      ? prevCfg.selectedFlowId
      : flowProbe.flows[0]?.id || configuredFlowId || '');
  const nextOwnedUsername = prevCfg.ownedLiveUsername || targetDev?.detectedTikTokHandle || '';

  if (
    nextSelectedDeviceId !== prevCfg.selectedDeviceId ||
    nextSelectedFlowId !== prevCfg.selectedFlowId ||
    nextOwnedUsername !== prevCfg.ownedLiveUsername
  ) {
    battleState.geelarkConfig = {
      ...prevCfg,
      selectedDeviceId: nextSelectedDeviceId,
      selectedFlowId: nextSelectedFlowId,
      ownedLiveUsername: nextOwnedUsername,
      updatedAt: Date.now(),
    };
    savePersistedGeeLarkConfig(battleState.geelarkConfig);
  }

  const rpaReady = Boolean(nextSelectedFlowId || flowProbe.flows.length > 0);
  const missingRequirementsHe: string[] = [];
  if (!rpaReady) {
    missingRequirementsHe.push(
      flowImportOutcome.supported === false
        ? `חסר Custom Flow פעיל: ${flowImportOutcome.detailHe}`
        : 'טרם יובא Custom Flow לחשבון — לחץ על "בנה והגדר Custom Flow ב-GeeLark" או שהוא ייבנה אוטומטית בעת השליחה הראשונה.'
    );
  }
  if (!effectiveOwnedUser) {
    missingRequirementsHe.push(
      'שם משתמש ה-TikTok LIVE שבשליטתך אינו נחשף אוטומטית מהמכשיר — הזן רק את ה-@username של הלייב שבשליטתך בכרטיס 2.'
    );
  }

  const capabilityReport: NonNullable<ServerBattleState['geelarkCapabilityReport']> = {
    checkedAt: Date.now(),
    targetDeviceVerified: devices.some((d) => d.id === TARGET_GEELARK_DEVICE_ID),
    targetDeviceId: TARGET_GEELARK_DEVICE_ID,
    targetDeviceName: devices.find((d) => d.id === TARGET_GEELARK_DEVICE_ID)?.serialName || targetDev?.serialName || null,
    targetDeviceStatus: devices.find((d) => d.id === TARGET_GEELARK_DEVICE_ID)?.status || targetDev?.status || null,
    detectedTikTokHandleOnDevice: targetDev?.detectedTikTokHandle || analyticsTikTokAccount || null,
    installedTikTokPackage,
    rpaFlowList: {
      ok: flowProbe.ok,
      count: flowProbe.flows.length,
      detailHe: flowProbe.ok
        ? `נשלפו ${flowProbe.flows.length} תהליכי Custom Flow מ-/open/v1/task/flow/list.`
        : `שליפת /open/v1/task/flow/list נכשלה: ${flowProbe.errorHe || 'שגיאה'}`,
    },
    customFlowCreationApi: flowImportOutcome,
    shellAccess: {
      ok: shellOk,
      httpStatus: shellHttpStatus,
      code: shellCode,
      detailHe: shellDetailHe,
    },
    adbAccess: {
      ok: adbProbe.ok && adbBinaryExists,
      httpStatus: adbProbe.httpStatus,
      code: adbProbe.code,
      adbBinaryInContainer: adbBinaryExists,
      detailHe: adbDetailHe,
    },
    missingRequirementsHe,
  };

  geelarkLastErrorHe = null;
  battleState.geelarkDevices = devices;
  battleState.geelarkRpaFlows = flowProbe.flows;
  battleState.geelarkRpaReady = rpaReady;
  battleState.geelarkCapabilityReport = capabilityReport;
  battleState.integrationAudit = computeIntegrationAudit();

  return {
    configured: true,
    connected: devices.length > 0,
    devices,
    flows: flowProbe.flows,
    capabilityReport,
    errorHe: null,
    endpointUsed: phoneRes.endpointUrl,
  };
}

async function executeToGeeLark(opts: {
  deviceId?: string;
  targetRoomUsername?: string | null;
  messageText: string;
  confirmedOwnedRoom?: boolean;
  flowId?: string;
}): Promise<{
  ok: boolean;
  status:
    | 'EXECUTED'
    | 'OWNED_ROOM_REQUIRED'
    | 'NOT_CONFIGURED'
    | 'NO_ACTIVE_DEVICE'
    | 'MISSING_RPA_FLOW_OR_PERMISSION'
    | 'EXECUTION_FAILED';
  device?: { id: string; serialName: string; status: string; envName?: string };
  taskId?: string | null;
  flowId?: string | null;
  normalizedRoom?: string;
  errorHe?: string;
  detailHe?: string;
  availableFlows?: Array<{ id: string; title: string; desc?: string; params?: string[] }>;
  capabilityReport?: ServerBattleState['geelarkCapabilityReport'];
}> {
  const cleanMsg = String(opts.messageText || '').trim();
  if (!cleanMsg) {
    return { ok: false, status: 'EXECUTION_FAILED', errorHe: 'נדרש טקסט הודעה לביצוע ב-GeeLark' };
  }

  const ownedRoomCheck = assertOwnedTikTokRoomForSend({
    requestedRoomUsername: opts.targetRoomUsername || battleState.geelarkConfig?.ownedLiveUsername || null,
    configuredOwnedRoom: getConfiguredOwnedRoomCsv(),
    confirmedOwnedRoom: opts.confirmedOwnedRoom,
  });
  if (!ownedRoomCheck.allowed) {
    return {
      ok: false,
      status: 'OWNED_ROOM_REQUIRED',
      errorHe: ownedRoomCheck.reasonHe,
    };
  }

  if (!isGeeLarkConfigured()) {
    return {
      ok: false,
      status: 'NOT_CONFIGURED',
      errorHe: 'לא ניתן לבצע פעולה במכשיר GeeLark — חסרים GEELARK_APP_ID ו-GEELARK_API_KEY בסביבה.',
    };
  }

  // Probe devices and auto-build Custom Flow if none exists yet
  let probe = await probeGeeLarkDevices(true);
  if (!probe.connected || probe.devices.length === 0) {
    return {
      ok: false,
      status: 'NO_ACTIVE_DEVICE',
      errorHe: probe.errorHe || 'אין מכשיר GeeLark פעיל מחובר כרגע.',
    };
  }

  const preferredId = String(
    opts.deviceId ||
      battleState.geelarkConfig?.selectedDeviceId ||
      readEnvClean('GEELARK_ENV_ID').value ||
      TARGET_GEELARK_DEVICE_ID
  ).trim();
  const targetDevice = probe.devices.find((d) => d.id === preferredId) || probe.devices[0];
  let configuredFlowId = String(
    opts.flowId ||
      battleState.geelarkConfig?.selectedFlowId ||
      readEnvClean('GEELARK_CHAT_FLOW_ID').value ||
      ''
  ).trim();

  if (!configuredFlowId && probe.flows.length === 0) {
    const ensured = await ensureOrImportTikTokLiveChatFlow();
    if (ensured.ok && ensured.flowId) {
      configuredFlowId = ensured.flowId;
      probe = await probeGeeLarkDevices(false);
    }
  }

  const matchedFlow =
    (configuredFlowId
      ? probe.flows.find((f) => f.id === configuredFlowId) || { id: configuredFlowId, title: 'BOOSTERA TikTok Live Chat' }
      : probe.flows.find((f) => /boostera|tiktok|chat|comment|live|msg/i.test(`${f.title} ${f.desc || ''}`)) ||
        probe.flows[0]) || null;

  if (!matchedFlow) {
    return {
      ok: false,
      status: 'MISSING_RPA_FLOW_OR_PERMISSION',
      device: targetDevice,
      normalizedRoom: ownedRoomCheck.normalizedRoom,
      availableFlows: probe.flows,
      capabilityReport: probe.capabilityReport,
      errorHe: `מכשיר GeeLark (${targetDevice.serialName} · ${targetDevice.id}) מאומת ופעיל, אך בניית/שליפת Custom Flow נדחתה ע״י GeeLark (${
        probe.capabilityReport?.customFlowCreationApi.detailHe || 'חסר FLOW_ID'
      }). לא בוצעה שליחה חיצונית.`,
    };
  }

  // Ensure cloud phone is started (non-fatal if already running)
  await callGeeLarkApi('/open/v1/phone/start', { ids: [targetDevice.id] }, 8000);

  // If Cloud Phone Shell API is supported, navigate TikTok directly into the confirmed owned LIVE room first
  if (probe.capabilityReport?.shellAccess?.ok && ownedRoomCheck.normalizedRoom) {
    const safeRoom = ownedRoomCheck.normalizedRoom.replace(/[^a-zA-Z0-9._]/g, '');
    if (safeRoom) {
      await callGeeLarkApi(
        '/open/v1/shell/execute',
        {
          id: targetDevice.id,
          cmd: `am start -a android.intent.action.VIEW -d "https://www.tiktok.com/@${safeRoom}/live"`,
        },
        7000
      );
    }
  }

  const scheduleAt = Math.floor(Date.now() / 1000) + 2;
  const rpaAdd = await callGeeLarkApi<{ taskId?: string; id?: string }>('/open/v1/task/rpa/add', {
    name: `BOOSTERA Chat @${ownedRoomCheck.normalizedRoom}`,
    remark: `Owned room verified: @${ownedRoomCheck.normalizedRoom}`,
    scheduleAt,
    id: targetDevice.id,
    flowId: matchedFlow.id,
    paramMap: {
      targetRoom: ownedRoomCheck.normalizedRoom,
      messageText: cleanMsg,
    },
  });

  if (!rpaAdd.ok) {
    return {
      ok: false,
      status: 'EXECUTION_FAILED',
      device: targetDevice,
      flowId: matchedFlow.id,
      normalizedRoom: ownedRoomCheck.normalizedRoom,
      capabilityReport: probe.capabilityReport,
      errorHe: `GeeLark /open/v1/task/rpa/add נכשל (${rpaAdd.errorHe || 'שגיאה לא ידועה'})`,
    };
  }

  const taskId = String(rpaAdd.data?.taskId || rpaAdd.data?.id || '').trim() || null;
  let taskDetailStatus = 'DISPATCHED';
  if (taskId) {
    const detailRes = await callGeeLarkApi<{ status?: string | number; failCode?: number; failDesc?: string }>(
      '/open/v1/task/detail',
      { id: taskId }
    );
    if (detailRes.ok && detailRes.data) {
      taskDetailStatus = String(detailRes.data.status ?? 'DISPATCHED');
      if (detailRes.data.failDesc) {
        return {
          ok: false,
          status: 'EXECUTION_FAILED',
          device: targetDevice,
          taskId,
          flowId: matchedFlow.id,
          normalizedRoom: ownedRoomCheck.normalizedRoom,
          errorHe: `משימת GeeLark נכשלה (code=${detailRes.data.failCode ?? 'n/a'}): ${detailRes.data.failDesc}`,
        };
      }
    }
  }

  return {
    ok: true,
    status: 'EXECUTED',
    device: targetDevice,
    taskId,
    flowId: matchedFlow.id,
    normalizedRoom: ownedRoomCheck.normalizedRoom,
    detailHe: `משימת GeeLark Custom Task (${matchedFlow.title} · flowId=${matchedFlow.id}) שוגרה למכשיר ${targetDevice.serialName} (${targetDevice.id}) לחדר שבבעלותך @${ownedRoomCheck.normalizedRoom} (taskId=${taskId || 'n/a'}, status=${taskDetailStatus})`,
  };
}

interface CouncilStageResult<T> {
  stage: ProviderStageInput;
  data: T | null;
}

async function callOpenAiCouncilPlanner(telemetryJson: string): Promise<CouncilStageResult<StructuredDirectorPlan>> {
  const keyInfo = readEnvClean('OPENAI_API_KEY');
  const requestedModel = getConfiguredOpenAiModel();

  if (!keyInfo.value) {
    return {
      stage: {
        configured: false,
        called: false,
        ok: false,
        model: requestedModel,
        requestedModel,
        actualModel: undefined,
        authOk: false,
        modelOk: false,
        keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
        summaryHe: '',
        errorHe: 'לא הוגדר OPENAI_API_KEY בשרת.',
      },
      data: null,
    };
  }

  try {
    // Official gpt-6-astra compatible payload: NO temperature, NO top_p; use max_completion_tokens & reasoning_effort
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyInfo.value}`,
      },
      body: JSON.stringify({
        model: requestedModel,
        max_completion_tokens: 2048,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are BOOSTERA's Lead Decision Council Architect for TikTok LIVE & PK Battles.
YOU (along with Claude verification) have sole authority over VFX, layer placement, target room/scope, timing, music, sound, camera, and tap stimulus. Gemini does NOT decide — it only feeds data and executes approved plans.
Return a strict JSON object with these exact fields:
{
  "situationSummaryHe": string (1-2 sharp Hebrew sentences),
  "tensionScore": number (0..100),
  "energyScore": number (0..100),
  "targetRoomOrScope": string (e.g. "OWN_STAGE" or "@username"),
  "layerPlacement": "L2_BACK_FX" | "L4_STANDARD_FRONT_FX" | "L5_TRACKED_FRONT_FX" | "L6_OPPONENT_OVERLAY" | "L7_AI_CLIENT_VIDEO" | "L8_INFO_PROMOTIONS",
  "vfxId": string | null (allowed: null, VID_01_FIREBALL_SNIPE_BLAST, VID_02_CRYO_CO2_CANNONS, VID_03_TWIN_LIGHTNING_ARCS, VID_04_COLD_SPARK_FOUNTAINS, VID_05_PK_FACTION_SMOKE_CLASH, VID_06_PLASMA_SPARK_SURGE, VID_07_QUAD_PYRO_FLAME_JETS, BEAST_08_VIOLET_PHOENIX, BEAST_09_SOLAR_TIGER, BEAST_10_ROYAL_FIRE_LION, SOLO_WARM_LOUNGE, GLOVE_POWER_SURGE, SNIPE_CRITICAL_FLASH, SHARE_CO2_CANNONS, SHARE_SMOKE_PLUMES, FOLLOW_GOLDEN_SPARKS, JOIN_ANAMORPHIC_SWEEP, CHAT_TESLA_FILAMENT, GOAL_SHOCKWAVE_RING, PRESSURE_FORKED_LIGHTNING, FINALE_PYRO_CONVERGENCE),
  "soundCueId": string | null (allowed: null, SND_SNIPE_LOCK, SND_GLOVE_POWERUP, SND_LEAD_TAKEN, SND_LEAD_LOST_TENSION, SND_FINAL_10S_HEARTBEAT, SND_ENERGY_WAKEUP_SWEEP, SND_HYPE_STADIUM_CHEER, SND_CINEMATIC_BRAAM, SND_TAP_DOPAMINE_PULSE, SND_COMBO_MILESTONE),
  "musicTrackId": string | null (allowed: null, MUS_SOLO_VELVET_LOFI, MUS_SOLO_WARM_HOUSE, MUS_BATTLE_IGNITION_PULSE, MUS_BATTLE_MOMENTUM_DRIVE, MUS_BATTLE_PRESSURE_TRAP, MUS_GLOVE_OVERCLOCK, MUS_SNIPE_TENSION_CLOCK, MUS_VICTORY_EUPHORIA),
  "cameraPreset": "STEADY_BREATH" | "BASS_PUMP" | "ZOOM_PUNCH" | "SNIPE_CREEP" | "EARTHQUAKE_SHAKE" | "DUTCH_WHIP" | "VACUUM_DROP",
  "cameraReasonHe": string,
  "tapCalloutTextHe": string | null,
  "tapDurationSec": number (5..14),
  "timingNoteHe": string,
  "rationaleHe": string
}`,
          },
          { role: 'user', content: telemetryJson },
        ],
      }),
      signal: AbortSignal.timeout(14000),
    });

    const json = (await resp.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string; code?: string; type?: string };
    };

    const actualModel = json.model || requestedModel;
    if (!resp.ok) {
      const authFailed = resp.status === 401 || resp.status === 403;
      return {
        stage: {
          configured: true,
          called: true,
          ok: false,
          model: actualModel,
          requestedModel,
          actualModel: json.model,
          authOk: !authFailed,
          modelOk: false,
          keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
          summaryHe: '',
          errorHe: `${json.error?.message || `OpenAI HTTP ${resp.status}`} [requested=${requestedModel}]`,
          timestamp: Date.now(),
        },
        data: null,
      };
    }

    const content = (json.choices?.[0]?.message?.content || '').trim();
    if (!content) {
      return {
        stage: {
          configured: true,
          called: true,
          ok: false,
          model: actualModel,
          requestedModel,
          actualModel: json.model,
          authOk: true,
          modelOk: false,
          keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
          summaryHe: '',
          errorHe: `OpenAI החזיר תשובה ריקה עבור ${requestedModel}`,
          timestamp: Date.now(),
        },
        data: null,
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        stage: {
          configured: true,
          called: true,
          ok: false,
          model: actualModel,
          requestedModel,
          actualModel: json.model,
          authOk: true,
          modelOk: true,
          keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
          summaryHe: '',
          errorHe: `תוכנית OpenAI לא הגיעה כ-JSON תקין: ${content.slice(0, 120)}`,
          timestamp: Date.now(),
        },
        data: null,
      };
    }

    const rawCam = String(parsed.cameraPreset || 'BASS_PUMP');
    const plan: StructuredDirectorPlan = {
      situationSummaryHe: String(parsed.situationSummaryHe || 'תוכנית בימוי מובנית מ-OpenAI'),
      tensionScore: Math.max(0, Math.min(100, Math.round(Number(parsed.tensionScore ?? 55)))),
      energyScore: Math.max(0, Math.min(100, Math.round(Number(parsed.energyScore ?? 60)))),
      targetRoomOrScope: String(parsed.targetRoomOrScope || 'OWN_STAGE'),
      layerPlacement: String(parsed.layerPlacement || 'L4_STANDARD_FRONT_FX'),
      vfxId: parsed.vfxId && EFFECT_RULES[String(parsed.vfxId)] ? String(parsed.vfxId) : null,
      soundCueId: parsed.soundCueId && VALID_SOUND_IDS.has(String(parsed.soundCueId)) ? String(parsed.soundCueId) : null,
      musicTrackId:
        parsed.musicTrackId && VALID_MUSIC_IDS.has(String(parsed.musicTrackId)) ? String(parsed.musicTrackId) : null,
      cameraPreset: VALID_CAMERA_PRESETS.has(rawCam as CameraPresetId) ? rawCam : 'BASS_PUMP',
      cameraReasonHe: String(parsed.cameraReasonHe || 'סנכרון מצלמה לפי מועצת OpenAI'),
      tapCalloutTextHe: parsed.tapCalloutTextHe ? String(parsed.tapCalloutTextHe).slice(0, 28) : null,
      tapDurationSec: Math.max(5, Math.min(14, Math.round(Number(parsed.tapDurationSec || 8)))),
      timingNoteHe: String(parsed.timingNoteHe || 'ביצוע מיידי לאחר בדיקת Claude ואישור שרת'),
      rationaleHe: String(parsed.rationaleHe || parsed.situationSummaryHe || ''),
    };

    return {
      stage: {
        configured: true,
        called: true,
        ok: true,
        model: actualModel,
        requestedModel,
        actualModel,
        authOk: true,
        modelOk: true,
        keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
        summaryHe: `${plan.situationSummaryHe} [${plan.layerPlacement}${plan.vfxId ? ` · ${plan.vfxId}` : ''}]`,
        timestamp: Date.now(),
      },
      data: plan,
    };
  } catch (err: unknown) {
    return {
      stage: {
        configured: true,
        called: true,
        ok: false,
        model: requestedModel,
        requestedModel,
        actualModel: undefined,
        authOk: false,
        modelOk: false,
        keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
        summaryHe: '',
        errorHe: `${err instanceof Error ? err.message : 'שגיאה בקריאה ל-OpenAI'} [requested=${requestedModel}]`,
        timestamp: Date.now(),
      },
      data: null,
    };
  }
}

async function verifyAnthropicAuth(apiKey: string): Promise<{
  authOk: boolean;
  httpStatus: number;
  errorHe: string | null;
  availableModels: string[];
}> {
  if (!apiKey) {
    return { authOk: false, httpStatus: 0, errorHe: 'חסר ANTHROPIC_API_KEY', availableModels: [] };
  }
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(8000),
    });
    const json = (await resp.json()) as {
      data?: Array<{ id?: string }>;
      error?: { message?: string; type?: string };
    };
    if (!resp.ok) {
      return {
        authOk: false,
        httpStatus: resp.status,
        errorHe: `אימות מפתח Anthropic נכשל (HTTP ${resp.status}): ${json.error?.message || 'Unauthorized'}`,
        availableModels: [],
      };
    }
    const models = (json.data || []).map((m) => String(m.id || '')).filter(Boolean);
    return { authOk: true, httpStatus: resp.status, errorHe: null, availableModels: models };
  } catch (err: unknown) {
    return {
      authOk: false,
      httpStatus: 0,
      errorHe: err instanceof Error ? err.message : 'שגיאת רשת באימות מפתח Anthropic',
      availableModels: [],
    };
  }
}

async function callClaudeCouncilInspector(
  telemetryJson: string,
  openAiPlan: StructuredDirectorPlan | null
): Promise<CouncilStageResult<ClaudeInspectionResult>> {
  const keyInfo = readEnvClean('ANTHROPIC_API_KEY');
  const requestedModel = getConfiguredAnthropicModel();

  if (!keyInfo.value) {
    return {
      stage: {
        configured: false,
        called: false,
        ok: false,
        model: requestedModel,
        requestedModel,
        authOk: false,
        modelOk: false,
        keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
        summaryHe: '',
        errorHe: 'לא הוגדר ANTHROPIC_API_KEY בשרת.',
      },
      data: null,
    };
  }

  // Separate key authentication check from specific model invocation
  const authCheck = await verifyAnthropicAuth(keyInfo.value);
  if (!authCheck.authOk) {
    return {
      stage: {
        configured: true,
        called: true,
        ok: false,
        model: requestedModel,
        requestedModel,
        authOk: false,
        modelOk: false,
        keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
        summaryHe: '',
        errorHe: authCheck.errorHe || 'כשל באימות מפתח Anthropic',
        timestamp: Date.now(),
      },
      data: null,
    };
  }

  if (!openAiPlan) {
    return {
      stage: {
        configured: true,
        called: false,
        ok: false,
        model: requestedModel,
        requestedModel,
        authOk: true,
        modelOk: false,
        keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
        summaryHe: '',
        errorHe: 'לא הופקה תוכנית OpenAI לבדיקה — מועצת Claude לא תאשר ביצוע.',
        timestamp: Date.now(),
      },
      data: null,
    };
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': keyInfo.value,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: requestedModel,
        max_tokens: 2048,
        system: `You are BOOSTERA's Chief Safety, Broadcast Compliance & Council Inspector (Claude).
You inspect OpenAI's structured live director plan against TikTok LIVE telemetry and safe-zone rules.
Respond ONLY with a single raw JSON object (no markdown fences):
{
  "verdict": "APPROVE" | "REJECT" | "DISAGREE",
  "summaryHe": string (1-2 sharp Hebrew sentences explaining your binding inspection verdict),
  "concernsHe": string[] (any safety, cooldown, layer, or target risks found),
  "suggestedAdjustmentsHe": string | null
}`,
        messages: [
          {
            role: 'user',
            content: `Live Telemetry:\n${telemetryJson}\n\nOpenAI Structured Plan To Inspect:\n${JSON.stringify(openAiPlan, null, 2)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(14000),
    });

    const json = (await resp.json()) as {
      model?: string;
      content?: Array<{ text?: string }>;
      error?: { message?: string; type?: string };
    };
    const actualModel = json.model || requestedModel;

    if (!resp.ok) {
      return {
        stage: {
          configured: true,
          called: true,
          ok: false,
          model: actualModel,
          requestedModel,
          actualModel: json.model,
          authOk: true, // Auth was already proven via GET /v1/models!
          modelOk: false,
          keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
          summaryHe: '',
          errorHe: `אימות המפתח תקין, אך קריאת המודל ${requestedModel} נכשלה: ${json.error?.message || `HTTP ${resp.status}`}`,
          timestamp: Date.now(),
        },
        data: null,
      };
    }

    const rawText = (json.content?.[0]?.text || '').trim();
    const cleanedJsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleanedJsonText);
    } catch {
      return {
        stage: {
          configured: true,
          called: true,
          ok: false,
          model: actualModel,
          requestedModel,
          actualModel: json.model,
          authOk: true,
          modelOk: true,
          keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
          summaryHe: '',
          errorHe: `תשובת Claude לא הגיעה כ-JSON תקין: ${rawText.slice(0, 120)}`,
          timestamp: Date.now(),
        },
        data: null,
      };
    }

    const vRaw = String(parsed.verdict || '').toUpperCase();
    const verdict: ClaudeInspectionResult['verdict'] =
      vRaw === 'APPROVE' ? 'APPROVE' : vRaw === 'DISAGREE' ? 'DISAGREE' : 'REJECT';

    const inspection: ClaudeInspectionResult = {
      verdict,
      summaryHe: String(parsed.summaryHe || `פסיקת Claude: ${verdict}`),
      concernsHe: Array.isArray(parsed.concernsHe) ? parsed.concernsHe.map((x) => String(x)) : [],
      suggestedAdjustmentsHe: parsed.suggestedAdjustmentsHe ? String(parsed.suggestedAdjustmentsHe) : undefined,
    };

    return {
      stage: {
        configured: true,
        called: true,
        ok: true,
        model: actualModel,
        requestedModel,
        actualModel,
        authOk: true,
        modelOk: true,
        keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
        summaryHe: `[${verdict}] ${inspection.summaryHe}`,
        timestamp: Date.now(),
      },
      data: inspection,
    };
  } catch (err: unknown) {
    return {
      stage: {
        configured: true,
        called: true,
        ok: false,
        model: requestedModel,
        requestedModel,
        authOk: true,
        modelOk: false,
        keyDiagnostic: toSafeKeyDiagnostic(keyInfo),
        summaryHe: '',
        errorHe: `${err instanceof Error ? err.message : 'שגיאה בקריאה ל-Claude'} [requested=${requestedModel}]`,
        timestamp: Date.now(),
      },
      data: null,
    };
  }
}

function recordAiDecision(decision: Omit<AiDirectorDecision, 'id' | 'timestamp'>): AiDirectorDecision {
  const now = Date.now();
  const approvalStatus: DecisionApprovalStatus = decision.approvalStatus || 'AUTO_EXECUTED';
  const trace =
    decision.pipelineTrace ||
    buildPipelineTrace({
      nowTs: now,
      liveConnected: battleState.tiktokRoom.connected,
      liveTargetUsername: battleState.tiktokRoom.targetUsername,
      liveRoomId: battleState.tiktokRoom.roomId,
      liveViewerCount: battleState.tiktokRoom.viewerCount,
      packetsCaptured: battleState.wsSniffer.totalPacketsCaptured,
      dataSummaryHe: `מצב ${battleState.streamMode} · שלב ${battleState.phase} · ניקוד ${battleState.myScore}:${battleState.opponentScore} · קצב ${battleState.likesPerSecond}/שנ׳`,
      openai: {
        configured: Boolean(readEnvClean('OPENAI_API_KEY').value),
        called: false,
        ok: false,
        requestedModel: getConfiguredOpenAiModel(),
        summaryHe: '',
      },
      claude: {
        configured: Boolean(readEnvClean('ANTHROPIC_API_KEY').value),
        called: false,
        ok: false,
        requestedModel: getConfiguredAnthropicModel(),
        summaryHe: '',
      },
      gemini: {
        configured: Boolean(readEnvClean('GEMINI_API_KEY').value),
        called: false,
        ok: approvalStatus === 'AUTO_EXECUTED' || approvalStatus === 'APPROVED_EXECUTED',
        model: 'gemini-4-hydrogen',
        role: 'collector_executor_only',
        summaryHe: 'Gemini פעל כמאסף/מבצע בלבד (אינו מקבל החלטות)',
      },
      decisionSummaryHe: decision.actionsTakenHe.join(' · ') || decision.detectedSituationHe,
      approvalMode: battleState.approvalMode || 'REQUIRE_APPROVAL',
      approvalStatus,
      executionDetailHe:
        approvalStatus === 'PENDING_APPROVAL'
          ? 'ממתין לאישור מפעיל'
          : approvalStatus === 'COUNCIL_BLOCKED'
            ? 'נחסם במועצת OpenAI + Claude — אין ביצוע או מעבר אוטומטי ל-Gemini'
            : `בוצע על מנוע הבמה המקומי (${decision.actionsTakenHe.join(' · ')})`,
      executionEvidence: [
        decision.vfxId ? `vfx=${decision.vfxId}` : '',
        decision.soundCueId ? `sound=${decision.soundCueId}` : '',
        decision.musicTrackId ? `music=${decision.musicTrackId}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      resultDetailHe:
        approvalStatus === 'COUNCIL_BLOCKED'
          ? 'עצר ללא ביצוע בהתאם לכללי מועצת ההחלטות'
          : approvalStatus === 'PENDING_APPROVAL'
            ? 'נשמר בתור האישורים ללא שינוי במה'
            : 'סטייט עודכן ושודר ל-OBS/Browser Source וללקוחות WebSocket',
    });

  const entry: AiDirectorDecision = {
    id: nextId('ai'),
    timestamp: now,
    approvalStatus,
    decidedBy: decision.decidedBy || 'DETERMINISTIC',
    executedAt: approvalStatus === 'AUTO_EXECUTED' ? now : null,
    expiresAt:
      decision.expiresAt !== undefined
        ? decision.expiresAt
        : approvalStatus === 'PENDING_APPROVAL'
          ? now + 180_000
          : null,
    ...decision,
    pipelineTrace: trace,
  };
  battleState.aiDecisions.unshift(entry);
  if (battleState.aiDecisions.length > 25) {
    const pending = battleState.aiDecisions.filter((d) => d.approvalStatus === 'PENDING_APPROVAL');
    const others = battleState.aiDecisions.filter((d) => d.approvalStatus !== 'PENDING_APPROVAL');
    const keepOthers = Math.max(0, 25 - pending.length);
    battleState.aiDecisions = [...pending, ...others.slice(0, keepOthers)].sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }
  return entry;
}

function triggerCameraKinetic(
  preset: CameraPresetId,
  intensity = 1.0,
  durationMs = 1400,
  reasonHe = 'תנועת מצלמה קינטית'
): CameraKineticEvent {
  const ev: CameraKineticEvent = {
    id: nextId('cam'),
    preset,
    intensity: Math.max(0.3, Math.min(1.5, intensity)),
    durationMs: Math.max(400, Math.min(6000, durationMs)),
    triggeredAt: Date.now(),
    reasonHe,
  };
  battleState.activeCameraEvent = ev;
  return ev;
}

function activateTapStimulus(durationSec = 8, calloutHe = 'DOUBLE TAP BOOST!') {
  battleState.tapStimulusActiveUntil = Date.now() + durationSec * 1000;
  battleState.tapCalloutTextHe = calloutHe.slice(0, 28);
  trackCueEffectiveness('TAP_DOPAMINE_STIMULUS', 'גירוי אצבע ללחיצה (Tap Stimulus)');
}

function tryTriggerOneShot(
  effectId: string,
  sourceLabel: string,
  intensity = 1,
  bypassCooldown = false
): { triggered: boolean; reason?: string; instance?: ActiveEffectInstance } {
  const rule: EffectRule | undefined =
    EFFECT_RULES[effectId] ||
    (effectId.startsWith('CUSTOM_VID_')
      ? { id: effectId, cooldownMs: 3000, priority: 8, durationMs: 8500, layer: 'FRONT' }
      : undefined);
  if (!rule) return { triggered: false, reason: 'UNKNOWN_EFFECT' };

  const now = Date.now();
  battleState.activeEffects = battleState.activeEffects.filter(
    (fx) => now - fx.triggeredAt < fx.durationMs
  );

  if (!bypassCooldown && rule.cooldownMs > 0) {
    const prev = lastTriggeredByEffect.get(effectId) ?? 0;
    if (now - prev < rule.cooldownMs) {
      return { triggered: false, reason: 'COOLDOWN' };
    }
  }

  const MAX_CONCURRENT = 3;
  if (battleState.activeEffects.length >= MAX_CONCURRENT) {
    let lowestIdx = -1;
    let lowestPrio = rule.priority;
    battleState.activeEffects.forEach((active, idx) => {
      const p = EFFECT_RULES[active.effectId]?.priority ?? 1;
      if (p < lowestPrio) {
        lowestPrio = p;
        lowestIdx = idx;
      }
    });
    if (lowestIdx === -1) {
      return { triggered: false, reason: 'POLYPHONY_CAP' };
    }
    battleState.activeEffects.splice(lowestIdx, 1);
  }

  lastTriggeredByEffect.set(effectId, now);
  const instance: ActiveEffectInstance = {
    instanceId: nextId('vfx'),
    effectId,
    triggeredAt: now,
    durationMs: rule.durationMs,
    layer: rule.layer,
    intensity,
    sourceLabel,
  };
  battleState.activeEffects.push(instance);
  trackCueEffectiveness(effectId, effectId);
  return { triggered: true, instance };
}

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: readEnvClean('GEMINI_API_KEY').value || process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Autonomous Gemini function-calling tools were removed: OpenAI + Claude Decision Council decides.

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  fs.mkdirSync(GENERATED_VIDEO_DIR, { recursive: true });
  app.use('/assets/generated', express.static(GENERATED_VIDEO_DIR));
  if (fs.existsSync(MEDIAPIPE_WASM_DIR)) {
    app.use('/mediapipe-wasm', express.static(MEDIAPIPE_WASM_DIR));
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcast(payload: unknown) {
    const raw = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    });
  }

  function emitSoundCue(soundId: string, labelHe?: string) {
    const instanceId = nextId('snd');
    broadcast({ type: 'sound:triggered', soundId, instanceId, state: battleState });
    if (labelHe) {
      pushLog({
        eventType: 'SOUND_CUE',
        userLabel: 'במאי סאונד',
        triggeredEffectId: soundId,
        status: 'TRIGGERED',
        detailHe: labelHe,
      });
    }
    return instanceId;
  }

  function emitMusicChange(trackId: string, volumePct?: number, labelHe?: string) {
    battleState.activeMusicTrackId = trackId;
    if (typeof volumePct === 'number') {
      battleState.musicVolumePct = Math.max(10, Math.min(85, Math.round(volumePct)));
    }
    broadcast({
      type: 'music:changed',
      trackId: battleState.activeMusicTrackId,
      volumePct: battleState.musicVolumePct,
      state: battleState,
    });
    if (labelHe) {
      pushLog({
        eventType: 'MUSIC_SWITCH',
        userLabel: 'במאי מוזיקה',
        triggeredEffectId: trackId,
        status: 'TRIGGERED',
        detailHe: labelHe,
      });
    }
  }

  function processTikTokEvent(payload: {
    type: string;
    count?: number;
    points?: number;
    effectId?: string;
    soundId?: string;
    trackId?: string;
    cameraPreset?: CameraPresetId;
    gesture?: PresenterGestureId;
    calloutHe?: string;
    volumePct?: number;
    user?: string;
    avatarUrl?: string;
    message?: string;
    bypassCooldown?: boolean;
  }) {
    const now = Date.now();
    const userLabel = payload.user || 'צופה בלייב';
    const count = Math.max(1, Number(payload.count || 1));

    switch (payload.type) {
      case 'like': {
        battleState.totalLikes += count;
        lastLikeReceivedTs = now;
        battleState.likeComboCount += count;
        const calib = battleState.countryCalibration;
        const step = calib.effectiveComboStep || 25;
        battleState.comboMultiplier =
          battleState.likeComboCount >= step * 6
            ? 10
            : battleState.likeComboCount >= step * 3
              ? 5
              : battleState.likeComboCount >= Math.round(step * 1.4)
                ? 3
                : battleState.likeComboCount >= Math.max(8, Math.round(step * 0.5))
                  ? 2
                  : 1;

        likeTimestamps.push({ ts: now, count });
        if (battleState.streamMode === 'BATTLE') {
          const mult = battleState.gloveRemainingSec > 0 ? 5 : 1;
          battleState.myScore += count * 3 * mult;
        }
        const phaseBoost =
          battleState.phase === 'MOMENTUM'
            ? 1.15
            : battleState.phase === 'PRESSURE'
              ? 1.25
              : battleState.phase === 'TENSION'
                ? 1.3
                : 1.0;
        const countryMult = Math.min(2.8, Math.max(0.5, calib.dynamicSensitivityMult * 0.78));
        battleState.likeEnergy = Math.min(100, battleState.likeEnergy + count * 1.65 * phaseBoost * countryMult);
        battleState.likeTier = computeLikeTier(battleState.likeEnergy, battleState.elapsedSec);

        // Reward Country-Scaled Combo Milestones (e.g. x25 in IL vs x90 in EG/BR!)
        const milestoneBucket = Math.floor(battleState.likeComboCount / step);
        if (milestoneBucket > lastMilestoneTier && battleState.likeComboCount >= step) {
          lastMilestoneTier = milestoneBucket;
          triggerCameraKinetic('ZOOM_PUNCH', 0.9, 950, `שיא רצף לייקים מכויל-מדינה x${battleState.likeComboCount}!`);
          emitSoundCue('SND_COMBO_MILESTONE', `רצף לייקים חצה x${battleState.likeComboCount} (${calib.code})!`);
          if (battleState.likeComboCount >= step * 3) {
            const tigerFx = tryTriggerOneShot('BEAST_09_SOLAR_TIGER', userLabel, 1.0, false);
            if (tigerFx.triggered && tigerFx.instance) {
              broadcast({ type: 'effect:triggered', effect: tigerFx.instance, state: battleState });
            }
          }
        }

        recordStageParticipantAvatar({
          username: userLabel,
          displayName: userLabel,
          avatarUrl: payload.avatarUrl,
          pointsDelta: count * 3,
          likesDelta: count,
          actionHe: `רצף דאבל-טאפ x${battleState.likeComboCount}`,
          spotlight:
            count >= Math.max(5, Math.round(step * 0.35)) || battleState.likeComboCount % step === 0
              ? { kind: 'COMBO_LIKE', badgeHe: `COMBO x${battleState.likeComboCount}`, durationMs: 3600 }
              : undefined,
        });

        pushLog({
          eventType: 'LIKE_COMBO',
          userLabel,
          triggeredEffectId: 'LIKE_PROGRESSIVE_CHARGE',
          status: 'ACCUMULATED',
          detailHe: `+${count} לייקים · קומבו x${battleState.likeComboCount} (מכפיל x${battleState.comboMultiplier})`,
        });
        broadcast({ type: 'state:update', state: battleState });
        return { accepted: true, combo: battleState.likeComboCount };
      }

      case 'tap_stimulus': {
        activateTapStimulus(9, payload.calloutHe || 'DOUBLE TAP x5 NOW!');
        triggerCameraKinetic('BASS_PUMP', 1.0, 2600, 'פעימת קצב לגירוי לחיצות אצבע');
        emitSoundCue('SND_TAP_DOPAMINE_PULSE', 'הופעל גירוי מיקרו-דופמין ללחיצות (Tap-Tap Stimulus)');
        broadcast({ type: 'state:update', state: battleState });
        return { accepted: true };
      }

      case 'camera_move': {
        const preset = VALID_CAMERA_PRESETS.has(payload.cameraPreset as CameraPresetId)
          ? (payload.cameraPreset as CameraPresetId)
          : 'ZOOM_PUNCH';
        const camEv = triggerCameraKinetic(preset, 1.1, 1800, `בימוי מצלמה: ${preset}`);
        pushLog({
          eventType: 'CAMERA_RIG',
          userLabel: 'במאי מצלמה',
          triggeredEffectId: preset,
          status: 'TRIGGERED',
          detailHe: `תנועת מצלמה קינטית הופעלה: ${preset}`,
        });
        broadcast({ type: 'state:update', state: battleState });
        return { accepted: true, cameraEvent: camEv };
      }

      case 'gesture': {
        const g = payload.gesture || 'HANDS_UP_HYPE';
        const labelMap: Record<PresenterGestureId, string> = {
          HANDS_UP_HYPE: 'הרמת ידיים באוויר (הייפ קהל!)',
          TAP_CALLOUT_WAVE: 'תנועת ידיים רחבה (קריאת דאבל-טאפ!)',
          LEAN_IN_CLOSE: 'התקרבות חדה לעדשה (מתח ומיקוד!)',
        };
        battleState.lastGesture = { gesture: g, ts: now, labelHe: labelMap[g] };

        if (battleState.approvalMode === 'REQUIRE_APPROVAL') {
          if (battleState.aiAutopilot) {
            const plannedPayload: PlannedExecutionPayload =
              g === 'HANDS_UP_HYPE'
                ? { vfxId: 'FOLLOW_GOLDEN_SPARKS', soundCueId: 'SND_HYPE_STADIUM_CHEER', cameraPreset: 'ZOOM_PUNCH', cameraReasonHe: labelMap[g] }
                : g === 'TAP_CALLOUT_WAVE'
                  ? { soundCueId: 'SND_TAP_DOPAMINE_PULSE', cameraPreset: 'BASS_PUMP', cameraReasonHe: labelMap[g], tapCalloutTextHe: 'TAP THE SCREEN!', tapDurationSec: 10 }
                  : { soundCueId: 'SND_CINEMATIC_BRAAM', cameraPreset: 'SNIPE_CREEP', cameraReasonHe: labelMap[g] };
            const dec = recordAiDecision({
              streamMode: battleState.streamMode,
              detectedSituationHe: `זוהתה מחוות גוף חיה (${labelMap[g]}) — ממתין לאישור מפעיל`,
              tensionScore: battleState.aiTensionScore,
              energyScore: Math.min(100, battleState.aiEnergyScore + 14),
              actionsTakenHe: [`הצעת תגובה למחוות ${g}`],
              approvalStatus: 'PENDING_APPROVAL',
              decidedBy: 'DETERMINISTIC',
              plannedPayload,
            });
            broadcast({ type: 'ai:decision', decision: dec, state: battleState });
          }
          broadcast({ type: 'state:update', state: battleState });
          return { accepted: true, gesture: g, pendingApproval: true };
        }

        if (g === 'HANDS_UP_HYPE') {
          triggerCameraKinetic('ZOOM_PUNCH', 1.15, 1300, labelMap[g]);
          emitSoundCue('SND_HYPE_STADIUM_CHEER', `מחוות מגיש זוהתה: ${labelMap[g]}`);
          const fx = tryTriggerOneShot('FOLLOW_GOLDEN_SPARKS', 'מחוות מצלמה', 1.0, true);
          if (fx.triggered && fx.instance) {
            broadcast({ type: 'effect:triggered', effect: fx.instance, state: battleState });
          }
        } else if (g === 'TAP_CALLOUT_WAVE') {
          activateTapStimulus(10, 'TAP THE SCREEN!');
          triggerCameraKinetic('BASS_PUMP', 1.1, 2800, labelMap[g]);
          emitSoundCue('SND_TAP_DOPAMINE_PULSE', `מחוות מגיש זוהתה: ${labelMap[g]}`);
        } else if (g === 'LEAN_IN_CLOSE') {
          triggerCameraKinetic('SNIPE_CREEP', 1.1, 2600, labelMap[g]);
          emitSoundCue('SND_CINEMATIC_BRAAM', `מחוות מגיש זוהתה: ${labelMap[g]}`);
        }

        if (battleState.aiAutopilot) {
          const dec = recordAiDecision({
            streamMode: battleState.streamMode,
            detectedSituationHe: `זוהתה מחוות גוף חיה במצלמה: ${labelMap[g]}`,
            tensionScore: battleState.aiTensionScore,
            energyScore: Math.min(100, battleState.aiEnergyScore + 14),
            actionsTakenHe: [`סנכרון מצלמה + סאונד + אפקט למחוות ${g}`],
          });
          broadcast({ type: 'ai:decision', decision: dec, state: battleState });
        }
        broadcast({ type: 'state:update', state: battleState });
        return { accepted: true, gesture: g };
      }

      case 'share': {
        battleState.totalShares += count;
        shareTimestamps.push(now);
        const cutoff = now - 10000;
        while (shareTimestamps.length > 0 && shareTimestamps[0] < cutoff) {
          shareTimestamps.shift();
        }
        const isStreak = shareTimestamps.length >= (battleState.countryCalibration.effectiveShareStreak || 2);
        const primaryId = isStreak ? 'SHARE_SMOKE_PLUMES' : 'VID_02_CRYO_CO2_CANNONS';
        let res = tryTriggerOneShot(primaryId, userLabel, 1, Boolean(payload.bypassCooldown));
        if (!res.triggered) {
          res = tryTriggerOneShot('SHARE_CO2_CANNONS', userLabel, 1, Boolean(payload.bypassCooldown));
        }
        triggerCameraKinetic('ZOOM_PUNCH', 0.85, 900, 'הדף שיתוף לייב');
        recordStageParticipantAvatar({
          username: userLabel,
          displayName: userLabel,
          avatarUrl: payload.avatarUrl,
          pointsDelta: 35,
          actionHe: 'שיתף את השידור החי!',
          spotlight: { kind: 'SHARE', badgeHe: 'SHARE BOOST', durationMs: 4200 },
        });
        if (res.triggered && res.instance) {
          broadcast({ type: 'effect:triggered', effect: res.instance, state: battleState });
        } else {
          broadcast({ type: 'state:update', state: battleState });
        }
        return { accepted: true, triggeredVfx: res.instance?.effectId, reason: res.reason };
      }

      case 'follow': {
        battleState.totalFollowers += count;
        recordStageParticipantAvatar({
          username: userLabel,
          displayName: userLabel,
          avatarUrl: payload.avatarUrl,
          pointsDelta: 45,
          actionHe: 'הצטרף כעוקב חדש!',
          spotlight: { kind: 'FOLLOW', badgeHe: 'NEW VIP FOLLOW', durationMs: 4400 },
        });
        let res = tryTriggerOneShot('VID_04_COLD_SPARK_FOUNTAINS', userLabel, 1, Boolean(payload.bypassCooldown));
        if (!res.triggered) {
          res = tryTriggerOneShot('FOLLOW_GOLDEN_SPARKS', userLabel, 1, Boolean(payload.bypassCooldown));
        }
        if (res.triggered && res.instance) {
          broadcast({ type: 'effect:triggered', effect: res.instance, state: battleState });
        } else {
          broadcast({ type: 'state:update', state: battleState });
        }
        return { accepted: true, triggeredVfx: res.instance?.effectId, reason: res.reason };
      }

      case 'join': {
        battleState.totalViewersJoined += count;
        pendingJoinsBatch += count;
        const joinThreshold = battleState.countryCalibration.effectiveJoinTrigger || 2;
        if (pendingJoinsBatch >= joinThreshold || payload.bypassCooldown) {
          pendingJoinsBatch = 0;
          const res = tryTriggerOneShot('JOIN_ANAMORPHIC_SWEEP', userLabel, 0.9, Boolean(payload.bypassCooldown));
          if (res.triggered && res.instance) {
            broadcast({ type: 'effect:triggered', effect: res.instance, state: battleState });
            return { accepted: true, triggeredVfx: res.instance.effectId };
          }
        }
        broadcast({ type: 'state:update', state: battleState });
        return { accepted: true };
      }

      case 'chat': {
        const chatText = (payload.message || 'אששש בלייב!').slice(0, 120);
        const resolvedAvatar = extractTikTokUserAvatar({ avatarUrl: payload.avatarUrl }, userLabel);
        battleState.recentChatMessages.unshift({
          user: userLabel,
          text: chatText,
          ts: now,
          avatarUrl: resolvedAvatar,
        });
        if (battleState.recentChatMessages.length > 100) {
          battleState.recentChatMessages.length = 100;
        }
        inspectLiveChatForModerationAndCompanion({
          sourceRoom: 'צ׳אט חי',
          sender: userLabel,
          comment: chatText,
          isMirroredRoom: true,
        });
        recordStageParticipantAvatar({
          username: userLabel,
          displayName: userLabel,
          avatarUrl: resolvedAvatar,
          pointsDelta: 15,
          actionHe: `"${chatText.slice(0, 34)}"`,
          spotlight: { kind: 'CHAT_HYPE', badgeHe: 'LIVE CHAT', durationMs: 3600 },
        });
        const res = tryTriggerOneShot('CHAT_TESLA_FILAMENT', userLabel, 0.85, Boolean(payload.bypassCooldown));
        if (res.triggered && res.instance) {
          broadcast({ type: 'effect:triggered', effect: res.instance, state: battleState });
        } else {
          broadcast({ type: 'state:update', state: battleState });
        }
        return { accepted: true, triggeredVfx: res.instance?.effectId };
      }

      case 'goal': {
        battleState.goalsCompleted += 1;
        battleState.likeEnergy = Math.min(100, battleState.likeEnergy + 22);
        battleState.likeTier = computeLikeTier(battleState.likeEnergy, battleState.elapsedSec);
        triggerCameraKinetic('EARTHQUAKE_SHAKE', 1.15, 1600, 'השלמת יעד קהילתי');
        const pyroVid = tryTriggerOneShot('VID_07_QUAD_PYRO_FLAME_JETS', userLabel, 1.0, Boolean(payload.bypassCooldown));
        if (pyroVid.triggered && pyroVid.instance) {
          broadcast({ type: 'effect:triggered', effect: pyroVid.instance, state: battleState });
        }
        const res = tryTriggerOneShot('GOAL_SHOCKWAVE_RING', userLabel, 1.0, Boolean(payload.bypassCooldown));
        if (res.triggered && res.instance) {
          broadcast({ type: 'effect:triggered', effect: res.instance, state: battleState });
        } else {
          broadcast({ type: 'state:update', state: battleState });
        }
        return { accepted: true, triggeredVfx: pyroVid.instance?.effectId || res.instance?.effectId };
      }

      case 'glove': {
        battleState.gloveRemainingSec = 30;
        battleState.likeEnergy = Math.min(100, battleState.likeEnergy + 28);
        battleState.likeTier = computeLikeTier(battleState.likeEnergy, battleState.elapsedSec);

        if (battleState.approvalMode === 'REQUIRE_APPROVAL') {
          if (battleState.aiAutopilot) {
            const dec = recordAiDecision({
              streamMode: battleState.streamMode,
              detectedSituationHe: 'זוהתה כפפת בוסט (Glove x5) ל-30 שניות — תגובת הפלזמה ממתינה לאישור מפעיל.',
              tensionScore: 88,
              energyScore: 95,
              actionsTakenHe: [
                'הצעה: VID_06_PLASMA_SPARK_SURGE + ZOOM_PUNCH',
                'מוזיקה: MUS_GLOVE_OVERCLOCK + SND_GLOVE_POWERUP + גירוי טאפ',
              ],
              approvalStatus: 'PENDING_APPROVAL',
              decidedBy: 'DETERMINISTIC',
              musicTrackId: 'MUS_GLOVE_OVERCLOCK',
              soundCueId: 'SND_GLOVE_POWERUP',
              vfxId: 'VID_06_PLASMA_SPARK_SURGE',
              plannedPayload: {
                vfxId: 'VID_06_PLASMA_SPARK_SURGE',
                musicTrackId: 'MUS_GLOVE_OVERCLOCK',
                soundCueId: 'SND_GLOVE_POWERUP',
                cameraPreset: 'ZOOM_PUNCH',
                cameraReasonHe: 'פתיחת כפפה x5!',
                tapCalloutTextHe: 'GLOVE x5 — TAP NOW!',
                tapDurationSec: 14,
              },
            });
            broadcast({ type: 'ai:decision', decision: dec, state: battleState });
          }
          broadcast({ type: 'state:update', state: battleState });
          return { accepted: true, pendingApproval: true };
        }

        activateTapStimulus(14, 'GLOVE x5 — TAP NOW!');
        triggerCameraKinetic('ZOOM_PUNCH', 1.25, 1500, 'פתיחת כפפה x5!');
        const vidRes = tryTriggerOneShot('VID_06_PLASMA_SPARK_SURGE', userLabel, 1.0, true);
        if (vidRes.triggered && vidRes.instance) {
          broadcast({ type: 'effect:triggered', effect: vidRes.instance, state: battleState });
        }
        const res = tryTriggerOneShot('GLOVE_POWER_SURGE', userLabel, 1.0, true);
        emitSoundCue('SND_GLOVE_POWERUP', 'כפפת בוסט x5 הופעלה ל-30 שניות!');

        if (battleState.aiAutopilot) {
          emitMusicChange('MUS_GLOVE_OVERCLOCK', Math.max(battleState.musicVolumePct, 46));
          const dec = recordAiDecision({
            streamMode: battleState.streamMode,
            detectedSituationHe: 'כפפת בוסט (Glove x5) פעילה ל-30 שניות! הופעל וידאו פלזמה וגיצים + גירוי אצבע + מוזיקת 145 BPM.',
            tensionScore: 88,
            energyScore: 95,
            actionsTakenHe: [
              'וידאו VFX: VID_06_PLASMA_SPARK_SURGE + GLOVE_POWER_SURGE',
              'מוזיקה: Glove Overclock + גירוי לחיצות (GLOVE x5 — TAP NOW!)',
            ],
            musicTrackId: 'MUS_GLOVE_OVERCLOCK',
            soundCueId: 'SND_GLOVE_POWERUP',
            vfxId: 'VID_06_PLASMA_SPARK_SURGE',
          });
          broadcast({ type: 'ai:decision', decision: dec, state: battleState });
        }

        if (res.triggered && res.instance) {
          broadcast({ type: 'effect:triggered', effect: res.instance, state: battleState });
        } else {
          broadcast({ type: 'state:update', state: battleState });
        }
        return { accepted: true, triggeredVfx: vidRes.instance?.effectId || res.instance?.effectId };
      }

      case 'score_us':
      case 'snipe_us': {
        const basePts = Math.max(50, Number(payload.points || (payload.type === 'snipe_us' ? 1800 : 500)));
        const mult = battleState.gloveRemainingSec > 0 ? 5 : 1;
        const added = basePts * mult;
        const prevWasBehind = battleState.myScore <= battleState.opponentScore;
        battleState.myScore += added;
        const tookLead = prevWasBehind && battleState.myScore > battleState.opponentScore;
        const isSnipe = payload.type === 'snipe_us' || battleState.snipeWindowActive;

        const whaleThreshold = battleState.countryCalibration.effectiveWhaleGiftThreshold || 299;
        recordStageParticipantAvatar({
          username: userLabel,
          displayName: userLabel,
          avatarUrl: payload.avatarUrl,
          pointsDelta: added,
          giftsDelta: 1,
          actionHe: isSnipe ? `סנייפ ענק +${added.toLocaleString()} נק׳!` : `מתנת תמיכה +${added.toLocaleString()} נק׳!`,
          spotlight: {
            kind: added >= whaleThreshold || isSnipe ? 'WHALE_GIFT' : 'GIFT',
            badgeHe: added >= whaleThreshold || isSnipe ? 'MVP WHALE GIFT' : `+${added.toLocaleString()} PTS`,
            durationMs: 5400,
          },
        });

        if (battleState.approvalMode === 'REQUIRE_APPROVAL') {
          if (battleState.aiAutopilot && (isSnipe || tookLead)) {
            const nextTrack =
              isSnipe && battleState.elapsedSec >= 225 && battleState.myScore > battleState.opponentScore + 800
                ? 'MUS_VICTORY_EUPHORIA'
                : undefined;
            const dec = recordAiDecision({
              streamMode: battleState.streamMode,
              detectedSituationHe: isSnipe
                ? `סנייפ לטובתנו (+${added.toLocaleString()} נק׳) — חבילת ההדף ממתינה לאישור מפעיל.`
                : `מהפך יתרון לטובתנו (+${added.toLocaleString()} נק׳) — אפקט הפניקס והטיה ממתינים לאישור.`,
              tensionScore: isSnipe ? 92 : 76,
              energyScore: 92,
              actionsTakenHe: [isSnipe ? 'הצעה: SNIPE_CRITICAL_FLASH + EARTHQUAKE_SHAKE' : 'הצעה: BEAST_08_VIOLET_PHOENIX + DUTCH_WHIP'],
              approvalStatus: 'PENDING_APPROVAL',
              decidedBy: 'DETERMINISTIC',
              musicTrackId: nextTrack || null,
              soundCueId: isSnipe ? 'SND_CINEMATIC_BRAAM' : 'SND_LEAD_TAKEN',
              vfxId: isSnipe ? 'SNIPE_CRITICAL_FLASH' : 'BEAST_08_VIOLET_PHOENIX',
              plannedPayload: {
                vfxId: isSnipe ? 'SNIPE_CRITICAL_FLASH' : 'BEAST_08_VIOLET_PHOENIX',
                soundCueId: isSnipe ? 'SND_CINEMATIC_BRAAM' : 'SND_LEAD_TAKEN',
                musicTrackId: nextTrack,
                cameraPreset: isSnipe ? 'EARTHQUAKE_SHAKE' : 'DUTCH_WHIP',
                cameraReasonHe: isSnipe ? 'סנייפ התקפי שלנו' : 'מהפך יתרון לטובתנו',
              },
            });
            broadcast({ type: 'ai:decision', decision: dec, state: battleState });
          }
          broadcast({ type: 'state:update', state: battleState });
          return { accepted: true, addedPoints: added, pendingApproval: true };
        }

        let vfxRes: { triggered: boolean; instance?: ActiveEffectInstance } = { triggered: false };
        if (isSnipe) {
          triggerCameraKinetic('EARTHQUAKE_SHAKE', 1.3, 1800, 'סנייפ התקפי שלנו!');
          const lion = tryTriggerOneShot('BEAST_10_ROYAL_FIRE_LION', userLabel, 1.0, true);
          if (lion.triggered && lion.instance) {
            broadcast({ type: 'effect:triggered', effect: lion.instance, state: battleState });
          }
          const fireball = tryTriggerOneShot('VID_01_FIREBALL_SNIPE_BLAST', userLabel, 1.0, true);
          if (fireball.triggered && fireball.instance) {
            broadcast({ type: 'effect:triggered', effect: fireball.instance, state: battleState });
          }
          vfxRes = tryTriggerOneShot('SNIPE_CRITICAL_FLASH', userLabel, 1.0, true);
          emitSoundCue('SND_CINEMATIC_BRAAM', `סנייפ התקפי שלנו (+${added.toLocaleString()} נק׳)!`);
        } else if (tookLead) {
          triggerCameraKinetic('DUTCH_WHIP', 1.05, 1300, 'מהפך יתרון לטובתנו');
          const phoenix = tryTriggerOneShot('BEAST_08_VIOLET_PHOENIX', userLabel, 1.0, true);
          if (phoenix.triggered && phoenix.instance) {
            broadcast({ type: 'effect:triggered', effect: phoenix.instance, state: battleState });
          }
          vfxRes = tryTriggerOneShot('GOAL_SHOCKWAVE_RING', userLabel, 0.95, true);
          emitSoundCue('SND_LEAD_TAKEN', 'עלינו ליתרון בקרב — הפניקס הסגול הוזנק!');
        } else if (basePts >= whaleThreshold) {
          const lion = tryTriggerOneShot('BEAST_10_ROYAL_FIRE_LION', userLabel, 1.0, false);
          if (lion.triggered && lion.instance) {
            broadcast({ type: 'effect:triggered', effect: lion.instance, state: battleState });
          }
        }

        if (battleState.aiAutopilot && (isSnipe || tookLead)) {
          const nextTrack =
            isSnipe && battleState.elapsedSec >= 225 && battleState.myScore > battleState.opponentScore + 800
              ? 'MUS_VICTORY_EUPHORIA'
              : battleState.activeMusicTrackId;
          if (nextTrack !== battleState.activeMusicTrackId) {
            emitMusicChange(nextTrack, 48);
          }
          const dec = recordAiDecision({
            streamMode: battleState.streamMode,
            detectedSituationHe: isSnipe
              ? `סנייפ לטובתנו (+${added.toLocaleString()} נק׳)! רעידת הדף במצלמה + הבזק סנייפ.`
              : `מהפך יתרון לטובתנו! הטיה קינטית (Dutch Whip) + טבעת הדף.`,
            tensionScore: isSnipe ? 92 : 76,
            energyScore: 92,
            actionsTakenHe: isSnipe
              ? ['רעידת מסך (EARTHQUAKE_SHAKE) + SNIPE_CRITICAL_FLASH + בראם קולנועי']
              : ['תנועת מצלמה DUTCH_WHIP + סאונד מהפך יתרון'],
            musicTrackId: nextTrack,
            soundCueId: isSnipe ? 'SND_CINEMATIC_BRAAM' : 'SND_LEAD_TAKEN',
            vfxId: vfxRes.instance?.effectId || null,
          });
          broadcast({ type: 'ai:decision', decision: dec, state: battleState });
        }

        if (vfxRes.triggered && vfxRes.instance) {
          broadcast({ type: 'effect:triggered', effect: vfxRes.instance, state: battleState });
        } else {
          broadcast({ type: 'state:update', state: battleState });
        }
        return { accepted: true, addedPoints: added };
      }

      case 'score_opponent':
      case 'snipe_opponent': {
        const added = Math.max(50, Number(payload.points || (payload.type === 'snipe_opponent' ? 2100 : 600)));
        const prevWasAhead = battleState.myScore >= battleState.opponentScore;
        battleState.opponentScore += added;
        const lostLead = prevWasAhead && battleState.opponentScore > battleState.myScore;
        const isSnipe = payload.type === 'snipe_opponent' || battleState.snipeWindowActive;

        if (battleState.approvalMode === 'REQUIRE_APPROVAL') {
          if (battleState.aiAutopilot && (isSnipe || lostLead)) {
            const targetMusic = isSnipe ? 'MUS_SNIPE_TENSION_CLOCK' : 'MUS_BATTLE_PRESSURE_TRAP';
            const dec = recordAiDecision({
              streamMode: battleState.streamMode,
              detectedSituationHe: isSnipe
                ? `איום סנייפ יריב (+${added.toLocaleString()}) — תגובת ההגנה ממתינה לאישור מפעיל.`
                : `איבדנו הובלה ליריב (+${added.toLocaleString()}) — תגובת ההתעוררות ממתינה לאישור.`,
              tensionScore: isSnipe ? 98 : 85,
              energyScore: 84,
              actionsTakenHe: [isSnipe ? 'הצעה: DEFEND SNIPE TAP + SNIPE_CRITICAL_FLASH' : 'הצעה: TAKE BACK LEAD + PRESSURE_FORKED_LIGHTNING'],
              approvalStatus: 'PENDING_APPROVAL',
              decidedBy: 'DETERMINISTIC',
              musicTrackId: targetMusic,
              soundCueId: isSnipe ? 'SND_SNIPE_LOCK' : 'SND_LEAD_LOST_TENSION',
              vfxId: isSnipe ? 'SNIPE_CRITICAL_FLASH' : 'PRESSURE_FORKED_LIGHTNING',
              plannedPayload: {
                vfxId: isSnipe ? 'SNIPE_CRITICAL_FLASH' : 'PRESSURE_FORKED_LIGHTNING',
                soundCueId: isSnipe ? 'SND_SNIPE_LOCK' : 'SND_LEAD_LOST_TENSION',
                musicTrackId: targetMusic,
                cameraPreset: isSnipe ? 'EARTHQUAKE_SHAKE' : 'DUTCH_WHIP',
                tapCalloutTextHe: isSnipe ? 'DEFEND SNIPE — TAP!' : 'TAKE BACK LEAD!',
                tapDurationSec: isSnipe ? 12 : 9,
              },
            });
            broadcast({ type: 'ai:decision', decision: dec, state: battleState });
          }
          broadcast({ type: 'state:update', state: battleState });
          return { accepted: true, opponentAdded: added, pendingApproval: true };
        }

        let vfxRes: { triggered: boolean; instance?: ActiveEffectInstance } = { triggered: false };
        if (isSnipe) {
          triggerCameraKinetic('EARTHQUAKE_SHAKE', 1.35, 1900, 'אזעקת סנייפ יריב!');
          activateTapStimulus(12, 'DEFEND SNIPE — TAP!');
          vfxRes = tryTriggerOneShot('SNIPE_CRITICAL_FLASH', 'סנייפ יריב', 1.0, true);
          emitSoundCue('SND_SNIPE_LOCK', `אזעקת סנייפ יריב (+${added.toLocaleString()} נק׳)!`);
        } else if (lostLead) {
          triggerCameraKinetic('DUTCH_WHIP', 1.1, 1400, 'אובדן הובלה ליריב');
          activateTapStimulus(9, 'TAKE BACK LEAD!');
          vfxRes = tryTriggerOneShot('PRESSURE_FORKED_LIGHTNING', 'מהפך יריב', 0.95, true);
          emitSoundCue('SND_LEAD_LOST_TENSION', 'היריב עלה ליתרון — קריאת השכמה לקהל');
        }

        if (battleState.aiAutopilot && (isSnipe || lostLead)) {
          const targetMusic = isSnipe ? 'MUS_SNIPE_TENSION_CLOCK' : 'MUS_BATTLE_PRESSURE_TRAP';
          if (battleState.activeMusicTrackId !== targetMusic && battleState.gloveRemainingSec <= 0) {
            emitMusicChange(targetMusic, 45);
          }
          const dec = recordAiDecision({
            streamMode: battleState.streamMode,
            detectedSituationHe: isSnipe
              ? `איום סנייפ מצד היריב (+${added.toLocaleString()})! הופעלה רעידת מסך + גירוי הגנה מיידי.`
              : `איבדנו את ההובלה ליריב — הופעל גירוי לחיצות והטיית מצלמה להעיר את החדר.`,
            tensionScore: isSnipe ? 98 : 85,
            energyScore: 84,
            actionsTakenHe: [
              isSnipe
                ? 'EARTHQUAKE_SHAKE + DEFEND SNIPE TAP + אזעקת סנייפ'
                : 'DUTCH_WHIP + גירוי אצבע לחזרה ליתרון + מכת ברק',
            ],
            musicTrackId: targetMusic,
            soundCueId: isSnipe ? 'SND_SNIPE_LOCK' : 'SND_LEAD_LOST_TENSION',
            vfxId: vfxRes.instance?.effectId || null,
          });
          broadcast({ type: 'ai:decision', decision: dec, state: battleState });
        }

        if (vfxRes.triggered && vfxRes.instance) {
          broadcast({ type: 'effect:triggered', effect: vfxRes.instance, state: battleState });
        } else {
          broadcast({ type: 'state:update', state: battleState });
        }
        return { accepted: true, opponentAdded: added };
      }

      case 'sound_cue': {
        const soundId = payload.soundId || 'SND_HYPE_STADIUM_CHEER';
        emitSoundCue(soundId, `הפעלת סאונד שידור: ${soundId}`);
        return { accepted: true, soundId };
      }

      case 'music_select': {
        const trackId = payload.trackId || 'MUS_SOLO_VELVET_LOFI';
        emitMusicChange(trackId, payload.volumePct, `החלפת רצועת מוזיקה: ${trackId}`);
        return { accepted: true, trackId };
      }

      case 'manual_vfx': {
        const targetId = payload.effectId || 'VID_02_CRYO_CO2_CANNONS';
        const res = tryTriggerOneShot(targetId, 'בימוי ידני', 1.0, true);
        if (
          targetId === 'GOAL_SHOCKWAVE_RING' ||
          targetId === 'FINALE_PYRO_CONVERGENCE' ||
          targetId === 'VID_01_FIREBALL_SNIPE_BLAST' ||
          targetId === 'VID_07_QUAD_PYRO_FLAME_JETS' ||
          targetId === 'BEAST_10_ROYAL_FIRE_LION'
        ) {
          triggerCameraKinetic('EARTHQUAKE_SHAKE', 1.15, 1600, targetId);
        } else if (targetId === 'BEAST_08_VIOLET_PHOENIX') {
          triggerCameraKinetic('DUTCH_WHIP', 1.0, 1250, targetId);
        } else if (
          targetId === 'VID_02_CRYO_CO2_CANNONS' ||
          targetId === 'VID_03_TWIN_LIGHTNING_ARCS' ||
          targetId === 'VID_06_PLASMA_SPARK_SURGE' ||
          targetId === 'BEAST_09_SOLAR_TIGER'
        ) {
          triggerCameraKinetic('ZOOM_PUNCH', 0.95, 1100, targetId);
        }
        if (res.triggered && res.instance) {
          broadcast({ type: 'effect:triggered', effect: res.instance, state: battleState });
        } else {
          broadcast({ type: 'state:update', state: battleState });
        }
        return { accepted: true, triggeredVfx: res.instance?.effectId };
      }

      default:
        return { accepted: false, reason: 'UNSUPPORTED_EVENT_TYPE' };
    }
  }

  // Authoritative 250ms broadcast, Combo Decay, Avatar Spotlights & Opponent Cloud X-Ray Score Sync loop
  setInterval(() => {
    const now = Date.now();
    battleState.activeEffects = battleState.activeEffects.filter(
      (fx) => now - fx.triggeredAt < fx.durationMs
    );
    battleState.avatarSpotlights = battleState.avatarSpotlights.filter(
      (sp) => now - sp.triggeredAt < sp.durationMs
    );

    // Real-time Opponent Cloud (SmokeCard) X-Ray Score Sync via Opponent's Live Room!
    if (battleState.cloudRadar.active) {
      if (now >= battleState.cloudRadar.expiresAt) {
        battleState.cloudRadar.active = false;
        battleState.cloudRadar.remainingSec = 0;
      } else {
        battleState.cloudRadar.remainingSec = Math.max(
          0,
          Number(((battleState.cloudRadar.expiresAt - now) / 1000).toFixed(1))
        );
        const oppHandle = (
          battleState.cloudRadar.opponentUsername ||
          battleState.tiktokRoom.activeOpponentUsername ||
          ''
        ).toLowerCase();
        const oppRoom = oppHandle ? activeSwarmRooms.get(oppHandle) : undefined;
        battleState.cloudRadar.opponentRoomConnected = Boolean(oppRoom?.summary.connected);

        if (oppRoom && oppRoom.summary.connected && (oppRoom.summary.hostBattlePoints > 0 || oppRoom.summary.opponentBattlePoints > 0)) {
          // In opponent's room: opponentBattlePoints is OUR score, hostBattlePoints is OPPONENT's score!
          battleState.cloudRadar.myTrueScore = oppRoom.summary.opponentBattlePoints;
          battleState.cloudRadar.opponentTrueScore = oppRoom.summary.hostBattlePoints;
          battleState.myScore = battleState.cloudRadar.myTrueScore;
          battleState.opponentScore = battleState.cloudRadar.opponentTrueScore;
        } else {
          battleState.cloudRadar.myTrueScore = battleState.myScore;
          battleState.cloudRadar.opponentTrueScore = battleState.opponentScore;
        }
        battleState.cloudRadar.scoreDiff =
          battleState.cloudRadar.myTrueScore - battleState.cloudRadar.opponentTrueScore;
      }
    } else {
      battleState.cloudRadar.myTrueScore = battleState.myScore;
      battleState.cloudRadar.opponentTrueScore = battleState.opponentScore;
      battleState.cloudRadar.scoreDiff = battleState.myScore - battleState.opponentScore;
    }

    // Decay Like-Streak Combo naturally if no taps arrived for 3.2s (creates psychological urgency to keep tapping!)
    if (now - lastLikeReceivedTs > 3200 && battleState.likeComboCount > 0) {
      battleState.likeComboCount = Math.max(0, battleState.likeComboCount - 3);
      if (battleState.likeComboCount < 50) {
        lastMilestoneTier = 0;
      }
      battleState.comboMultiplier =
        battleState.likeComboCount >= 200
          ? 10
          : battleState.likeComboCount >= 100
            ? 5
            : battleState.likeComboCount >= 40
              ? 3
              : battleState.likeComboCount >= 15
                ? 2
                : 1;
    }

    const lpsCutoff = now - 2500;
    while (likeTimestamps.length > 0 && likeTimestamps[0].ts < lpsCutoff) {
      likeTimestamps.shift();
    }
    const recentCount = likeTimestamps.reduce((acc, item) => acc + item.count, 0);
    battleState.likesPerSecond = Number((recentCount / 2.5).toFixed(1));

    if (battleState.likesPerSecond < 2) {
      battleState.likeEnergy = Math.max(0, battleState.likeEnergy - 1.35);
    } else if (battleState.likesPerSecond < 7 && battleState.likeEnergy > 38) {
      battleState.likeEnergy = Math.max(20, battleState.likeEnergy - 0.55);
    }
    battleState.likeTier = computeLikeTier(battleState.likeEnergy, battleState.elapsedSec);

    if (battleState.gloveRemainingSec > 0) {
      const prevGlove = battleState.gloveRemainingSec;
      battleState.gloveRemainingSec = Math.max(0, Number((battleState.gloveRemainingSec - 0.25).toFixed(2)));
      if (
        prevGlove > 0 &&
        battleState.gloveRemainingSec === 0 &&
        battleState.aiAutopilot &&
        battleState.approvalMode !== 'REQUIRE_APPROVAL' &&
        battleState.streamMode === 'BATTLE'
      ) {
        const fallbackTrack =
          battleState.elapsedSec >= 205
            ? 'MUS_SNIPE_TENSION_CLOCK'
            : battleState.elapsedSec >= 115
              ? 'MUS_BATTLE_PRESSURE_TRAP'
              : 'MUS_BATTLE_MOMENTUM_DRIVE';
        emitMusicChange(fallbackTrack, 38, 'חלון הכפפה הסתיים — חזרה למוזיקת שלב הקרב');
      }
    }

    battleState.snipeWindowActive = battleState.streamMode === 'BATTLE' && battleState.elapsedSec >= 205;

    if (battleState.streamMode === 'BATTLE' && battleState.isRunning) {
      battleState.elapsedSec = Number((battleState.elapsedSec + 0.25).toFixed(2));

      if (battleState.elapsedSec >= 240) {
        battleState.roundNumber += 1;
        aiMemory.totalRoundsAnalyzed += 1;
        battleState.memorySummary = buildMemorySummary();
        saveMemory(aiMemory);

        battleState.elapsedSec = 0;
        const nextPalette = PALETTE_ORDER[(battleState.roundNumber - 1) % PALETTE_ORDER.length];
        battleState.roundPalette = nextPalette;
        battleState.likeEnergy = Math.max(10, battleState.likeEnergy * 0.35);
        battleState.phase = 'IGNITION';
        battleState.snipeWindowActive = false;
        if (battleState.aiAutopilot && battleState.approvalMode !== 'REQUIRE_APPROVAL') {
          emitMusicChange('MUS_BATTLE_IGNITION_PULSE', 35);
        }
      } else {
        const nextPhase = computePhase(battleState.elapsedSec);
        battleState.phase = nextPhase;

        if (
          nextPhase === 'PRESSURE' &&
          battleState.elapsedSec >= 115 &&
          battleState.elapsedSec < 116.5 &&
          pressureEntryStrikeRound !== battleState.roundNumber &&
          battleState.approvalMode !== 'REQUIRE_APPROVAL'
        ) {
          pressureEntryStrikeRound = battleState.roundNumber;
          triggerCameraKinetic('ZOOM_PUNCH', 1.0, 1200, 'כניסה לשלב PRESSURE');
          const pkClash = tryTriggerOneShot('VID_05_PK_FACTION_SMOKE_CLASH', 'טיימר שלב 3', 1.0, true);
          if (pkClash.triggered && pkClash.instance) {
            broadcast({ type: 'effect:triggered', effect: pkClash.instance, state: battleState });
          }
          const strike = tryTriggerOneShot('VID_03_TWIN_LIGHTNING_ARCS', 'טיימר שלב 3', 0.95, true);
          if (battleState.aiAutopilot && battleState.gloveRemainingSec <= 0) {
            emitMusicChange('MUS_BATTLE_PRESSURE_TRAP', 42);
          }
          if (strike.triggered && strike.instance) {
            broadcast({ type: 'effect:triggered', effect: strike.instance, state: battleState });
          }
        }

        if (
          battleState.elapsedSec >= 205 &&
          battleState.elapsedSec < 206.5 &&
          snipeAlertTriggeredRound !== battleState.roundNumber
        ) {
          snipeAlertTriggeredRound = battleState.roundNumber;
          if (battleState.aiAutopilot) {
            if (battleState.approvalMode === 'REQUIRE_APPROVAL') {
              const dec = recordAiDecision({
                streamMode: 'BATTLE',
                detectedSituationHe: 'כניסה לחלון סנייפ (03:25) — ממתין לאישור מפעיל לפני הפעלת שעון הסנייפ והוואקום.',
                tensionScore: 92,
                energyScore: 86,
                actionsTakenHe: ['הצעה: VACUUM_DROP + MUS_SNIPE_TENSION_CLOCK + SND_SNIPE_LOCK'],
                approvalStatus: 'PENDING_APPROVAL',
                decidedBy: 'DETERMINISTIC',
                musicTrackId: 'MUS_SNIPE_TENSION_CLOCK',
                soundCueId: 'SND_SNIPE_LOCK',
                plannedPayload: {
                  musicTrackId: 'MUS_SNIPE_TENSION_CLOCK',
                  soundCueId: 'SND_SNIPE_LOCK',
                  cameraPreset: 'VACUUM_DROP',
                  cameraReasonHe: 'כניסה לחלון הסנייפ',
                },
              });
              broadcast({ type: 'ai:decision', decision: dec, state: battleState });
            } else {
              triggerCameraKinetic('VACUUM_DROP', 1.0, 2200, 'וואקום מיקוד לפני חלון סנייפ');
              emitMusicChange('MUS_SNIPE_TENSION_CLOCK', 45);
              emitSoundCue('SND_SNIPE_LOCK', '03:25 כניסה לחלון הסנייפ!');
              const dec = recordAiDecision({
                streamMode: 'BATTLE',
                detectedSituationHe: '35 שניות אחרונות (חלון סנייפ)! הופעל זום מתיחה איטי (Snipe Creep) + שעון 150 BPM.',
                tensionScore: 92,
                energyScore: 86,
                actionsTakenHe: [
                  'וואקום מצלמה (VACUUM_DROP) + זום מתח איטי (Snipe Creep)',
                  'מוזיקה: Final Snipe Clockwork + SND_SNIPE_LOCK',
                ],
                musicTrackId: 'MUS_SNIPE_TENSION_CLOCK',
                soundCueId: 'SND_SNIPE_LOCK',
                vfxId: null,
              });
              broadcast({ type: 'ai:decision', decision: dec, state: battleState });
            }
          }
        }

        if (
          battleState.elapsedSec >= 230 &&
          battleState.elapsedSec < 231.5 &&
          heartbeat10sTriggeredRound !== battleState.roundNumber &&
          battleState.approvalMode !== 'REQUIRE_APPROVAL'
        ) {
          heartbeat10sTriggeredRound = battleState.roundNumber;
          if (battleState.aiAutopilot) {
            activateTapStimulus(10, 'FINAL 10s — FULL TAP!');
            emitSoundCue('SND_FINAL_10S_HEARTBEAT', '10 שניות אחרונות — דופק לב + גירוי טאפ סיום!');
          }
        }

        if (
          nextPhase === 'FINALE' &&
          battleState.elapsedSec >= 225 &&
          battleState.elapsedSec < 226.5 &&
          finaleTriggeredForRound !== battleState.roundNumber &&
          battleState.approvalMode !== 'REQUIRE_APPROVAL'
        ) {
          finaleTriggeredForRound = battleState.roundNumber;
          triggerCameraKinetic('EARTHQUAKE_SHAKE', 1.25, 2200, 'פתיחת הגראנד פינאלה');
          const quadPyro = tryTriggerOneShot('VID_07_QUAD_PYRO_FLAME_JETS', 'טיימר פינאלה 03:45', 1.0, true);
          if (quadPyro.triggered && quadPyro.instance) {
            broadcast({ type: 'effect:triggered', effect: quadPyro.instance, state: battleState });
          }
          const fin = tryTriggerOneShot('FINALE_PYRO_CONVERGENCE', 'טיימר פינאלה 03:45', 1.0, true);
          if (fin.triggered && fin.instance) {
            broadcast({ type: 'effect:triggered', effect: fin.instance, state: battleState });
          }
        }
      }

      if (battleState.crowdTestActive) {
        const isQuietValley =
          (battleState.elapsedSec >= 42 && battleState.elapsedSec <= 54) ||
          (battleState.elapsedSec >= 104 && battleState.elapsedSec <= 114) ||
          (battleState.elapsedSec >= 165 && battleState.elapsedSec <= 174) ||
          (battleState.elapsedSec >= 218 && battleState.elapsedSec <= 224.5);

        if (!isQuietValley && Math.random() < 0.55) {
          const burst = battleState.phase === 'IGNITION' ? 3 : battleState.phase === 'MOMENTUM' ? 6 : 11;
          processTikTokEvent({ type: 'like', count: burst, user: 'קהל חי' });
        }
        if (!isQuietValley && Math.random() < 0.08) {
          const pool = ['share', 'follow', 'chat', 'join'];
          const pick = pool[Math.floor(Math.random() * pool.length)];
          processTikTokEvent({
            type: pick,
            count: pick === 'join' ? 5 : 1,
            user: 'קהל חי',
            message: 'קדימה כולם דאבל טאפ שומרים על היתרון!',
          });
        }
      }
    }

    const scoreDiffAbs = Math.abs(battleState.myScore - battleState.opponentScore);
    const closeMatchFactor = battleState.streamMode === 'BATTLE' ? Math.max(0, 32 - scoreDiffAbs / 120) : 0;
    const clockFactor = battleState.streamMode === 'BATTLE' ? (battleState.elapsedSec / 240) * 45 : 14;
    const gloveFactor = battleState.gloveRemainingSec > 0 ? 25 : 0;
    const rawTension = Math.min(100, Math.round(clockFactor + closeMatchFactor + gloveFactor));
    const rawEnergy = Math.min(
      100,
      Math.round(
        (battleState.streamMode === 'SOLO' ? 24 : 30) +
          battleState.likeEnergy * 0.55 +
          Math.min(20, battleState.likesPerSecond * 1.6)
      )
    );

    const aiFresh = now - aiMoodBias.updatedAt < 12000;
    battleState.aiTensionScore = aiFresh
      ? Math.round(aiMoodBias.tension * 0.65 + rawTension * 0.35)
      : rawTension;
    battleState.aiEnergyScore = aiFresh
      ? Math.round(aiMoodBias.energy * 0.65 + rawEnergy * 0.35)
      : rawEnergy;

    broadcast({ type: 'state:tick', state: battleState });
  }, 250);

  const activeServerExternalWs = new Map<string, WebSocket>();
  const chatRecentTimestamps: number[] = [];
  const lastCompanionMomentTs = new Map<string, number>();

  function describeRawWebcastEventHe(rawName: string): {
    labelHe: string;
    descriptionHe: string;
    category: WsCollectedEventCategory;
  } {
    const lower = rawName.toLowerCase();
    if (lower.includes('boostcard')) {
      return {
        labelHe: 'קלף האצת חשיפה (TikTok Boost Card)',
        descriptionHe: 'אירוע פתיחת קלף בוסט צופים בחדר הלייב',
        category: 'CARDS_BOOSTS',
      };
    }
    if (lower.includes('battletask')) {
      return {
        labelHe: 'משימת מהירות / בונוס בקרב (Battle Task)',
        descriptionHe: 'משימת בונוס קצובה בזמן במהלך קרב PK',
        category: 'BATTLE_PK',
      };
    }
    if (lower.includes('battlepunish')) {
      return {
        labelHe: 'סיום סיבוב קרב / זמן עונש (Battle Punish Finish)',
        descriptionHe: 'מעבר מסיום הקרב לשלב התוצאה והעונש',
        category: 'BATTLE_PK',
      };
    }
    if (lower.includes('battleitemcard')) {
      return {
        labelHe: 'שימוש בקלף קרב חי (Battle Item Card)',
        descriptionHe: 'כפפה, ענן ערפל, הארכת זמן או קלף מיוחד בקרב',
        category: 'CARDS_BOOSTS',
      };
    }
    if (lower.includes('linkmicbattle')) {
      return {
        labelHe: 'אירוע קרב PK חי (LinkMic Battle)',
        descriptionHe: 'פתיחה או שינוי סטטוס קרב בין שדרנים',
        category: 'BATTLE_PK',
      };
    }
    if (lower.includes('linkmicarmies')) {
      return {
        labelHe: 'עדכון צבאות וניקוד קרב (Battle Armies)',
        descriptionHe: 'זרם ניקוד חי ותומכים מובילים משני צידי הקרב',
        category: 'BATTLE_PK',
      };
    }
    if (lower.includes('giftbroadcast')) {
      return {
        labelHe: 'באנר מתנת-על גלובלית (Global Gift Broadcast)',
        descriptionHe: 'הכרזת מתנת ענק חוצת-חדרים בטיקטוק',
        category: 'GIFTS_DIAMONDS',
      };
    }
    if (lower.includes('gift')) {
      return {
        labelHe: `אירוע מתנה ב-WebSocket (${rawName})`,
        descriptionHe: 'שליחת מתנה/יהלומים בשידור החי',
        category: 'GIFTS_DIAMONDS',
      };
    }
    if (lower.includes('subnotify') || lower.includes('superfan')) {
      return {
        labelHe: `אירוע מנוי / SuperFan (${rawName})`,
        descriptionHe: 'הצטרפות או פעילות של מנוי מועדון מעריצים בחדר',
        category: 'CROWD_SOCIAL',
      };
    }
    if (lower.includes('envelope') || lower.includes('capsule')) {
      return {
        labelHe: `תיבת אוצר / קפסולת פרסים (${rawName})`,
        descriptionHe: 'חלוקת מטבעות או תיבת הפתעה בחדר',
        category: 'RANKS_GOALS',
      };
    }
    if (lower.includes('rank') || lower.includes('goal') || lower.includes('poll')) {
      return {
        labelHe: `אירוע דירוג / יעד / סקר (${rawName})`,
        descriptionHe: 'עדכון מיקום בדירוג, התקדמות יעד או סקר קהל חי',
        category: 'RANKS_GOALS',
      };
    }
    if (
      lower.includes('chat') ||
      lower.includes('like') ||
      lower.includes('member') ||
      lower.includes('social') ||
      lower.includes('emote') ||
      lower.includes('barrage') ||
      lower.includes('pin') ||
      lower.includes('question') ||
      lower.includes('roomuser')
    ) {
      return {
        labelHe: `אירוע קהל ואינטראקציה (${rawName})`,
        descriptionHe: 'פעילות צופים בזמן אמת מתוך צינור ה-WebSocket',
        category: 'CROWD_SOCIAL',
      };
    }
    return {
      labelHe: `אירוע WebSocket שנתפס חי (${rawName})`,
      descriptionHe: 'אירוע שזוהה אוטומטית מהאזנה חיה לזרם ה-WebSocket ומוכן לשיבוץ הפעלה',
      category: 'EXTERNAL_CUSTOM',
    };
  }

  function executeWsEventBinding(
    record: DiscoveredWsEventRecord,
    opts: {
      sourceLabel: string;
      senderUser?: string;
      avatarUrl?: string;
      numericValue?: number;
      isMirroredRoom?: boolean;
      forceManualTest?: boolean;
    }
  ): { triggered: boolean; summaryHe: string | null } {
    const b = record.binding;
    const now = Date.now();

    if (!opts.forceManualTest) {
      if (!battleState.wsSniffer.autoExecuteBoundTriggers || !b.enabled) {
        return { triggered: false, summaryHe: null };
      }
      const effectiveScope =
        battleState.wsSniffer.globalScopeOverride === 'RESPECT_BINDING'
          ? b.scope
          : battleState.wsSniffer.globalScopeOverride;
      if (effectiveScope === 'MIRRORED_ONLY' && !opts.isMirroredRoom) {
        return { triggered: false, summaryHe: null };
      }
      if (b.minNumericValue > 0 && (opts.numericValue || 0) < b.minNumericValue) {
        return { triggered: false, summaryHe: null };
      }
      const cdMs = Math.max(1, Number(b.cooldownSec || 4)) * 1000;
      if (now - (b.lastTriggeredTs || 0) < cdMs) {
        return { triggered: false, summaryHe: null };
      }
    }

    if (battleState.approvalMode === 'REQUIRE_APPROVAL' && !opts.forceManualTest) {
      b.lastTriggeredTs = now;
      savePersistedWsSniffer(battleState.wsSniffer.discoveredEvents);
      const dec = recordAiDecision({
        streamMode: battleState.streamMode,
        detectedSituationHe: `טריגר WebSocket זוהה (${record.labelHe} מ-${opts.sourceLabel}) — ממתין לאישור מפעיל`,
        tensionScore: battleState.aiTensionScore,
        energyScore: Math.min(100, battleState.aiEnergyScore + 10),
        actionsTakenHe: [
          b.vfxId && b.vfxId !== 'NONE' ? `VFX: ${b.vfxId}` : '',
          b.cameraPreset && b.cameraPreset !== 'NONE' ? `מצלמה: ${b.cameraPreset}` : '',
          b.soundCueId && b.soundCueId !== 'NONE' ? `סאונד: ${b.soundCueId}` : '',
        ].filter(Boolean),
        approvalStatus: 'PENDING_APPROVAL',
        decidedBy: 'DETERMINISTIC',
        vfxId: b.vfxId !== 'NONE' ? b.vfxId : null,
        soundCueId: b.soundCueId !== 'NONE' ? b.soundCueId : null,
        musicTrackId: b.musicTrackId !== 'KEEP' ? b.musicTrackId : null,
        plannedPayload: {
          vfxId: b.vfxId !== 'NONE' ? b.vfxId : undefined,
          cameraPreset: b.cameraPreset && b.cameraPreset !== 'NONE' ? b.cameraPreset : undefined,
          soundCueId: b.soundCueId && b.soundCueId !== 'NONE' ? b.soundCueId : undefined,
          musicTrackId: b.musicTrackId !== 'KEEP' ? b.musicTrackId : undefined,
          tapCalloutTextHe: b.calloutTextHe?.trim() || undefined,
          tapDurationSec: 8,
        },
      });
      broadcast({ type: 'ai:decision', decision: dec, state: battleState });
      return { triggered: false, summaryHe: 'הועבר לתור האישורים (REQUIRE_APPROVAL)' };
    }

    const actionsExecuted: string[] = [];

    if (b.vfxId && b.vfxId !== 'NONE') {
      const fx = tryTriggerOneShot(b.vfxId, `WS:${record.labelHe.slice(0, 20)}`, 1.0, true);
      if (fx.triggered && fx.instance) {
        broadcast({ type: 'effect:triggered', effect: fx.instance, state: battleState });
        actionsExecuted.push(`אפקט ${b.vfxId}`);
      }
    }

    if (b.cameraPreset && b.cameraPreset !== 'NONE') {
      triggerCameraKinetic(b.cameraPreset, 1.15, 1650, `שיבוץ WebSocket: ${record.labelHe}`);
      actionsExecuted.push(`מצלמה ${b.cameraPreset}`);
    }

    if (b.soundCueId && b.soundCueId !== 'NONE') {
      emitSoundCue(b.soundCueId, `שיבוץ WebSocket (${record.labelHe})`);
      actionsExecuted.push(`סאונד ${b.soundCueId}`);
    }

    if (b.musicTrackId && b.musicTrackId !== 'KEEP') {
      emitMusicChange(b.musicTrackId, Math.max(battleState.musicVolumePct, 42), `שיבוץ WebSocket: ${record.labelHe}`);
      actionsExecuted.push(`מוזיקה ${b.musicTrackId}`);
    }

    if (b.specialAction === 'CLOUD_XRAY') {
      activateOpponentCloudXray({
        durationSec: 25,
        opponentUsername: battleState.cloudRadar.opponentUsername,
        reasonHe: `הופעל משיבוץ WebSocket: ${record.labelHe}`,
      });
      actionsExecuted.push('רנטגן אנטי-ענן');
    } else if (b.specialAction === 'GLOVE_30S') {
      battleState.gloveRemainingSec = 30;
      activateTapStimulus(14, b.calloutTextHe || 'GLOVE x5 — TAP NOW!');
      actionsExecuted.push('מצב כפפה 30s');
    } else if (b.specialAction === 'SNIPE_WINDOW') {
      battleState.snipeWindowActive = true;
      activateTapStimulus(12, b.calloutTextHe || 'CRITICAL SNIPE!');
      actionsExecuted.push('חלון סנייפ');
    } else if (b.specialAction === 'AVATAR_SPOTLIGHT') {
      const who = opts.senderUser || opts.sourceLabel || 'תומך חי';
      recordStageParticipantAvatar({
        username: who,
        displayName: who,
        avatarUrl: opts.avatarUrl,
        pointsDelta: Math.max(25, Math.round(opts.numericValue || 60)),
        actionHe: record.labelHe.slice(0, 34),
        spotlight: {
          kind: 'GIFT',
          badgeHe: (b.calloutTextHe || record.labelHe).slice(0, 16),
          durationMs: 4800,
        },
      });
      actionsExecuted.push('זרקור אווטאר לבמה');
    } else if (b.specialAction === 'TAP_BOOST_BANNER') {
      activateTapStimulus(10, b.calloutTextHe || 'DOUBLE TAP NOW!');
      actionsExecuted.push('באנר הקשות');
    } else if (b.calloutTextHe && b.calloutTextHe.trim()) {
      activateTapStimulus(8, b.calloutTextHe.trim());
      actionsExecuted.push(`באנר "${b.calloutTextHe.trim()}"`);
    }

    if (actionsExecuted.length === 0) {
      return { triggered: false, summaryHe: null };
    }

    b.lastTriggeredTs = now;
    b.triggeredCount = (b.triggeredCount || 0) + 1;
    savePersistedWsSniffer(battleState.wsSniffer.discoveredEvents);

    const summaryHe = actionsExecuted.join(' + ');
    const dec = recordAiDecision({
      streamMode: battleState.streamMode,
      detectedSituationHe: `טריגר WebSocket אוטומטי הופעל (${record.labelHe} מ-${opts.sourceLabel})`,
      tensionScore: battleState.aiTensionScore,
      energyScore: Math.min(100, battleState.aiEnergyScore + 10),
      actionsTakenHe: [`הופעל: ${summaryHe}`],
      vfxId: b.vfxId !== 'NONE' ? b.vfxId : null,
      soundCueId: b.soundCueId !== 'NONE' ? b.soundCueId : null,
      musicTrackId: b.musicTrackId !== 'KEEP' ? b.musicTrackId : null,
    });
    broadcast({ type: 'ai:decision', decision: dec, state: battleState });
    return { triggered: true, summaryHe };
  }

  const highFreqSnifferThrottle = new Map<string, number>();

  function captureWsEventFrame(opts: {
    eventKey: string;
    rawEventName: string;
    sourceLabel: string;
    summaryHe: string;
    payloadObj?: any;
    numericValue?: number;
    senderUser?: string;
    avatarUrl?: string;
    isMirroredRoom?: boolean;
    customLabelHe?: string;
    customCategory?: WsCollectedEventCategory;
    throttleRecentPacketMs?: number;
  }) {
    if (!battleState.wsSniffer.snifferActive) return;
    const now = Date.now();
    battleState.wsSniffer.totalPacketsCaptured += 1;

    let record = battleState.wsSniffer.discoveredEvents.find((e) => e.eventKey === opts.eventKey);
    const extractedFields =
      opts.payloadObj && typeof opts.payloadObj === 'object'
        ? Object.keys(opts.payloadObj).filter((k) => k !== '$type').slice(0, 10)
        : [];
    let rawPreview = '{}';
    if (opts.payloadObj !== undefined) {
      try {
        rawPreview = JSON.stringify(opts.payloadObj, (_k, val) => {
          if (typeof val === 'bigint') return val.toString();
          return val;
        }).slice(0, 280);
      } catch {
        rawPreview = '{"info":"binary_or_circular_frame"}';
      }
    }

    if (!record) {
      const meta = describeRawWebcastEventHe(opts.rawEventName || opts.eventKey);
      record = {
        eventKey: opts.eventKey,
        rawEventName: opts.rawEventName || opts.eventKey,
        labelHe: opts.customLabelHe || meta.labelHe,
        descriptionHe: meta.descriptionHe,
        category: opts.customCategory || meta.category,
        seenCount: 1,
        firstSeenTs: now,
        lastSeenTs: now,
        lastSourceLabel: opts.sourceLabel,
        lastSampleSummaryHe: opts.summaryHe.slice(0, 120),
        detectedFields: extractedFields,
        lastPayloadPreview: rawPreview,
        binding: makeDefaultBinding({ enabled: false }),
      };
      battleState.wsSniffer.discoveredEvents.unshift(record);
      if (battleState.wsSniffer.discoveredEvents.length > 85) {
        battleState.wsSniffer.discoveredEvents.length = 85;
      }
      savePersistedWsSniffer(battleState.wsSniffer.discoveredEvents);
    } else {
      record.seenCount += 1;
      record.lastSeenTs = now;
      record.lastSourceLabel = opts.sourceLabel;
      record.lastSampleSummaryHe = opts.summaryHe.slice(0, 120);
      if (extractedFields.length > 0) {
        record.detectedFields = Array.from(new Set([...record.detectedFields, ...extractedFields])).slice(0, 12);
      }
      if (rawPreview !== '{}') {
        record.lastPayloadPreview = rawPreview;
      }
    }

    battleState.wsSniffer.uniqueEventTypesCount = battleState.wsSniffer.discoveredEvents.length;
    battleState.wsSniffer.activeTikTokSocketsCount = Array.from(activeSwarmRooms.values()).filter(
      (r) => r.summary.connected
    ).length;

    const execRes = executeWsEventBinding(record, {
      sourceLabel: opts.sourceLabel,
      senderUser: opts.senderUser,
      avatarUrl: opts.avatarUrl,
      numericValue: opts.numericValue,
      isMirroredRoom: opts.isMirroredRoom,
    });

    const throttleMs = opts.throttleRecentPacketMs ?? 0;
    const prevLogTs = highFreqSnifferThrottle.get(opts.eventKey) || 0;
    if (execRes.triggered || throttleMs <= 0 || now - prevLogTs >= throttleMs) {
      highFreqSnifferThrottle.set(opts.eventKey, now);
      battleState.wsSniffer.recentPackets.unshift({
        id: nextId('wspkt'),
        ts: now,
        eventKey: record.eventKey,
        labelHe: record.labelHe,
        sourceLabel: opts.sourceLabel,
        summaryHe: opts.summaryHe.slice(0, 120),
        numericValue: Math.round(opts.numericValue || 0),
        autoTriggered: execRes.triggered,
        triggeredActionsSummaryHe: execRes.summaryHe,
      });
      if (battleState.wsSniffer.recentPackets.length > 40) {
        battleState.wsSniffer.recentPackets.length = 40;
      }
    }
  }

  function dispatchCompanionCrewAction(opts: {
    moment: ChatMomentType;
    momentLabelHe: string;
    preferredRole: CompanionRoleId;
    kind: 'CHAT_VIBE_LINE' | 'MOD_CLEANUP';
    customMessageHe?: string;
    userPlaceholder?: string;
    targetOffender?: string;
    bypassCooldown?: boolean;
    injectIntoStagePreviewChat?: boolean;
  }): CompanionDispatchActionItem | null {
    const now = Date.now();
    if (!opts.bypassCooldown) {
      const prevTs = lastCompanionMomentTs.get(opts.moment) || 0;
      if (now - prevTs < 14000) return null;
    }
    lastCompanionMomentTs.set(opts.moment, now);

    const enabledAccounts = battleState.chatCompanion.accounts.filter((a) => a.enabled);
    if (enabledAccounts.length === 0) return null;
    const chosenAccount =
      enabledAccounts.find((a) => a.role === opts.preferredRole) || enabledAccounts[0];

    let lineHe = opts.customMessageHe || '';
    if (!lineHe) {
      const matchingPatterns = battleState.chatCompanion.learnedPatterns.filter(
        (p) => p.moment === opts.moment && p.autoDispatchEnabled && p.hebrewLines.length > 0
      );
      const pickedPattern =
        matchingPatterns[Math.floor(Math.random() * matchingPatterns.length)] ||
        battleState.chatCompanion.learnedPatterns[0];
      if (pickedPattern && pickedPattern.hebrewLines.length > 0) {
        lineHe =
          pickedPattern.hebrewLines[Math.floor(Math.random() * pickedPattern.hebrewLines.length)];
        pickedPattern.usedCount += 1;
      } else {
        lineHe = 'כולם ביחד בדאבל טאפ על המסך — שומרים על האנרגיה בחדר! 🔥';
      }
    }

    if (opts.userPlaceholder) {
      lineHe = lineHe.replace(/\{\{USER\}\}/g, opts.userPlaceholder);
    } else {
      lineHe = lineHe.replace(/\{\{USER\}\}/g, 'התומך שלנו');
    }

    chosenAccount.messagesDispatched += 1;
    if (opts.kind === 'MOD_CLEANUP') {
      chosenAccount.moderationsTriggered += 1;
    }

    const dispatchItem: CompanionDispatchActionItem = {
      id: nextId('comp_act'),
      ts: now,
      accountId: chosenAccount.id,
      accountHandle: chosenAccount.handle,
      accountDisplayName: chosenAccount.displayName,
      role: chosenAccount.role,
      kind: opts.kind,
      momentLabelHe: opts.momentLabelHe,
      messageTextHe: lineHe,
      targetOffender: opts.targetOffender,
      dispatchedToBridge: true,
    };

    battleState.chatCompanion.recentDispatches.unshift(dispatchItem);
    if (battleState.chatCompanion.recentDispatches.length > 35) {
      battleState.chatCompanion.recentDispatches.length = 35;
    }

    if (opts.injectIntoStagePreviewChat !== false) {
      battleState.recentChatMessages.unshift({
        user: `${chosenAccount.displayName}`,
        text: lineHe,
        ts: now,
        source: 'מנחה מלווה',
        avatarUrl: chosenAccount.avatarUrl,
      });
      if (battleState.recentChatMessages.length > 100) {
        battleState.recentChatMessages.length = 100;
      }
    }

    broadcast({
      type: 'chat_companion:dispatch',
      item: dispatchItem,
      state: battleState,
    });
    return dispatchItem;
  }

  function inspectLiveChatForModerationAndCompanion(opts: {
    sourceRoom: string;
    sender: string;
    comment: string;
    isMirroredRoom: boolean;
  }) {
    const now = Date.now();
    chatRecentTimestamps.push(now);
    while (chatRecentTimestamps.length > 0 && now - chatRecentTimestamps[0] > 60000) {
      chatRecentTimestamps.shift();
    }
    battleState.chatCompanion.chatVelocityPerMin = chatRecentTimestamps.length;

    const text = opts.comment.trim();
    if (!text) return;

    // 1. Detect Opponent Trolls, Demoralizing Bait, Toxic Messages, or Bot Spam ("מה שצריך להעיף מבחינת צ׳אט")
    const isOpponentTroll =
      /(הפסדתם|תפסידו|אין לכם סיכוי|חלשים|תפרוש|בושה|משעמם פה|יריב מפרק|ez win|you lose|loser|noobs|quit live)/i.test(
        text
      );
    const isSpamBot =
      /(http:\/\/|https:\/\/|www\.|telegram|whatsapp|ביו שלי|כנסו לפרופיל)/i.test(text) ||
      /(.)\1{9,}/.test(text);
    const isToxic = /(אפס|מטומטם|סתום|פח אשפה|גרוע ביותר|trash|idiot|stupid)/i.test(text);

    if (isOpponentTroll || isSpamBot || isToxic) {
      const reasonType: ChatModerationFlagItem['reasonType'] = isSpamBot
        ? 'SPAM_BOT'
        : isOpponentTroll
          ? 'OPPONENT_TROLL'
          : 'TOXIC_NEGATIVE';
      const reasonHe = isSpamBot
        ? 'זוהה קישור/ספאם בוט שפוגע בחשיפת החדר'
        : isOpponentTroll
          ? 'זוהה טרול מחדר יריב שמנסה להוריד מורל לצופים שלנו'
          : 'זוהתה הודעה שלילית/רעילה שפוגעת באווירת הלייב';

      const recommendedAction: ChatModerationFlagItem['recommendedAction'] = isSpamBot
        ? 'MUTE_AND_DELETE'
        : isToxic
          ? 'HIDE_USER'
          : 'POSITIVE_FLOOD';

      const flag: ChatModerationFlagItem = {
        id: nextId('modflag'),
        ts: now,
        sourceRoom: opts.sourceRoom,
        offenderUser: opts.sender,
        rawMessage: text.slice(0, 110),
        reasonType,
        reasonHe,
        recommendedAction,
        counterFloodLineHe:
          'רק אנרגיות שיא בחדר שלנו! כולם להציף לבבות כתומים ודאבל טאפ על המסך! 🧡🔥',
        resolved: Boolean(battleState.chatCompanion.autoModerationShieldEnabled),
      };

      battleState.chatCompanion.moderationFlags.unshift(flag);
      if (battleState.chatCompanion.moderationFlags.length > 30) {
        battleState.chatCompanion.moderationFlags.length = 30;
      }

      if (battleState.chatCompanion.autoModerationShieldEnabled) {
        dispatchCompanionCrewAction({
          moment: 'ANTI_TROLL_SHIELD',
          momentLabelHe: `סינון אוטומטי נגד ${opts.sender} (${reasonHe})`,
          preferredRole: 'MOD_SHIELD',
          kind: 'MOD_CLEANUP',
          targetOffender: opts.sender,
          bypassCooldown: false,
        });
      }
      return;
    }

    // 2. Detect Organic Moderator / Co-Host Hype Phrases in Live Rooms for Continuous Learning!
    if (
      battleState.chatCompanion.autoLearnFromLiveChat &&
      text.length >= 14 &&
      /(כפפה|דאבל טאפ|ורדים|סנייפ|ענן|שיתוף|כולם ביחד|תנו עבודה|double tap|glove|snipe|share the live|roses)/i.test(
        text
      )
    ) {
      battleState.chatCompanion.detectedRoomMoodHe = `קלט משפט הנחיית צ׳אט חי ב-${opts.sourceRoom}: "${text.slice(0, 42)}"`;
    } else if (battleState.chatCompanion.chatVelocityPerMin >= 18) {
      battleState.chatCompanion.detectedRoomMoodHe = `צ׳אט רותח (${battleState.chatCompanion.chatVelocityPerMin} הודעות/דקה) — אווירה גבוהה!`;
    } else {
      battleState.chatCompanion.detectedRoomMoodHe = `קצב צ׳אט: ${battleState.chatCompanion.chatVelocityPerMin} הודעות/דקה · צוות מלווים דרוך`;
    }
  }

  function ingestExternalWsFrame(sourceUrl: string, rawFrame: string) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawFrame);
    } catch {
      parsed = { rawText: rawFrame.slice(0, 200) };
    }
    const bridgeEntry = battleState.wsSniffer.externalBridges.find((b) => b.url === sourceUrl);
    if (bridgeEntry) {
      bridgeEntry.messagesReceived += 1;
      bridgeEntry.connected = true;
    }

    const evName = String(
      parsed?.event ||
        parsed?.type ||
        parsed?.msgType ||
        parsed?.action ||
        parsed?.data?.event ||
        'ExternalMessage'
    ).trim();
    const payloadData = parsed?.data ?? parsed?.payload ?? parsed;
    const sender = String(
      payloadData?.nickname ||
        payloadData?.uniqueId ||
        payloadData?.user?.nickname ||
        payloadData?.username ||
        'משתמש_חיצוני'
    );
    const numVal = Number(
      payloadData?.diamondCount ||
        payloadData?.points ||
        payloadData?.likeCount ||
        payloadData?.repeatCount ||
        0
    );
    const summary =
      String(payloadData?.comment || payloadData?.giftName || payloadData?.message || '').slice(0, 70) ||
      `אירוע ${evName} מ-${sender}`;

    captureWsEventFrame({
      eventKey: `ExternalWS:${evName}`,
      rawEventName: evName,
      sourceLabel: sourceUrl,
      summaryHe: `${sender}: ${summary}`,
      payloadObj: payloadData,
      numericValue: numVal,
      senderUser: sender,
      isMirroredRoom: true,
    });

    if (typeof payloadData?.comment === 'string' && payloadData.comment.trim()) {
      inspectLiveChatForModerationAndCompanion({
        sourceRoom: sourceUrl,
        sender,
        comment: payloadData.comment,
        isMirroredRoom: true,
      });
    }
    broadcast({ type: 'state:update', state: battleState });
  }

  wss.on('connection', (ws) => {
    battleState.connectedClients = wss.clients.size;
    ws.send(JSON.stringify({ type: 'state:init', state: battleState }));
    broadcast({ type: 'clients:count', connectedClients: battleState.connectedClients });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.action === 'tiktok_event' && msg.payload) {
          processTikTokEvent(msg.payload);
        } else if (msg.action === 'ingest_external_ws' && msg.payload?.url) {
          ingestExternalWsFrame(String(msg.payload.url), String(msg.payload.rawFrame || '{}'));
        } else if (msg.action === 'browser_ws_status' && msg.payload?.url) {
          const entry = battleState.wsSniffer.externalBridges.find((b) => b.url === msg.payload.url);
          if (entry) {
            entry.connected = Boolean(msg.payload.connected);
            entry.connecting = false;
            entry.lastErrorHe = msg.payload.errorHe || null;
            if (entry.connected && !entry.connectedSinceTs) entry.connectedSinceTs = Date.now();
            broadcast({ type: 'state:update', state: battleState });
          }
        } else if (msg.event || msg.msgType) {
          // Direct third-party WebSocket push onto /ws
          ingestExternalWsFrame('ws://direct-webhook-client', String(raw));
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      battleState.connectedClients = wss.clients.size;
      broadcast({ type: 'clients:count', connectedClients: battleState.connectedClients });
    });
  });

  app.get('/api/state', (_req, res) => {
    battleState.integrationAudit = computeIntegrationAudit();
    res.json(battleState);
  });

  app.get('/api/integrations/audit', (_req, res) => {
    const audit = computeIntegrationAudit();
    battleState.integrationAudit = audit;
    res.json({ ok: true, audit, geelarkDevices: battleState.geelarkDevices || [], state: battleState });
  });

  app.post('/api/integrations/test-providers', async (_req, res) => {
    const sampleTelemetry = JSON.stringify({
      diagnosticProbe: true,
      streamMode: battleState.streamMode,
      phase: battleState.phase,
      myScore: battleState.myScore,
      opponentScore: battleState.opponentScore,
      likesPerSecond: battleState.likesPerSecond,
    });

    const openaiPlanRes = await callOpenAiCouncilPlanner(sampleTelemetry);
    const anthropicKeyInfo = readEnvClean('ANTHROPIC_API_KEY');
    const anthropicRequestedModel = getConfiguredAnthropicModel();
    const anthropicAuth = await verifyAnthropicAuth(anthropicKeyInfo.value);

    let claudeRes: CouncilStageResult<ClaudeInspectionResult>;
    if (!anthropicKeyInfo.value) {
      claudeRes = {
        stage: {
          configured: false,
          called: false,
          ok: false,
          model: anthropicRequestedModel,
          requestedModel: anthropicRequestedModel,
          authOk: false,
          modelOk: false,
          keyDiagnostic: toSafeKeyDiagnostic(anthropicKeyInfo),
          summaryHe: '',
          errorHe: 'לא הוגדר ANTHROPIC_API_KEY בשרת.',
        },
        data: null,
      };
    } else if (!anthropicAuth.authOk) {
      claudeRes = {
        stage: {
          configured: true,
          called: true,
          ok: false,
          model: anthropicRequestedModel,
          requestedModel: anthropicRequestedModel,
          authOk: false,
          modelOk: false,
          keyDiagnostic: toSafeKeyDiagnostic(anthropicKeyInfo),
          summaryHe: '',
          errorHe: anthropicAuth.errorHe || 'כשל באימות מפתח Anthropic',
          timestamp: Date.now(),
        },
        data: null,
      };
    } else {
      const dummyPlan: StructuredDirectorPlan = openaiPlanRes.data || {
        situationSummaryHe: 'בדיקת זמינות מודל בלבד',
        tensionScore: 30,
        energyScore: 40,
        targetRoomOrScope: 'OWN_STAGE',
        layerPlacement: 'L4_STANDARD_FRONT_FX',
        vfxId: null,
        soundCueId: null,
        musicTrackId: null,
        cameraPreset: 'STEADY_BREATH',
        cameraReasonHe: 'בדיקה',
        tapCalloutTextHe: null,
        tapDurationSec: 5,
        timingNoteHe: 'diagnostic',
        rationaleHe: 'diagnostic',
      };
      claudeRes = await callClaudeCouncilInspector(sampleTelemetry, dummyPlan);
    }

    const geminiKeyInfo = readEnvClean('GEMINI_API_KEY');
    let geminiDiag: {
      configured: boolean;
      requestedModel: string;
      actualModel?: string;
      authOk: boolean;
      modelOk: boolean;
      error?: string;
    } = {
      configured: Boolean(geminiKeyInfo.value),
      requestedModel: 'gemini-4-hydrogen',
      authOk: false,
      modelOk: false,
    };
    if (geminiKeyInfo.value) {
      try {
        const ai = getGeminiClient();
        const r = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: 'Reply with OK',
        });
        geminiDiag = {
          configured: true,
          requestedModel: 'gemini-4-hydrogen',
          actualModel: 'gemini-4-hydrogen',
          authOk: true,
          modelOk: Boolean((r.text || '').trim()),
        };
      } catch (err: unknown) {
        geminiDiag = {
          configured: true,
          requestedModel: 'gemini-4-hydrogen',
          authOk: false,
          modelOk: false,
          error: err instanceof Error ? err.message : 'שגיאה בקריאה ל-Gemini',
        };
      }
    }

    const geelarkProbe = await probeGeeLarkDevices();

    battleState.providerDiagnostics = {
      checkedAt: Date.now(),
      openai: {
        configured: openaiPlanRes.stage.configured,
        requestedModel: openaiPlanRes.stage.requestedModel || getConfiguredOpenAiModel(),
        actualModel: openaiPlanRes.stage.actualModel || null,
        authOk: Boolean(openaiPlanRes.stage.authOk),
        modelOk: Boolean(openaiPlanRes.stage.modelOk),
        ok: Boolean(openaiPlanRes.stage.ok),
        errorHe: openaiPlanRes.stage.errorHe,
        keyDiagnostic: openaiPlanRes.stage.keyDiagnostic,
      },
      claude: {
        configured: claudeRes.stage.configured,
        requestedModel: claudeRes.stage.requestedModel || anthropicRequestedModel,
        actualModel: claudeRes.stage.actualModel || null,
        authOk: anthropicAuth.authOk,
        modelOk: Boolean(claudeRes.stage.modelOk),
        ok: Boolean(claudeRes.stage.ok),
        errorHe: claudeRes.stage.errorHe || anthropicAuth.errorHe || undefined,
        keyDiagnostic: toSafeKeyDiagnostic(anthropicKeyInfo),
      },
      gemini: {
        configured: geminiDiag.configured,
        requestedModel: geminiDiag.requestedModel,
        actualModel: geminiDiag.actualModel || null,
        authOk: geminiDiag.authOk,
        modelOk: geminiDiag.modelOk,
        ok: geminiDiag.authOk && geminiDiag.modelOk,
        errorHe: geminiDiag.error,
        keyDiagnostic: toSafeKeyDiagnostic(geminiKeyInfo),
      },
      geelark: {
        configured: geelarkProbe.configured,
        connected: geelarkProbe.connected,
        devicesCount: geelarkProbe.devices.length,
        rpaFlowsCount: geelarkProbe.flows.length,
        rpaReady: Boolean(battleState.geelarkRpaReady),
        errorHe: geelarkProbe.errorHe || undefined,
      },
    };
    battleState.integrationAudit = computeIntegrationAudit();
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, diagnostics: battleState.providerDiagnostics, state: battleState });
  });

  app.post('/api/geelark/probe', async (req, res) => {
    const autoBuild = Boolean(req.body?.autoBuildFlow);
    const probe = await probeGeeLarkDevices(autoBuild);
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: probe.connected, ...probe, audit: battleState.integrationAudit, state: battleState });
  });

  app.post('/api/geelark/ensure-chat-flow', async (req, res) => {
    const existingFlowId = req.body?.flowId ? String(req.body.flowId) : battleState.geelarkConfig?.selectedFlowId;
    const ensured = await ensureOrImportTikTokLiveChatFlow(existingFlowId);
    broadcast({ type: 'state:update', state: battleState });
    res.status(ensured.ok ? 200 : 422).json({
      ...ensured,
      config: battleState.geelarkConfig,
      flows: battleState.geelarkRpaFlows,
      capabilityReport: battleState.geelarkCapabilityReport,
      state: battleState,
    });
  });

  app.post('/api/geelark/config', async (req, res) => {
    const prev = battleState.geelarkConfig || loadPersistedGeeLarkConfig();
    const selectedDeviceId =
      req.body?.selectedDeviceId !== undefined ? String(req.body.selectedDeviceId).trim() : prev.selectedDeviceId;
    const selectedFlowId =
      req.body?.selectedFlowId !== undefined ? String(req.body.selectedFlowId).trim() : prev.selectedFlowId;
    const ownedLiveUsername =
      req.body?.ownedLiveUsername !== undefined
        ? sanitizeTikTokHandle(String(req.body.ownedLiveUsername))
        : prev.ownedLiveUsername;
    const selectedLiveRoom =
      req.body?.selectedLiveRoom !== undefined
        ? sanitizeTikTokHandle(String(req.body.selectedLiveRoom))
        : prev.selectedLiveRoom;

    battleState.geelarkConfig = {
      selectedDeviceId: selectedDeviceId || prev.selectedDeviceId,
      selectedFlowId,
      ownedLiveUsername,
      selectedLiveRoom,
      updatedAt: Date.now(),
    };
    savePersistedGeeLarkConfig(battleState.geelarkConfig);

    let liveConnectResult: { connected: boolean; errorHe?: string } | null = null;
    if (req.body?.connectOwnedLiveNow && ownedLiveUsername) {
      const cRes = await connectCreatorToSwarm(ownedLiveUsername, {
        listenMode: 'MY_BROADCAST',
        mirrorToStage: true,
        addToWatchlist: true,
      });
      liveConnectResult = { connected: cRes.connected, errorHe: cRes.errorHe };
    }

    if (battleState.geelarkCapabilityReport) {
      await probeGeeLarkDevices();
    } else {
      battleState.integrationAudit = computeIntegrationAudit();
    }

    broadcast({ type: 'state:update', state: battleState });
    res.json({
      ok: true,
      config: battleState.geelarkConfig,
      liveConnectResult,
      state: battleState,
    });
  });

  app.post('/api/geelark/execute-chat', async (req, res) => {
    const messageText = String(req.body?.messageText || '').trim();
    const deviceId = String(
      req.body?.deviceId ||
        battleState.geelarkConfig?.selectedDeviceId ||
        readEnvClean('GEELARK_ENV_ID').value ||
        TARGET_GEELARK_DEVICE_ID
    ).trim();
    const targetRoomUsername = req.body?.targetRoomUsername
      ? String(req.body.targetRoomUsername)
      : battleState.geelarkConfig?.ownedLiveUsername || battleState.tiktokRoom.targetUsername;
    const confirmedOwnedRoom = Boolean(req.body?.confirmedOwnedRoom);
    const flowId = req.body?.flowId
      ? String(req.body.flowId)
      : battleState.geelarkConfig?.selectedFlowId || undefined;

    if (!messageText) {
      res.status(400).json({ ok: false, status: 'EXECUTION_FAILED', errorHe: 'נדרש טקסט הודעה לביצוע' });
      return;
    }

    const dispatchTs = Date.now();
    const result = await executeToGeeLark({
      deviceId,
      targetRoomUsername,
      messageText,
      confirmedOwnedRoom,
      flowId,
    });

    const httpStatus =
      result.ok
        ? 200
        : result.status === 'OWNED_ROOM_REQUIRED'
          ? 403
          : result.status === 'NOT_CONFIGURED' || result.status === 'NO_ACTIVE_DEVICE'
            ? 412
            : result.status === 'MISSING_RPA_FLOW_OR_PERMISSION'
              ? 422
              : 502;

    let verifiedInLiveChat = false;
    let verificationDetailHe = 'לא שוגרה הודעה חיצונית — אימות הופעה בצ׳אט לא בוצע.';

    if (result.ok && result.normalizedRoom) {
      await connectCreatorToSwarm(result.normalizedRoom, {
        listenMode: 'MY_BROADCAST',
        mirrorToStage: true,
        silentIfOffline: true,
      });

      const deadline = Date.now() + 7000;
      const needle = messageText.toLowerCase();
      const targetHandle = `@${result.normalizedRoom.toLowerCase()}`;
      while (Date.now() < deadline) {
        const seen = battleState.recentChatMessages.find(
          (m) =>
            m.ts >= dispatchTs - 1000 &&
            (m.source || '').toLowerCase() === targetHandle &&
            m.text.toLowerCase().includes(needle)
        );
        if (seen) {
          verifiedInLiveChat = true;
          verificationDetailHe = `אומת בפועל בצ׳אט החי של ${targetHandle} ע״י tiktok-live-connector (מאת ${seen.user}: "${seen.text}")`;
          break;
        }
        await new Promise((r) => setTimeout(r, 700));
      }

      if (!verifiedInLiveChat) {
        verificationDetailHe = `המשימה שוגרה ל-GeeLark (taskId=${result.taskId || 'n/a'}), אך ההודעה טרם נצפתה בפיד החי של ${targetHandle} ב-tiktok-live-connector בתוך 7 שניות.`;
      }

      pushLog({
        eventType: verifiedInLiveChat ? 'GEELARK_CHAT_VERIFIED' : 'GEELARK_CHAT_SENT',
        userLabel: result.device?.serialName || 'GeeLark',
        triggeredEffectId: result.taskId || null,
        status: 'TRIGGERED',
        detailHe: `${result.detailHe || ''} · ${verificationDetailHe}`,
      });
    }
    broadcast({ type: 'state:update', state: battleState });
    res.status(httpStatus).json({
      ...result,
      verifiedInLiveChat,
      verificationDetailHe,
      state: battleState,
    });
  });

  app.post('/api/memory/approve-proposal', (req, res) => {
    const { kind, id, action, actor } = req.body || {};
    const decisionAction = action === 'REJECT' ? 'REJECT' : 'APPROVE';
    const actorName = String(actor || 'מפעיל אולפן').trim();
    const now = Date.now();

    if (kind === 'rule') {
      const rule = aiMemory.energyRules.find((r) => r.id === id);
      if (!rule) {
        res.status(404).json({ ok: false, errorHe: 'חוק לא נמצא בזיכרון' });
        return;
      }
      if (decisionAction === 'APPROVE') {
        rule.approved = true;
        rule.status = 'APPROVED';
        rule.active = true;
        rule.version = (rule.version || 0) + 1;
        rule.approvedAt = now;
        rule.approvedBy = actorName;
      } else {
        rule.approved = false;
        rule.status = 'REJECTED';
        rule.active = false;
      }
      battleState.memorySummary = buildMemorySummary();
      saveMemory(aiMemory);
      broadcast({ type: 'state:update', state: battleState });
      res.json({ ok: true, rule, state: battleState });
      return;
    }

    if (kind === 'tool') {
      const tool = aiMemory.discoveredTools.find((t) => t.id === id);
      if (!tool) {
        res.status(404).json({ ok: false, errorHe: 'כלי לא נמצא בארגז הכלים' });
        return;
      }
      if (decisionAction === 'APPROVE') {
        tool.approved = true;
        tool.status = 'APPROVED';
        tool.autoEnabled = true;
        tool.version = (tool.version || 0) + 1;
        tool.approvedAt = now;
        tool.approvedBy = actorName;
      } else {
        tool.approved = false;
        tool.status = 'REJECTED';
        tool.autoEnabled = false;
      }
      battleState.memorySummary = buildMemorySummary();
      saveMemory(aiMemory);
      broadcast({ type: 'state:update', state: battleState });
      res.json({ ok: true, tool, state: battleState });
      return;
    }

    if (kind === 'ws_binding') {
      const rec = battleState.wsSniffer.discoveredEvents.find((e) => e.eventKey === id);
      if (!rec) {
        res.status(404).json({ ok: false, errorHe: 'אירוע WebSocket לא נמצא' });
        return;
      }
      rec.binding.enabled = decisionAction === 'APPROVE';
      savePersistedWsSniffer(battleState.wsSniffer.discoveredEvents);
      broadcast({ type: 'state:update', state: battleState });
      res.json({ ok: true, record: rec, state: battleState });
      return;
    }

    res.status(400).json({ ok: false, errorHe: 'סוג הצעה לא נתמך (rule | tool | ws_binding)' });
  });

  app.post('/api/ai-video/generate', async (req, res) => {
    const { imageBase64, mimeType, promptHe, styleNote } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.length < 32) {
      res.status(400).json({ ok: false, errorHe: 'חסרה תמונת לקוח (base64) ליצירת וידאו AI' });
      return;
    }
    const cleanMime = String(mimeType || 'image/jpeg').trim();
    const cleanPrompt = String(promptHe || 'Animate this client photo into an energetic vertical 9:16 TikTok LIVE stage video with subtle studio lighting').trim();

    battleState.aiClientVideo = {
      status: 'GENERATING',
      videoUrl: null,
      promptHe: cleanPrompt,
      updatedAt: Date.now(),
      errorHe: null,
    };
    broadcast({ type: 'state:update', state: battleState });

    try {
      const ai = getGeminiClient();
      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: [
            {
              type: 'image',
              mime_type: cleanMime,
              data: imageBase64.replace(/^data:[^;]+;base64,/, ''),
            },
            {
              type: 'text',
              text: `${cleanPrompt}${styleNote ? ` (${String(styleNote)})` : ''}. Vertical 9:16 broadcast-ready animation.`,
            },
          ],
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: '9:16',
            duration: '5s',
            resolution: '720p',
          },
        },
        { timeout: 300000 }
      );

      const typedInteraction = interaction as {
        output_video?: { data?: string; mime_type?: string };
        outputs?: Array<{ type?: string; data?: string; mime_type?: string }>;
      };
      const base64Video =
        typedInteraction.output_video?.data ||
        typedInteraction.outputs?.find((o) => o.type === 'video' && o.data)?.data;

      if (!base64Video) {
        battleState.aiClientVideo = {
          status: 'FAILED',
          videoUrl: null,
          promptHe: cleanPrompt,
          updatedAt: Date.now(),
          errorHe: 'לא התקבלו נתוני וידאו מהמודל gemini-omni-1.2-flash.',
        };
        broadcast({ type: 'state:update', state: battleState });
        res.status(502).json({ ok: false, errorHe: battleState.aiClientVideo.errorHe, state: battleState });
        return;
      }

      fs.mkdirSync(GENERATED_VIDEO_DIR, { recursive: true });
      const fileName = `client_video_${Date.now()}.mp4`;
      const fullPath = path.join(GENERATED_VIDEO_DIR, fileName);
      fs.writeFileSync(fullPath, Buffer.from(base64Video, 'base64'));

      const videoUrl = `/assets/generated/${fileName}`;
      battleState.aiClientVideo = {
        status: 'READY',
        videoUrl,
        promptHe: cleanPrompt,
        updatedAt: Date.now(),
        errorHe: null,
      };
      pushLog({
        eventType: 'AI_CLIENT_VIDEO_READY',
        userLabel: 'Omni Video Studio',
        triggeredEffectId: fileName,
        status: 'TRIGGERED',
        detailHe: `נוצר וידאו AI מתמונת לקוח (${fileName}) ומוכן לשכבה 7`,
      });
      broadcast({ type: 'state:update', state: battleState });
      res.json({ ok: true, aiClientVideo: battleState.aiClientVideo, state: battleState });
    } catch (err: unknown) {
      const errHe = err instanceof Error ? err.message : 'שגיאה ביצירת וידאו AI מתמונת לקוח';
      battleState.aiClientVideo = {
        status: 'FAILED',
        videoUrl: null,
        promptHe: cleanPrompt,
        updatedAt: Date.now(),
        errorHe: errHe,
      };
      broadcast({ type: 'state:update', state: battleState });
      res.status(500).json({ ok: false, errorHe: errHe, state: battleState });
    }
  });

  app.post('/api/ai-video/clear', (_req, res) => {
    battleState.aiClientVideo = {
      status: 'IDLE',
      videoUrl: null,
      promptHe: null,
      updatedAt: Date.now(),
      errorHe: null,
    };
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, state: battleState });
  });

  app.post('/api/ai-director/approval-mode', (req, res) => {
    const mode = req.body?.approvalMode === 'REQUIRE_APPROVAL' ? 'REQUIRE_APPROVAL' : 'AUTO_EXECUTE';
    battleState.approvalMode = mode;
    battleState.integrationAudit = computeIntegrationAudit();
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, approvalMode: mode, state: battleState });
  });

  app.post('/api/ai-director/approval-action', async (req, res) => {
    const decisionId = String(req.body?.decisionId || '').trim();
    const action = req.body?.action === 'REJECT' ? 'REJECT' : 'APPROVE';
    const actor = String(req.body?.actor || 'מפעיל אולפן').trim();
    const shouldExecuteGeeLark = Boolean(req.body?.executeToGeeLark);
    const geelarkChatText = req.body?.geelarkMessageText ? String(req.body.geelarkMessageText) : '';
    const geelarkTargetRoom = req.body?.targetRoomUsername
      ? String(req.body.targetRoomUsername)
      : battleState.tiktokRoom.targetUsername;
    const confirmedOwnedRoom = Boolean(req.body?.confirmedOwnedRoom);
    const nowTs = Date.now();

    const idx = battleState.aiDecisions.findIndex((d) => d.id === decisionId);
    if (idx < 0) {
      res.status(404).json({ ok: false, errorHe: 'החלטה לא נמצאה בתור ההחלטות' });
      return;
    }

    const decision = battleState.aiDecisions[idx];
    if (action === 'REJECT') {
      const tr = applyApprovalTransition(decision, 'REJECT', actor, nowTs);
      if (!tr.ok) {
        res.status(409).json({ ok: false, errorHe: tr.errorHe });
        return;
      }
      battleState.aiDecisions[idx] = tr.updated;
      broadcast({ type: 'ai:decision', decision: tr.updated, state: battleState });
      res.json({ ok: true, decision: tr.updated, state: battleState });
      return;
    }

    // Check expiration & status BEFORE running ANY stage effects!
    if (decision.councilApproved === false || decision.approvalStatus === 'COUNCIL_BLOCKED') {
      res.status(409).json({
        ok: false,
        errorHe: 'לא ניתן לאשר או להפעיל החלטה שנחסמה ע״י מועצת OpenAI + Claude.',
      });
      return;
    }

    if ((decision.approvalStatus || 'AUTO_EXECUTED') !== 'PENDING_APPROVAL') {
      res.status(409).json({
        ok: false,
        errorHe: `לא ניתן לאשר החלטה בסטטוס ${decision.approvalStatus} (חסימת אישור כפול)`,
      });
      return;
    }

    if (decision.expiresAt && nowTs > decision.expiresAt) {
      const expiredTr = applyApprovalTransition(decision, 'APPROVE', actor, nowTs);
      battleState.aiDecisions[idx] = expiredTr.updated;
      broadcast({ type: 'ai:decision', decision: expiredTr.updated, state: battleState });
      res.status(409).json({
        ok: false,
        errorHe: expiredTr.errorHe || 'תוקף ההחלטה פג לפני האישור.',
        decision: expiredTr.updated,
        state: battleState,
      });
      return;
    }

    const payload = decision.plannedPayload || {};
    const executedParts: string[] = [];
    const evidenceParts: string[] = [];

    if (payload.musicTrackId && VALID_MUSIC_IDS.has(payload.musicTrackId)) {
      emitMusicChange(payload.musicTrackId, undefined, 'בוצע לאחר אישור מפעיל');
      executedParts.push(`מוזיקה: ${payload.musicTrackId}`);
      evidenceParts.push(`music=${payload.musicTrackId}`);
    }
    if (payload.soundCueId && VALID_SOUND_IDS.has(payload.soundCueId)) {
      emitSoundCue(payload.soundCueId, 'סאונד אושר ובוצע');
      executedParts.push(`סאונד: ${payload.soundCueId}`);
      evidenceParts.push(`sound=${payload.soundCueId}`);
    }
    if (payload.vfxId && EFFECT_RULES[payload.vfxId]) {
      const vfx = tryTriggerOneShot(payload.vfxId, 'החלטה מאושרת', 1.0, true);
      if (vfx.triggered && vfx.instance) {
        broadcast({ type: 'effect:triggered', effect: vfx.instance, state: battleState });
        executedParts.push(`VFX: ${payload.vfxId}`);
        evidenceParts.push(`vfx=${payload.vfxId}`);
      }
    }
    if (payload.cameraPreset && VALID_CAMERA_PRESETS.has(payload.cameraPreset as CameraPresetId)) {
      triggerCameraKinetic(
        payload.cameraPreset as CameraPresetId,
        1.0,
        1500,
        payload.cameraReasonHe || 'תנועת מצלמה מאושרת'
      );
      executedParts.push(`מצלמה: ${payload.cameraPreset}`);
      evidenceParts.push(`camera=${payload.cameraPreset}`);
    }
    if (payload.tapCalloutTextHe) {
      activateTapStimulus(payload.tapDurationSec || 8, payload.tapCalloutTextHe);
      emitSoundCue('SND_TAP_DOPAMINE_PULSE');
      executedParts.push(`גירוי טאפ: ${payload.tapCalloutTextHe}`);
      evidenceParts.push('tap=active');
    }

    if (executedParts.length === 0) {
      activateTapStimulus(7, 'APPROVED BOOST!');
      executedParts.push('גירוי טאפ מאושר על הבמה');
      evidenceParts.push('tap=APPROVED_BOOST');
    }

    let execOk = true;
    let execDetailHe = `בוצע על מנוע הבמה של BOOSTERA: ${executedParts.join(' · ')}`;
    let geelarkResult: Awaited<ReturnType<typeof executeToGeeLark>> | null = null;

    if (shouldExecuteGeeLark) {
      const msgToSend = geelarkChatText || payload.tapCalloutTextHe || decision.detectedSituationHe.slice(0, 60);
      geelarkResult = await executeToGeeLark({
        targetRoomUsername: geelarkTargetRoom,
        messageText: msgToSend,
        confirmedOwnedRoom,
      });
      if (!geelarkResult.ok) {
        execOk = false;
        execDetailHe = `ביצוע GeeLark נכשל (${geelarkResult.status}): ${geelarkResult.errorHe || 'שגיאה'}`;
        evidenceParts.push(`geelark_error=${geelarkResult.status}`);
      } else {
        execDetailHe = `${execDetailHe} · ${geelarkResult.detailHe}`;
        evidenceParts.push(`geelark_task=${geelarkResult.taskId || 'sent'}`);
      }
    }

    const tr = applyApprovalTransition(decision, 'APPROVE', actor, Date.now(), {
      ok: execOk,
      detailHe: execDetailHe,
      evidence: evidenceParts.join(' '),
      resultDetailHe: execOk
        ? `הפעולה הופעלה ונקלטה ב-battleState ושודרה ל-${wss.clients.size} לקוחות מחוברים`
        : `האישור בוצע חלקית בלבד — משימת GeeLark החיצונית נכשלה ואינה מסומנת כהצלחה`,
    });

    battleState.aiDecisions[idx] = tr.updated;
    pushLog({
      eventType: execOk ? 'AI_DECISION_APPROVED' : 'AI_DECISION_EXECUTION_FAILED',
      userLabel: actor,
      triggeredEffectId: payload.vfxId || null,
      status: execOk ? 'TRIGGERED' : 'FAILED',
      detailHe: execOk ? `אושר ובוצע: ${executedParts.join(' · ')}` : execDetailHe,
    });
    broadcast({ type: 'ai:decision', decision: tr.updated, state: battleState });
    res.status(execOk ? 200 : 502).json({
      ok: execOk,
      decision: tr.updated,
      geelarkResult,
      errorHe: execOk ? undefined : execDetailHe,
      state: battleState,
    });
  });

  app.post('/api/events', (req, res) => {
    const result = processTikTokEvent(req.body || {});
    res.json({ ...result, state: battleState });
  });

  function activateOpponentCloudXray(opts: {
    durationSec?: number;
    opponentUsername?: string | null;
    reasonHe: string;
  }) {
    const dur = Math.max(12, Math.min(60, Number(opts.durationSec || 25)));
    const oppClean = sanitizeTikTokHandle(
      opts.opponentUsername ||
        battleState.cloudRadar.opponentUsername ||
        battleState.tiktokRoom.activeOpponentUsername ||
        ''
    );

    if (oppClean) {
      battleState.cloudRadar.opponentUsername = oppClean;
      battleState.tiktokRoom.activeOpponentUsername = oppClean;
      const existingOpp = activeSwarmRooms.get(oppClean.toLowerCase());
      if (!existingOpp || (!existingOpp.summary.connected && !existingOpp.summary.connecting)) {
        void connectCreatorToSwarm(oppClean, {
          listenMode: 'OBSERVER_LEARN',
          mirrorToStage: false,
          addToWatchlist: true,
          silentIfOffline: true,
        });
      }
    }

    battleState.cloudRadar.active = true;
    battleState.cloudRadar.expiresAt = Date.now() + dur * 1000;
    battleState.cloudRadar.remainingSec = dur;
    battleState.cloudRadar.detectedReasonHe = opts.reasonHe;
    battleState.cloudRadar.triggeredCount += 1;
    battleState.cloudRadar.myTrueScore = battleState.myScore;
    battleState.cloudRadar.opponentTrueScore = battleState.opponentScore;
    battleState.cloudRadar.scoreDiff = battleState.myScore - battleState.opponentScore;

    triggerCameraKinetic('SNIPE_CREEP', 1.1, 2200, 'טריגר שובר-ענן: חשיפת סקור דרך חדר היריב');
    emitSoundCue('SND_SNIPE_LOCK', opts.reasonHe);
    activateTapStimulus(12, 'CLOUD X-RAY — PUSH SCORE!');

    const dec = recordAiDecision({
      streamMode: battleState.streamMode,
      detectedSituationHe: `${opts.reasonHe} — מציג עכשיו על הבמה את הסקור האמיתי שלך (${battleState.myScore.toLocaleString()} מול ${battleState.opponentScore.toLocaleString()}) בזמן הענן!`,
      tensionScore: 95,
      energyScore: Math.min(100, battleState.aiEnergyScore + 18),
      actionsTakenHe: [
        oppClean
          ? `חיבור X-Ray לחדר היריב @${oppClean} לשאיבת LINK_MIC_ARMIES ויהלומים`
          : 'הופעלה תצוגת סקור שובר-ענן חיה על הבמה ו-OBS',
        `טיימר ענן: ${dur} שניות + אזעקת SND_SNIPE_LOCK`,
      ],
      soundCueId: 'SND_SNIPE_LOCK',
    });
    broadcast({ type: 'ai:decision', decision: dec, state: battleState });
  }

  app.post('/api/battle/control', (req, res) => {
    const {
      action,
      timeSec,
      palette,
      streamMode,
      volumePct,
      cameraMode,
      ruleId,
      toolId,
      opponentUsername,
      durationSec,
      countryCode,
      aiMoodProfile,
    } = req.body || {};
    if (action === 'start') {
      battleState.isRunning = true;
    } else if (action === 'set_broadcast_country' && typeof countryCode === 'string' && COUNTRY_CALIB_MAP[countryCode as BroadcastCountryCode]) {
      battleState.broadcastCountryCode = countryCode as BroadcastCountryCode;
      const ownRoom = battleState.tiktokRoom.monitoredRooms.find((r) => r.mirrorToStage && r.connected);
      battleState.countryCalibration = resolveCountryCalibration(
        battleState.broadcastCountryCode,
        ownRoom ? ownRoom.viewerCount : 0,
        ownRoom?.detectedLanguage
      );
      const dec = recordAiDecision({
        streamMode: battleState.streamMode,
        detectedSituationHe: `כיול הפעלות הותאם למדינה: ${battleState.countryCalibration.labelHe}`,
        tensionScore: battleState.aiTensionScore,
        energyScore: battleState.aiEnergyScore,
        actionsTakenHe: [battleState.countryCalibration.noteHe],
      });
      broadcast({ type: 'ai:decision', decision: dec, state: battleState });
    } else if (
      action === 'set_ai_mood_profile' &&
      (aiMoodProfile === 'AUTO_SMART' ||
        aiMoodProfile === 'HYPE_PARTY' ||
        aiMoodProfile === 'TACTICAL_PK' ||
        aiMoodProfile === 'CHILL_HOST')
    ) {
      const validMood = aiMoodProfile as AiMoodProfileId;
      battleState.aiMoodProfile = validMood;
      battleState.aiAutopilot = true;
      const moodLabelMap: Record<AiMoodProfileId, string> = {
        AUTO_SMART: 'אוטומטי חכם (כל המצבים)',
        HYPE_PARTY: 'מוד מסיבה והייפ גבוה',
        TACTICAL_PK: 'מוד קרב PK טקטי וסנייפים',
        CHILL_HOST: 'מוד אירוח ושיחה זורמת',
      };
      const plannedPayload: PlannedExecutionPayload =
        validMood === 'HYPE_PARTY'
          ? { vfxId: 'VID_02_CRYO_CO2_CANNONS', musicTrackId: 'MUS_BATTLE_MOMENTUM_DRIVE', tapCalloutTextHe: 'PARTY HYPE — TAP!', tapDurationSec: 10 }
          : validMood === 'TACTICAL_PK'
            ? { vfxId: 'VID_05_PK_FACTION_SMOKE_CLASH', musicTrackId: 'MUS_BATTLE_PRESSURE_TRAP' }
            : validMood === 'CHILL_HOST'
              ? { vfxId: 'VID_04_COLD_SPARK_FOUNTAINS', musicTrackId: 'MUS_SOLO_WARM_HOUSE' }
              : {};

      if (battleState.approvalMode === 'REQUIRE_APPROVAL' && validMood !== 'AUTO_SMART') {
        const dec = recordAiDecision({
          streamMode: battleState.streamMode,
          detectedSituationHe: `מוד טייס עבר ל-${moodLabelMap[validMood]} — השקת פתיח המוד ממתינה לאישור מפעיל`,
          tensionScore: battleState.aiTensionScore,
          energyScore: battleState.aiEnergyScore,
          actionsTakenHe: [`הצעת פתיח מוד: ${moodLabelMap[validMood]}`],
          approvalStatus: 'PENDING_APPROVAL',
          decidedBy: 'DETERMINISTIC',
          musicTrackId: plannedPayload.musicTrackId || null,
          vfxId: plannedPayload.vfxId || null,
          plannedPayload,
        });
        broadcast({ type: 'ai:decision', decision: dec, state: battleState });
      } else {
        if (validMood === 'HYPE_PARTY') {
          emitMusicChange('MUS_BATTLE_MOMENTUM_DRIVE', 44);
          activateTapStimulus(10, 'PARTY HYPE — TAP!');
          const fx = tryTriggerOneShot('VID_02_CRYO_CO2_CANNONS', 'מוד מסיבה AI', 1.0, true);
          if (fx.triggered && fx.instance) {
            broadcast({ type: 'effect:triggered', effect: fx.instance, state: battleState });
          }
        } else if (validMood === 'TACTICAL_PK') {
          battleState.streamMode = 'BATTLE';
          emitMusicChange('MUS_BATTLE_PRESSURE_TRAP', 42);
          const fx = tryTriggerOneShot('VID_05_PK_FACTION_SMOKE_CLASH', 'מוד קרב טקטי AI', 1.0, true);
          if (fx.triggered && fx.instance) {
            broadcast({ type: 'effect:triggered', effect: fx.instance, state: battleState });
          }
        } else if (validMood === 'CHILL_HOST') {
          emitMusicChange('MUS_SOLO_WARM_HOUSE', 32);
          const fx = tryTriggerOneShot('VID_04_COLD_SPARK_FOUNTAINS', 'מוד אירוח AI', 0.85, true);
          if (fx.triggered && fx.instance) {
            broadcast({ type: 'effect:triggered', effect: fx.instance, state: battleState });
          }
        }
        const dec = recordAiDecision({
          streamMode: battleState.streamMode,
          detectedSituationHe: `טייס אוטומטי הועבר ל-${moodLabelMap[validMood]} — מנהל מעכשיו מוזיקה, מצלמה ו-VFX בהתאם למוד!`,
          tensionScore: battleState.aiTensionScore,
          energyScore: battleState.aiEnergyScore,
          actionsTakenHe: [`מוד טייס פעיל: ${moodLabelMap[validMood]}`],
        });
        broadcast({ type: 'ai:decision', decision: dec, state: battleState });
      }
    } else if (action === 'pause') {
      battleState.isRunning = false;
    } else if (action === 'reset') {
      battleState.elapsedSec = 0;
      battleState.phase = 'IGNITION';
      battleState.likeEnergy = 12;
      battleState.likeTier = 'IDLE';
      battleState.likeComboCount = 0;
      battleState.comboMultiplier = 1;
      battleState.gloveRemainingSec = 0;
      battleState.snipeWindowActive = false;
      battleState.activeEffects = [];
      finaleTriggeredForRound = 0;
      pressureEntryStrikeRound = 0;
      snipeAlertTriggeredRound = 0;
      heartbeat10sTriggeredRound = 0;
      if (battleState.aiAutopilot && battleState.approvalMode !== 'REQUIRE_APPROVAL' && battleState.streamMode === 'BATTLE') {
        emitMusicChange('MUS_BATTLE_IGNITION_PULSE', 36);
      }
    } else if (action === 'reset_scores') {
      battleState.myScore = 0;
      battleState.opponentScore = 0;
      battleState.gloveRemainingSec = 0;
    } else if (action === 'set_camera_mode' && (cameraMode === 'AI_DYNAMIC' || cameraMode === 'HYPER_KINETIC' || cameraMode === 'LOCKED')) {
      battleState.cameraMode = cameraMode;
    } else if (action === 'toggle_memory_rule' && typeof ruleId === 'string') {
      const rule = aiMemory.energyRules.find((r) => r.id === ruleId);
      if (rule) {
        if (!rule.active && rule.approved !== true) {
          res.status(409).json({
            ok: false,
            errorHe: 'לא ניתן להפעיל חוק שעדיין במצב הצעה (PROPOSED) — יש לאשר אותו תחילה עם גרסה במרכז האישורים.',
            state: battleState,
          });
          return;
        }
        rule.active = !rule.active;
        battleState.memorySummary = buildMemorySummary();
        saveMemory(aiMemory);
      }
    } else if (action === 'toggle_discovered_tool' && typeof toolId === 'string') {
      const tool = aiMemory.discoveredTools.find((t) => t.id === toolId);
      if (tool) {
        if (!tool.autoEnabled && tool.approved !== true) {
          res.status(409).json({
            ok: false,
            errorHe: 'לא ניתן להפעיל כלי שפותח ע״י AI לפני שאושר ונשמר עם גרסה (PROPOSED).',
            state: battleState,
          });
          return;
        }
        tool.autoEnabled = !tool.autoEnabled;
        battleState.memorySummary = buildMemorySummary();
        saveMemory(aiMemory);
      }
    } else if (action === 'toggle_avatars_overlay') {
      battleState.avatarsOverlayEnabled = !battleState.avatarsOverlayEnabled;
    } else if (action === 'spawn_demo_supporters') {
      battleState.avatarsOverlayEnabled = true;
      recordStageParticipantAvatar({
        username: 'yossi_lion_king',
        displayName: 'יוסי המלך',
        pointsDelta: 1850,
        giftsDelta: 1,
        actionHe: 'שלח אריה אש מלכותי +1,850!',
        spotlight: { kind: 'WHALE_GIFT', badgeHe: 'MVP WHALE GIFT', durationMs: 5600 },
      });
      recordStageParticipantAvatar({
        username: 'maya_boost_il',
        displayName: 'מאיה לייב',
        pointsDelta: 420,
        likesDelta: 65,
        actionHe: 'רצף דאבל-טאפ וכפפה +420!',
        spotlight: { kind: 'COMBO_LIKE', badgeHe: 'x5 TAP STAR', durationMs: 5200 },
      });
      emitSoundCue('SND_LEAD_TAKEN', 'זרקור אווטארים של תומכים הופעל על הבמה!');
    } else if (action === 'toggle_cloud_auto_detect') {
      battleState.cloudRadar.autoDetectEnabled = !battleState.cloudRadar.autoDetectEnabled;
    } else if (action === 'set_opponent_username' && typeof opponentUsername === 'string') {
      const cleanOpp = sanitizeTikTokHandle(opponentUsername);
      battleState.cloudRadar.opponentUsername = cleanOpp || null;
      if (cleanOpp) {
        battleState.tiktokRoom.activeOpponentUsername = cleanOpp;
        void connectCreatorToSwarm(cleanOpp, {
          listenMode: 'OBSERVER_LEARN',
          mirrorToStage: false,
          addToWatchlist: true,
          silentIfOffline: true,
        });
      }
    } else if (action === 'trigger_cloud_xray') {
      activateOpponentCloudXray({
        durationSec: durationSec || 25,
        opponentUsername: opponentUsername || battleState.cloudRadar.opponentUsername,
        reasonHe: 'זיהוי פתיחת ענן יריב (SmokeCard) — שאיבת סקור אמת דרך חדר היריב!',
      });
    } else if (action === 'clear_cloud_xray') {
      battleState.cloudRadar.active = false;
      battleState.cloudRadar.remainingSec = 0;
    } else if (action === 'seek' && typeof timeSec === 'number') {
      const clamped = Math.max(0, Math.min(239.5, timeSec));
      battleState.elapsedSec = clamped;
      battleState.phase = computePhase(clamped);
      battleState.snipeWindowActive = battleState.streamMode === 'BATTLE' && clamped >= 205;
      if (clamped < 225) finaleTriggeredForRound = 0;
      if (clamped < 115) pressureEntryStrikeRound = 0;
      if (clamped < 205) snipeAlertTriggeredRound = 0;
      if (clamped < 230) heartbeat10sTriggeredRound = 0;
    } else if (action === 'set_palette' && PALETTE_ORDER.includes(palette)) {
      battleState.roundPalette = palette;
    } else if (action === 'toggle_crowd_test') {
      battleState.crowdTestActive = !battleState.crowdTestActive;
    } else if (action === 'toggle_ai_autopilot') {
      battleState.aiAutopilot = !battleState.aiAutopilot;
    } else if (action === 'set_music_volume' && typeof volumePct === 'number') {
      emitMusicChange(battleState.activeMusicTrackId, volumePct);
    } else if (action === 'set_stream_mode' && (streamMode === 'SOLO' || streamMode === 'BATTLE')) {
      battleState.streamMode = streamMode;
      if (streamMode === 'SOLO') {
        battleState.gloveRemainingSec = 0;
        battleState.snipeWindowActive = false;
        if (battleState.aiAutopilot) {
          if (battleState.approvalMode === 'REQUIRE_APPROVAL') {
            const dec = recordAiDecision({
              streamMode: 'SOLO',
              detectedSituationHe: 'מעבר לשידור סולו — התאמת המוזיקה והתאורה ממתינה לאישור מפעיל.',
              tensionScore: 16,
              energyScore: 38,
              actionsTakenHe: ['הצעה: MUS_SOLO_VELVET_LOFI + SOLO_WARM_LOUNGE'],
              approvalStatus: 'PENDING_APPROVAL',
              decidedBy: 'DETERMINISTIC',
              musicTrackId: 'MUS_SOLO_VELVET_LOFI',
              vfxId: 'SOLO_WARM_LOUNGE',
              plannedPayload: { musicTrackId: 'MUS_SOLO_VELVET_LOFI', vfxId: 'SOLO_WARM_LOUNGE' },
            });
            broadcast({ type: 'ai:decision', decision: dec, state: battleState });
          } else {
            emitMusicChange('MUS_SOLO_VELVET_LOFI', 32);
            const soloFx = tryTriggerOneShot('SOLO_WARM_LOUNGE', 'במאי AI (מצב סולו)', 0.9, true);
            if (soloFx.triggered && soloFx.instance) {
              broadcast({ type: 'effect:triggered', effect: soloFx.instance, state: battleState });
            }
            const dec = recordAiDecision({
              streamMode: 'SOLO',
              detectedSituationHe: 'מעבר לשידור סולו פתוח — רוככה מוזיקה, מצלמה במצב נשימה טבעית ותאורת אבק חמה.',
              tensionScore: 16,
              energyScore: 38,
              actionsTakenHe: ['מוזיקה: Velvet Lounge + אפקט אבק זהב ב-BACK'],
              musicTrackId: 'MUS_SOLO_VELVET_LOFI',
              vfxId: 'SOLO_WARM_LOUNGE',
            });
            broadcast({ type: 'ai:decision', decision: dec, state: battleState });
          }
        }
      } else {
        battleState.isRunning = true;
        if (battleState.aiAutopilot && battleState.approvalMode !== 'REQUIRE_APPROVAL') {
          const track =
            battleState.elapsedSec >= 205
              ? 'MUS_SNIPE_TENSION_CLOCK'
              : battleState.elapsedSec >= 115
                ? 'MUS_BATTLE_PRESSURE_TRAP'
                : 'MUS_BATTLE_IGNITION_PULSE';
          emitMusicChange(track, 40);
        }
      }
    }
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, state: battleState });
  });

  // ============================================================================
  // 1. OFFICIAL TIKTOK LOGIN KIT v2 POPUP OAUTH FLOW (Iframe-Compliant)
  // ============================================================================
  function resolveBaseAppUrl(reqOrigin?: string): string {
    if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
      return process.env.APP_URL.replace(/\/+$/, '');
    }
    if (reqOrigin && reqOrigin.startsWith('http')) {
      return reqOrigin.replace(/\/+$/, '');
    }
    return 'http://localhost:3000';
  }

  app.get('/api/auth/tiktok/url', (req, res) => {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const isConfigured = Boolean(clientKey && clientKey !== 'MY_TIKTOK_CLIENT_KEY');
    const originParam = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const baseUrl = resolveBaseAppUrl(originParam);
    const redirectUri = `${baseUrl}/auth/tiktok/callback`;

    if (!isConfigured) {
      res.json({
        configured: false,
        redirectUri,
        messageHe:
          'כדי להפעיל כניסת OAuth רשמית של TikTok Login Kit, הגדר TIKTOK_CLIENT_KEY ו-TIKTOK_CLIENT_SECRET ב-Secrets והוסף את כתובת ה-Callback בפורטל המפתחים של טיקטוק. בינתיים תוכל להתחבר מיידית לכל שידור חי עם @username למטה!',
      });
      return;
    }

    const params = new URLSearchParams({
      client_key: clientKey!,
      scope: 'user.info.basic,user.info.profile,user.info.stats',
      response_type: 'code',
      redirect_uri: redirectUri,
      state: `boostera_${Date.now()}`,
    });

    res.json({
      configured: true,
      redirectUri,
      url: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`,
    });
  });

  const handleTikTokCallback = async (req: express.Request, res: express.Response) => {
    try {
      const code = String(req.query.code || '');
      const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
      const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
      const redirectUri = `${resolveBaseAppUrl()}/auth/tiktok/callback`;

      if (code && clientKey && clientSecret) {
        const tokenResp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }),
        });
        const tokenJson = (await tokenResp.json()) as { access_token?: string; open_id?: string };

        if (tokenJson.access_token) {
          const userResp = await fetch(
            'https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,username',
            {
              headers: { Authorization: `Bearer ${tokenJson.access_token}` },
            }
          );
          const userJson = (await userResp.json()) as {
            data?: { user?: { open_id?: string; display_name?: string; username?: string; avatar_url?: string } };
          };
          const u = userJson.data?.user;
          battleState.tiktokRoom.oauthConnectedUser = {
            openId: u?.open_id || tokenJson.open_id || 'tiktok_user',
            displayName: u?.username || u?.display_name || 'חשבון טיקטוק מחובר',
            avatarUrl: u?.avatar_url,
          };
          aiMemory.oauthConnectedUser = battleState.tiktokRoom.oauthConnectedUser;
          saveMemory(aiMemory);
          broadcast({ type: 'state:update', state: battleState });
        }
      }

      res.send(`<!doctype html><html dir="rtl" lang="he"><body style="background:#0B0E14;color:#E2E8F0;font-family:sans-serif;padding:24px;text-align:center;">
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'tiktok' }, '*');
            window.close();
          } else {
            window.location.href = '/';
          }
        </script>
        <p>חיבור חשבון טיקטוק הושלם בהצלחה! החלון ייסגר אוטומטית.</p>
      </body></html>`);
    } catch {
      res.send(`<!doctype html><html><body><script>if(window.opener){window.close();}</script><p>OAuth closed.</p></body></html>`);
    }
  };

  app.get(['/auth/tiktok/callback', '/auth/tiktok/callback/'], handleTikTokCallback);

  // ============================================================================
  // 2. MULTI-STREAM GLOBAL LIVE SWARM + 24/7 CREATOR WATCHLIST AUTO-RADAR
  // ============================================================================
  function sanitizeTikTokHandle(raw: string): string {
    return String(raw || '')
      .trim()
      .replace(/^https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/@?/i, '')
      .split('/')[0]
      .split('?')[0]
      .replace(/^@+/, '')
      .trim();
  }

  function detectScriptLanguageTag(text: string): string {
    if (!text) return 'GLOBAL';
    if (/[\u0600-\u06FF]/.test(text)) return 'ערבית (AR)';
    if (/[\u0590-\u05FF]/.test(text)) return 'עברית (HE)';
    if (/[\u0400-\u04FF]/.test(text)) return 'רוסית/קירילית (RU)';
    if (/[ğüşöçıİĞÜŞÖÇ]/.test(text)) return 'טורקית (TR)';
    if (/[áéíóúñ¿¡ãõç]/i.test(text)) return 'ספרדית/פורטוגזית (ES/PT)';
    if (/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text)) return 'אסיה (CJK/KR)';
    if (/[a-zA-Z]/.test(text)) return 'אנגלית/גלובלי (EN)';
    return 'אימוג׳י/הייפ אוניברסלי';
  }

  function computeRoomEnergyAndVibe(room: ManagedLiveRoom): { energy: number; vibeHe: string } {
    const now = Date.now();
    room.likeWindow = room.likeWindow.filter((item) => now - item.ts <= 5000);
    const likesLast5s = room.likeWindow.reduce((acc, item) => acc + item.count, 0);
    const lps = Number((likesLast5s / 5).toFixed(1));
    room.summary.likesPerSec = lps;

    // Country/Language-relative viewer normalization so an Israeli stream with 60 viewers scores on par with a 2,000-viewer Egyptian stream!
    const lang = room.summary.detectedLanguage || '';
    const langRefViewers = lang.includes('עברית')
      ? 75
      : lang.includes('טורקית')
        ? 1200
        : lang.includes('ערבית')
          ? 1800
          : lang.includes('ספרדית') || lang.includes('פורטוגזית')
            ? 2200
            : 450;
    const relativeViewerRatio = room.summary.viewerCount / Math.max(25, langRefViewers);

    const battleBoost = room.summary.inBattle ? 22 : 0;
    const gloveBoost = room.summary.activeCardOrGloveHe ? 18 : 0;
    const giftBoost = Math.min(28, Math.round(Math.log10(1 + room.summary.diamondsCount) * 11));
    const chatBoost = Math.min(18, Math.round(room.summary.chatCount * (lang.includes('עברית') ? 0.9 : 0.45)));
    const viewerBoost = Math.min(20, Math.round(Math.min(2.5, relativeViewerRatio) * 8));
    const lpsBoost = Math.min(30, Math.round(lps * (lang.includes('עברית') ? 3.2 : 1.9)));

    const energy = Math.max(8, Math.min(100, battleBoost + gloveBoost + giftBoost + chatBoost + viewerBoost + lpsBoost));

    let vibeHe = 'שידור חי פעיל · מאזין לאווירה';
    if (room.summary.activeCardOrGloveHe) {
      vibeHe = `בוסט פעיל (${room.summary.activeCardOrGloveHe}) + קצב אש!`;
    } else if (room.summary.inBattle && (room.summary.hostBattlePoints > 0 || room.summary.opponentBattlePoints > 0)) {
      vibeHe = `קרב PK חי (${room.summary.hostBattlePoints.toLocaleString()} : ${room.summary.opponentBattlePoints.toLocaleString()})`;
    } else if (room.summary.inBattle) {
      vibeHe = `קרב PK פעיל${room.summary.opponentUsername ? ` מול @${room.summary.opponentUsername}` : ''}`;
    } else if (room.summary.diamondsCount >= 100 || room.summary.giftsCount >= 5) {
      vibeHe = 'מסיבת מתנות והייפ מסביב!';
    } else if (lps >= (lang.includes('עברית') ? 4 : 8) || room.summary.chatCount >= (lang.includes('עברית') ? 6 : 12)) {
      vibeHe = 'שטף צ׳אט ולייקים גבוה ביחס לגודל המדינה';
    }
    return { energy, vibeHe };
  }

  function pushSwarmFeedEvent(room: ManagedLiveRoom, kind: SwarmFeedEvent['kind'], summary: string, languageTag?: string) {
    const ev: SwarmFeedEvent = {
      id: nextId('swm'),
      ts: Date.now(),
      username: room.username,
      kind,
      summary: summary.slice(0, 150),
      languageTag,
    };
    room.summary.recentEvents.unshift(ev);
    if (room.summary.recentEvents.length > 18) {
      room.summary.recentEvents.length = 18;
    }
    battleState.tiktokRoom.swarmRecentFeed.unshift(ev);
    if (battleState.tiktokRoom.swarmRecentFeed.length > 40) {
      battleState.tiktokRoom.swarmRecentFeed.length = 40;
    }
  }

  function syncGlobalTikTokRoomSummary() {
    const summaries = Array.from(activeSwarmRooms.values()).map((r) => {
      const { energy, vibeHe } = computeRoomEnergyAndVibe(r);
      r.summary.energyScore = energy;
      r.summary.partyVibeHe = vibeHe;
      return r.summary;
    });

    summaries.sort((a, b) => Number(b.connected) - Number(a.connected) || b.energyScore - a.energyScore);
    battleState.tiktokRoom.monitoredRooms = summaries;

    const connectedRooms = summaries.filter((s) => s.connected);
    const connectingRooms = summaries.filter((s) => s.connecting);

    battleState.tiktokRoom.connected = connectedRooms.length > 0;
    battleState.tiktokRoom.connecting = connectingRooms.length > 0 && connectedRooms.length === 0;
    battleState.tiktokRoom.viewerCount = connectedRooms.reduce((sum, r) => sum + r.viewerCount, 0);
    battleState.tiktokRoom.streamLikesCount = connectedRooms.reduce((sum, r) => sum + r.totalLikes, 0);
    battleState.tiktokRoom.chatMessagesCount = connectedRooms.reduce((sum, r) => sum + r.chatCount, 0);
    battleState.wsSniffer.activeTikTokSocketsCount = connectedRooms.length;

    const primary =
      connectedRooms.find((r) => r.mirrorToStage) ||
      connectedRooms[0] ||
      connectingRooms[0] ||
      null;

    // Continuously recalibrate stage triggers relative to host's country & live viewer count!
    const mirroredHostRoom = connectedRooms.find((r) => r.mirrorToStage);
    battleState.countryCalibration = resolveCountryCalibration(
      battleState.broadcastCountryCode,
      mirroredHostRoom ? mirroredHostRoom.viewerCount : 0,
      mirroredHostRoom?.detectedLanguage
    );

    battleState.tiktokRoom.targetUsername = primary ? primary.username : null;
    battleState.tiktokRoom.roomId = primary ? primary.roomId : null;
    const anyBattleRoom = connectedRooms.find((r) => r.inBattle);
    battleState.tiktokRoom.liveBattleDetected = Boolean(anyBattleRoom);
    battleState.tiktokRoom.activeOpponentUsername = anyBattleRoom?.opponentUsername || null;

    // Sync Watchlist connection flags
    for (const w of aiMemory.watchedCreators) {
      const key = w.username.toLowerCase();
      const active = activeSwarmRooms.get(key);
      w.currentlyConnected = Boolean(active?.summary.connected);
      if (active?.summary.connected) {
        w.isLiveNow = true;
        w.lastLiveSeenTs = Date.now();
        if (active.summary.detectedLanguage && active.summary.detectedLanguage !== 'GLOBAL') {
          w.detectedLanguage = active.summary.detectedLanguage;
        }
      }
    }
    battleState.memorySummary = buildMemorySummary();
    battleState.integrationAudit = computeIntegrationAudit();
  }

  function upsertWatchlistCreator(
    rawHandle: string,
    options?: { notesHe?: string; autoWatchEnabled?: boolean; autoLearnEnabled?: boolean }
  ): WatchedCreatorEntry | null {
    const clean = sanitizeTikTokHandle(rawHandle);
    if (!clean || !/^[a-zA-Z0-9._-]+$/.test(clean)) return null;

    const existing = aiMemory.watchedCreators.find(
      (w) => w.username.toLowerCase() === clean.toLowerCase()
    );
    if (existing) {
      if (options?.notesHe) existing.notesHe = options.notesHe;
      if (typeof options?.autoWatchEnabled === 'boolean') existing.autoWatchEnabled = options.autoWatchEnabled;
      if (typeof options?.autoLearnEnabled === 'boolean') existing.autoLearnEnabled = options.autoLearnEnabled;
      saveMemory(aiMemory);
      battleState.memorySummary = buildMemorySummary();
      return existing;
    }

    const entry: WatchedCreatorEntry = {
      username: clean,
      displayName: clean,
      addedAtTs: Date.now(),
      autoWatchEnabled: options?.autoWatchEnabled ?? true,
      autoLearnEnabled: options?.autoLearnEnabled ?? true,
      notesHe:
        options?.notesHe ||
        'מעקב אוטומטי 24/7 — מתחבר ומאזין לאנרגיה, צ׳אט, מסיבה ובאטלים בכל פעם שעולה ללייב',
      isLiveNow: false,
      currentlyConnected: false,
      lastCheckedTs: 0,
      lastLiveSeenTs: null,
      lastLearnedTs: null,
      sessionsLearnedCount: 0,
      detectedLanguage: 'GLOBAL',
    };
    aiMemory.watchedCreators.unshift(entry);
    saveMemory(aiMemory);
    battleState.memorySummary = buildMemorySummary();
    return entry;
  }

  async function synthesizeCreatorOrSwarmInsights(targetUsername?: string, reasonLabelHe = 'למידה חיה אוטומטית') {
    const roomsToAnalyze: ManagedLiveRoom[] = [];
    if (targetUsername) {
      const found = activeSwarmRooms.get(targetUsername.toLowerCase());
      if (found) roomsToAnalyze.push(found);
    } else {
      for (const r of activeSwarmRooms.values()) {
        if (r.summary.connected && r.unsynthesizedEventCount >= 3) {
          roomsToAnalyze.push(r);
        }
      }
    }

    // Also allow offline web/memory synthesis when user explicitly requests learning on an offline handle
    if (roomsToAnalyze.length === 0 && !targetUsername) {
      return null;
    }

    const ai = getGeminiClient();

    if (targetUsername && roomsToAnalyze.length === 0) {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `You are BOOSTERA's Cross-Language TikTok LIVE Energy, Battle Intelligence & Autonomous Tool Architect.
Creator @${targetUsername} is on our 24/7 Watchlist (currently between live sessions or just added).
Search public TikTok LIVE / TikLeap / social references for @${targetUsername} (any language: Arabic, Russian, English, Spanish, Turkish, Hebrew, etc.) and build:
1) A sharp tactical & crowd-energy profile in Hebrew
2) One actionable AI Showrunner rule
3) One NEW specialized stage tool that our AI realizes it needs after studying @${targetUsername}'s broadcast dynamics!
Respond with exact labeled lines:
DISPLAY_NAME: <name>
STRENGTH: <number 75-98>
BATTLE_STYLE_HE: <1-2 sentences in Hebrew about their vibe, party energy, chat & crowd hypnosis>
SNIPE_TENDENCY_HE: <1 sentence in Hebrew about final-seconds / battle intensity>
GLOVE_STRATEGY_HE: <1 sentence in Hebrew about x5 glove / boost momentum>
COUNTER_TACTIC_HE: <1 sentence in Hebrew on what our AI Showrunner should adopt or counter>
RULE_TITLE_HE: <short Hebrew title>
RULE_TRIGGER_HE: <when to fire in Hebrew>
RULE_DIRECTIVE_EN: <1 sentence English directive for BOOSTERA AI Showrunner>
TOOL_NAME_HE: <short Hebrew name of a new stage tool our AI deduced it needs>
TOOL_WHY_HE: <1 sentence in Hebrew explaining why listening to this creator showed we need this tool>
TOOL_HOW_HE: <1 sentence in Hebrew explaining how this tool acts on our 9:16 stage>`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const raw = response.text || '';
      const getField = (key: string, fallback: string) => {
        const m = raw.match(new RegExp(`${key}:\\s*(.+)`, 'i'));
        return m ? m[1].trim() : fallback;
      };

      const inferredCombo = inferStageComboFromText(
        `${getField('COUNTER_TACTIC_HE', '')} ${getField('SNIPE_TENDENCY_HE', '')} ${getField('GLOVE_STRATEGY_HE', '')}`,
        targetUsername
      );

      const profile: LearnedCreatorProfile = {
        username: targetUsername,
        displayName: getField('DISPLAY_NAME', targetUsername),
        region: 'GLOBAL',
        strengthScore: Math.min(99, Math.max(72, Number(getField('STRENGTH', '89')) || 89)),
        battleStyleHe: getField('BATTLE_STYLE_HE', 'בונה אנרגיית קהל ומסיבה חיה עם תגובות מהירות שמזניקות צ׳אט ומתנות.'),
        snipeTendencyHe: getField('SNIPE_TENDENCY_HE', 'מייצר שיאי מתח והתגייסות קהל בדקת ההכרעה.'),
        gloveStrategyHe: getField('GLOVE_STRATEGY_HE', 'מתזמן בוסטים וכפפות בשיא קצב הלייקים והצ׳אט.'),
        counterTacticHe: getField('COUNTER_TACTIC_HE', 'שלב גירוי אצבע היקפי עם זום-פאנץ׳ במצלמה בכל עליית קצב.'),
        observedChatSamples: [],
        lastUpdatedTs: Date.now(),
        ...inferredCombo,
      };

      const idx = aiMemory.learnedCreators.findIndex((c) => c.username.toLowerCase() === targetUsername.toLowerCase());
      if (idx >= 0) aiMemory.learnedCreators[idx] = { ...aiMemory.learnedCreators[idx], ...profile };
      else aiMemory.learnedCreators.unshift(profile);

      const proposalGov = toProposedGovernanceDefaults();
      const newRule: SetupEnergyRule = {
        id: nextId('rule'),
        titleHe: getField('RULE_TITLE_HE', `דפוס אנרגיה שנלמד מ-@${targetUsername}`),
        sourceLabelHe: `מעקב יוצר @${targetUsername}`,
        triggerConditionHe: getField('RULE_TRIGGER_HE', 'בזמן בניית מומנטום קהל או קרב צמוד'),
        aiActionDirectiveEn: getField(
          'RULE_DIRECTIVE_EN',
          'Trigger BASS_PUMP camera and peripheral tap stimulus when crowd momentum starts rising.'
        ),
        active: proposalGov.active,
        approved: proposalGov.approved,
        status: proposalGov.status,
        version: proposalGov.version,
        effectivenessScore: 92,
        recommendedVfxId: inferredCombo.recommendedVfxId,
        recommendedCamera: inferredCombo.recommendedCamera,
        recommendedSoundId: inferredCombo.recommendedSoundId,
        recommendedTapCallout: inferredCombo.recommendedTapCallout,
        appliedTimesCount: 0,
      };
      aiMemory.energyRules.unshift(newRule);
      if (aiMemory.energyRules.length > 18) aiMemory.energyRules.length = 18;

      const toolNameHe = getField('TOOL_NAME_HE', `מאיץ תגובת קהל של @${targetUsername}`);
      const toolCombo = inferStageComboFromText(`${toolNameHe} ${getField('TOOL_HOW_HE', '')}`, targetUsername);
      const newTool: DiscoveredStageTool = {
        id: nextId('tool'),
        nameHe: toolNameHe,
        sourceLabelHe: `הוסק מניתוח @${targetUsername}`,
        whyNeededHe: getField(
          'TOOL_WHY_HE',
          `מהאזנה לדינמיקה של @${targetUsername} עלה צורך בכלי שמגיב אוטומטית לשינויי קצב ומחזיק את הצופים דרוכים.`
        ),
        howItWorksHe: getField(
          'TOOL_HOW_HE',
          'משלב אוטומטית אפקט וידאו תואם, תנועת מצלמה קינטית וגירוי דאבל-טאפ בצידי המסך.'
        ),
        triggerConditionHe: newRule.triggerConditionHe,
        autoEnabled: proposalGov.autoEnabled,
        approved: proposalGov.approved,
        status: proposalGov.status,
        version: proposalGov.version,
        recommendedVfxId: toolCombo.recommendedVfxId,
        recommendedCamera: toolCombo.recommendedCamera,
        recommendedSoundId: toolCombo.recommendedSoundId,
        recommendedMusicId: toolCombo.recommendedMusicId,
        recommendedTapCallout: toolCombo.recommendedTapCallout,
        usageCount: 0,
        createdAtTs: Date.now(),
      };
      const dupToolIdx = aiMemory.discoveredTools.findIndex((t) => t.nameHe === newTool.nameHe);
      if (dupToolIdx >= 0) aiMemory.discoveredTools[dupToolIdx] = newTool;
      else aiMemory.discoveredTools.unshift(newTool);
      if (aiMemory.discoveredTools.length > 20) aiMemory.discoveredTools.length = 20;

      const watchEntry = aiMemory.watchedCreators.find((w) => w.username.toLowerCase() === targetUsername.toLowerCase());
      if (watchEntry) {
        watchEntry.lastLearnedTs = Date.now();
        watchEntry.sessionsLearnedCount += 1;
      }

      aiMemory.totalRoundsAnalyzed += 1;
      battleState.memorySummary = buildMemorySummary();
      saveMemory(aiMemory);
      broadcast({ type: 'state:update', state: battleState });
      return {
        profile,
        newRule,
        newTool,
        synthesisHe: `נלמד פרופיל @${targetUsername}, הופק החוק "${newRule.titleHe}" ונוסף הכלי החדש "${newTool.nameHe}" לארגז הכלים של ה-AI!`,
      };
    }

    // Live Multi-Room Cross-Language Synthesis!
    const snapshot = roomsToAnalyze.map((r) => ({
      username: r.username,
      detectedLanguage: r.summary.detectedLanguage,
      viewers: r.summary.viewerCount,
      peakViewers: r.summary.peakViewers,
      likesPerSec: r.summary.likesPerSec,
      totalLikes: r.summary.totalLikes,
      giftsCount: r.summary.giftsCount,
      diamondsCount: r.summary.diamondsCount,
      sharesCount: r.summary.sharesCount,
      joinsCount: r.summary.joinsCount,
      inBattle: r.summary.inBattle,
      opponent: r.summary.opponentUsername,
      battleScore: `${r.summary.hostBattlePoints} vs ${r.summary.opponentBattlePoints}`,
      gloveOrCard: r.summary.activeCardOrGloveHe,
      recentChatsAnyLanguage: r.chatSamples.slice(0, 18),
      liveVoiceCaptionsAnyLanguage: r.captionSamples.slice(0, 10),
      giftPartyStream: r.giftSamples.slice(0, 12),
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `You are BOOSTERA's Cross-Language Live Swarm Intelligence, Party/Battle Energy Decoder & Autonomous Tool Inventor.
We are simultaneously listening in real time to ${snapshot.length} live TikTok stream(s) across ANY language:
${JSON.stringify(snapshot, null, 2)}

CRITICAL COUNTRY-RELATIVE CALIBRATION:
Our own target broadcast runs in country profile "${battleState.countryCalibration.labelHe}" (reference strong crowd: ~${battleState.countryCalibration.referenceStrongViewers} viewers; join trigger: ${battleState.countryCalibration.effectiveJoinTrigger} viewers; combo step: x${battleState.countryCalibration.effectiveComboStep}).
When learning from mega-countries (like Egypt, Brazil, Turkey, US with thousands of viewers), ALWAYS translate thresholds into RELATIVE ratios or calibrate them proportionally to our country's viewer scale!

Return JSON matching the schema:
- swarmSynthesisHe: Rich 2-3 sentence Hebrew summary of what is happening right now across these live rooms AND how it translates proportionally to our broadcast country.
- updatedCreators: For each creator in the snapshot, provide updated Hebrew tactical fields.
- newEnergyRule: One concrete hypnosis/energy directive learned from watching their live room right now (calibrated proportionally to our country's audience size).
- newDiscoveredTool: One NEW specialized stage tool that our AI deduced it needs to add to its arsenal based on listening to this live broadcast!`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            swarmSynthesisHe: { type: Type.STRING },
            updatedCreators: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  username: { type: Type.STRING },
                  strengthScore: { type: Type.NUMBER },
                  battleStyleHe: { type: Type.STRING },
                  snipeTendencyHe: { type: Type.STRING },
                  gloveStrategyHe: { type: Type.STRING },
                  counterTacticHe: { type: Type.STRING },
                },
                required: [
                  'username',
                  'strengthScore',
                  'battleStyleHe',
                  'snipeTendencyHe',
                  'gloveStrategyHe',
                  'counterTacticHe',
                ],
              },
            },
            newEnergyRule: {
              type: Type.OBJECT,
              properties: {
                titleHe: { type: Type.STRING },
                triggerConditionHe: { type: Type.STRING },
                aiActionDirectiveEn: { type: Type.STRING },
              },
              required: ['titleHe', 'triggerConditionHe', 'aiActionDirectiveEn'],
            },
            newDiscoveredTool: {
              type: Type.OBJECT,
              properties: {
                nameHe: { type: Type.STRING },
                whyNeededHe: { type: Type.STRING },
                howItWorksHe: { type: Type.STRING },
                triggerConditionHe: { type: Type.STRING },
              },
              required: ['nameHe', 'whyNeededHe', 'howItWorksHe', 'triggerConditionHe'],
            },
          },
          required: ['swarmSynthesisHe', 'updatedCreators', 'newEnergyRule', 'newDiscoveredTool'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const now = Date.now();

    for (const r of roomsToAnalyze) {
      r.unsynthesizedEventCount = 0;
      r.lastSynthesizedTs = now;
      const w = aiMemory.watchedCreators.find((item) => item.username.toLowerCase() === r.username.toLowerCase());
      if (w) {
        w.lastLearnedTs = now;
        w.sessionsLearnedCount += 1;
      }
    }

    if (Array.isArray(parsed.updatedCreators)) {
      for (const uc of parsed.updatedCreators) {
        const roomRef = activeSwarmRooms.get(String(uc.username || '').toLowerCase());
        const inferred = inferStageComboFromText(
          `${uc.counterTacticHe || ''} ${uc.snipeTendencyHe || ''} ${uc.gloveStrategyHe || ''}`,
          uc.username
        );
        const profile: LearnedCreatorProfile = {
          username: uc.username,
          displayName: uc.username,
          region: roomRef?.summary.detectedLanguage || 'GLOBAL',
          strengthScore: Math.min(99, Math.max(74, Number(uc.strengthScore) || 90)),
          isLiveNow: Boolean(roomRef?.summary.connected),
          battleStyleHe: uc.battleStyleHe,
          snipeTendencyHe: uc.snipeTendencyHe,
          gloveStrategyHe: uc.gloveStrategyHe,
          counterTacticHe: uc.counterTacticHe,
          observedChatSamples: roomRef ? roomRef.chatSamples.slice(0, 6) : [],
          lastUpdatedTs: now,
          ...inferred,
        };
        const existingIdx = aiMemory.learnedCreators.findIndex(
          (c) => c.username.toLowerCase() === String(uc.username).toLowerCase()
        );
        if (existingIdx >= 0) aiMemory.learnedCreators[existingIdx] = { ...aiMemory.learnedCreators[existingIdx], ...profile };
        else aiMemory.learnedCreators.unshift(profile);
      }
    }

    const swarmProposalGov = toProposedGovernanceDefaults();
    let createdRule: SetupEnergyRule | null = null;
    if (parsed.newEnergyRule?.titleHe && parsed.newEnergyRule?.aiActionDirectiveEn) {
      const ruleCombo = inferStageComboFromText(
        `${parsed.newEnergyRule.titleHe} ${parsed.newEnergyRule.aiActionDirectiveEn}`,
        roomsToAnalyze[0]?.username || 'swarm'
      );
      createdRule = {
        id: nextId('swarm_rule'),
        titleHe: parsed.newEnergyRule.titleHe,
        sourceLabelHe: `${reasonLabelHe} (${roomsToAnalyze.map((r) => '@' + r.username).join(', ')})`,
        triggerConditionHe: parsed.newEnergyRule.triggerConditionHe,
        aiActionDirectiveEn: parsed.newEnergyRule.aiActionDirectiveEn,
        active: swarmProposalGov.active,
        approved: swarmProposalGov.approved,
        status: swarmProposalGov.status,
        version: swarmProposalGov.version,
        effectivenessScore: 93,
        recommendedVfxId: ruleCombo.recommendedVfxId,
        recommendedCamera: ruleCombo.recommendedCamera,
        recommendedSoundId: ruleCombo.recommendedSoundId,
        recommendedTapCallout: ruleCombo.recommendedTapCallout,
        appliedTimesCount: 0,
      };
      const dupIdx = aiMemory.energyRules.findIndex((r) => r.titleHe === createdRule!.titleHe);
      if (dupIdx >= 0) aiMemory.energyRules[dupIdx] = createdRule;
      else aiMemory.energyRules.unshift(createdRule);
      if (aiMemory.energyRules.length > 18) aiMemory.energyRules.length = 18;
    }

    let createdTool: DiscoveredStageTool | null = null;
    if (parsed.newDiscoveredTool?.nameHe) {
      const tCombo = inferStageComboFromText(
        `${parsed.newDiscoveredTool.nameHe} ${parsed.newDiscoveredTool.howItWorksHe || ''}`,
        roomsToAnalyze[0]?.username || 'swarm'
      );
      createdTool = {
        id: nextId('swarm_tool'),
        nameHe: parsed.newDiscoveredTool.nameHe,
        sourceLabelHe: `הוסק מהאזנה חיה (${roomsToAnalyze.map((r) => '@' + r.username).join(', ')})`,
        whyNeededHe: parsed.newDiscoveredTool.whyNeededHe || 'זוהה צורך בכלי תגובה אוטומטי מתוך השידור החי.',
        howItWorksHe: parsed.newDiscoveredTool.howItWorksHe || 'משלב אוטומטית אפקט, מצלמה קינטית וגירוי אצבע.',
        triggerConditionHe: parsed.newDiscoveredTool.triggerConditionHe || 'מופעל לאחר אישור מפעיל',
        autoEnabled: swarmProposalGov.autoEnabled,
        approved: swarmProposalGov.approved,
        status: swarmProposalGov.status,
        version: swarmProposalGov.version,
        recommendedVfxId: tCombo.recommendedVfxId,
        recommendedCamera: tCombo.recommendedCamera,
        recommendedSoundId: tCombo.recommendedSoundId,
        recommendedMusicId: tCombo.recommendedMusicId,
        recommendedTapCallout: tCombo.recommendedTapCallout,
        usageCount: 0,
        createdAtTs: now,
      };
      const dupTIdx = aiMemory.discoveredTools.findIndex((t) => t.nameHe === createdTool!.nameHe);
      if (dupTIdx >= 0) aiMemory.discoveredTools[dupTIdx] = createdTool;
      else aiMemory.discoveredTools.unshift(createdTool);
      if (aiMemory.discoveredTools.length > 20) aiMemory.discoveredTools.length = 20;
    }

    battleState.tiktokRoom.lastSwarmSynthesisHe = parsed.swarmSynthesisHe || null;
    aiMemory.totalRoundsAnalyzed += 1;
    battleState.memorySummary = buildMemorySummary();
    saveMemory(aiMemory);

    pushLog({
      eventType: 'SWARM_AI_LEARN',
      userLabel: 'מוח AI רב-לשוני',
      triggeredEffectId: null,
      status: 'TRIGGERED',
      detailHe: (parsed.swarmSynthesisHe || 'זוקקה תובנת אנרגיה חדשה מהשידורים החיים').slice(0, 120),
    });

    broadcast({ type: 'state:update', state: battleState });
    return {
      synthesisHe: parsed.swarmSynthesisHe,
      newRule: createdRule,
      newTool: createdTool,
      updatedCreators: parsed.updatedCreators,
    };
  }

  async function connectCreatorToSwarm(
    rawUsername: string,
    options?: {
      listenMode?: 'MY_BROADCAST' | 'OBSERVER_LEARN';
      mirrorToStage?: boolean;
      addToWatchlist?: boolean;
      silentIfOffline?: boolean;
    }
  ): Promise<{ ok: boolean; connected: boolean; errorHe?: string; summary?: MonitoredLiveRoomSummary }> {
    const cleanUsername = sanitizeTikTokHandle(rawUsername);
    if (!cleanUsername) {
      return { ok: false, connected: false, errorHe: 'יש להזין שם משתמש תקין בטיקטוק.' };
    }

    const key = cleanUsername.toLowerCase();
    const listenMode = options?.listenMode || 'OBSERVER_LEARN';
    const mirrorToStage = Boolean(options?.mirrorToStage || listenMode === 'MY_BROADCAST');

    if (options?.addToWatchlist !== false) {
      upsertWatchlistCreator(cleanUsername);
    }

    const existing = activeSwarmRooms.get(key);
    if (existing && (existing.summary.connected || existing.summary.connecting)) {
      existing.listenMode = listenMode;
      existing.summary.mirrorToStage = mirrorToStage;
      syncGlobalTikTokRoomSummary();
      broadcast({ type: 'state:update', state: battleState });
      return { ok: true, connected: existing.summary.connected, summary: existing.summary };
    }

    // Enforce max concurrent cap by evicting oldest disconnected or lowest-energy non-mirrored stream
    if (activeSwarmRooms.size >= MAX_CONCURRENT_SWARM_ROOMS) {
      let victimKey: string | null = null;
      for (const [k, v] of activeSwarmRooms.entries()) {
        if (!v.summary.connected && !v.summary.connecting) {
          victimKey = k;
          break;
        }
      }
      if (!victimKey) {
        for (const [k, v] of activeSwarmRooms.entries()) {
          if (!v.summary.mirrorToStage) {
            victimKey = k;
            break;
          }
        }
      }
      if (victimKey) {
        const victim = activeSwarmRooms.get(victimKey);
        if (victim) {
          try {
            await victim.conn.disconnect();
          } catch {
            // Ignore
          }
          activeSwarmRooms.delete(victimKey);
        }
      }
    }

    const conn = new TikTokLiveConnection(cleanUsername, {
      processInitialData: true,
      fetchRoomInfoOnConnect: true,
    });

    const managed: ManagedLiveRoom = {
      username: cleanUsername,
      conn,
      listenMode,
      summary: {
        username: cleanUsername,
        roomId: null,
        connected: false,
        connecting: true,
        mirrorToStage,
        viewerCount: 0,
        peakViewers: 0,
        likesPerSec: 0,
        totalLikes: 0,
        chatCount: 0,
        giftsCount: 0,
        diamondsCount: 0,
        sharesCount: 0,
        followsCount: 0,
        joinsCount: 0,
        detectedLanguage: 'GLOBAL',
        energyScore: 18,
        partyVibeHe: 'מתחבר לחדר השידור החי...',
        inBattle: false,
        opponentUsername: null,
        hostBattlePoints: 0,
        opponentBattlePoints: 0,
        activeCardOrGloveHe: null,
        recentEvents: [],
        lastErrorHe: null,
        connectedSinceTs: Date.now(),
      },
      likeWindow: [],
      chatSamples: [],
      captionSamples: [],
      giftSamples: [],
      opponentsSeen: [],
      unsynthesizedEventCount: 0,
      lastSynthesizedTs: 0,
    };

    activeSwarmRooms.set(key, managed);
    battleState.tiktokRoom.lastErrorHe = null;
    syncGlobalTikTokRoomSummary();
    broadcast({ type: 'state:update', state: battleState });

    // 0. UNIVERSAL RAW WEBSOCKET SNIFFER: Captures 100% of decoded protobuf Webcast frames seen on the live socket!
    conn.on(ControlEvent.DECODED_DATA, (rawType: string, decodedEvent: any) => {
      const cleanType = String(rawType || 'WebcastUnknownEvent').trim();
      const sender = String(
        decodedEvent?.user?.nickname ||
          decodedEvent?.user?.uniqueId ||
          decodedEvent?.anchorInfo?.nickname ||
          `@${cleanUsername}`
      );
      const avatarUrl = decodedEvent?.user ? extractTikTokUserAvatar(decodedEvent.user, sender) : undefined;
      const isHighFreq =
        /RoomUserSeq|LinkMicArmies|LikeMessage|ChatMessage/i.test(cleanType);
      const brief =
        decodedEvent?.comment
          ? `${sender}: "${String(decodedEvent.comment).slice(0, 48)}"`
          : decodedEvent?.giftDetails?.giftName
            ? `${sender} שלח ${decodedEvent.giftDetails.giftName}`
            : `נקלט פריים ${cleanType} מחדר @${cleanUsername}`;

      captureWsEventFrame({
        eventKey: cleanType,
        rawEventName: cleanType,
        sourceLabel: `@${cleanUsername}`,
        summaryHe: brief,
        payloadObj: decodedEvent,
        senderUser: sender,
        avatarUrl,
        isMirroredRoom: managed.summary.mirrorToStage,
        throttleRecentPacketMs: isHighFreq ? 4500 : 0,
      });
    });

    // 1. Live Chat (ALL Languages + Emojis + Universal Hype + Real Viewer Avatar + Chat Companion & Moderation Shield!)
    conn.on(WebcastEvent.CHAT, (data: any) => {
      const sender = String(data?.user?.nickname || data?.user?.uniqueId || 'צופה');
      const senderHandle = String(data?.user?.uniqueId || sender);
      const avatarUrl = extractTikTokUserAvatar(data?.user, sender);
      const comment = String(data?.comment || '').slice(0, 140);
      if (!comment) return;

      const lang = detectScriptLanguageTag(comment);
      if (lang !== 'אימוג׳י/הייפ אוניברסלי') {
        managed.summary.detectedLanguage = lang;
      }

      managed.summary.chatCount += 1;
      managed.unsynthesizedEventCount += 1;
      managed.chatSamples.unshift(`${sender}: ${comment}`);
      if (managed.chatSamples.length > 45) managed.chatSamples.length = 45;

      pushSwarmFeedEvent(managed, 'CHAT', `${sender}: ${comment}`, lang);

      inspectLiveChatForModerationAndCompanion({
        sourceRoom: `@${cleanUsername}`,
        sender,
        comment,
        isMirroredRoom: managed.summary.mirrorToStage,
      });

      battleState.recentChatMessages.unshift({
        user: sender,
        text: comment,
        ts: Date.now(),
        source: `@${cleanUsername}`,
        avatarUrl,
      });
      if (battleState.recentChatMessages.length > 100) battleState.recentChatMessages.length = 100;

      // Secondary Cloud Warning: if chat in mirrored room warns about opponent cloud ("ענן" / "smoke" / "mist")
      if (
        managed.summary.mirrorToStage &&
        battleState.cloudRadar.autoDetectEnabled &&
        !battleState.cloudRadar.active &&
        managed.summary.inBattle &&
        /(פתחו ענן|פתח ענן|יש ענן|smoke card|mist card)/i.test(comment)
      ) {
        activateOpponentCloudXray({
          durationSec: 25,
          opponentUsername: managed.summary.opponentUsername,
          reasonHe: `זוהתה התראת ענן בצ׳אט החי ("${comment.slice(0, 28)}") — שואב סקור מחדר היריב!`,
        });
      }

      if (managed.summary.mirrorToStage) {
        processTikTokEvent({
          type: 'chat',
          user: senderHandle,
          avatarUrl,
          message: comment,
        });
      } else {
        syncGlobalTikTokRoomSummary();
        broadcast({ type: 'state:update', state: battleState });
      }
    });

    // 2. Live Spoken Host Captions (if TikTok emits live speech captions in any language!)
    conn.on(WebcastEvent.CAPTION_MESSAGE, (data: any) => {
      const rawCap =
        String(
          data?.content ||
            (Array.isArray(data?.captionContent) ? data.captionContent.map((c: any) => c?.content).join(' ') : '') ||
            ''
        ).trim();
      if (!rawCap) return;
      const lang = detectScriptLanguageTag(rawCap);
      managed.summary.detectedLanguage = lang;
      managed.captionSamples.unshift(rawCap.slice(0, 140));
      if (managed.captionSamples.length > 25) managed.captionSamples.length = 25;
      managed.unsynthesizedEventCount += 1;
      pushSwarmFeedEvent(managed, 'CAPTION', `דיבור חי: "${rawCap.slice(0, 90)}"`, lang);
      syncGlobalTikTokRoomSummary();
    });

    // 3. Likes & Crowd Tapping Velocity + Participant Avatars
    conn.on(WebcastEvent.LIKE, (data: any) => {
      const likeBurst = Math.min(40, Math.max(1, Number(data?.likeCount || 4)));
      const sender = String(data?.user?.nickname || data?.user?.uniqueId || 'צופה');
      const avatarUrl = extractTikTokUserAvatar(data?.user, sender);
      managed.summary.totalLikes += likeBurst;
      managed.likeWindow.push({ ts: Date.now(), count: likeBurst });

      if (likeBurst >= 12) {
        pushSwarmFeedEvent(managed, 'LIKE_SURGE', `גל לחיצות מהיר (+${likeBurst} לייקים מ-${sender})`);
      }
      if (managed.summary.mirrorToStage) {
        processTikTokEvent({
          type: 'like',
          count: likeBurst,
          user: sender,
          avatarUrl,
        });
      } else {
        syncGlobalTikTokRoomSummary();
      }
    });

    // 4. Gifts, Streaks & Diamonds ("המסיבה מסביב" + Real Supporter Avatars + Opponent Room Score Delta!)
    conn.on(WebcastEvent.GIFT, (data: any) => {
      const giftName = String(data?.giftDetails?.giftName || data?.giftName || 'מתנה');
      const repeatCount = Math.max(1, Number(data?.repeatCount || 1));
      const unitDiamonds = Math.max(1, Number(data?.giftDetails?.diamondCount || data?.diamondCount || 1));
      const diamonds = unitDiamonds * repeatCount;
      const giver = String(data?.user?.nickname || data?.user?.uniqueId || 'תומך');
      const avatarUrl = extractTikTokUserAvatar(data?.user, giver);

      managed.summary.giftsCount += 1;
      managed.summary.diamondsCount += diamonds;
      managed.unsynthesizedEventCount += 2;
      const desc = `${giver} שלח ${giftName} x${repeatCount} (${diamonds} יהלומים)`;
      managed.giftSamples.unshift(desc);
      if (managed.giftSamples.length > 30) managed.giftSamples.length = 30;

      pushSwarmFeedEvent(managed, 'GIFT', desc);

      const whaleDiamondThreshold = Math.max(
        80,
        Math.round((battleState.countryCalibration.effectiveWhaleGiftThreshold || 299) / 3)
      );
      if (diamonds >= whaleDiamondThreshold) {
        captureWsEventFrame({
          eventKey: 'WebcastGiftMessage:WHALE',
          rawEventName: 'gift',
          sourceLabel: `@${cleanUsername}`,
          summaryHe: `לווייתן: ${desc}`,
          payloadObj: { giftName, repeatCount, diamonds, giver },
          numericValue: diamonds,
          senderUser: giver,
          avatarUrl,
          isMirroredRoom: managed.summary.mirrorToStage,
        });
        if (battleState.chatCompanion.autoCompanionEnabled) {
          dispatchCompanionCrewAction({
            moment: 'VIP_THANK_YOU',
            momentLabelHe: `תודת VIP אוטומטית על מתנת ${giftName}`,
            preferredRole: 'WELCOME_VIP',
            kind: 'CHAT_VIBE_LINE',
            userPlaceholder: giver,
          });
        }
      } else if (diamonds >= 20) {
        captureWsEventFrame({
          eventKey: 'WebcastGiftMessage:MEDIUM',
          rawEventName: 'gift',
          sourceLabel: `@${cleanUsername}`,
          summaryHe: desc,
          payloadObj: { giftName, repeatCount, diamonds, giver },
          numericValue: diamonds,
          senderUser: giver,
          avatarUrl,
          isMirroredRoom: managed.summary.mirrorToStage,
        });
      }

      // Even when observing (or mirroring), showcase real TikTok supporter avatars on stage!
      if (managed.summary.mirrorToStage || battleState.tiktokRoom.monitoredRooms.length <= 2) {
        recordStageParticipantAvatar({
          userId: String(data?.user?.id || giver),
          username: String(data?.user?.uniqueId || giver),
          displayName: giver,
          avatarUrl,
          pointsDelta: diamonds * 3,
          giftsDelta: 1,
          actionHe: `${giftName} x${repeatCount} (+${diamonds * 3})`,
          spotlight:
            diamonds >= 5
              ? {
                  kind: diamonds >= 250 ? 'WHALE_GIFT' : 'GIFT',
                  badgeHe: diamonds >= 250 ? 'MVP WHALE' : giftName.slice(0, 14),
                  durationMs: 5200,
                }
              : undefined,
        });
      }

      if (managed.summary.mirrorToStage && diamonds >= 5) {
        processTikTokEvent({
          type: diamonds >= 300 ? 'snipe_us' : 'score_us',
          points: diamonds * 3,
          user: giver,
          avatarUrl,
        });
      } else {
        syncGlobalTikTokRoomSummary();
        broadcast({ type: 'state:update', state: battleState });
      }
    });

    // 5. Party Treasure Envelopes, Emotes, Barrages & Goals
    conn.on(WebcastEvent.ENVELOPE, () => {
      managed.unsynthesizedEventCount += 2;
      pushSwarmFeedEvent(managed, 'PARTY_ENV', 'נפתחה תיבת אוצר / מעטפת מסיבה בחדר!');
      if (managed.summary.mirrorToStage) {
        processTikTokEvent({ type: 'goal', user: `@${cleanUsername}` });
      } else {
        syncGlobalTikTokRoomSummary();
        broadcast({ type: 'state:update', state: battleState });
      }
    });

    conn.on(WebcastEvent.GOAL_UPDATE, () => {
      pushSwarmFeedEvent(managed, 'PARTY_ENV', 'עדכון יעד קהילתי (Live Goal) בחדר!');
      syncGlobalTikTokRoomSummary();
    });

    // 6. Shares, Follows, Member Joins & Viewer Count + Participant Avatars
    conn.on(WebcastEvent.SHARE, (data: any) => {
      const sender = String(data?.user?.nickname || data?.user?.uniqueId || 'צופה');
      const avatarUrl = extractTikTokUserAvatar(data?.user, sender);
      managed.summary.sharesCount += 1;
      pushSwarmFeedEvent(managed, 'JOIN_SHARE', `${sender} שיתף את השידור`);
      if (managed.summary.mirrorToStage) {
        processTikTokEvent({ type: 'share', count: 1, user: sender, avatarUrl });
      } else {
        syncGlobalTikTokRoomSummary();
      }
    });

    conn.on(WebcastEvent.FOLLOW, (data: any) => {
      const sender = String(data?.user?.nickname || data?.user?.uniqueId || 'עוקב חדש');
      const avatarUrl = extractTikTokUserAvatar(data?.user, sender);
      managed.summary.followsCount += 1;
      pushSwarmFeedEvent(managed, 'JOIN_SHARE', `עוקב חדש: ${sender}`);
      if (managed.summary.mirrorToStage) {
        processTikTokEvent({ type: 'follow', count: 1, user: sender, avatarUrl });
      } else {
        syncGlobalTikTokRoomSummary();
      }
    });

    conn.on(WebcastEvent.MEMBER, (data: any) => {
      managed.summary.joinsCount += 1;
      if (managed.summary.mirrorToStage) {
        const sender = String(data?.user?.nickname || data?.user?.uniqueId || `@${cleanUsername}`);
        const avatarUrl = extractTikTokUserAvatar(data?.user, sender);
        processTikTokEvent({ type: 'join', count: 1, user: sender, avatarUrl });
      }
    });

    conn.on(WebcastEvent.ROOM_USER, (data: any) => {
      const viewers = Number(data?.viewerCount || 0);
      if (viewers > 0) {
        managed.summary.viewerCount = viewers;
        managed.summary.peakViewers = Math.max(managed.summary.peakViewers, viewers);
        syncGlobalTikTokRoomSummary();
      }
    });

    // 7. Live PK Battle Detection + Anchor ID Mapping + Auto-Opponent Spy Connection!
    conn.on(WebcastEvent.LINK_MIC_BATTLE, (data: any) => {
      managed.summary.inBattle = true;
      managed.unsynthesizedEventCount += 3;

      let opp = '';
      // Support both tiktok-live-proto v3 (anchorsInfo wrapper) and legacy anchorInfo/battleUsers
      const v3Anchors = Array.isArray(data?.anchorsInfo) ? data.anchorsInfo : [];
      for (const wrapper of v3Anchors) {
        const u = wrapper?.value?.user || wrapper?.user;
        const handle = String(u?.displayId || u?.uniqueId || '').trim();
        const anchorId = String(wrapper?.key || u?.userId || u?.id || '').trim();
        if (handle && handle.toLowerCase() === key) {
          if (anchorId) managed.hostAnchorId = anchorId;
        } else if (handle) {
          opp = handle;
          if (anchorId) managed.opponentAnchorId = anchorId;
        }
      }

      if (!opp) {
        const legacyUsers = data?.anchorInfo || data?.battleUsers || [];
        if (Array.isArray(legacyUsers)) {
          for (const u of legacyUsers) {
            const handle = String(u?.user?.uniqueId || u?.uniqueId || u?.displayId || '').trim();
            const anchorId = String(u?.user?.userId || u?.userId || '').trim();
            if (handle && handle.toLowerCase() === key) {
              if (anchorId) managed.hostAnchorId = anchorId;
            } else if (handle) {
              opp = handle;
              if (anchorId) managed.opponentAnchorId = anchorId;
            }
          }
        }
      }

      if (opp) {
        managed.summary.opponentUsername = opp;
        if (!managed.opponentsSeen.includes(opp)) {
          managed.opponentsSeen.push(opp);
        }
        if (managed.summary.mirrorToStage) {
          battleState.cloudRadar.opponentUsername = opp;
          battleState.tiktokRoom.activeOpponentUsername = opp;
        }
        // Automatically connect stealth listener to opponent's room so Anti-Cloud X-Ray Score is instant!
        if (battleState.tiktokRoom.autoDiscoverOpponents || battleState.cloudRadar.autoDetectEnabled) {
          upsertWatchlistCreator(opp, {
            notesHe: `יריב קרב PK שזוהה בשידור חי מול @${cleanUsername} (מחובר לשאיבת סקור אנטי-ענן)`,
          });
          if (activeSwarmRooms.size < MAX_CONCURRENT_SWARM_ROOMS && !activeSwarmRooms.has(opp.toLowerCase())) {
            void connectCreatorToSwarm(opp, {
              listenMode: 'OBSERVER_LEARN',
              mirrorToStage: false,
              silentIfOffline: true,
            });
          }
        }
      }

      // Also check if fuzzyDisplayConfig is already active on battle state
      if (
        managed.summary.mirrorToStage &&
        battleState.cloudRadar.autoDetectEnabled &&
        Boolean(data?.fuzzyDisplayConfig)
      ) {
        activateOpponentCloudXray({
          durationSec: 25,
          opponentUsername: opp || battleState.cloudRadar.opponentUsername,
          reasonHe: `זוהה מיסוך ניקוד (fuzzyDisplayConfig) בקרב מול @${opp || 'היריב'} — חושף סקור מהחדר שלו!`,
        });
      }

      pushSwarmFeedEvent(
        managed,
        'BATTLE_PK',
        `נפתח קרב PK חי${opp ? ` נגד @${opp}` : ''}!`
      );

      if (managed.summary.mirrorToStage) {
        battleState.streamMode = 'BATTLE';
        battleState.elapsedSec = 0;
        battleState.isRunning = true;
      }
      syncGlobalTikTokRoomSummary();
      broadcast({ type: 'state:update', state: battleState });
    });

    // 8. Real-Time Battle Armies Score + Top Supporter Avatars + Cross-Room Anti-Cloud Score Extraction!
    conn.on(WebcastEvent.LINK_MIC_ARMIES, (data: any) => {
      managed.summary.inBattle = true;

      // Parse v3 map data.armies: { [anchorId]: { hostscore, anchorIdStr, userArmies } } + legacy battleItems
      const v3Map = data?.armies && typeof data.armies === 'object' ? Object.values(data.armies) : [];
      const entries: any[] = v3Map.length >= 2 ? v3Map : Array.isArray(data?.battleItems) ? data.battleItems : Array.isArray(data?.battleArmies) ? data.battleArmies : [];

      if (entries.length >= 2) {
        let hostPts = 0;
        let oppPts = 0;

        const e0 = entries[0];
        const e1 = entries[1];
        const s0 = Number(e0?.hostscore ?? e0?.points ?? e0?.hostScore ?? 0);
        const s1 = Number(e1?.hostscore ?? e1?.points ?? e1?.hostScore ?? 0);
        const id0 = String(e0?.anchorIdStr || e0?.anchorId || '');
        const id1 = String(e1?.anchorIdStr || e1?.anchorId || '');

        if (managed.hostAnchorId && id1 === managed.hostAnchorId) {
          hostPts = s1;
          oppPts = s0;
        } else if (managed.opponentAnchorId && id0 === managed.opponentAnchorId) {
          hostPts = s1;
          oppPts = s0;
        } else {
          hostPts = s0;
          oppPts = s1;
        }

        if (hostPts > 0 || oppPts > 0) {
          managed.summary.hostBattlePoints = hostPts;
          managed.summary.opponentBattlePoints = oppPts;

          if (managed.summary.mirrorToStage) {
            battleState.myScore = hostPts;
            battleState.opponentScore = oppPts;
          } else if (
            battleState.cloudRadar.opponentUsername &&
            battleState.cloudRadar.opponentUsername.toLowerCase() === key
          ) {
            // THIS ROOM IS OUR CURRENT OPPONENT'S LIVE ROOM!
            // In opponent's room, oppPts is OUR true score and hostPts is OPPONENT's true score!
            battleState.cloudRadar.opponentRoomConnected = true;
            battleState.cloudRadar.myTrueScore = oppPts;
            battleState.cloudRadar.opponentTrueScore = hostPts;
            battleState.cloudRadar.scoreDiff = oppPts - hostPts;
            if (battleState.cloudRadar.active) {
              battleState.myScore = oppPts;
              battleState.opponentScore = hostPts;
            }
          }
        }

        // Extract Real Supporter Avatars from BattleUserArmy[] (top contributors on our side!)
        const ourArmyEntry =
          managed.hostAnchorId && id1 === managed.hostAnchorId ? e1 : e0;
        const userArmies = Array.isArray(ourArmyEntry?.userArmies) ? ourArmyEntry.userArmies : [];
        if (managed.summary.mirrorToStage && userArmies.length > 0) {
          for (const contributor of userArmies.slice(0, 5)) {
            const nick = String(contributor?.nickname || 'תומך קרב');
            const cScore = Number(contributor?.score || contributor?.diamondScore || 0);
            const avUrl = extractTikTokUserAvatar({ avatarThumb: contributor?.avatarThumb }, nick);
            if (cScore > 0) {
              const existing = battleState.topSupporters.find((s) => s.displayName === nick);
              if (!existing || cScore > existing.points) {
                recordStageParticipantAvatar({
                  userId: String(contributor?.userIdStr || contributor?.userId || nick),
                  username: nick,
                  displayName: nick,
                  avatarUrl: avUrl,
                  pointsDelta: existing ? Math.max(0, cScore - existing.points) : cScore,
                  actionHe: `תומך קרב מוביל (${cScore.toLocaleString()} נק׳)`,
                });
              }
            }
          }
        }
      }

      // Detect score obfuscation / enigma / fuzzyDisplayConfigV2 in LINK_MIC_ARMIES
      const hasFuzzyCloud =
        Boolean(data?.fuzzyDisplayConfigV2) ||
        entries.some((e: any) => Number(e?.hostEnigmaScore || 0) > 0);
      if (
        managed.summary.mirrorToStage &&
        battleState.cloudRadar.autoDetectEnabled &&
        hasFuzzyCloud &&
        !battleState.cloudRadar.active
      ) {
        activateOpponentCloudXray({
          durationSec: 25,
          opponentUsername: managed.summary.opponentUsername,
          reasonHe: 'זוהה ענן הסתרת סקור ב-LINK_MIC_ARMIES — חושף את הסקור האמיתי שלך דרך חדר היריב!',
        });
      }

      syncGlobalTikTokRoomSummary();
    });

    // 9. Battle Item Cards: Exact SmokeCard / Cloud ("ענן") Detection + Glove x5 Detection!
    conn.on(WebcastEvent.LINK_MIC_BATTLE_ITEM_CARD, (data: any) => {
      const smokeCard = data?.useSmokeCard;
      const specialCard = data?.useSpecialEffectCard;
      const gloveCard = data?.useVaultGloveCard || data?.useCriticalStrikeCard;
      const rawCardKey = String(
        smokeCard?.cardInfo?.cardNameKey ||
          specialCard?.cardInfo?.cardNameKey ||
          data?.cardName ||
          data?.itemType ||
          ''
      );

      const isSmokeOrCloud =
        Boolean(smokeCard) || /smoke|mist|fog|cloud|ענן|ערפל/i.test(rawCardKey);

      if (isSmokeOrCloud) {
        const smokeDur = Math.max(
          12,
          Math.min(
            60,
            Number(
              smokeCard?.cardInfo?.effectLastDuration ||
                smokeCard?.cardInfo?.effectTimeSec ||
                specialCard?.cardInfo?.effectLastDuration ||
                25
            )
          )
        );
        managed.summary.activeCardOrGloveHe = `ענן ערפל פעיל (${smokeDur}s)`;
        managed.unsynthesizedEventCount += 4;
        pushSwarmFeedEvent(
          managed,
          'GLOVE_CARD',
          `זוהה פתיחת ענן (SmokeCard) בקרב של @${cleanUsername} למשך ${smokeDur} שניות!`
        );

        captureWsEventFrame({
          eventKey: 'WebcastLinkMicBattleItemCard:SMOKE_CLOUD',
          rawEventName: 'linkMicBattleItemCard',
          sourceLabel: `@${cleanUsername}`,
          summaryHe: `נפתח ענן ערפל (SmokeCard) ל-${smokeDur} שניות!`,
          payloadObj: data,
          numericValue: smokeDur,
          isMirroredRoom: managed.summary.mirrorToStage,
        });

        if (battleState.chatCompanion.autoCompanionEnabled) {
          dispatchCompanionCrewAction({
            moment: 'CLOUD_DEFENSE',
            momentLabelHe: 'התראת ענן בצ׳אט מהמנחה המלווה',
            preferredRole: 'TACTICAL_SNIPE',
            kind: 'CHAT_VIBE_LINE',
          });
        }

        const isRelevantToOurBattle =
          managed.summary.mirrorToStage ||
          (battleState.cloudRadar.opponentUsername &&
            battleState.cloudRadar.opponentUsername.toLowerCase() === key);

        if (isRelevantToOurBattle && battleState.cloudRadar.autoDetectEnabled) {
          activateOpponentCloudXray({
            durationSec: smokeDur,
            opponentUsername: managed.summary.mirrorToStage
              ? managed.summary.opponentUsername
              : cleanUsername,
            reasonHe: `היריב פתח ענן (useSmokeCard ל-${smokeDur} שנ׳)! טריגר X-Ray מציג את הסקור שלך דרך החדר שלו!`,
          });
        } else {
          syncGlobalTikTokRoomSummary();
          broadcast({ type: 'state:update', state: battleState });
        }
        return;
      }

      const cardName = gloveCard
        ? 'כפפת בוסט / מכה קריטית x5'
        : rawCardKey || 'קלף קרב חי';
      managed.summary.activeCardOrGloveHe = cardName;
      managed.unsynthesizedEventCount += 3;
      pushSwarmFeedEvent(managed, 'GLOVE_CARD', `הופעל קלף קרב / כפפה חיה: ${cardName}!`);

      captureWsEventFrame({
        eventKey: 'WebcastLinkMicBattleItemCard:GLOVE_X5',
        rawEventName: 'linkMicBattleItemCard',
        sourceLabel: `@${cleanUsername}`,
        summaryHe: `הופעל קלף קרב: ${cardName}`,
        payloadObj: data,
        numericValue: 30,
        isMirroredRoom: managed.summary.mirrorToStage,
      });

      if (battleState.chatCompanion.autoCompanionEnabled) {
        dispatchCompanionCrewAction({
          moment: 'GLOVE_X5_PUSH',
          momentLabelHe: `דרבון כפפה x5 בצ׳אט (${cardName})`,
          preferredRole: 'TACTICAL_SNIPE',
          kind: 'CHAT_VIBE_LINE',
        });
      }

      setTimeout(() => {
        if (managed.summary.activeCardOrGloveHe === cardName) {
          managed.summary.activeCardOrGloveHe = null;
          syncGlobalTikTokRoomSummary();
        }
      }, 30000);

      if (managed.summary.mirrorToStage) {
        processTikTokEvent({ type: 'glove', user: `@${cleanUsername}` });
      } else {
        syncGlobalTikTokRoomSummary();
        broadcast({ type: 'state:update', state: battleState });
      }
    });

    const handleStreamClosed = () => {
      const hadActivity = managed.chatSamples.length + managed.giftSamples.length > 0;
      managed.summary.connected = false;
      managed.summary.connecting = false;
      const w = aiMemory.watchedCreators.find((item) => item.username.toLowerCase() === key);
      if (w) {
        w.isLiveNow = false;
        w.currentlyConnected = false;
      }
      if (hadActivity) {
        void synthesizeCreatorOrSwarmInsights(cleanUsername, `סיכום סשן לייב אוטומטי (@${cleanUsername})`).catch(() => {});
      }
      activeSwarmRooms.delete(key);
      syncGlobalTikTokRoomSummary();
      broadcast({ type: 'state:update', state: battleState });
    };

    conn.on(WebcastEvent.STREAM_END, handleStreamClosed);
    conn.on(ControlEvent.DISCONNECTED, handleStreamClosed);

    try {
      const state = await conn.connect();
      managed.summary.connecting = false;
      managed.summary.connected = true;
      managed.summary.roomId = String(state?.roomId || conn.roomId || '');
      const initialViewers = Number((state?.roomInfo as Record<string, any>)?.data?.user_count || 0);
      managed.summary.viewerCount = initialViewers;
      managed.summary.peakViewers = initialViewers;
      managed.summary.partyVibeHe = 'מחובר בלייב · קולט אנרגיה, צ׳אט ומסיבה מסביב';

      const w = aiMemory.watchedCreators.find((item) => item.username.toLowerCase() === key);
      if (w) {
        w.isLiveNow = true;
        w.currentlyConnected = true;
        w.lastCheckedTs = Date.now();
        w.lastLiveSeenTs = Date.now();
        saveMemory(aiMemory);
      }

      pushSwarmFeedEvent(managed, 'PARTY_ENV', `התחברנו לשידור החי של @${cleanUsername} (${initialViewers} צופים)`);
      pushLog({
        eventType: 'TIKTOK_CONNECTED',
        userLabel: `@${cleanUsername}`,
        triggeredEffectId: null,
        status: 'TRIGGERED',
        detailHe: `מאזין חי ל-@${cleanUsername} במקביל (כל השפות: אנרגיה, צ׳אט, מתנות וקרבות)!`,
      });

      syncGlobalTikTokRoomSummary();
      broadcast({ type: 'state:update', state: battleState });
      return { ok: true, connected: true, summary: managed.summary };
    } catch (err: unknown) {
      activeSwarmRooms.delete(key);
      const rawErr = err instanceof Error ? err.message : '';
      const isOffline = /offline|not live|room_id|failed to retrieve/i.test(rawErr);

      const w = aiMemory.watchedCreators.find((item) => item.username.toLowerCase() === key);
      if (w) {
        w.isLiveNow = false;
        w.currentlyConnected = false;
        w.lastCheckedTs = Date.now();
        saveMemory(aiMemory);
      }

      const errorHe = isOffline
        ? `@${cleanUsername} אינו בלייב כרגע — נשמר ברשימת המעקב 24/7 ויתחבר אוטומטית ברגע שיעלה לשידור חי!`
        : `לא ניתן להתחבר כרגע ל-@${cleanUsername} (${rawErr.slice(0, 55) || 'נשמר למעקב אוטומטי'}).`;

      if (!options?.silentIfOffline) {
        battleState.tiktokRoom.lastErrorHe = errorHe;
      }
      syncGlobalTikTokRoomSummary();
      broadcast({ type: 'state:update', state: battleState });
      return { ok: false, connected: false, errorHe };
    }
  }

  async function checkIsCreatorLiveQuick(username: string): Promise<boolean> {
    try {
      const probe = new TikTokLiveConnection(username, { fetchRoomInfoOnConnect: false });
      const livePromise = probe.fetchIsLive(username);
      const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3400));
      return await Promise.race([livePromise, timeoutPromise]);
    } catch {
      return false;
    }
  }

  let radarScanInProgress = false;
  async function scanWatchlistAndAutoConnect(alsoConnectGlobalTop = false): Promise<{
    checkedCount: number;
    newlyConnected: string[];
    currentlyLive: string[];
  }> {
    if (radarScanInProgress) {
      return {
        checkedCount: aiMemory.watchedCreators.length,
        newlyConnected: [],
        currentlyLive: Array.from(activeSwarmRooms.values())
          .filter((r) => r.summary.connected)
          .map((r) => r.username),
      };
    }
    radarScanInProgress = true;
    const newlyConnected: string[] = [];
    const currentlyLive: string[] = [];

    try {
      battleState.tiktokRoom.lastRadarScanTs = Date.now();
      const candidates = new Set<string>();

      for (const w of aiMemory.watchedCreators) {
        if (w.autoWatchEnabled) {
          candidates.add(w.username);
        }
      }

      if (alsoConnectGlobalTop) {
        for (const reg of Object.keys(tikleapCache.byRegion)) {
          for (const item of tikleapCache.byRegion[reg]?.items || []) {
            if (item.username) candidates.add(item.username);
          }
        }
      }

      const list = Array.from(candidates).slice(0, 18);
      // Probe in batches of 6 so we don't overload sockets
      for (let i = 0; i < list.length; i += 6) {
        const batch = list.slice(i, i + 6);
        await Promise.all(
          batch.map(async (uname) => {
            const key = uname.toLowerCase();
            const existing = activeSwarmRooms.get(key);
            if (existing?.summary.connected) {
              currentlyLive.push(uname);
              return;
            }
            const isLive = await checkIsCreatorLiveQuick(uname);
            const watchEntry = aiMemory.watchedCreators.find((w) => w.username.toLowerCase() === key);
            if (watchEntry) {
              watchEntry.lastCheckedTs = Date.now();
              watchEntry.isLiveNow = isLive;
            }
            if (isLive && activeSwarmRooms.size < MAX_CONCURRENT_SWARM_ROOMS) {
              if (!watchEntry) {
                upsertWatchlistCreator(uname, {
                  notesHe: 'מוביל TikLeap שזוהה בשידור חי — נוסף אוטומטית לרשימת המעקב והלמידה 24/7',
                  autoWatchEnabled: true,
                  autoLearnEnabled: true,
                });
              }
              const res = await connectCreatorToSwarm(uname, {
                listenMode: 'OBSERVER_LEARN',
                mirrorToStage: false,
                addToWatchlist: true,
                silentIfOffline: true,
              });
              if (res.connected) {
                newlyConnected.push(uname);
                currentlyLive.push(uname);
              }
            }
          })
        );
      }

      saveMemory(aiMemory);
      syncGlobalTikTokRoomSummary();
      broadcast({ type: 'state:update', state: battleState });
    } finally {
      radarScanInProgress = false;
    }

    return { checkedCount: aiMemory.watchedCreators.length, newlyConnected, currentlyLive };
  }

  // Background 24/7 Watchlist Live Radar (checks every 40s for any watched creator going LIVE!)
  setInterval(() => {
    if (battleState.tiktokRoom.autoWatchRadarEnabled) {
      void scanWatchlistAndAutoConnect(false).catch(() => {});
    }
    syncGlobalTikTokRoomSummary();
  }, 40000);

  // Background Autonomous Cross-Stream AI Learning Loop (every 35s when connected streams have fresh activity)
  let autoSynthesizeInProgress = false;
  setInterval(() => {
    if (autoSynthesizeInProgress) return;
    const hasFresh = Array.from(activeSwarmRooms.values()).some(
      (r) => r.summary.connected && r.unsynthesizedEventCount >= 6 && Date.now() - r.lastSynthesizedTs > 30000
    );
    if (!hasFresh) return;
    autoSynthesizeInProgress = true;
    void synthesizeCreatorOrSwarmInsights(undefined, 'למידה אוטונומית רציפה משידורים חיים')
      .catch(() => {})
      .finally(() => {
        autoSynthesizeInProgress = false;
      });
  }, 35000);

  // Kick off initial non-blocking radar scan right after server starts!
  setTimeout(() => {
    void scanWatchlistAndAutoConnect(true).catch(() => {});
  }, 2000);

  // Connect single or additional room into the parallel swarm
  app.post('/api/tiktok/connect-room', async (req, res) => {
    const rawUser = String(req.body?.username || '').trim();
    const listenMode: 'MY_BROADCAST' | 'OBSERVER_LEARN' =
      req.body?.listenMode === 'MY_BROADCAST' ? 'MY_BROADCAST' : 'OBSERVER_LEARN';
    const mirrorToStage = Boolean(req.body?.mirrorToStage || listenMode === 'MY_BROADCAST');

    const result = await connectCreatorToSwarm(rawUser, {
      listenMode,
      mirrorToStage,
      addToWatchlist: true,
      silentIfOffline: false,
    });
    res.json({ ...result, state: battleState });
  });

  // Disconnect one room or all rooms
  app.post('/api/tiktok/disconnect-room', async (req, res) => {
    const target = sanitizeTikTokHandle(req.body?.username || '');
    const disconnectAll = Boolean(req.body?.all || !target);

    if (disconnectAll) {
      for (const room of activeSwarmRooms.values()) {
        try {
          await room.conn.disconnect();
        } catch {
          // Ignore
        }
      }
      activeSwarmRooms.clear();
    } else {
      const room = activeSwarmRooms.get(target.toLowerCase());
      if (room) {
        try {
          await room.conn.disconnect();
        } catch {
          // Ignore
        }
        activeSwarmRooms.delete(target.toLowerCase());
      }
    }
    syncGlobalTikTokRoomSummary();
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, state: battleState });
  });

  // Toggle stage mirroring for a specific connected live stream
  app.post('/api/tiktok/toggle-mirror', (req, res) => {
    const target = sanitizeTikTokHandle(req.body?.username || '').toLowerCase();
    const room = activeSwarmRooms.get(target);
    if (room) {
      room.summary.mirrorToStage = !room.summary.mirrorToStage;
      syncGlobalTikTokRoomSummary();
      broadcast({ type: 'state:update', state: battleState });
    }
    res.json({ ok: true, state: battleState });
  });

  // Add 1 or multiple creators (comma/space/newline separated) to the 24/7 Auto-Watch & Auto-Learn list!
  app.post('/api/tiktok/watchlist/add', async (req, res) => {
    const rawInput = req.body?.usernames ?? req.body?.username ?? '';
    const notesHe = typeof req.body?.notesHe === 'string' ? req.body.notesHe.trim() : undefined;
    const rawTokens = Array.isArray(rawInput)
      ? rawInput.map(String)
      : String(rawInput)
          .split(/[\s,;|\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);

    const added: WatchedCreatorEntry[] = [];
    for (const token of rawTokens) {
      const entry = upsertWatchlistCreator(token, { notesHe });
      if (entry) added.push(entry);
    }

    if (added.length === 0) {
      res.status(400).json({ error: 'הזן לפחות שם משתמש אחד בטיקטוק (למשל zainabmamdouh35 או sanya.mar).' });
      return;
    }

    // Immediately probe & auto-connect any newly added creators who are LIVE right now!
    const connectedNow: string[] = [];
    const queuedForAutoWatch: string[] = [];

    await Promise.all(
      added.map(async (entry) => {
        const resConn = await connectCreatorToSwarm(entry.username, {
          listenMode: 'OBSERVER_LEARN',
          mirrorToStage: false,
          addToWatchlist: true,
          silentIfOffline: true,
        });
        if (resConn.connected) {
          connectedNow.push(entry.username);
        } else {
          queuedForAutoWatch.push(entry.username);
          // Pre-learn creator profile in background so AI already knows them before their next live!
          void synthesizeCreatorOrSwarmInsights(entry.username, 'למידה מקדימה ברשימת המעקב').catch(() => {});
        }
      })
    );

    syncGlobalTikTokRoomSummary();
    broadcast({ type: 'state:update', state: battleState });
    res.json({
      ok: true,
      addedCount: added.length,
      connectedNow,
      queuedForAutoWatch,
      state: battleState,
    });
  });

  app.post('/api/tiktok/watchlist/remove', async (req, res) => {
    const clean = sanitizeTikTokHandle(req.body?.username || '');
    if (clean) {
      aiMemory.watchedCreators = aiMemory.watchedCreators.filter(
        (w) => w.username.toLowerCase() !== clean.toLowerCase()
      );
      const active = activeSwarmRooms.get(clean.toLowerCase());
      if (active) {
        try {
          await active.conn.disconnect();
        } catch {
          // Ignore
        }
        activeSwarmRooms.delete(clean.toLowerCase());
      }
      saveMemory(aiMemory);
      syncGlobalTikTokRoomSummary();
      broadcast({ type: 'state:update', state: battleState });
    }
    res.json({ ok: true, state: battleState });
  });

  app.post('/api/tiktok/watchlist/toggle', (req, res) => {
    const { username, field, autoWatchRadarEnabled, autoDiscoverOpponents } = req.body || {};
    if (typeof autoWatchRadarEnabled === 'boolean') {
      battleState.tiktokRoom.autoWatchRadarEnabled = autoWatchRadarEnabled;
    }
    if (typeof autoDiscoverOpponents === 'boolean') {
      battleState.tiktokRoom.autoDiscoverOpponents = autoDiscoverOpponents;
    }
    if (username && (field === 'autoWatchEnabled' || field === 'autoLearnEnabled')) {
      const toggleField: 'autoWatchEnabled' | 'autoLearnEnabled' = field;
      const clean = sanitizeTikTokHandle(username);
      const entry = aiMemory.watchedCreators.find((w) => w.username.toLowerCase() === clean.toLowerCase());
      if (entry) {
        entry[toggleField] = !entry[toggleField];
        saveMemory(aiMemory);
      }
    }
    syncGlobalTikTokRoomSummary();
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, state: battleState });
  });

  // Connect simultaneously to ALL currently LIVE creators from Watchlist + Global Multi-Region Scout!
  app.post('/api/tiktok/connect-all-live', async (req, res) => {
    const includeGlobal = req.body?.includeGlobal !== false;
    const regionsToSeed = ['il', 'eg', 'ae', 'tr', 'ru', 'us', 'br', 'de'];

    // Opportunistically pull up to 2 uncached global regions per sweep from TikLeap using the new key
    if (includeGlobal && process.env.TIKLEAP_API_KEY && process.env.TIKLEAP_API_KEY !== 'MY_TIKLEAP_API_KEY') {
      const missingRegions = regionsToSeed.filter((r) => !tikleapCache.byRegion[r]).slice(0, 2);
      for (const missingRegion of missingRegions) {
        try {
          const tlResp = await fetch(`https://api.tikleap.com/rankings?region=${missingRegion}`, {
            headers: {
              Authorization: `Bearer ${process.env.TIKLEAP_API_KEY}`,
              'X-API-Key': process.env.TIKLEAP_API_KEY,
            },
          });
          const tlJson = (await tlResp.json()) as {
            data?: Array<{ rank: number; name: string; username: string; avatar?: string }>;
          };
          if (Array.isArray(tlJson.data) && tlJson.data.length > 0) {
            tikleapCache.byRegion[missingRegion] = {
              fetchedAt: Date.now(),
              items: tlJson.data.slice(0, 12),
            };
            saveTikLeapCache(tikleapCache);
          }
        } catch {
          // Ignore quota/network hiccup
        }
      }
    }

    const scanRes = await scanWatchlistAndAutoConnect(includeGlobal);
    res.json({
      ok: true,
      ...scanRes,
      activeStreamsCount: battleState.tiktokRoom.monitoredRooms.filter((r) => r.connected).length,
      state: battleState,
    });
  });

  // Trigger immediate cross-language Gemini synthesis across all active live streams (or one specific creator)
  app.post('/api/tiktok/synthesize-swarm-energy', async (req, res) => {
    try {
      const targetUser = req.body?.username ? sanitizeTikTokHandle(req.body.username) : undefined;
      const result = await synthesizeCreatorOrSwarmInsights(targetUser, 'זיקוק אנרגיה רב-לשוני יזום');
      res.json({ ok: true, result, state: battleState });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה בזיקוק תובנות מהשידורים החיים';
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // 3. TIKLEAP API + GEMINI SEARCH GROUNDING STRONG BATTLE SCOUT + LIVE PROBE
  // ============================================================================
  app.post('/api/tiktok/scout-battles', async (req, res) => {
    const region = String(req.body?.region || 'il').toLowerCase();
    const nicheQuery = String(req.body?.query || 'strongest TikTok LIVE PK battle streamers any language').trim();
    const autoConnectFound = Boolean(req.body?.autoConnectLive);

    let tikleapStatusHe = 'נתוני דירוג TikLeap טעונים';
    let tikleapItems: Array<{ rank: number; name: string; username: string; avatar?: string }> = [];

    const cached = tikleapCache.byRegion[region];
    const cacheFresh = cached && Date.now() - cached.fetchedAt < 30 * 60 * 1000;

    if (cacheFresh) {
      tikleapItems = cached.items;
      tikleapStatusHe = `נטען ממטמון TikLeap אזור ${region.toUpperCase()} (שמירת מכסת בקשות יומית)`;
    } else if (process.env.TIKLEAP_API_KEY && process.env.TIKLEAP_API_KEY !== 'MY_TIKLEAP_API_KEY') {
      try {
        const tlResp = await fetch(`https://api.tikleap.com/rankings?region=${encodeURIComponent(region)}`, {
          headers: {
            Authorization: `Bearer ${process.env.TIKLEAP_API_KEY}`,
            'X-API-Key': process.env.TIKLEAP_API_KEY,
          },
        });
        const tlJson = (await tlResp.json()) as {
          data?: Array<{ rank: number; name: string; username: string; avatar?: string }>;
          error?: string;
        };
        if (Array.isArray(tlJson.data) && tlJson.data.length > 0) {
          tikleapItems = tlJson.data.slice(0, 12);
          tikleapCache.byRegion[region] = { fetchedAt: Date.now(), items: tikleapItems };
          saveTikLeapCache(tikleapCache);
          tikleapStatusHe = `נשלפו ${tikleapItems.length} מובילים חיים מ-TikLeap API (${region.toUpperCase()})`;
        } else if (tlJson.error === 'api_daily_limit_reached') {
          tikleapItems = cached?.items || [];
          tikleapStatusHe = 'מכסת 50 הבקשות היומית של מפתח TikLeap מוצתה להיום — משלב מטמון TikLeap + חיפוש חי של Gemini ברשת!';
        }
      } catch {
        tikleapItems = cached?.items || [];
      }
    }

    const geminiCreators: Array<{
      username: string;
      displayName: string;
      estimatedStrength: number;
      styleNoteHe: string;
    }> = [];
    const groundingLinks: Array<{ title: string; uri: string }> = [];

    try {
      const ai = getGeminiClient();
      const searchResp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Search the web (TikLeap rankings, TikTok LIVE PK battle leaderboards, viral TikTok battle clips across all languages) for top high-energy TikTok LIVE Battle / PK streamers in region "${region.toUpperCase()}" or matching "${nicheQuery}".
Return a concise list of 6 real, well-known TikTok LIVE creators with their exact @username (without spaces), display name, strength score (75-99), and a 1-sentence Hebrew tactical note about their battle energy/party/snipe style.
Format each line strictly as:
CREATOR|username|displayName|strengthScore|Hebrew tactical note`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = searchResp.text || '';
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('CREATOR|')) {
          const parts = trimmed.split('|');
          if (parts.length >= 5) {
            const uname = sanitizeTikTokHandle(parts[1]);
            if (uname && /^[a-zA-Z0-9._-]+$/.test(uname)) {
              geminiCreators.push({
                username: uname,
                displayName: parts[2].trim() || uname,
                estimatedStrength: Math.min(99, Math.max(70, Number(parts[3]) || 88)),
                styleNoteHe: parts.slice(4).join(' ').trim(),
              });
            }
          }
        }
      }

      const chunks = searchResp.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      for (const ch of chunks) {
        if (ch.web?.uri && ch.web?.title) {
          groundingLinks.push({ title: ch.web.title, uri: ch.web.uri });
        }
      }
    } catch {
      // Continue with Watchlist + TikLeap + Memory creators
    }

    const map = new Map<
      string,
      {
        username: string;
        displayName: string;
        region: string;
        rank?: number | null;
        avatarUrl?: string;
        isLiveNow: boolean;
        estimatedStrength: number;
        styleNoteHe: string;
        source: 'TIKLEAP' | 'GEMINI_SEARCH' | 'MEMORY';
        profileUrl: string;
      }
    >();

    // Always include watched creators first so the user sees live status of zainabmamdouh35, sanya.mar, etc.
    for (const w of aiMemory.watchedCreators.slice(0, 6)) {
      const key = w.username.toLowerCase();
      map.set(key, {
        username: w.username,
        displayName: w.displayName,
        region: w.detectedLanguage || 'WATCHLIST',
        rank: null,
        isLiveNow: w.isLiveNow,
        estimatedStrength: 92,
        styleNoteHe: w.notesHe,
        source: 'MEMORY',
        profileUrl: `https://www.tiktok.com/@${w.username}/live`,
      });
    }

    for (const item of tikleapItems.slice(0, 10)) {
      const key = item.username.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          username: item.username,
          displayName: item.name || item.username,
          region: region.toUpperCase(),
          rank: item.rank,
          avatarUrl: item.avatar,
          isLiveNow: false,
          estimatedStrength: Math.max(82, 100 - (item.rank - 1) * 2),
          styleNoteHe: `מדורג #${item.rank} ב-TikLeap (${region.toUpperCase()}) בצבירת יהלומים וקרבות חיים.`,
          source: 'TIKLEAP',
          profileUrl: `https://www.tiktok.com/@${item.username}/live`,
        });
      }
    }

    for (const gc of geminiCreators) {
      const key = gc.username.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          username: gc.username,
          displayName: gc.displayName,
          region: region.toUpperCase(),
          rank: null,
          isLiveNow: false,
          estimatedStrength: gc.estimatedStrength,
          styleNoteHe: gc.styleNoteHe,
          source: 'GEMINI_SEARCH',
          profileUrl: `https://www.tiktok.com/@${gc.username}/live`,
        });
      }
    }

    const candidates = Array.from(map.values()).slice(0, 14);

    // Probe live status in parallel!
    await Promise.all(
      candidates.slice(0, 10).map(async (c) => {
        const active = activeSwarmRooms.get(c.username.toLowerCase());
        if (active?.summary.connected) {
          c.isLiveNow = true;
        } else {
          c.isLiveNow = await checkIsCreatorLiveQuick(c.username);
        }
        if (c.isLiveNow) {
          // Automatically add LIVE discovered TikLeap / Search leaders to 24/7 Watchlist per user preference!
          upsertWatchlistCreator(c.username, {
            notesHe:
              c.source === 'TIKLEAP'
                ? `מוביל TikLeap (${c.region}) שזוהה בלייב — נוסף אוטומטית למעקב ולמידה 24/7`
                : c.styleNoteHe,
            autoWatchEnabled: true,
            autoLearnEnabled: true,
          });
          if (autoConnectFound && activeSwarmRooms.size < MAX_CONCURRENT_SWARM_ROOMS) {
            await connectCreatorToSwarm(c.username, {
              listenMode: 'OBSERVER_LEARN',
              mirrorToStage: false,
              addToWatchlist: true,
              silentIfOffline: true,
            });
          }
        }
      })
    );

    candidates.sort((a, b) => Number(b.isLiveNow) - Number(a.isLiveNow) || b.estimatedStrength - a.estimatedStrength);

    res.json({
      ok: true,
      tikleapStatusHe,
      candidates,
      groundingLinks: groundingLinks.slice(0, 6),
      state: battleState,
    });
  });

  // ============================================================================
  // 4. LEARN FROM SPECIFIC OBSERVED STREAM / CREATOR & SEARCH VIRAL ENERGY VIDEOS
  // ============================================================================
  app.post('/api/tiktok/learn-from-stream', async (req, res) => {
    try {
      const targetUser = sanitizeTikTokHandle(
        req.body?.username || battleState.tiktokRoom.targetUsername || ''
      );

      if (!targetUser) {
        res.status(400).json({ error: 'בחר או הזן שם יוצר ללמידה.' });
        return;
      }

      upsertWatchlistCreator(targetUser);
      const out = await synthesizeCreatorOrSwarmInsights(targetUser, `למידה ממוקדת מ-@${targetUser}`);
      const profile = aiMemory.learnedCreators.find(
        (c) => c.username.toLowerCase() === targetUser.toLowerCase()
      );
      res.json({
        ok: true,
        profile,
        newRule: out?.newRule || null,
        newTool: out?.newTool || null,
        synthesisHe: out?.synthesisHe || null,
        state: battleState,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה בניתוח היוצר';
      res.status(500).json({ error: message });
    }
  });

  // Execute a Learned Creator Playbook, Approved Energy Rule, Approved AI Tool, OR Learning Vault Material onto the live 9:16 Stage & OBS!
  app.post('/api/tiktok/apply-creator-playbook', (req, res) => {
    const { username, ruleId, toolId, vaultItemId } = req.body || {};

    const fireComboOnStage = (opts: {
      vfxId: string;
      cam: CameraPresetId;
      snd: string;
      mus?: string;
      callout: string;
      sourceTagHe: string;
      summaryHe: string;
    }) => {
      const appliedActionsHe = [
        `VFX: ${opts.vfxId}`,
        `מצלמה: ${opts.cam}`,
        `סאונד: ${opts.snd}`,
        ...(opts.mus ? [`מוזיקה: ${opts.mus}`] : []),
        `גירוי טאפ: "${opts.callout}"`,
      ];

      if (battleState.approvalMode === 'REQUIRE_APPROVAL') {
        const dec = recordAiDecision({
          streamMode: battleState.streamMode,
          detectedSituationHe: `${opts.summaryHe} (ממתין לאישור מפעיל)`,
          tensionScore: Math.max(76, battleState.aiTensionScore),
          energyScore: Math.min(100, battleState.aiEnergyScore + 20),
          actionsTakenHe: appliedActionsHe,
          approvalStatus: 'PENDING_APPROVAL',
          decidedBy: 'DETERMINISTIC',
          musicTrackId: opts.mus || null,
          soundCueId: opts.snd,
          vfxId: opts.vfxId,
          plannedPayload: {
            vfxId: opts.vfxId,
            cameraPreset: opts.cam,
            soundCueId: opts.snd,
            musicTrackId: opts.mus && VALID_MUSIC_IDS.has(opts.mus) ? opts.mus : undefined,
            tapCalloutTextHe: opts.callout,
            tapDurationSec: 11,
          },
        });
        battleState.memorySummary = buildMemorySummary();
        saveMemory(aiMemory);
        broadcast({ type: 'ai:decision', decision: dec, state: battleState });
        res.json({
          ok: true,
          pendingApproval: true,
          decision: dec,
          executedSummaryHe: `הועבר לאישור מפעיל: ${opts.summaryHe}`,
          appliedActionsHe,
          state: battleState,
        });
        return;
      }

      const vfxOut = tryTriggerOneShot(opts.vfxId, opts.sourceTagHe, 1.0, true);
      if (vfxOut.triggered && vfxOut.instance) {
        broadcast({ type: 'effect:triggered', effect: vfxOut.instance, state: battleState });
      }
      triggerCameraKinetic(opts.cam, 1.2, 1750, opts.sourceTagHe);
      emitSoundCue(opts.snd, opts.sourceTagHe);
      if (opts.mus && VALID_MUSIC_IDS.has(opts.mus)) {
        emitMusicChange(opts.mus, Math.max(38, battleState.musicVolumePct), opts.sourceTagHe);
      }
      activateTapStimulus(11, opts.callout);

      const dec = recordAiDecision({
        streamMode: battleState.streamMode,
        detectedSituationHe: opts.summaryHe,
        tensionScore: Math.max(76, battleState.aiTensionScore),
        energyScore: Math.min(100, battleState.aiEnergyScore + 20),
        actionsTakenHe: appliedActionsHe,
        musicTrackId: opts.mus || null,
        soundCueId: opts.snd,
        vfxId: opts.vfxId,
      });

      battleState.memorySummary = buildMemorySummary();
      saveMemory(aiMemory);
      broadcast({ type: 'ai:decision', decision: dec, state: battleState });
      res.json({ ok: true, executedSummaryHe: opts.summaryHe, appliedActionsHe, state: battleState });
    };

    if (toolId && typeof toolId === 'string') {
      const tool = aiMemory.discoveredTools.find((t) => t.id === toolId);
      if (!tool) {
        res.status(404).json({ error: 'הכלי המבוקש לא נמצא בארגז הכלים של ה-AI.' });
        return;
      }
      if (tool.approved !== true || tool.status !== 'APPROVED') {
        res.status(409).json({
          ok: false,
          error: 'כלי זה עדיין בהצעה (PROPOSED) וטרם אושר — יש לאשר אותו קודם במרכז האישורים.',
        });
        return;
      }
      tool.usageCount = (tool.usageCount || 0) + 1;
      fireComboOnStage({
        vfxId: tool.recommendedVfxId,
        cam: tool.recommendedCamera,
        snd: tool.recommendedSoundId,
        mus: tool.recommendedMusicId,
        callout: tool.recommendedTapCallout,
        sourceTagHe: `כלי AI: ${tool.nameHe}`,
        summaryHe: `הופעל הכלי המאושר "${tool.nameHe}" (${tool.sourceLabelHe})!`,
      });
      return;
    }

    if (vaultItemId && typeof vaultItemId === 'string') {
      const item = aiMemory.learningVaultItems.find((v) => v.id === vaultItemId);
      if (!item) {
        res.status(404).json({ error: 'הקובץ המבוקש לא נמצא בתיקיית הלמידה.' });
        return;
      }
      item.appliedTimesCount = (item.appliedTimesCount || 0) + 1;
      fireComboOnStage({
        vfxId: item.recommendedVfxId,
        cam: item.recommendedCamera,
        snd: item.recommendedSoundId,
        mus: item.recommendedMusicId,
        callout: item.recommendedTapCallout,
        sourceTagHe: `תיקיית למידה: ${item.fileName}`,
        summaryHe: `הופעלה מסקנת החומר מתיקיית הלמידה "${item.fileName}"!`,
      });
      return;
    }

    if (ruleId && typeof ruleId === 'string') {
      const rule = aiMemory.energyRules.find((r) => r.id === ruleId);
      if (!rule) {
        res.status(404).json({ error: 'חוק הלמידה המבוקש לא נמצא בזיכרון.' });
        return;
      }
      if (rule.approved !== true || rule.status !== 'APPROVED' || !(rule.version && rule.version >= 1)) {
        res.status(409).json({
          ok: false,
          error: 'חוק זה נשמר כהצעה בלבד (PROPOSED) וטרם אושר עם גרסה — אינו ניתן להפעלה אוטומטית.',
        });
        return;
      }
      const fallback = inferStageComboFromText(`${rule.titleHe} ${rule.aiActionDirectiveEn}`, rule.id);
      rule.appliedTimesCount = (rule.appliedTimesCount || 0) + 1;
      fireComboOnStage({
        vfxId: rule.recommendedVfxId || fallback.recommendedVfxId,
        cam: rule.recommendedCamera || fallback.recommendedCamera,
        snd: rule.recommendedSoundId || fallback.recommendedSoundId,
        callout: rule.recommendedTapCallout || fallback.recommendedTapCallout,
        sourceTagHe: `ניצול חוק v${rule.version}: ${rule.titleHe}`,
        summaryHe: `הופעל החוק המאושר v${rule.version} "${rule.titleHe}" (${rule.sourceLabelHe})!`,
      });
      return;
    }

    const cleanUser = sanitizeTikTokHandle(String(username || ''));
    const profile = aiMemory.learnedCreators.find(
      (c) => c.username.toLowerCase() === cleanUser.toLowerCase()
    );
    if (!profile) {
      res.status(404).json({ error: `טרם נבנה פרופיל למידה עבור @${cleanUser} — לחץ תחילה על "למד עכשיו".` });
      return;
    }

    const fallback = inferStageComboFromText(
      `${profile.counterTacticHe} ${profile.snipeTendencyHe} ${profile.gloveStrategyHe}`,
      profile.username
    );
    profile.appliedTimesCount = (profile.appliedTimesCount || 0) + 1;

    fireComboOnStage({
      vfxId: profile.recommendedVfxId || fallback.recommendedVfxId,
      cam: profile.recommendedCamera || fallback.recommendedCamera,
      snd: profile.recommendedSoundId || fallback.recommendedSoundId,
      mus: profile.recommendedMusicId || fallback.recommendedMusicId,
      callout: profile.recommendedTapCallout || fallback.recommendedTapCallout,
      sourceTagHe: `פלייבוק @${profile.username}`,
      summaryHe: `הופעלה על הבמה המסקנה שנלמדה מ-@${profile.username}: "${profile.counterTacticHe}"`,
    });
  });

  // ============================================================================
  // 4B. LEARNING FOLDER VAULT (Upload any Video / Audio / Image / PDF / Text / Note -> Deconstruct & Read!)
  // ============================================================================
  function detectMaterialKind(fileName: string, mimeType: string): LearningMaterialKind {
    const m = (mimeType || '').toLowerCase();
    const ext = path.extname(fileName || '').toLowerCase();
    if (m.startsWith('video/') || ['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) return 'VIDEO';
    if (m.startsWith('audio/') || ['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(ext)) return 'AUDIO';
    if (m.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'IMAGE';
    if (ext === '.note') return 'NOTE';
    return 'DOCUMENT';
  }

  async function deconstructVaultMaterialWithGemini(params: {
    fileName: string;
    kind: LearningMaterialKind;
    mimeType: string;
    base64Data?: string;
    textContent?: string;
    videoFrames?: Array<{ base64: string; mimeType?: string; timeSec?: number }>;
    durationSec?: number;
    userNoteHe?: string;
  }) {
    const fallbackCombo = inferStageComboFromText(
      `${params.fileName} ${params.userNoteHe || ''} ${params.textContent || ''}`,
      params.fileName
    );
    try {
      const ai = getGeminiClient();
      const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];

      if (Array.isArray(params.videoFrames) && params.videoFrames.length > 0) {
        for (const frame of params.videoFrames.slice(0, 6)) {
          if (frame?.base64) {
            parts.push({
              inlineData: {
                mimeType: frame.mimeType || 'image/jpeg',
                data: String(frame.base64),
              },
            });
          }
        }
      } else if (
        params.base64Data &&
        params.base64Data.length > 32 &&
        (params.kind === 'IMAGE' ||
          params.kind === 'AUDIO' ||
          params.mimeType === 'application/pdf' ||
          (params.kind === 'VIDEO' && params.base64Data.length < 18 * 1024 * 1024))
      ) {
        parts.push({
          inlineData: {
            mimeType: params.mimeType || 'application/octet-stream',
            data: params.base64Data,
          },
        });
      }

      const textExcerpt = params.textContent ? params.textContent.slice(0, 24000) : '';
      parts.push({
        text: `You are BOOSTERA's Learning Folder Deconstructor, Broadcast Analyst & Autonomous Tool Architect.
The user uploaded a learning material into the AI Learning Folder ("תיקיית למידה"):
- File Name: "${params.fileName}"
- Material Type: ${params.kind} (${params.mimeType || 'unknown'})
${params.durationSec ? `- Media Duration: ~${Math.round(params.durationSec)}s` : ''}
${params.userNoteHe ? `- User Context Note: "${params.userNoteHe}"` : ''}
${textExcerpt ? `\n--- EXTRACTED FILE TEXT CONTENT ---\n${textExcerpt}\n--- END CONTENT ---` : ''}

Read, deconstruct, and break down this material thoroughly in clear, sharp studio Hebrew so the user sees:
1. overviewHe: Concise 2-sentence Hebrew summary of what you read/saw/heard inside this file.
2. breakdownPartsHe: Array of 3-5 structured Hebrew bullet strings breaking the material into chronological scenes, sections, chat/audio waves, or tactical mechanics.
3. conclusionsHe: Array of 2-3 actionable Hebrew conclusions for our live 9:16 TikTok broadcast & PK battles.
4. newEnergyRule: A new persistent energy rule extracted from this file (titleHe, triggerConditionHe, aiActionDirectiveEn).
5. newDiscoveredTool: A new specialized stage tool that our AI deduced it needs after reading/deconstructing this material (nameHe, whyNeededHe, howItWorksHe, triggerConditionHe).`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overviewHe: { type: Type.STRING },
              breakdownPartsHe: { type: Type.ARRAY, items: { type: Type.STRING } },
              conclusionsHe: { type: Type.ARRAY, items: { type: Type.STRING } },
              newEnergyRule: {
                type: Type.OBJECT,
                properties: {
                  titleHe: { type: Type.STRING },
                  triggerConditionHe: { type: Type.STRING },
                  aiActionDirectiveEn: { type: Type.STRING },
                },
                required: ['titleHe', 'triggerConditionHe', 'aiActionDirectiveEn'],
              },
              newDiscoveredTool: {
                type: Type.OBJECT,
                properties: {
                  nameHe: { type: Type.STRING },
                  whyNeededHe: { type: Type.STRING },
                  howItWorksHe: { type: Type.STRING },
                  triggerConditionHe: { type: Type.STRING },
                },
                required: ['nameHe', 'whyNeededHe', 'howItWorksHe', 'triggerConditionHe'],
              },
            },
            required: ['overviewHe', 'breakdownPartsHe', 'conclusionsHe', 'newEnergyRule', 'newDiscoveredTool'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const combo = inferStageComboFromText(
        `${parsed.overviewHe || ''} ${(parsed.conclusionsHe || []).join(' ')} ${parsed.newDiscoveredTool?.howItWorksHe || ''}`,
        params.fileName
      );
      return {
        overviewHe: parsed.overviewHe || `פורק ונקרא בהצלחה הקובץ "${params.fileName}" בתיקיית הלמידה.`,
        breakdownPartsHe:
          Array.isArray(parsed.breakdownPartsHe) && parsed.breakdownPartsHe.length > 0
            ? parsed.breakdownPartsHe
            : ['זוהתה דינמיקת קצב ומעורבות קהל מתוך החומר שהועלה.'],
        conclusionsHe:
          Array.isArray(parsed.conclusionsHe) && parsed.conclusionsHe.length > 0
            ? parsed.conclusionsHe
            : ['שילוב תזמון מצלמה קינטית ואפקט תואם ברגעי מעבר מעלה את מעורבות הצופים.'],
        newEnergyRule: parsed.newEnergyRule,
        newDiscoveredTool: parsed.newDiscoveredTool,
        combo,
      };
    } catch {
      return {
        overviewHe: `הקובץ "${params.fileName}" נקרא ונשמר בתיקיית הלמידה — חולצו ממנו דפוסי קצב והפעלה לטייס האוטומטי.`,
        breakdownPartsHe: [
          `סוג חומר שזוהה: ${params.kind} (${params.fileName})`,
          params.textContent
            ? `נקראו ${params.textContent.length.toLocaleString()} תווים של תוכן טקסטואלי ותובנות.`
            : 'נותחו מאפייני המדיה והתזמון לשילוב בבמה האנכית 9:16.',
          'מופה חיבור ישיר למנוע המצלמה הקינטית, סאונד השידור וגירוי הדאבל-טאפ.',
        ],
        conclusionsHe: [
          'מומלץ להפעיל קומבו מצלמה + אפקט גרין-סקרין בנקודות שיא מהחומר שנלמד.',
        ],
        newEnergyRule: {
          titleHe: `תובנה מתוך ${params.fileName.slice(0, 26)}`,
          triggerConditionHe: 'בעת עליית מתח או ירידת קצב לחיצות בשידור',
          aiActionDirectiveEn: 'Apply coordinated stage VFX, kinetic zoom punch, and peripheral tap stimulus.',
        },
        newDiscoveredTool: {
          nameHe: `כלי יישום מתוך ${params.fileName.slice(0, 22)}`,
          whyNeededHe: `הופק אוטומטית מפריקת הקובץ "${params.fileName}" בתיקיית הלמידה.`,
          howItWorksHe: 'משגר בלחיצה או אוטומטית את שילוב ה-VFX, המצלמה והסאונד שהותאם לחומר.',
          triggerConditionHe: 'מופעל ע״י הטייס האוטומטי ברגעי מפתח',
        },
        combo: fallbackCombo,
      };
    }
  }

  app.post('/api/learning-vault/upload', async (req, res) => {
    try {
      ensureDataDir();
      const {
        fileName,
        mimeType,
        sizeBytes,
        base64Data,
        textContent,
        videoFrames,
        durationSec,
        userNoteHe,
      } = req.body || {};

      const cleanOriginalName = String(fileName || `חומר_למידה_${Date.now()}.txt`)
        .replace(/[^a-zA-Z0-9._\u0590-\u05FF\u0600-\u06FF -]/g, '_')
        .slice(0, 90);
      const kind = detectMaterialKind(cleanOriginalName, String(mimeType || ''));
      const storedFileName = `${Date.now()}_${cleanOriginalName.replace(/\s+/g, '_')}`;
      const storedPath = path.join(LEARNING_VAULT_DIR, storedFileName);

      // Persist raw file or extracted text/frames manifest into data/learning_vault/
      if (typeof base64Data === 'string' && base64Data.length > 0 && base64Data.length < 28 * 1024 * 1024) {
        fs.writeFileSync(storedPath, Buffer.from(base64Data, 'base64'));
      } else if (typeof textContent === 'string' && textContent.length > 0) {
        fs.writeFileSync(storedPath, textContent, 'utf-8');
      } else {
        fs.writeFileSync(
          `${storedPath}.manifest.json`,
          JSON.stringify({
            fileName: cleanOriginalName,
            mimeType,
            sizeBytes,
            durationSec,
            userNoteHe,
            sampledFramesCount: Array.isArray(videoFrames) ? videoFrames.length : 0,
            savedAt: new Date().toISOString(),
          }),
          'utf-8'
        );
      }

      const decodedText =
        typeof textContent === 'string' && textContent.trim()
          ? textContent
          : kind === 'DOCUMENT' &&
              typeof base64Data === 'string' &&
              base64Data.length > 0 &&
              String(mimeType || '') !== 'application/pdf'
            ? Buffer.from(base64Data, 'base64').toString('utf-8')
            : undefined;

      const result = await deconstructVaultMaterialWithGemini({
        fileName: cleanOriginalName,
        kind,
        mimeType: String(mimeType || 'text/plain'),
        base64Data: typeof base64Data === 'string' ? base64Data : undefined,
        textContent: decodedText,
        videoFrames: Array.isArray(videoFrames) ? videoFrames : undefined,
        durationSec: typeof durationSec === 'number' ? durationSec : undefined,
        userNoteHe: typeof userNoteHe === 'string' ? userNoteHe : undefined,
      });

      const vaultGov = toProposedGovernanceDefaults();
      const newRule: SetupEnergyRule = {
        id: nextId('vault_rule'),
        titleHe: result.newEnergyRule.titleHe,
        sourceLabelHe: `תיקיית למידה: ${cleanOriginalName}`,
        triggerConditionHe: result.newEnergyRule.triggerConditionHe,
        aiActionDirectiveEn: result.newEnergyRule.aiActionDirectiveEn,
        active: vaultGov.active,
        approved: vaultGov.approved,
        status: vaultGov.status,
        version: vaultGov.version,
        effectivenessScore: 95,
        recommendedVfxId: result.combo.recommendedVfxId,
        recommendedCamera: result.combo.recommendedCamera,
        recommendedSoundId: result.combo.recommendedSoundId,
        recommendedTapCallout: result.combo.recommendedTapCallout,
        appliedTimesCount: 0,
      };
      aiMemory.energyRules.unshift(newRule);
      if (aiMemory.energyRules.length > 22) aiMemory.energyRules.length = 22;

      const newTool: DiscoveredStageTool = {
        id: nextId('vault_tool'),
        nameHe: result.newDiscoveredTool.nameHe,
        sourceLabelHe: `תיקיית למידה (${cleanOriginalName})`,
        whyNeededHe: result.newDiscoveredTool.whyNeededHe,
        howItWorksHe: result.newDiscoveredTool.howItWorksHe,
        triggerConditionHe: result.newDiscoveredTool.triggerConditionHe,
        autoEnabled: vaultGov.autoEnabled,
        approved: vaultGov.approved,
        status: vaultGov.status,
        version: vaultGov.version,
        recommendedVfxId: result.combo.recommendedVfxId,
        recommendedCamera: result.combo.recommendedCamera,
        recommendedSoundId: result.combo.recommendedSoundId,
        recommendedMusicId: result.combo.recommendedMusicId,
        recommendedTapCallout: result.combo.recommendedTapCallout,
        usageCount: 0,
        createdAtTs: Date.now(),
      };
      aiMemory.discoveredTools.unshift(newTool);
      if (aiMemory.discoveredTools.length > 22) aiMemory.discoveredTools.length = 22;

      const vaultItem: LearningVaultItem = {
        id: nextId('vault'),
        fileName: cleanOriginalName,
        storedFileName,
        kind,
        mimeType: String(mimeType || 'text/plain'),
        sizeBytes: Number(sizeBytes || decodedText?.length || 0),
        uploadedAtTs: Date.now(),
        overviewHe: result.overviewHe,
        breakdownPartsHe: result.breakdownPartsHe,
        conclusionsHe: result.conclusionsHe,
        generatedRuleTitleHe: newRule.titleHe,
        generatedToolNameHe: newTool.nameHe,
        recommendedVfxId: result.combo.recommendedVfxId,
        recommendedCamera: result.combo.recommendedCamera,
        recommendedSoundId: result.combo.recommendedSoundId,
        recommendedMusicId: result.combo.recommendedMusicId,
        recommendedTapCallout: result.combo.recommendedTapCallout,
        appliedTimesCount: 0,
      };

      aiMemory.learningVaultItems.unshift(vaultItem);
      if (aiMemory.learningVaultItems.length > 40) aiMemory.learningVaultItems.length = 40;
      aiMemory.totalRoundsAnalyzed += 1;

      battleState.memorySummary = buildMemorySummary();
      saveMemory(aiMemory);
      pushLog({
        eventType: 'VAULT_LEARNED',
        userLabel: 'תיקיית למידה',
        triggeredEffectId: vaultItem.recommendedVfxId,
        status: 'TRIGGERED',
        detailHe: `פורק ונלמד "${cleanOriginalName}" -> נוצר כלי: ${newTool.nameHe}`,
      });
      broadcast({ type: 'state:update', state: battleState });

      res.json({
        ok: true,
        item: vaultItem,
        newRule,
        newTool,
        state: battleState,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה בפריקת הקובץ בתיקיית הלמידה';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/learning-vault/reanalyze', async (req, res) => {
    try {
      const { id } = req.body || {};
      const item = aiMemory.learningVaultItems.find((v) => v.id === id);
      if (!item) {
        res.status(404).json({ error: 'הפריט לא נמצא בתיקיית הלמידה.' });
        return;
      }
      const fullPath = path.join(LEARNING_VAULT_DIR, item.storedFileName);
      let base64Data: string | undefined;
      let textContent: string | undefined;
      if (fs.existsSync(fullPath)) {
        const buf = fs.readFileSync(fullPath);
        if (item.kind === 'DOCUMENT' || item.kind === 'NOTE') {
          if (item.mimeType === 'application/pdf') base64Data = buf.toString('base64');
          else textContent = buf.toString('utf-8');
        } else if (buf.length < 18 * 1024 * 1024) {
          base64Data = buf.toString('base64');
        }
      } else {
        textContent = `${item.overviewHe}\n${item.breakdownPartsHe.join('\n')}`;
      }

      const result = await deconstructVaultMaterialWithGemini({
        fileName: item.fileName,
        kind: item.kind,
        mimeType: item.mimeType,
        base64Data,
        textContent,
      });

      item.overviewHe = result.overviewHe;
      item.breakdownPartsHe = result.breakdownPartsHe;
      item.conclusionsHe = result.conclusionsHe;
      item.generatedRuleTitleHe = result.newEnergyRule.titleHe;
      item.generatedToolNameHe = result.newDiscoveredTool.nameHe;
      item.recommendedVfxId = result.combo.recommendedVfxId;
      item.recommendedCamera = result.combo.recommendedCamera;
      item.recommendedSoundId = result.combo.recommendedSoundId;
      item.recommendedMusicId = result.combo.recommendedMusicId;
      item.recommendedTapCallout = result.combo.recommendedTapCallout;
      item.uploadedAtTs = Date.now();

      aiMemory.totalRoundsAnalyzed += 1;
      battleState.memorySummary = buildMemorySummary();
      saveMemory(aiMemory);
      broadcast({ type: 'state:update', state: battleState });
      res.json({ ok: true, item, state: battleState });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה בקריאה חוזרת של הקובץ';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/learning-vault/delete', (req, res) => {
    const { id } = req.body || {};
    const idx = aiMemory.learningVaultItems.findIndex((v) => v.id === id);
    if (idx >= 0) {
      const removed = aiMemory.learningVaultItems[idx];
      aiMemory.learningVaultItems.splice(idx, 1);
      const fullPath = path.join(LEARNING_VAULT_DIR, removed.storedFileName);
      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        if (fs.existsSync(`${fullPath}.manifest.json`)) fs.unlinkSync(`${fullPath}.manifest.json`);
      } catch {
        // Ignore
      }
      battleState.memorySummary = buildMemorySummary();
      saveMemory(aiMemory);
      broadcast({ type: 'state:update', state: battleState });
    }
    res.json({ ok: true, state: battleState });
  });

  app.post('/api/tiktok/search-energy-videos', async (req, res) => {
    try {
      const topic = String(
        req.body?.query || 'TikTok LIVE PK battle viral setup CO2 screen shake snipe energy tactics'
      ).trim();
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Search the web for viral TikTok LIVE battle videos, streamer setups, and high-energy PK crowd hypnosis techniques matching: "${topic}".
Provide a concise, actionable Hebrew breakdown of:
1. אילו אלמנטים בסרטונים ובסאטפים האלו מהפנטים את הצופים (מצלמה, סאונד, CO2, קריאות טאפ, תזמון כפפות וסנייפ).
2. איך הבמאי האוטומטי של BOOSTERA מיישם זאת בלייב שלך.
Also end with one line starting with:
LEARNED_DIRECTIVE_EN: <1 sentence English rule for our AI Showrunner>`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || '';
      const dirMatch = text.match(/LEARNED_DIRECTIVE_EN:\s*(.+)/i);
      const cleanSummaryHe = text.replace(/LEARNED_DIRECTIVE_EN:.+/gi, '').trim();

      if (dirMatch?.[1]) {
        const webGov = toProposedGovernanceDefaults();
        aiMemory.energyRules.unshift({
          id: nextId('web_rule'),
          titleHe: `תובנת אנרגיה מרשת (${topic.slice(0, 24)})`,
          sourceLabelHe: 'מחקר סרטוני לייב ברשת',
          triggerConditionHe: 'הצעת חוק שממתינה לאישור מפעיל',
          aiActionDirectiveEn: dirMatch[1].trim(),
          active: webGov.active,
          approved: webGov.approved,
          status: webGov.status,
          version: webGov.version,
          effectivenessScore: 92,
        });
        battleState.memorySummary = buildMemorySummary();
        saveMemory(aiMemory);
        broadcast({ type: 'state:update', state: battleState });
      }

      const links: Array<{ title: string; uri: string }> = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      for (const ch of chunks) {
        if (ch.web?.uri && ch.web?.title) {
          links.push({ title: ch.web.title, uri: ch.web.uri });
        }
      }

      res.json({ ok: true, summaryHe: cleanSummaryHe, links: links.slice(0, 8), state: battleState });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה בחיפוש סרטוני אנרגיה ברשת';
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // 5. MULTI-FRAME LONG SETUP VIDEO ANALYZER (Reverse-Engineers Viewer Hypnosis!)
  // ============================================================================
  app.post('/api/ai-director/analyze-setup-video', async (req, res) => {
    try {
      const { frames, durationSec, fileName } = req.body || {};
      if (!Array.isArray(frames) || frames.length === 0) {
        res.status(400).json({ error: 'לא התקבלו פריימים מתוך סרטון הסאטפ לניתוח.' });
        return;
      }

      const ai = getGeminiClient();
      const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];

      for (const f of frames.slice(0, 6)) {
        if (f?.base64) {
          parts.push({
            inlineData: {
              mimeType: f.mimeType || 'image/jpeg',
              data: String(f.base64),
            },
          });
        }
      }

      parts.push({
        text: `You are BOOSTERA's Chief Broadcast Showrunner & Behavioral Visual Psychologist.
These ${Math.min(6, frames.length)} chronological keyframes were sampled across a ${Math.round(Number(durationSec || 60))}s TikTok LIVE Setup / Battle video ("${fileName || 'setup.mp4'}").
Analyze deeply HOW this setup hypnotizes and retains viewers (framing, lighting contrast, background vs foreground depth, kinetic motion, presenter energy, tap/gift callouts, tension pacing) and extract actionable upgrades for our AI Director!
Return JSON matching the schema, with all Hebrew fields in sharp, practical studio Hebrew.`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hypnosisSecretsHe: { type: Type.ARRAY, items: { type: Type.STRING } },
              cameraAndFramingAnalysisHe: { type: Type.STRING },
              energyArcAndPacingHe: { type: Type.STRING },
              recommendedCameraPreset: { type: Type.STRING },
              recommendedVfxIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              learnedRuleTitleHe: { type: Type.STRING },
              learnedRuleTriggerHe: { type: Type.STRING },
              learnedRuleDirectiveEn: { type: Type.STRING },
            },
            required: [
              'hypnosisSecretsHe',
              'cameraAndFramingAnalysisHe',
              'energyArcAndPacingHe',
              'recommendedCameraPreset',
              'recommendedVfxIds',
              'learnedRuleTitleHe',
              'learnedRuleTriggerHe',
              'learnedRuleDirectiveEn',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());

      // Store new setup video insight as PROPOSED (inactive until operator approves with version!)
      if (parsed.learnedRuleTitleHe && parsed.learnedRuleDirectiveEn) {
        const setupGov = toProposedGovernanceDefaults();
        aiMemory.energyRules.unshift({
          id: nextId('setup_vid'),
          titleHe: parsed.learnedRuleTitleHe,
          sourceLabelHe: `ניתוח וידאו סאטפ (${fileName || 'קובץ מקומי'})`,
          triggerConditionHe: parsed.learnedRuleTriggerHe || 'הצעה שממתינה לאישור מפעיל',
          aiActionDirectiveEn: parsed.learnedRuleDirectiveEn,
          active: setupGov.active,
          approved: setupGov.approved,
          status: setupGov.status,
          version: setupGov.version,
          effectivenessScore: 95,
        });
        battleState.memorySummary = buildMemorySummary();
        saveMemory(aiMemory);
        broadcast({ type: 'state:update', state: battleState });
      }

      res.json({ ok: true, analysis: parsed, state: battleState });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה בניתוח סרטון הסאטפ ב-Gemini';
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // 6. STRICT COUNCIL SHOWRUNNER (Gemini Telemetry Collector -> OpenAI Decision -> Claude Inspection -> Server Approval -> Gemini Execution)
  // ============================================================================
  app.post('/api/ai-director/decide', async (req, res) => {
    const { audioBase64, audioMimeType, micMetrics, availableCustomTracks, directorPromptHe, requireApproval } =
      req.body || {};
    const nowTs = Date.now();
    const policy = enforceServerApprovalPolicy({
      serverApprovalMode: battleState.approvalMode || 'AUTO_EXECUTE',
      clientRequireApproval: requireApproval,
    });
    const needsApproval = policy.needsApproval;

    const approvedRulesOnly = aiMemory.energyRules
      .filter((r) => canDeterministicRuleExecute(r).allowed)
      .slice(0, 7)
      .map((r) => `- [v${r.version}] ${r.titleHe}: ${r.aiActionDirectiveEn}`)
      .join('\n');

    const activeOpponentDossier = battleState.tiktokRoom.activeOpponentUsername
      ? aiMemory.learnedCreators.find(
          (c) => c.username.toLowerCase() === battleState.tiktokRoom.activeOpponentUsername?.toLowerCase()
        )
      : null;

    // Stage 1: Gemini collects/analyzes raw media/material ONLY (NEVER decides!)
    const geminiKeyInfo = readEnvClean('GEMINI_API_KEY');
    let geminiAudioNoteHe: string | null = null;
    const geminiCollectorStage: ProviderStageInput = {
      configured: Boolean(geminiKeyInfo.value),
      called: false,
      ok: true,
      model: 'gemini-4-hydrogen',
      role: 'collector_executor_only',
      summaryHe: 'Gemini אסף טלמטריה וחומרי עזר למועצת OpenAI + Claude (אינו מחליט)',
      timestamp: nowTs,
    };

    if (audioBase64 && typeof audioBase64 === 'string' && audioBase64.length > 64 && geminiKeyInfo.value) {
      geminiCollectorStage.called = true;
      try {
        const ai = getGeminiClient();
        const audioResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: audioMimeType || 'audio/webm',
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe/summarize ONLY the raw vocal tone, crowd noise, and spoken energy in 1-2 factual Hebrew sentences. Do NOT choose VFX, music, or broadcast actions.',
              },
            ],
          },
          config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
        });
        geminiAudioNoteHe = (audioResp.text || '').trim() || null;
        geminiCollectorStage.ok = true;
        geminiCollectorStage.summaryHe = geminiAudioNoteHe || 'נותחה הקלטת שמע ע״י מאסף Gemini';
      } catch (err: unknown) {
        geminiCollectorStage.ok = false;
        geminiCollectorStage.errorHe = err instanceof Error ? err.message : 'שגיאה בעיבוד שמע ב-Gemini';
      }
    }

    const customTrackIds = Array.isArray(availableCustomTracks)
      ? availableCustomTracks.map((t: { id?: string }) => String(t.id || '')).filter(Boolean)
      : [];

    const liveTelemetry = {
      streamMode: battleState.streamMode,
      battleClockSec: battleState.streamMode === 'BATTLE' ? battleState.elapsedSec : null,
      remainingBattleSec:
        battleState.streamMode === 'BATTLE' ? Number((240 - battleState.elapsedSec).toFixed(1)) : null,
      battlePhase: battleState.streamMode === 'BATTLE' ? battleState.phase : 'SOLO_HOSTING',
      myScore: battleState.streamMode === 'BATTLE' ? battleState.myScore : null,
      opponentScore: battleState.streamMode === 'BATTLE' ? battleState.opponentScore : null,
      scoreLeadOrDeficit:
        battleState.streamMode === 'BATTLE' ? battleState.myScore - battleState.opponentScore : null,
      gloveActiveRemainingSec: battleState.gloveRemainingSec,
      snipeWindowActive: battleState.snipeWindowActive,
      likesPerSecond: battleState.likesPerSecond,
      likeComboCount: battleState.likeComboCount,
      likeEnergyPct: Math.round(battleState.likeEnergy),
      currentMusicTrackId: battleState.activeMusicTrackId,
      currentMusicVolumePct: battleState.musicVolumePct,
      lastPresenterGesture: battleState.lastGesture,
      recentChatMessages: battleState.recentChatMessages.slice(0, 8),
      microphoneAndAudioTelemetry: micMetrics || { rmsPct: 0, isSpeaking: false, deadAirSec: 0, musicEnergy: 30 },
      geminiCollectedAudioNoteHe: geminiAudioNoteHe,
      approvedMemoryDirectives: approvedRulesOnly || 'None approved yet',
      opponentIntelDossier: activeOpponentDossier || null,
      explicitHostNoteHe: directorPromptHe || null,
      customTracksAvailable: customTrackIds,
    };

    const telemetryJson = JSON.stringify(liveTelemetry, null, 2);

    // Stage 2: OpenAI (gpt-6-astra) produces structured decision plan
    const openAiRes = await callOpenAiCouncilPlanner(telemetryJson);
    // Stage 3: Claude (claude-fable-5-2) inspects OpenAI's plan with binding APPROVE | REJECT | DISAGREE
    const claudeRes = await callClaudeCouncilInspector(telemetryJson, openAiRes.data);

    const councilVerdict = evaluateCouncilDecision({
      openai: {
        ok: openAiRes.stage.ok,
        plan: openAiRes.data,
        errorHe: openAiRes.stage.errorHe,
      },
      claude: {
        ok: claudeRes.stage.ok,
        inspection: claudeRes.data,
        errorHe: claudeRes.stage.errorHe,
      },
    });

    if (!councilVerdict.approved || !openAiRes.data) {
      // HALT! Zero fallback to Gemini decision-making. Zero stage execution!
      const pipelineTrace = buildPipelineTrace({
        nowTs,
        liveConnected: battleState.tiktokRoom.connected,
        liveTargetUsername: battleState.tiktokRoom.targetUsername,
        liveRoomId: battleState.tiktokRoom.roomId,
        liveViewerCount: battleState.tiktokRoom.viewerCount,
        packetsCaptured: battleState.wsSniffer.totalPacketsCaptured,
        dataSummaryHe: `מצב ${battleState.streamMode} · שלב ${battleState.phase} · ניקוד ${battleState.myScore}:${battleState.opponentScore}`,
        openai: openAiRes.stage,
        claude: claudeRes.stage,
        gemini: {
          ...geminiCollectorStage,
          summaryHe: 'עצר ללא ביצוע — מועצת OpenAI + Claude לא אישרה',
        },
        decisionSummaryHe: councilVerdict.reasonHe,
        approvalMode: policy.effectiveMode,
        approvalStatus: 'COUNCIL_BLOCKED',
        executionDetailHe: councilVerdict.reasonHe,
        executionEvidence: `blocked=${councilVerdict.blockedBy}`,
        resultDetailHe: 'לא בוצעה כל פעולה על הבמה ולא הופעל מעבר אוטומטי ל-Gemini',
      });

      const blockedDecision = recordAiDecision({
        streamMode: battleState.streamMode,
        detectedSituationHe: councilVerdict.reasonHe,
        tensionScore: openAiRes.data?.tensionScore ?? battleState.aiTensionScore,
        energyScore: openAiRes.data?.energyScore ?? battleState.aiEnergyScore,
        actionsTakenHe: [`נחסם: ${councilVerdict.reasonHe}`],
        musicTrackId: null,
        soundCueId: null,
        vfxId: null,
        approvalStatus: 'COUNCIL_BLOCKED',
        councilApproved: false,
        decidedBy: 'OPENAI_CLAUDE_COUNCIL',
        openAiPlan: openAiRes.data || undefined,
        claudeInspection: claudeRes.data || undefined,
        pipelineTrace,
      });

      pushLog({
        eventType: 'COUNCIL_BLOCKED',
        userLabel: 'מועצת OpenAI + Claude',
        triggeredEffectId: null,
        status: 'BLOCKED',
        detailHe: councilVerdict.reasonHe,
      });
      broadcast({ type: 'ai:decision', decision: blockedDecision, state: battleState });
      res.status(409).json({
        ok: false,
        blocked: true,
        blockedBy: councilVerdict.blockedBy,
        reasonHe: councilVerdict.reasonHe,
        decision: blockedDecision,
        state: battleState,
      });
      return;
    }

    const plan = openAiRes.data;
    const plannedPayload: PlannedExecutionPayload = {
      vfxId: plan.vfxId || undefined,
      soundCueId: plan.soundCueId || undefined,
      musicTrackId: plan.musicTrackId || undefined,
      cameraPreset: plan.cameraPreset,
      cameraReasonHe: plan.cameraReasonHe,
      tapCalloutTextHe: plan.tapCalloutTextHe || undefined,
      tapDurationSec: plan.tapDurationSec || 8,
    };

    const actionsTakenHe = [
      `שכבה: ${plan.layerPlacement}`,
      `יעד: ${plan.targetRoomOrScope}`,
      ...(plan.vfxId ? [`VFX: ${plan.vfxId}`] : []),
      ...(plan.soundCueId ? [`סאונד: ${plan.soundCueId}`] : []),
      ...(plan.musicTrackId ? [`מוזיקה: ${plan.musicTrackId}`] : []),
      ...(plan.cameraPreset ? [`מצלמה: ${plan.cameraPreset}`] : []),
      ...(plan.tapCalloutTextHe ? [`גירוי טאפ: "${plan.tapCalloutTextHe}"`] : []),
    ];

    const approvalStatus: DecisionApprovalStatus = needsApproval ? 'PENDING_APPROVAL' : 'AUTO_EXECUTED';
    const executedParts: string[] = [];

    if (!needsApproval) {
      aiMoodBias = { tension: plan.tensionScore, energy: plan.energyScore, updatedAt: nowTs };
      battleState.aiTensionScore = plan.tensionScore;
      battleState.aiEnergyScore = plan.energyScore;

      if (plan.musicTrackId && VALID_MUSIC_IDS.has(plan.musicTrackId) && plan.musicTrackId !== battleState.activeMusicTrackId) {
        emitMusicChange(plan.musicTrackId, undefined, `מועצת AI: ${plan.timingNoteHe}`);
        executedParts.push(`music=${plan.musicTrackId}`);
      }
      if (plan.soundCueId && VALID_SOUND_IDS.has(plan.soundCueId)) {
        emitSoundCue(plan.soundCueId, `ביצוע מאושר מועצה: ${plan.soundCueId}`);
        executedParts.push(`sound=${plan.soundCueId}`);
      }
      if (plan.vfxId && EFFECT_RULES[plan.vfxId]) {
        const vfx = tryTriggerOneShot(plan.vfxId, 'מועצת OpenAI + Claude', 1.0, true);
        if (vfx.triggered && vfx.instance) {
          broadcast({ type: 'effect:triggered', effect: vfx.instance, state: battleState });
          executedParts.push(`vfx=${plan.vfxId}`);
        }
      }
      if (plan.cameraPreset && VALID_CAMERA_PRESETS.has(plan.cameraPreset as CameraPresetId)) {
        triggerCameraKinetic(plan.cameraPreset as CameraPresetId, 1.05, 1500, plan.cameraReasonHe || 'בימוי מועצת AI');
        executedParts.push(`camera=${plan.cameraPreset}`);
      }
      if (plan.tapCalloutTextHe) {
        activateTapStimulus(plan.tapDurationSec || 8, plan.tapCalloutTextHe);
        emitSoundCue('SND_TAP_DOPAMINE_PULSE');
        executedParts.push(`tap=${plan.tapCalloutTextHe}`);
      }
    }

    const pipelineTrace = buildPipelineTrace({
      nowTs,
      liveConnected: battleState.tiktokRoom.connected,
      liveTargetUsername: battleState.tiktokRoom.targetUsername,
      liveRoomId: battleState.tiktokRoom.roomId,
      liveViewerCount: battleState.tiktokRoom.viewerCount,
      packetsCaptured: battleState.wsSniffer.totalPacketsCaptured,
      dataSummaryHe: `מצב ${battleState.streamMode} · שלב ${battleState.phase} · ניקוד ${battleState.myScore}:${battleState.opponentScore} · קצב ${battleState.likesPerSecond}/שנ׳`,
      openai: openAiRes.stage,
      claude: claudeRes.stage,
      gemini: {
        ...geminiCollectorStage,
        summaryHe: needsApproval
          ? 'ממתין לאישור שרת לפני הרצת התוכנית ב-Gemini/Bמה'
          : `תוכנית מועצת OpenAI+Claude בוצעה (${executedParts.join(' · ') || 'ready'})`,
      },
      decisionSummaryHe: actionsTakenHe.join(' · '),
      approvalMode: policy.effectiveMode,
      approvalStatus,
      executionDetailHe: needsApproval
        ? policy.overrideBlocked
          ? 'השרת חסם בקשת עקיפה (requireApproval:false) — ממתין לאישור מפעיל'
          : 'ממתין לאישור מפעיל במרכז האישורים'
        : `בוצע ישירות תוכנית מועצת OpenAI + Claude (${executedParts.join(' · ')})`,
      executionEvidence: executedParts.join(' '),
      resultDetailHe: needsApproval
        ? 'נשמר בתור האישורים ללא שינוי בבמה החיה'
        : `התוצאה עודכנה ב-battleState ושודרה ל-${wss.clients.size} לקוחות מחוברים`,
    });

    const decision = recordAiDecision({
      streamMode: battleState.streamMode,
      detectedSituationHe: plan.situationSummaryHe,
      tensionScore: plan.tensionScore,
      energyScore: plan.energyScore,
      actionsTakenHe,
      musicTrackId: plan.musicTrackId || null,
      soundCueId: plan.soundCueId || null,
      vfxId: plan.vfxId || null,
      approvalStatus,
      councilApproved: true,
      decidedBy: 'OPENAI_CLAUDE_COUNCIL',
      openAiPlan: plan,
      claudeInspection: claudeRes.data || undefined,
      plannedPayload,
      pipelineTrace,
    });

    broadcast({ type: 'ai:decision', decision, state: battleState });
    res.json({
      ok: true,
      policyOverrideBlocked: policy.overrideBlocked,
      decision,
      state: battleState,
    });
  });

  // ============================================================================
  // 6B. PERMANENT SERVER-SIDE APPROVED-RULE EXECUTOR LOOP (NO GEMINI AUTONOMOUS DECISIONS!)
  // ============================================================================
  let autonomousDirectorCycleIdx = 0;

  setInterval(() => {
    if (!battleState.aiAutopilot || battleState.approvalMode === 'REQUIRE_APPROVAL') return;
    // Do not interrupt Intentional Quiet Valleys except in Snipe Window or Glove x5
    const sec = battleState.elapsedSec;
    const inQuietValley =
      battleState.streamMode === 'BATTLE' &&
      battleState.gloveRemainingSec <= 0 &&
      ((sec >= 42 && sec <= 54) || (sec >= 104 && sec <= 114) || (sec >= 165 && sec <= 174));
    if (inQuietValley) return;

    // Deterministic path may ONLY execute pre-approved rules saved with version >= 1
    const approvedRules = aiMemory.energyRules.filter((r) => canDeterministicRuleExecute(r).allowed);
    if (approvedRules.length === 0) return;

    autonomousDirectorCycleIdx += 1;
    const chosenRule = approvedRules[autonomousDirectorCycleIdx % approvedRules.length];

    const selectedVfx =
      chosenRule.recommendedVfxId && EFFECT_RULES[chosenRule.recommendedVfxId]
        ? chosenRule.recommendedVfxId
        : 'VID_02_CRYO_CO2_CANNONS';
    const selectedCam: CameraPresetId =
      chosenRule.recommendedCamera && VALID_CAMERA_PRESETS.has(chosenRule.recommendedCamera)
        ? chosenRule.recommendedCamera
        : 'BASS_PUMP';
    const selectedSound =
      chosenRule.recommendedSoundId && VALID_SOUND_IDS.has(chosenRule.recommendedSoundId)
        ? chosenRule.recommendedSoundId
        : null;

    const actionsHe: string[] = [];
    const vfxOut = tryTriggerOneShot(selectedVfx, `חוק מאושר v${chosenRule.version}: ${chosenRule.titleHe}`, 0.95, false);
    if (vfxOut.triggered && vfxOut.instance) {
      broadcast({ type: 'effect:triggered', effect: vfxOut.instance, state: battleState });
      actionsHe.push(`VFX: ${selectedVfx}`);
    }
    if (selectedCam !== 'STEADY_BREATH') {
      triggerCameraKinetic(selectedCam, 0.95, 1400, `חוק מאושר v${chosenRule.version}`);
      actionsHe.push(`מצלמה: ${selectedCam}`);
    }
    if (selectedSound) {
      emitSoundCue(selectedSound);
      actionsHe.push(`סאונד: ${selectedSound}`);
    }
    if (chosenRule.recommendedTapCallout) {
      activateTapStimulus(8, chosenRule.recommendedTapCallout);
      actionsHe.push(`גירוי: ${chosenRule.recommendedTapCallout}`);
    }

    if (actionsHe.length > 0) {
      chosenRule.appliedTimesCount = (chosenRule.appliedTimesCount || 0) + 1;
      const dec = recordAiDecision({
        streamMode: battleState.streamMode,
        detectedSituationHe: `הרצה דטרמיניסטית של חוק מאושר v${chosenRule.version}: "${chosenRule.titleHe}"`,
        tensionScore: battleState.aiTensionScore,
        energyScore: battleState.aiEnergyScore,
        actionsTakenHe: actionsHe,
        vfxId: vfxOut.instance?.effectId || null,
        soundCueId: selectedSound,
        decidedBy: 'DETERMINISTIC',
      });
      broadcast({ type: 'ai:decision', decision: dec, state: battleState });
    }
  }, 14000);

  // Existing VFX Frame Inspector & English Prompt Refiner
  app.post('/api/gemini/inspect-vfx', async (req, res) => {
    try {
      const { frameBase64, mimeType, metrics } = req.body || {};
      if (!frameBase64) {
        res.status(400).json({ error: 'חסרה תמונת פריים מתוך הסרטון לניתוח.' });
        return;
      }

      const ai = getGeminiClient();
      const promptText = `You are BOOSTERA's Senior Hollywood VFX Supervisor and Broadcast Compositing Engineer.
Inspect this uploaded TikTok LIVE Battle VFX frame along with its measured client file telemetry:
${JSON.stringify(metrics || {}, null, 2)}
Evaluate strictly against BOOSTERA broadcast standards (vertical 9:16, central 45-50% presenter safe area, realistic physics vs cheap cartoon stickers, genuine alpha vs #00FF00 green screen spill vs black Screen blend).
Respond ONLY in JSON matching the schema, with all explanatory fields written in professional, clear Hebrew.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: frameBase64 } },
            { text: promptText },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              identifiedEffectHe: { type: Type.STRING },
              recommendedTikTokTriggerHe: { type: Type.STRING },
              recommendedLayer: { type: Type.STRING },
              chromaAndAlphaVerdictHe: { type: Type.STRING },
              framingAndSafeZoneVerdictHe: { type: Type.STRING },
              reusabilityVerdictHe: { type: Type.STRING },
              soundPairingSuggestionHe: { type: Type.STRING },
              needsRerender: { type: Type.BOOLEAN },
            },
            required: [
              'identifiedEffectHe',
              'recommendedTikTokTriggerHe',
              'recommendedLayer',
              'chromaAndAlphaVerdictHe',
              'framingAndSafeZoneVerdictHe',
              'reusabilityVerdictHe',
              'soundPairingSuggestionHe',
              'needsRerender',
            ],
          },
        },
      });

      res.json({ analysis: JSON.parse((response.text ?? '{}').trim()) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה בניתוח הווידאו מול שרת Gemini';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/gemini/refine-prompt', async (req, res) => {
    try {
      const { basePrompt, directorRequestHe } = req.body || {};
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Base English VFX Prompt:\n${basePrompt}\n\nDirector modification request (in Hebrew):\n${directorRequestHe || 'חדד את הריאליזם הפיזיקלי ושמור על אזור המגיש נקי.'}\n\nReturn JSON with an updated production-ready English video generation prompt plus a short Hebrew note.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              refinedPromptEn: { type: Type.STRING },
              directorNoteHe: { type: Type.STRING },
            },
            required: ['refinedPromptEn', 'directorNoteHe'],
          },
        },
      });
      res.json(JSON.parse((response.text ?? '{}').trim()));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה בעדכון הפרומפט מול שרת Gemini';
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // REAL-TIME WEBSOCKET EVENT SNIFFER & CUSTOM AUTO-TRIGGER ROUTER ENDPOINTS
  // ============================================================================
  app.post('/api/ws-sniffer/config', (req, res) => {
    const { snifferActive, autoExecuteBoundTriggers, globalScopeOverride, resetCounters } = req.body || {};
    if (typeof snifferActive === 'boolean') {
      battleState.wsSniffer.snifferActive = snifferActive;
    }
    if (typeof autoExecuteBoundTriggers === 'boolean') {
      battleState.wsSniffer.autoExecuteBoundTriggers = autoExecuteBoundTriggers;
    }
    if (
      globalScopeOverride === 'RESPECT_BINDING' ||
      globalScopeOverride === 'ALL_CONNECTED_SOCKETS' ||
      globalScopeOverride === 'MIRRORED_ONLY'
    ) {
      battleState.wsSniffer.globalScopeOverride = globalScopeOverride;
    }
    if (resetCounters) {
      battleState.wsSniffer.totalPacketsCaptured = 0;
      battleState.wsSniffer.recentPackets = [];
      for (const ev of battleState.wsSniffer.discoveredEvents) {
        ev.seenCount = 0;
      }
      savePersistedWsSniffer(battleState.wsSniffer.discoveredEvents);
    }
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, state: battleState });
  });

  app.post('/api/ws-sniffer/connect-external', (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    if (!/^wss?:\/\/.+/i.test(rawUrl)) {
      res.status(400).json({ error: 'יש להזין כתובת WebSocket תקינה המתחילה ב-ws:// או wss://' });
      return;
    }
    const isBrowserLocal = /^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(rawUrl);

    let existing = battleState.wsSniffer.externalBridges.find((b) => b.url === rawUrl);
    if (!existing) {
      existing = {
        url: rawUrl,
        mode: isBrowserLocal ? 'BROWSER_LOCAL' : 'SERVER',
        connected: false,
        connecting: true,
        messagesReceived: 0,
        lastErrorHe: null,
        connectedSinceTs: null,
      };
      battleState.wsSniffer.externalBridges.push(existing);
    } else {
      existing.connecting = true;
      existing.lastErrorHe = null;
    }

    if (!isBrowserLocal) {
      const prevSock = activeServerExternalWs.get(rawUrl);
      if (prevSock) {
        try {
          prevSock.close();
        } catch {
          // Ignore
        }
      }
      try {
        const outSock = new WebSocket(rawUrl);
        activeServerExternalWs.set(rawUrl, outSock);

        outSock.on('open', () => {
          const entry = battleState.wsSniffer.externalBridges.find((b) => b.url === rawUrl);
          if (entry) {
            entry.connected = true;
            entry.connecting = false;
            entry.connectedSinceTs = Date.now();
            entry.lastErrorHe = null;
          }
          broadcast({ type: 'state:update', state: battleState });
        });

        outSock.on('message', (data) => {
          ingestExternalWsFrame(rawUrl, String(data || ''));
        });

        outSock.on('error', (err) => {
          const entry = battleState.wsSniffer.externalBridges.find((b) => b.url === rawUrl);
          if (entry) {
            entry.connected = false;
            entry.connecting = false;
            entry.lastErrorHe = `שגיאת חיבור: ${err.message.slice(0, 60)}`;
          }
          broadcast({ type: 'state:update', state: battleState });
        });

        outSock.on('close', () => {
          activeServerExternalWs.delete(rawUrl);
          const entry = battleState.wsSniffer.externalBridges.find((b) => b.url === rawUrl);
          if (entry) {
            entry.connected = false;
            entry.connecting = false;
          }
          broadcast({ type: 'state:update', state: battleState });
        });
      } catch (err: unknown) {
        existing.connecting = false;
        existing.lastErrorHe = err instanceof Error ? err.message : 'שגיאה בפתיחת WebSocket';
      }
    }

    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, mode: existing.mode, state: battleState });
  });

  app.post('/api/ws-sniffer/disconnect-external', (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    const sock = activeServerExternalWs.get(rawUrl);
    if (sock) {
      try {
        sock.close();
      } catch {
        // Ignore
      }
      activeServerExternalWs.delete(rawUrl);
    }
    battleState.wsSniffer.externalBridges = battleState.wsSniffer.externalBridges.filter(
      (b) => b.url !== rawUrl
    );
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, state: battleState });
  });

  app.post('/api/ws-sniffer/update-binding', (req, res) => {
    const { eventKey, labelHe, binding } = req.body || {};
    const cleanKey = String(eventKey || '').trim();
    if (!cleanKey) {
      res.status(400).json({ error: 'חסר מזהה אירוע (eventKey).' });
      return;
    }

    let rec = battleState.wsSniffer.discoveredEvents.find((e) => e.eventKey === cleanKey);
    if (!rec) {
      const meta = describeRawWebcastEventHe(cleanKey);
      rec = {
        eventKey: cleanKey,
        rawEventName: cleanKey,
        labelHe: typeof labelHe === 'string' && labelHe.trim() ? labelHe.trim() : meta.labelHe,
        descriptionHe: meta.descriptionHe,
        category: meta.category,
        seenCount: 0,
        firstSeenTs: Date.now(),
        lastSeenTs: 0,
        lastSourceLabel: 'נוצר ידנית',
        lastSampleSummaryHe: 'כלל מותאם אישית מוכן לקליטה',
        detectedFields: [],
        lastPayloadPreview: '{}',
        binding: makeDefaultBinding({ enabled: true }),
      };
      battleState.wsSniffer.discoveredEvents.unshift(rec);
    }

    if (typeof labelHe === 'string' && labelHe.trim()) {
      rec.labelHe = labelHe.trim();
    }
    if (binding && typeof binding === 'object') {
      rec.binding = {
        ...rec.binding,
        ...(typeof binding.enabled === 'boolean' ? { enabled: binding.enabled } : {}),
        ...(typeof binding.vfxId === 'string' ? { vfxId: binding.vfxId } : {}),
        ...(typeof binding.cameraPreset === 'string'
          ? { cameraPreset: binding.cameraPreset as CameraPresetId | 'NONE' }
          : {}),
        ...(typeof binding.soundCueId === 'string' ? { soundCueId: binding.soundCueId } : {}),
        ...(typeof binding.musicTrackId === 'string' ? { musicTrackId: binding.musicTrackId } : {}),
        ...(typeof binding.specialAction === 'string'
          ? { specialAction: binding.specialAction as WsSpecialStageAction }
          : {}),
        ...(typeof binding.calloutTextHe === 'string'
          ? { calloutTextHe: binding.calloutTextHe.slice(0, 32) }
          : {}),
        ...(typeof binding.cooldownSec === 'number'
          ? { cooldownSec: Math.max(1, Math.min(120, Math.round(binding.cooldownSec))) }
          : {}),
        ...(typeof binding.minNumericValue === 'number'
          ? { minNumericValue: Math.max(0, Math.round(binding.minNumericValue)) }
          : {}),
        ...(binding.scope === 'MIRRORED_ONLY' || binding.scope === 'ALL_CONNECTED_SOCKETS'
          ? { scope: binding.scope }
          : {}),
      };
    }

    battleState.wsSniffer.uniqueEventTypesCount = battleState.wsSniffer.discoveredEvents.length;
    savePersistedWsSniffer(battleState.wsSniffer.discoveredEvents);
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, record: rec, state: battleState });
  });

  app.post('/api/ws-sniffer/test-binding', (req, res) => {
    const cleanKey = String(req.body?.eventKey || '').trim();
    const rec = battleState.wsSniffer.discoveredEvents.find((e) => e.eventKey === cleanKey);
    if (!rec) {
      res.status(404).json({ error: 'האירוע המבוקש לא נמצא במאגר ה-WebSocket.' });
      return;
    }
    const result = executeWsEventBinding(rec, {
      sourceLabel: 'בדיקת במה חיה',
      senderUser: 'בדיקת_במאי',
      numericValue: Math.max(500, rec.binding.minNumericValue || 500),
      isMirroredRoom: true,
      forceManualTest: true,
    });
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, ...result, state: battleState });
  });

  app.post('/api/ws-sniffer/ai-auto-assign', async (req, res) => {
    try {
      const targetKey = typeof req.body?.eventKey === 'string' ? req.body.eventKey.trim() : '';
      const candidates = targetKey
        ? battleState.wsSniffer.discoveredEvents.filter((e) => e.eventKey === targetKey)
        : battleState.wsSniffer.discoveredEvents.slice(0, 14);

      if (candidates.length === 0) {
        res.json({ ok: true, updatedCount: 0, state: battleState });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `אתה במאי שידור ראשי של מערכת BOOSTERA לטיקטוק לייב (מדינה מכוילת: ${battleState.countryCalibration.labelHe}).
לפניך רשימת אירועי WebSocket שנתפסו מהשידורים החיים:
${JSON.stringify(
  candidates.map((c) => ({
    eventKey: c.eventKey,
    labelHe: c.labelHe,
    category: c.category,
    sample: c.lastSampleSummaryHe,
    fields: c.detectedFields,
  }))
)}

שבץ לכל אירוע הפעלת במה אוטומטית חכמה ומאוזנת (אל תעמיס על אירועים שגרתיים כמו RoomUserSeq או Chat רגיל — השאר אותם enabled: false או אפקט עדין עם צינון ארוך; לאירועים דרמטיים כמו BoostCard, SmokeCard, Glove, Whale Gift, BattleTask, SubNotify, Rank — שבץ enabled: true עם אפקט, מצלמה וסאונד מדויקים).
אפקטים מותרים ל-vfxId: NONE, VID_01_FIREBALL_SNIPE_BLAST, VID_02_CRYO_CO2_CANNONS, VID_03_TWIN_LIGHTNING_ARCS, VID_04_COLD_SPARK_FOUNTAINS, VID_05_PK_FACTION_SMOKE_CLASH, VID_06_PLASMA_SPARK_SURGE, VID_07_QUAD_PYRO_FLAME_JETS, BEAST_08_VIOLET_PHOENIX, BEAST_09_SOLAR_TIGER, BEAST_10_ROYAL_FIRE_LION, FOLLOW_GOLDEN_SPARKS, GOAL_SHOCKWAVE_RING, JOIN_ANAMORPHIC_SWEEP, CHAT_TESLA_FILAMENT.
מצלמות מותרות ל-cameraPreset: NONE, ZOOM_PUNCH, BASS_PUMP, EARTHQUAKE_SHAKE, DUTCH_WHIP, SNIPE_CREEP, VACUUM_DROP.
סאונד מותר ל-soundCueId: NONE, SND_SNIPE_LOCK, SND_GLOVE_POWERUP, SND_LEAD_TAKEN, SND_LEAD_LOST_TENSION, SND_HYPE_STADIUM_CHEER, SND_CINEMATIC_BRAAM.
פעולה מיוחדת ל-specialAction: NONE, CLOUD_XRAY, GLOVE_30S, SNIPE_WINDOW, AVATAR_SPOTLIGHT, TAP_BOOST_BANNER.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assignments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    eventKey: { type: Type.STRING },
                    enabled: { type: Type.BOOLEAN },
                    vfxId: { type: Type.STRING },
                    cameraPreset: { type: Type.STRING },
                    soundCueId: { type: Type.STRING },
                    specialAction: { type: Type.STRING },
                    calloutTextHe: { type: Type.STRING },
                    cooldownSec: { type: Type.NUMBER },
                  },
                  required: ['eventKey', 'enabled', 'vfxId', 'cameraPreset', 'soundCueId', 'specialAction', 'calloutTextHe', 'cooldownSec'],
                },
              },
            },
            required: ['assignments'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      let updatedCount = 0;
      if (Array.isArray(parsed.assignments)) {
        for (const a of parsed.assignments) {
          const rec = battleState.wsSniffer.discoveredEvents.find((e) => e.eventKey === a.eventKey);
          if (!rec) continue;
          // Proposals only! Never auto-enable discovered event bindings without operator approval.
          rec.binding.enabled = false;
          rec.binding.vfxId = String(a.vfxId || 'NONE');
          rec.binding.cameraPreset = (VALID_CAMERA_PRESETS.has(a.cameraPreset) ? a.cameraPreset : 'NONE') as CameraPresetId | 'NONE';
          rec.binding.soundCueId = String(a.soundCueId || 'NONE');
          rec.binding.specialAction = (
            ['NONE', 'CLOUD_XRAY', 'GLOVE_30S', 'SNIPE_WINDOW', 'AVATAR_SPOTLIGHT', 'TAP_BOOST_BANNER'].includes(
              a.specialAction
            )
              ? a.specialAction
              : 'NONE'
          ) as WsSpecialStageAction;
          rec.binding.calloutTextHe = String(a.calloutTextHe || '').slice(0, 28);
          rec.binding.cooldownSec = Math.max(3, Math.min(90, Math.round(Number(a.cooldownSec || 8))));
          updatedCount += 1;
        }
      }
      savePersistedWsSniffer(battleState.wsSniffer.discoveredEvents);
      broadcast({ type: 'state:update', state: battleState });
      res.json({ ok: true, updatedCount, state: battleState });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה בשיבוץ אוטומטי מול Gemini';
      res.status(500).json({ error: msg });
    }
  });

  // ============================================================================
  // LIVE CHAT TRACKING, CO-HOST MODERATOR LEARNING & MULTI-ACCOUNT CREW ENDPOINTS
  // ============================================================================
  app.post('/api/chat-companion/config', (req, res) => {
    const { autoCompanionEnabled, autoModerationShieldEnabled, autoLearnFromLiveChat } = req.body || {};
    if (typeof autoCompanionEnabled === 'boolean') {
      battleState.chatCompanion.autoCompanionEnabled = autoCompanionEnabled;
    }
    if (typeof autoModerationShieldEnabled === 'boolean') {
      battleState.chatCompanion.autoModerationShieldEnabled = autoModerationShieldEnabled;
    }
    if (typeof autoLearnFromLiveChat === 'boolean') {
      battleState.chatCompanion.autoLearnFromLiveChat = autoLearnFromLiveChat;
    }
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, state: battleState });
  });

  app.post('/api/chat-companion/account/upsert', (req, res) => {
    const { id, handle, displayName, role, enabled, externalWebhookOrWsTag, toneNotesHe, connectionStatus } =
      req.body || {};
    const cleanHandle = sanitizeTikTokHandle(handle || displayName || 'companion_live') || 'companion_live';
    const validRole: CompanionRoleId =
      role === 'TACTICAL_SNIPE' || role === 'VIBE_HYPE' || role === 'MOD_SHIELD' || role === 'WELCOME_VIP'
        ? role
        : 'VIBE_HYPE';

    let acc = id
      ? battleState.chatCompanion.accounts.find((a) => a.id === id)
      : battleState.chatCompanion.accounts.find((a) => a.handle.toLowerCase() === cleanHandle.toLowerCase());

    if (!acc) {
      acc = {
        id: nextId('comp_acc'),
        handle: cleanHandle,
        displayName: String(displayName || `@${cleanHandle}`).trim(),
        avatarUrl: buildBroadcastAvatarCrestUri(displayName || cleanHandle, battleState.chatCompanion.accounts.length),
        role: validRole,
        enabled: enabled !== false,
        connectionStatus: connectionStatus === 'WS_BRIDGE_ACTIVE' ? 'WS_BRIDGE_ACTIVE' : 'SLOT_READY',
        externalWebhookOrWsTag: String(externalWebhookOrWsTag || `ws://companion-${cleanHandle}`).trim(),
        toneNotesHe: String(toneNotesHe || 'מנחה מלווה ליצירת אווירה, מענה לקהל ושמירה על אנרגיה חיובית בצ׳אט.').trim(),
        messagesDispatched: 0,
        moderationsTriggered: 0,
      };
      battleState.chatCompanion.accounts.push(acc);
    } else {
      if (handle) acc.handle = cleanHandle;
      if (displayName) acc.displayName = String(displayName).trim();
      if (role) acc.role = validRole;
      if (typeof enabled === 'boolean') acc.enabled = enabled;
      if (typeof externalWebhookOrWsTag === 'string') acc.externalWebhookOrWsTag = externalWebhookOrWsTag.trim();
      if (typeof toneNotesHe === 'string') acc.toneNotesHe = toneNotesHe.trim();
      if (connectionStatus === 'WS_BRIDGE_ACTIVE' || connectionStatus === 'SLOT_READY') {
        acc.connectionStatus = connectionStatus;
      }
    }

    savePersistedChatCompanion(battleState.chatCompanion);
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, account: acc, state: battleState });
  });

  app.post('/api/chat-companion/account/delete', (req, res) => {
    const id = String(req.body?.id || '').trim();
    battleState.chatCompanion.accounts = battleState.chatCompanion.accounts.filter((a) => a.id !== id);
    savePersistedChatCompanion(battleState.chatCompanion);
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, state: battleState });
  });

  app.post('/api/chat-companion/dispatch-now', (req, res) => {
    const { moment, customMessageHe, preferredRole, kind, targetOffender } = req.body || {};
    const validMoment: ChatMomentType =
      moment === 'OPENING_WARMUP' ||
      moment === 'DEAD_AIR_ICEBREAKER' ||
      moment === 'GLOVE_X5_PUSH' ||
      moment === 'CLOUD_DEFENSE' ||
      moment === 'FINAL_30S_SNIPE' ||
      moment === 'VIP_THANK_YOU' ||
      moment === 'ANTI_TROLL_SHIELD'
        ? moment
        : 'DEAD_AIR_ICEBREAKER';

    const validRole: CompanionRoleId =
      preferredRole === 'TACTICAL_SNIPE' ||
      preferredRole === 'VIBE_HYPE' ||
      preferredRole === 'MOD_SHIELD' ||
      preferredRole === 'WELCOME_VIP'
        ? preferredRole
        : 'VIBE_HYPE';

    const item = dispatchCompanionCrewAction({
      moment: validMoment,
      momentLabelHe: 'שליחת הודעת מנחה מלווה לצ׳אט ולגשר החשבונות',
      preferredRole: validRole,
      kind: kind === 'MOD_CLEANUP' ? 'MOD_CLEANUP' : 'CHAT_VIBE_LINE',
      customMessageHe: typeof customMessageHe === 'string' && customMessageHe.trim() ? customMessageHe.trim() : undefined,
      targetOffender: typeof targetOffender === 'string' ? targetOffender : undefined,
      bypassCooldown: true,
    });
    savePersistedChatCompanion(battleState.chatCompanion);
    res.json({ ok: true, dispatched: item, state: battleState });
  });

  app.post('/api/chat-companion/resolve-flag', (req, res) => {
    const flagId = String(req.body?.flagId || '').trim();
    const sendFlood = Boolean(req.body?.sendFlood);
    const flag = battleState.chatCompanion.moderationFlags.find((f) => f.id === flagId);
    if (flag) {
      flag.resolved = true;
      if (sendFlood) {
        dispatchCompanionCrewAction({
          moment: 'ANTI_TROLL_SHIELD',
          momentLabelHe: `ניקוי והצפה חיובית מול ${flag.offenderUser}`,
          preferredRole: 'MOD_SHIELD',
          kind: 'MOD_CLEANUP',
          customMessageHe: flag.counterFloodLineHe,
          targetOffender: flag.offenderUser,
          bypassCooldown: true,
        });
      }
    }
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: true, state: battleState });
  });

  app.post('/api/chat-companion/learn-now', async (req, res) => {
    try {
      const customNotes = typeof req.body?.customChatSample === 'string' ? req.body.customChatSample.trim() : '';
      const collectedLiveChat: string[] = [];
      for (const room of activeSwarmRooms.values()) {
        for (const c of room.chatSamples.slice(0, 15)) {
          collectedLiveChat.push(`[@${room.username}] ${c}`);
        }
      }
      for (const m of battleState.recentChatMessages.slice(0, 15)) {
        collectedLiveChat.push(`[${m.source || 'חדר'}] ${m.user}: ${m.text}`);
      }
      if (customNotes) {
        collectedLiveChat.unshift(`[חומר ידני לניתוח מנחים]: ${customNotes}`);
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `אתה מומחה עולמי לניהול צ׳אט ומנחים מלווים (Chat Co-Hosts & Moderators) בטיקטוק לייב וקרבות PK, מותאם לקהל ב-${battleState.countryCalibration.labelHe}.
נתח את דגימות הצ׳אט והאירועים החיים הבאים (בכל שפה שנקלטה ותרגם לטקטיקה ישראלית טבעית, חדה ולא רובוטית!):
${collectedLiveChat.slice(0, 35).join('\n') || 'אין עדיין דגימות — צור תבניות מתקדמות לניהול קהל, כפפה, ענן וניקוי טרולים.'}

חלץ:
1. 2 תבניות חדשות של מנחים מלווים (learnedPatterns) עבור צוות החשבונות שלנו שיצטרפו ללייב וייצרו אווירה (כל תבנית כוללת מה זוהה בלייב + 2 משפטי צ׳אט טבעיים בעברית שנשמעים כמו אח/מנחה אמיתי בחדר ולא בוט!).
2. סיכום קצר בעברית של מה כדאי להעיף/לסנן בצ׳אט ואיך להרים את קצב התגובות.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summaryInsightHe: { type: Type.STRING },
              patterns: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    moment: { type: Type.STRING },
                    role: { type: Type.STRING },
                    whatObservedHe: { type: Type.STRING },
                    hebrewLines: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['moment', 'role', 'whatObservedHe', 'hebrewLines'],
                },
              },
            },
            required: ['summaryInsightHe', 'patterns'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const validMoments = new Set([
        'OPENING_WARMUP',
        'DEAD_AIR_ICEBREAKER',
        'GLOVE_X5_PUSH',
        'CLOUD_DEFENSE',
        'FINAL_30S_SNIPE',
        'VIP_THANK_YOU',
        'ANTI_TROLL_SHIELD',
      ]);
      const validRoles = new Set(['TACTICAL_SNIPE', 'VIBE_HYPE', 'MOD_SHIELD', 'WELCOME_VIP']);

      let addedCount = 0;
      if (Array.isArray(parsed.patterns)) {
        for (const p of parsed.patterns) {
          const lines = Array.isArray(p.hebrewLines)
            ? p.hebrewLines.map((s: any) => String(s || '').trim()).filter(Boolean)
            : [];
          if (lines.length === 0) continue;
          const newPat: LearnedChatModeratorPattern = {
            id: nextId('cpat'),
            moment: (validMoments.has(p.moment) ? p.moment : 'DEAD_AIR_ICEBREAKER') as ChatMomentType,
            role: (validRoles.has(p.role) ? p.role : 'VIBE_HYPE') as CompanionRoleId,
            sourceStreamHe:
              activeSwarmRooms.size > 0
                ? `נלמד מצ׳אט חי (${Array.from(activeSwarmRooms.keys()).slice(0, 3).map((u) => '@' + u).join(', ')})`
                : 'למידת AI מצ׳אט השידור',
            whatObservedHe: String(p.whatObservedHe || 'טקטיקת הנחיית צ׳אט חיה').trim(),
            hebrewLines: lines.slice(0, 4),
            effectivenessScore: 94,
            autoDispatchEnabled: true,
            usedCount: 0,
            updatedAtTs: Date.now(),
          };
          battleState.chatCompanion.learnedPatterns.unshift(newPat);
          addedCount += 1;
        }
      }
      if (battleState.chatCompanion.learnedPatterns.length > 32) {
        battleState.chatCompanion.learnedPatterns.length = 32;
      }
      if (parsed.summaryInsightHe) {
        battleState.chatCompanion.detectedRoomMoodHe = String(parsed.summaryInsightHe).slice(0, 130);
      }

      savePersistedChatCompanion(battleState.chatCompanion);
      broadcast({ type: 'state:update', state: battleState });
      res.json({
        ok: true,
        addedCount,
        summaryInsightHe: parsed.summaryInsightHe || 'נלמדו תבניות מנחים חדשות מהצ׳אט!',
        state: battleState,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה בלמידת מנחי צ׳אט מול Gemini';
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`BOOSTERA Apex Broadcast Engine running on http://0.0.0.0:${PORT}`);
    if (isGeeLarkConfigured()) {
      setTimeout(() => {
        void probeGeeLarkDevices()
          .then(() => {
            broadcast({ type: 'state:update', state: battleState });
          })
          .catch(() => {});
      }, 1500);
    }
  });
}

startServer();
