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
  buildIntegrationAuditReport,
  buildPipelineTrace,
  DecisionApprovalMode,
  DecisionApprovalStatus,
  IntegrationAuditReport,
  PipelineStageLog,
  PlannedExecutionPayload,
  ProviderStageInput,
} from './src/engine/decisionPipeline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const LEARNING_VAULT_DIR = path.join(DATA_DIR, 'learning_vault');
const MEMORY_FILE = path.join(DATA_DIR, 'boostera_ai_memory.json');
const TIKLEAP_CACHE_FILE = path.join(DATA_DIR, 'tikleap_rankings_cache.json');
const WS_SNIFFER_FILE = path.join(DATA_DIR, 'ws_event_sniffer.json');
const CHAT_COMPANION_FILE = path.join(DATA_DIR, 'chat_companion_crew.json');

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
  status: 'TRIGGERED' | 'COOLDOWN_SKIPPED' | 'ACCUMULATED';
  detailHe: string;
}

interface AiDirectorDecision {
  id: string;
  timestamp: number;
  streamMode: StreamMode;
  detectedSituationHe: string;
  tensionScore: number;
  energyScore: number;
  actionsTakenHe: string[];
  musicTrackId?: string | null;
  soundCueId?: string | null;
  vfxId?: string | null;
  approvalStatus?: DecisionApprovalStatus;
  decidedBy?: 'GEMINI' | 'OPENAI_CLAUDE_GEMINI' | 'DETERMINISTIC' | 'MANUAL';
  approvedAt?: number | null;
  approvedBy?: string | null;
  executedAt?: number | null;
  plannedPayload?: PlannedExecutionPayload | null;
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

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LEARNING_VAULT_DIR)) {
    fs.mkdirSync(LEARNING_VAULT_DIR, { recursive: true });
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
  geelarkDevices?: Array<{ id: string; serialName: string; status: string; envName?: string }>;
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

function readEnvClean(name: string): { value: string; hadPrefix: boolean } {
  let raw = (process.env[name] || '').trim();
  if (!raw) return { value: '', hadPrefix: false };
  let hadPrefix = false;
  const prefix = `${name}=`;
  if (raw.startsWith(prefix)) {
    raw = raw.slice(prefix.length).trim();
    hadPrefix = true;
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  return { value: raw, hadPrefix };
}

function normalizeGeeLarkOrigin(rawUrl: string): string {
  const cleaned = (rawUrl || 'https://openapi.geelark.com').trim().replace(/\/+$/, '');
  return cleaned.replace(/\/open\/v1(?:\/.*)?$/i, '');
}

function isGeeLarkConfigured(): boolean {
  return Boolean(readEnvClean('GEELARK_API_KEY').value && readEnvClean('GEELARK_APP_ID').value);
}

function computeIntegrationAudit(): IntegrationAuditReport {
  const externalConnected = battleState.wsSniffer.externalBridges.filter((b) => b.connected).length;
  return buildIntegrationAuditReport({
    geelarkConfigured: isGeeLarkConfigured(),
    geelarkDevicesCount: (battleState.geelarkDevices || []).length,
    geelarkLastErrorHe,
    tiktokOauthConfigured: battleState.tiktokRoom.oauthConfigured,
    tiktokOauthUser: battleState.tiktokRoom.oauthConnectedUser?.displayName || null,
    tiktokWebcastConnected: battleState.tiktokRoom.connected,
    tiktokWebcastUsername: battleState.tiktokRoom.targetUsername,
    tiktokWebcastRoomId: battleState.tiktokRoom.roomId,
    tiktokWebcastViewers: battleState.tiktokRoom.viewerCount,
    openaiConfigured: Boolean(readEnvClean('OPENAI_API_KEY').value),
    claudeConfigured: Boolean(readEnvClean('ANTHROPIC_API_KEY').value),
    geminiConfigured: Boolean(readEnvClean('GEMINI_API_KEY').value),
    externalWsConnectedCount: externalConnected,
  });
}

async function probeGeeLarkDevices(): Promise<{
  configured: boolean;
  connected: boolean;
  devices: Array<{ id: string; serialName: string; status: string; envName?: string }>;
  errorHe: string | null;
  endpointUsed?: string;
}> {
  const appIdClean = readEnvClean('GEELARK_APP_ID');
  const apiKeyClean = readEnvClean('GEELARK_API_KEY');
  const urlClean = readEnvClean('GEELARK_API_URL');

  if (!appIdClean.value || !apiKeyClean.value) {
    geelarkLastErrorHe = null;
    battleState.geelarkDevices = [];
    battleState.integrationAudit = computeIntegrationAudit();
    return {
      configured: false,
      connected: false,
      devices: [],
      errorHe: 'לא מוגדרים GEELARK_APP_ID ו-GEELARK_API_KEY בסביבת השרת.',
    };
  }

  const baseOrigin = normalizeGeeLarkOrigin(urlClean.value);
  const endpointUrl = `${baseOrigin}/open/v1/phone/list`;
  const appId = appIdClean.value;
  const apiKey = apiKeyClean.value;
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
      body: JSON.stringify({ page: 1, pageSize: 20 }),
      signal: AbortSignal.timeout(8000),
    });
    const rawText = await resp.text();
    let json: {
      code?: number;
      msg?: string;
      data?: { items?: Array<{ id?: string; serialName?: string; status?: number | string; envName?: string }> };
    } | null = null;
    try {
      json = JSON.parse(rawText);
    } catch {
      geelarkLastErrorHe = `תשובה לא תקינה מ-GeeLark (HTTP ${resp.status} מ-${endpointUrl}): ${rawText.slice(0, 120)}`;
      battleState.geelarkDevices = [];
      battleState.integrationAudit = computeIntegrationAudit();
      return {
        configured: true,
        connected: false,
        devices: [],
        errorHe: geelarkLastErrorHe,
        endpointUsed: endpointUrl,
      };
    }

    if (!resp.ok || !json || (typeof json.code === 'number' && json.code !== 0)) {
      geelarkLastErrorHe = json?.msg ? `${json.msg} (code=${json.code ?? resp.status})` : `HTTP ${resp.status}`;
      battleState.geelarkDevices = [];
      battleState.integrationAudit = computeIntegrationAudit();
      return {
        configured: true,
        connected: false,
        devices: [],
        errorHe: geelarkLastErrorHe,
        endpointUsed: endpointUrl,
      };
    }
    const devices = (json.data?.items || []).map((d) => ({
      id: String(d.id || ''),
      serialName: String(d.serialName || d.id || 'cloud-phone'),
      status: String(d.status ?? 'unknown'),
      envName: d.envName,
    }));
    geelarkLastErrorHe = null;
    battleState.geelarkDevices = devices;
    battleState.integrationAudit = computeIntegrationAudit();
    return {
      configured: true,
      connected: devices.length > 0,
      devices,
      errorHe: null,
      endpointUsed: endpointUrl,
    };
  } catch (err: unknown) {
    geelarkLastErrorHe = err instanceof Error ? err.message : 'שגיאת תקשורת מול GeeLark OpenAPI';
    battleState.geelarkDevices = [];
    battleState.integrationAudit = computeIntegrationAudit();
    return {
      configured: true,
      connected: false,
      devices: [],
      errorHe: geelarkLastErrorHe,
      endpointUsed: endpointUrl,
    };
  }
}

async function callOpenAiAdvisor(snapshotJson: string): Promise<ProviderStageInput> {
  const apiKey = readEnvClean('OPENAI_API_KEY').value;
  const configuredModel = readEnvClean('OPENAI_MODEL').value || 'gpt-4o-mini';
  if (!apiKey) {
    return { configured: false, called: false, ok: false, model: configuredModel, summaryHe: '' };
  }

  const attemptModel = async (modelToTry: string) => {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelToTry,
        temperature: 0.3,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content:
              'You are a TikTok LIVE battle telemetry analyst. Respond in 1-2 concise Hebrew sentences summarizing crowd momentum, score risk, and recommended action.',
          },
          { role: 'user', content: snapshotJson },
        ],
      }),
      signal: AbortSignal.timeout(9000),
    });
    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string; code?: string };
    };
    return { resp, json };
  };

  try {
    let modelUsed = configuredModel;
    let { resp, json } = await attemptModel(configuredModel);
    if (
      !resp.ok &&
      configuredModel !== 'gpt-4o-mini' &&
      /model/i.test(json.error?.message || '')
    ) {
      const fallbackAttempt = await attemptModel('gpt-4o-mini');
      if (fallbackAttempt.resp.ok) {
        resp = fallbackAttempt.resp;
        json = fallbackAttempt.json;
        modelUsed = `gpt-4o-mini (גיבוי מ-${configuredModel})`;
      }
    }
    if (!resp.ok) {
      return {
        configured: true,
        called: true,
        ok: false,
        model: modelUsed,
        summaryHe: '',
        errorHe: json.error?.message || `OpenAI HTTP ${resp.status}`,
        timestamp: Date.now(),
      };
    }
    const text = (json.choices?.[0]?.message?.content || '').trim();
    return {
      configured: true,
      called: true,
      ok: Boolean(text),
      model: modelUsed,
      summaryHe: text || 'התקבלה תשובה ריקה מ-OpenAI',
      timestamp: Date.now(),
    };
  } catch (err: unknown) {
    return {
      configured: true,
      called: true,
      ok: false,
      model: configuredModel,
      summaryHe: '',
      errorHe: err instanceof Error ? err.message : 'שגיאה בקריאה ל-OpenAI',
      timestamp: Date.now(),
    };
  }
}

async function callClaudeAdvisor(snapshotJson: string, openAiSummaryHe: string): Promise<ProviderStageInput> {
  const apiKey = readEnvClean('ANTHROPIC_API_KEY').value;
  const configuredModel = readEnvClean('ANTHROPIC_MODEL').value || 'claude-3-5-sonnet-latest';
  if (!apiKey) {
    return { configured: false, called: false, ok: false, model: configuredModel, summaryHe: '' };
  }

  const attemptModel = async (modelToTry: string) => {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelToTry,
        max_tokens: 200,
        system:
          'You are the safety & tactical verifier for a TikTok LIVE studio director. Reply in 1-2 concise Hebrew sentences confirming or refining the tactical move.',
        messages: [
          {
            role: 'user',
            content: `Live Snapshot:\n${snapshotJson}\n\nOpenAI Note: ${openAiSummaryHe || 'N/A'}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(9000),
    });
    const json = (await resp.json()) as {
      content?: Array<{ text?: string }>;
      error?: { message?: string; type?: string };
    };
    return { resp, json };
  };

  try {
    let modelUsed = configuredModel;
    let { resp, json } = await attemptModel(configuredModel);
    if (
      !resp.ok &&
      configuredModel !== 'claude-3-5-sonnet-latest' &&
      /model/i.test(json.error?.message || '')
    ) {
      const fallbackAttempt = await attemptModel('claude-3-5-sonnet-latest');
      if (fallbackAttempt.resp.ok) {
        resp = fallbackAttempt.resp;
        json = fallbackAttempt.json;
        modelUsed = `claude-3-5-sonnet-latest (גיבוי מ-${configuredModel})`;
      }
    }
    if (!resp.ok) {
      return {
        configured: true,
        called: true,
        ok: false,
        model: modelUsed,
        summaryHe: '',
        errorHe: json.error?.message || `Claude HTTP ${resp.status}`,
        timestamp: Date.now(),
      };
    }
    const text = (json.content?.[0]?.text || '').trim();
    return {
      configured: true,
      called: true,
      ok: Boolean(text),
      model: modelUsed,
      summaryHe: text || 'התקבלה תשובה ריקה מ-Claude',
      timestamp: Date.now(),
    };
  } catch (err: unknown) {
    return {
      configured: true,
      called: true,
      ok: false,
      model: configuredModel,
      summaryHe: '',
      errorHe: err instanceof Error ? err.message : 'שגיאה בקריאה ל-Claude',
      timestamp: Date.now(),
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
        configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
        called: false,
        ok: false,
        summaryHe: '',
      },
      claude: {
        configured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
        called: false,
        ok: false,
        summaryHe: '',
      },
      gemini: {
        configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        called: decision.decidedBy === 'GEMINI' || decision.decidedBy === 'OPENAI_CLAUDE_GEMINI',
        ok: decision.decidedBy === 'GEMINI' || decision.decidedBy === 'OPENAI_CLAUDE_GEMINI',
        model: 'gemini-4-hydrogen',
        summaryHe: decision.detectedSituationHe,
      },
      decisionSummaryHe: decision.actionsTakenHe.join(' · ') || decision.detectedSituationHe,
      approvalMode: battleState.approvalMode || 'AUTO_EXECUTE',
      approvalStatus,
      executionDetailHe:
        approvalStatus === 'PENDING_APPROVAL'
          ? 'ממתין לאישור מפעיל'
          : `בוצע על מנוע הבמה המקומי (${decision.actionsTakenHe.join(' · ')})`,
      executionEvidence: [
        decision.vfxId ? `vfx=${decision.vfxId}` : '',
        decision.soundCueId ? `sound=${decision.soundCueId}` : '',
        decision.musicTrackId ? `music=${decision.musicTrackId}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      resultDetailHe: 'סטייט עודכן ושודר ל-OBS/Browser Source וללקוחות WebSocket',
    });

  const entry: AiDirectorDecision = {
    id: nextId('ai'),
    timestamp: now,
    approvalStatus,
    decidedBy: decision.decidedBy || 'DETERMINISTIC',
    executedAt: approvalStatus === 'AUTO_EXECUTED' ? now : null,
    ...decision,
    pipelineTrace: trace,
  };
  battleState.aiDecisions.unshift(entry);
  if (battleState.aiDecisions.length > 20) {
    const pending = battleState.aiDecisions.filter((d) => d.approvalStatus === 'PENDING_APPROVAL');
    const others = battleState.aiDecisions.filter((d) => d.approvalStatus !== 'PENDING_APPROVAL');
    const keepOthers = Math.max(0, 20 - pending.length);
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

// Expanded Gemini Function Declarations for Full Camera, Tap-Dopamine, Music, Sound, VFX & Self-Learning Memory
const AI_DIRECTOR_TOOLS: FunctionDeclaration[] = [
  {
    name: 'assessLiveMood',
    description:
      'Mandatory assessment of the live room atmosphere, tension (0-100), and energy (0-100) based on audio, chat, battle clock, score gap, gloves, snipes, gestures, or solo host cadence.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        situationSummaryHe: {
          type: Type.STRING,
          description: 'Concise professional Hebrew insight describing what you hear/detect right now.',
        },
        tensionScore: { type: Type.NUMBER },
        energyScore: { type: Type.NUMBER },
      },
      required: ['situationSummaryHe', 'tensionScore', 'energyScore'],
    },
  },
  {
    name: 'selectMusicTrack',
    description: 'Switch the active studio music track when mood, phase, Solo talk, Glove x5, or Snipe window calls for it.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        trackId: { type: Type.STRING },
        reasonHe: { type: Type.STRING },
      },
      required: ['trackId', 'reasonHe'],
    },
  },
  {
    name: 'triggerSoundCue',
    description:
      'Fire a real-time broadcast sound effect: SND_SNIPE_LOCK, SND_GLOVE_POWERUP, SND_LEAD_TAKEN, SND_LEAD_LOST_TENSION, SND_FINAL_10S_HEARTBEAT, SND_ENERGY_WAKEUP_SWEEP, SND_HYPE_STADIUM_CHEER, SND_CINEMATIC_BRAAM, SND_TAP_DOPAMINE_PULSE, or SND_COMBO_MILESTONE.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        soundId: { type: Type.STRING },
        reasonHe: { type: Type.STRING },
      },
      required: ['soundId', 'reasonHe'],
    },
  },
  {
    name: 'triggerVisualEffect',
    description:
      'Trigger a 9:16 live VFX (prioritizing the 7 real studio video VFX clips: VID_01_FIREBALL_SNIPE_BLAST, VID_02_CRYO_CO2_CANNONS, VID_03_TWIN_LIGHTNING_ARCS, VID_04_COLD_SPARK_FOUNTAINS, VID_05_PK_FACTION_SMOKE_CLASH, VID_06_PLASMA_SPARK_SURGE, VID_07_QUAD_PYRO_FLAME_JETS, the 3 green-screen beast mascots: BEAST_08_VIOLET_PHOENIX [comeback/lead], BEAST_09_SOLAR_TIGER [x5 glove/combo], BEAST_10_ROYAL_FIRE_LION [whale gift/snipe win], or procedural VFX: SOLO_WARM_LOUNGE, GLOVE_POWER_SURGE, SNIPE_CRITICAL_FLASH, SHARE_CO2_CANNONS, SHARE_SMOKE_PLUMES, FOLLOW_GOLDEN_SPARKS, JOIN_ANAMORPHIC_SWEEP, CHAT_TESLA_FILAMENT, GOAL_SHOCKWAVE_RING, PRESSURE_FORKED_LIGHTNING, FINALE_PYRO_CONVERGENCE).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        effectId: { type: Type.STRING },
        reasonHe: { type: Type.STRING },
      },
      required: ['effectId', 'reasonHe'],
    },
  },
  {
    name: 'triggerCameraMove',
    description:
      'Execute an AI virtual camera / screen movement: ZOOM_PUNCH (hype snap), EARTHQUAKE_SHAKE (heavy impact/snipe), BASS_PUMP (rhythmic beat pulse), DUTCH_WHIP (score flip tilt), SNIPE_CREEP (slow tension push-in), or VACUUM_DROP (pre-drop pull-back).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        preset: { type: Type.STRING },
        intensity: { type: Type.NUMBER, description: '0.4 to 1.4' },
        durationMs: { type: Type.NUMBER, description: '700 to 4500' },
        reasonHe: { type: Type.STRING },
      },
      required: ['preset', 'intensity', 'durationMs', 'reasonHe'],
    },
  },
  {
    name: 'triggerTapStimulus',
    description:
      'Activate outer-edge tactile Finger-Tap Dopamine Pacemaker rings & combo boost when tapping slows down, during tap challenges, or during Glove x5!',
    parameters: {
      type: Type.OBJECT,
      properties: {
        calloutTextHe: { type: Type.STRING, description: 'Short punchy callout e.g. DOUBLE TAP NOW!' },
        durationSec: { type: Type.NUMBER, description: '5 to 14 seconds' },
        reasonHe: { type: Type.STRING },
      },
      required: ['calloutTextHe', 'durationSec', 'reasonHe'],
    },
  },
  {
    name: 'setMixBalance',
    description: 'Adjust background music volume percentage (15-75%).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        musicVolumePct: { type: Type.NUMBER },
        reasonHe: { type: Type.STRING },
      },
      required: ['musicVolumePct', 'reasonHe'],
    },
  },
  {
    name: 'saveLearnedRule',
    description: 'Store a newly discovered audience engagement or battle pacing insight into persistent AI memory.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        titleHe: { type: Type.STRING },
        triggerConditionHe: { type: Type.STRING },
        aiActionDirectiveEn: { type: Type.STRING },
      },
      required: ['titleHe', 'triggerConditionHe', 'aiActionDirectiveEn'],
    },
  },
  {
    name: 'proposeNewStageTool',
    description:
      'Invent and register a new tactical stage tool when the AI realizes from live stream dynamics that an extra capability/combo is needed.',
    parameters: {
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
];

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

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
        if (battleState.recentChatMessages.length > 18) {
          battleState.recentChatMessages.length = 18;
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
        if (battleState.aiAutopilot) {
          emitMusicChange('MUS_BATTLE_IGNITION_PULSE', 35);
        }
      } else {
        const nextPhase = computePhase(battleState.elapsedSec);
        battleState.phase = nextPhase;

        if (
          nextPhase === 'PRESSURE' &&
          battleState.elapsedSec >= 115 &&
          battleState.elapsedSec < 116.5 &&
          pressureEntryStrikeRound !== battleState.roundNumber
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

        if (
          battleState.elapsedSec >= 230 &&
          battleState.elapsedSec < 231.5 &&
          heartbeat10sTriggeredRound !== battleState.roundNumber
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
          finaleTriggeredForRound !== battleState.roundNumber
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
      if (battleState.recentChatMessages.length > 24) {
        battleState.recentChatMessages.length = 24;
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

  app.post('/api/geelark/probe', async (_req, res) => {
    const probe = await probeGeeLarkDevices();
    broadcast({ type: 'state:update', state: battleState });
    res.json({ ok: probe.connected, ...probe, audit: battleState.integrationAudit, state: battleState });
  });

  app.post('/api/geelark/execute-chat', async (req, res) => {
    const messageText = String(req.body?.messageText || '').trim();
    const deviceId = String(req.body?.deviceId || process.env.GEELARK_ENV_ID || '').trim();
    if (!messageText) {
      res.status(400).json({ ok: false, errorHe: 'נדרש טקסט הודעה לביצוע' });
      return;
    }
    if (!isGeeLarkConfigured()) {
      res.status(412).json({
        ok: false,
        status: 'NOT_CONFIGURED',
        errorHe: 'לא ניתן לבצע פעולת צ׳אט במכשיר GeeLark — חסרים GEELARK_APP_ID ו-GEELARK_API_KEY בסביבה.',
      });
      return;
    }
    const probe = await probeGeeLarkDevices();
    if (!probe.connected || probe.devices.length === 0) {
      res.status(412).json({
        ok: false,
        status: 'NO_ACTIVE_DEVICE',
        errorHe: probe.errorHe || 'אין מכשיר GeeLark פעיל מחובר כרגע.',
      });
      return;
    }
    const targetDevice = probe.devices.find((d) => d.id === deviceId) || probe.devices[0];
    res.status(501).json({
      ok: false,
      status: 'DEVICE_FOUND_NO_ADB_AUTOMATION',
      device: targetDevice,
      errorHe: `נמצא מכשיר GeeLark (${targetDevice.serialName}), אך משימת הקלדת הצ׳אט האוטומטית בטיקטוק טרם הוגדרה לפרופיל זה.`,
    });
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
    const executeToGeeLark = Boolean(req.body?.executeToGeeLark);

    const idx = battleState.aiDecisions.findIndex((d) => d.id === decisionId);
    if (idx < 0) {
      res.status(404).json({ ok: false, errorHe: 'החלטה לא נמצאה בתור ההחלטות' });
      return;
    }

    const decision = battleState.aiDecisions[idx];
    if (action === 'REJECT') {
      const tr = applyApprovalTransition(decision, 'REJECT', actor, Date.now());
      if (!tr.ok) {
        res.status(409).json({ ok: false, errorHe: tr.errorHe });
        return;
      }
      battleState.aiDecisions[idx] = tr.updated;
      broadcast({ type: 'ai:decision', decision: tr.updated, state: battleState });
      res.json({ ok: true, decision: tr.updated, state: battleState });
      return;
    }

    if ((decision.approvalStatus || 'AUTO_EXECUTED') !== 'PENDING_APPROVAL') {
      res.status(409).json({
        ok: false,
        errorHe: `לא ניתן לאשר החלטה בסטטוס ${decision.approvalStatus}`,
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

    let geelarkNote = '';
    if (executeToGeeLark) {
      geelarkNote = isGeeLarkConfigured()
        ? ' · גשר GeeLark זמין'
        : ' · GeeLark לא מוגדר (בוצע בבמת BOOSTERA בלבד)';
    }

    const tr = applyApprovalTransition(decision, 'APPROVE', actor, Date.now(), {
      ok: true,
      detailHe: `בוצע על מנוע הבמה של BOOSTERA: ${executedParts.join(' · ')}${geelarkNote}`,
      evidence: evidenceParts.join(' '),
      resultDetailHe: `הפעולה הופעלה ונקלטה ב-battleState ושודרה ל-${wss.clients.size} לקוחות מחוברים`,
    });

    battleState.aiDecisions[idx] = tr.updated;
    pushLog({
      eventType: 'AI_DECISION_APPROVED',
      userLabel: actor,
      triggeredEffectId: payload.vfxId || null,
      status: 'TRIGGERED',
      detailHe: `אושר ובוצע: ${executedParts.join(' · ')}`,
    });
    broadcast({ type: 'ai:decision', decision: tr.updated, state: battleState });
    res.json({ ok: true, decision: tr.updated, state: battleState });
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
      if (battleState.aiAutopilot && battleState.streamMode === 'BATTLE') {
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
        rule.active = !rule.active;
        battleState.memorySummary = buildMemorySummary();
        saveMemory(aiMemory);
      }
    } else if (action === 'toggle_discovered_tool' && typeof toolId === 'string') {
      const tool = aiMemory.discoveredTools.find((t) => t.id === toolId);
      if (tool) {
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
      } else {
        battleState.isRunning = true;
        if (battleState.aiAutopilot) {
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

      const newRule: SetupEnergyRule = {
        id: nextId('rule'),
        titleHe: getField('RULE_TITLE_HE', `דפוס אנרגיה שנלמד מ-@${targetUsername}`),
        sourceLabelHe: `מעקב יוצר @${targetUsername}`,
        triggerConditionHe: getField('RULE_TRIGGER_HE', 'בזמן בניית מומנטום קהל או קרב צמוד'),
        aiActionDirectiveEn: getField(
          'RULE_DIRECTIVE_EN',
          'Trigger BASS_PUMP camera and peripheral tap stimulus when crowd momentum starts rising.'
        ),
        active: true,
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
        autoEnabled: true,
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
        active: true,
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
        triggerConditionHe: parsed.newDiscoveredTool.triggerConditionHe || 'מופעל אוטומטית ע״י הטייס בזמן אמת',
        autoEnabled: true,
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
      if (battleState.recentChatMessages.length > 24) battleState.recentChatMessages.length = 24;

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

  // Execute a Learned Creator Playbook, Energy Rule, AI-Discovered Tool, OR Learning Vault Material onto the live 9:16 Stage & OBS!
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

      const appliedActionsHe = [
        `VFX: ${opts.vfxId}`,
        `מצלמה: ${opts.cam}`,
        `סאונד: ${opts.snd}`,
        ...(opts.mus ? [`מוזיקה: ${opts.mus}`] : []),
        `גירוי טאפ: "${opts.callout}"`,
      ];

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
      tool.usageCount = (tool.usageCount || 0) + 1;
      tool.autoEnabled = true;
      fireComboOnStage({
        vfxId: tool.recommendedVfxId,
        cam: tool.recommendedCamera,
        snd: tool.recommendedSoundId,
        mus: tool.recommendedMusicId,
        callout: tool.recommendedTapCallout,
        sourceTagHe: `כלי AI: ${tool.nameHe}`,
        summaryHe: `הופעל הכלי שה-AI פיתח "${tool.nameHe}" (${tool.sourceLabelHe})!`,
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
      const fallback = inferStageComboFromText(`${rule.titleHe} ${rule.aiActionDirectiveEn}`, rule.id);
      rule.appliedTimesCount = (rule.appliedTimesCount || 0) + 1;
      rule.active = true;
      fireComboOnStage({
        vfxId: rule.recommendedVfxId || fallback.recommendedVfxId,
        cam: rule.recommendedCamera || fallback.recommendedCamera,
        snd: rule.recommendedSoundId || fallback.recommendedSoundId,
        callout: rule.recommendedTapCallout || fallback.recommendedTapCallout,
        sourceTagHe: `ניצול חוק: ${rule.titleHe}`,
        summaryHe: `הופעל על הבמה החוק שנלמד "${rule.titleHe}" (${rule.sourceLabelHe})!`,
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

      const newRule: SetupEnergyRule = {
        id: nextId('vault_rule'),
        titleHe: result.newEnergyRule.titleHe,
        sourceLabelHe: `תיקיית למידה: ${cleanOriginalName}`,
        triggerConditionHe: result.newEnergyRule.triggerConditionHe,
        aiActionDirectiveEn: result.newEnergyRule.aiActionDirectiveEn,
        active: true,
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
        autoEnabled: true,
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
        aiMemory.energyRules.unshift({
          id: nextId('web_rule'),
          titleHe: `תובנת אנרגיה מרשת (${topic.slice(0, 24)})`,
          sourceLabelHe: 'מחקר סרטוני לייב ברשת',
          triggerConditionHe: 'מופעל אוטומטית ע״י במאי ה-AI בזמן אמת',
          aiActionDirectiveEn: dirMatch[1].trim(),
          active: true,
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

      // Automatically implant the learned setup technique into AI Persistent Memory!
      if (parsed.learnedRuleTitleHe && parsed.learnedRuleDirectiveEn) {
        aiMemory.energyRules.unshift({
          id: nextId('setup_vid'),
          titleHe: parsed.learnedRuleTitleHe,
          sourceLabelHe: `ניתוח וידאו סאטפ (${fileName || 'קובץ מקומי'})`,
          triggerConditionHe: parsed.learnedRuleTriggerHe || 'מופעל אוטומטית ברגעי מפתח בשידור',
          aiActionDirectiveEn: parsed.learnedRuleDirectiveEn,
          active: true,
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
  // 6. MULTIMODAL AUTONOMOUS AI SHOWRUNNER (Audio + Chat + Camera + Tap + Memory)
  // ============================================================================
  app.post('/api/ai-director/decide', async (req, res) => {
    const { audioBase64, audioMimeType, micMetrics, availableCustomTracks, directorPromptHe, requireApproval } =
      req.body || {};
    const needsApproval =
      typeof requireApproval === 'boolean'
        ? requireApproval
        : battleState.approvalMode === 'REQUIRE_APPROVAL';

    const activeMemoryDirectives = aiMemory.energyRules
      .filter((r) => r.active)
      .slice(0, 7)
      .map((r) => `- ${r.titleHe}: ${r.aiActionDirectiveEn}`)
      .join('\n');

    const activeOpponentDossier = battleState.tiktokRoom.activeOpponentUsername
      ? aiMemory.learnedCreators.find(
          (c) => c.username.toLowerCase() === battleState.tiktokRoom.activeOpponentUsername?.toLowerCase()
        )
      : null;

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
      topPerformingCuesFromMemory: aiMemory.cueStats.slice(0, 4),
      opponentIntelDossier: activeOpponentDossier || null,
      explicitHostNoteHe: directorPromptHe || null,
    };

    const telemetryJson = JSON.stringify(liveTelemetry, null, 2);
    const openAiStage = await callOpenAiAdvisor(telemetryJson);
    const claudeStage = await callClaudeAdvisor(telemetryJson, openAiStage.summaryHe);
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());

    try {
      const ai = getGeminiClient();
      const advisorContext = [
        openAiStage.ok ? `OpenAI Telemetry Advisor: ${openAiStage.summaryHe}` : null,
        claudeStage.ok ? `Claude Safety/Tactical Verifier: ${claudeStage.summaryHe}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const systemPrompt = `You are BOOSTERA's Apex-Capability Live Showrunner, Kinetic Camera Director & Audience Hypnosis AI for TikTok LIVE.
You control EVERYTHING in real time:
1. Music Deck (8 studio tracks + custom tracks) & Voice Balance
2. Cinema & Competitive Sound Cues (Snipes, Gloves, Heartbeat, Braam, Wakeup, Crowd Cheer, Tactile Tap-Dopamine Pulse)
3. 14 Dual-Layer 9:16 Visual Effects (BACK & FRONT)
4. Virtual Kinetic Camera & Screen Shakes ('triggerCameraMove': ZOOM_PUNCH, EARTHQUAKE_SHAKE, BASS_PUMP, DUTCH_WHIP, SNIPE_CREEP, VACUUM_DROP)
5. Finger-Tap Dopamine Stimulus ('triggerTapStimulus': outer-edge tactile pacemaker rings + combo callout when likesPerSecond slows down or during Glove/Snipe!)
6. Long-Term Self-Learning Memory ('saveLearnedRule' when discovering a strong new pattern).

LEARNED MEMORY DIRECTIVES CURRENTLY ACTIVE:
${activeMemoryDirectives}
${advisorContext ? `\nMULTI-MODEL ADVISOR NOTES:\n${advisorContext}` : ''}

Always call 'assessLiveMood' first with a sharp Hebrew insight, and coordinate Camera + Sound + Tap-Stimulus + Music/VFX intelligently without overloading!

Live Broadcast Snapshot JSON:
${telemetryJson}`;

      const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
      if (audioBase64 && typeof audioBase64 === 'string' && audioBase64.length > 64) {
        parts.push({
          inlineData: {
            mimeType: audioMimeType || 'audio/webm',
            data: audioBase64,
          },
        });
      }
      parts.push({ text: systemPrompt });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [{ functionDeclarations: AI_DIRECTOR_TOOLS }],
        },
      });

      const calls = response.functionCalls || [];
      let detectedSituationHe =
        battleState.streamMode === 'SOLO'
          ? 'האזנה לשידור הסולו — שמירה על זרימה חיה ומיקוד במגיש.'
          : 'מעקב חי אחר קצב הקרב, הקומבו, המצלמה והצ׳אט.';
      let tensionScore = battleState.aiTensionScore;
      let energyScore = battleState.aiEnergyScore;
      const actionsTakenHe: string[] = [];
      let chosenMusic: string | null = null;
      let chosenSound: string | null = null;
      let chosenVfx: string | null = null;
      const plannedPayload: PlannedExecutionPayload = {};

      const customIds = new Set(
        Array.isArray(availableCustomTracks)
          ? availableCustomTracks.map((t: { id?: string }) => String(t.id || ''))
          : []
      );

      for (const call of calls) {
        const args = (call.args || {}) as Record<string, unknown>;
        if (call.name === 'assessLiveMood') {
          if (typeof args.situationSummaryHe === 'string' && args.situationSummaryHe.trim()) {
            detectedSituationHe = args.situationSummaryHe.trim();
          }
          if (typeof args.tensionScore === 'number') {
            tensionScore = Math.max(0, Math.min(100, Math.round(args.tensionScore)));
          }
          if (typeof args.energyScore === 'number') {
            energyScore = Math.max(0, Math.min(100, Math.round(args.energyScore)));
          }
          if (!needsApproval) {
            aiMoodBias = { tension: tensionScore, energy: energyScore, updatedAt: Date.now() };
            battleState.aiTensionScore = tensionScore;
            battleState.aiEnergyScore = energyScore;
          }
        } else if (call.name === 'selectMusicTrack') {
          const trackId = String(args.trackId || '');
          const reasonHe = String(args.reasonHe || 'התאמת מוזיקה');
          if ((VALID_MUSIC_IDS.has(trackId) || customIds.has(trackId)) && trackId !== battleState.activeMusicTrackId) {
            chosenMusic = trackId;
            plannedPayload.musicTrackId = trackId;
            actionsTakenHe.push(`מוזיקה: ${trackId}`);
            if (!needsApproval) {
              emitMusicChange(trackId, undefined, `במאי AI החליף מוזיקה: ${reasonHe}`);
            }
          }
        } else if (call.name === 'triggerSoundCue') {
          const soundId = String(args.soundId || '');
          const reasonHe = String(args.reasonHe || 'חיזוק סאונד');
          if (VALID_SOUND_IDS.has(soundId)) {
            chosenSound = soundId;
            plannedPayload.soundCueId = soundId;
            actionsTakenHe.push(`סאונד: ${soundId} (${reasonHe})`);
            if (!needsApproval) {
              emitSoundCue(soundId, `במאי AI הפעיל סאונד ${soundId}: ${reasonHe}`);
            }
          }
        } else if (call.name === 'triggerVisualEffect') {
          const effectId = String(args.effectId || '');
          if (EFFECT_RULES[effectId]) {
            chosenVfx = effectId;
            plannedPayload.vfxId = effectId;
            actionsTakenHe.push(`VFX: ${effectId}`);
            if (!needsApproval) {
              const vfx = tryTriggerOneShot(effectId, 'במאי AI חכם', 1.0, true);
              if (vfx.triggered && vfx.instance) {
                broadcast({ type: 'effect:triggered', effect: vfx.instance, state: battleState });
              }
            }
          }
        } else if (call.name === 'triggerCameraMove') {
          const presetRaw = String(args.preset || 'ZOOM_PUNCH') as CameraPresetId;
          const preset = VALID_CAMERA_PRESETS.has(presetRaw) ? presetRaw : 'ZOOM_PUNCH';
          const intensity = Number(args.intensity) || 1.0;
          const durationMs = Number(args.durationMs) || 1500;
          const reasonHe = String(args.reasonHe || 'תנועת מצלמה');
          plannedPayload.cameraPreset = preset;
          plannedPayload.cameraReasonHe = reasonHe;
          actionsTakenHe.push(`מצלמה: ${preset} (${reasonHe})`);
          if (!needsApproval) {
            triggerCameraKinetic(preset, intensity, durationMs, reasonHe);
          }
        } else if (call.name === 'triggerTapStimulus') {
          const callout = String(args.calloutTextHe || 'DOUBLE TAP NOW!');
          const dur = Number(args.durationSec) || 8;
          const reasonHe = String(args.reasonHe || 'גירוי לחיצות אצבע');
          plannedPayload.tapCalloutTextHe = callout;
          plannedPayload.tapDurationSec = dur;
          actionsTakenHe.push(`גירוי אצבע: "${callout}" (${reasonHe})`);
          if (!needsApproval) {
            activateTapStimulus(dur, callout);
            emitSoundCue('SND_TAP_DOPAMINE_PULSE');
          }
        } else if (call.name === 'setMixBalance') {
          const vol = Number(args.musicVolumePct);
          if (!Number.isNaN(vol)) {
            if (!needsApproval) {
              emitMusicChange(battleState.activeMusicTrackId, vol);
            }
            actionsTakenHe.push(`עוצמת מוזיקה: ${Math.round(vol)}%`);
          }
        } else if (call.name === 'saveLearnedRule') {
          const titleHe = String(args.titleHe || '').trim();
          const directive = String(args.aiActionDirectiveEn || '').trim();
          if (titleHe && directive) {
            const combo = inferStageComboFromText(`${titleHe} ${directive}`, 'live');
            aiMemory.energyRules.unshift({
              id: nextId('learned'),
              titleHe,
              sourceLabelHe: 'למידה עצמית בזמן שידור',
              triggerConditionHe: String(args.triggerConditionHe || 'זיהוי בזמן אמת'),
              aiActionDirectiveEn: directive,
              active: true,
              effectivenessScore: 90,
              recommendedVfxId: combo.recommendedVfxId,
              recommendedCamera: combo.recommendedCamera,
              recommendedSoundId: combo.recommendedSoundId,
              recommendedTapCallout: combo.recommendedTapCallout,
              appliedTimesCount: 0,
            });
            battleState.memorySummary = buildMemorySummary();
            saveMemory(aiMemory);
            actionsTakenHe.push(`נשמר חוק בזיכרון: ${titleHe}`);
          }
        } else if (call.name === 'proposeNewStageTool') {
          const nameHe = String(args.nameHe || '').trim();
          if (nameHe) {
            const combo = inferStageComboFromText(`${nameHe} ${String(args.howItWorksHe || '')}`, 'tool');
            aiMemory.discoveredTools.unshift({
              id: nextId('live_tool'),
              nameHe,
              sourceLabelHe: 'פותח אוטונומית בזמן שידור חי',
              whyNeededHe: String(args.whyNeededHe || 'זוהה צורך בכלי במה נוסף מתוך דינמיקת השידור'),
              howItWorksHe: String(args.howItWorksHe || 'משלב אפקט, מצלמה וגירוי דאבל-טאפ'),
              triggerConditionHe: String(args.triggerConditionHe || 'מופעל אוטומטית ע״י הטייס'),
              autoEnabled: true,
              recommendedVfxId: combo.recommendedVfxId,
              recommendedCamera: combo.recommendedCamera,
              recommendedSoundId: combo.recommendedSoundId,
              recommendedMusicId: combo.recommendedMusicId,
              recommendedTapCallout: combo.recommendedTapCallout,
              usageCount: 0,
              createdAtTs: Date.now(),
            });
            if (aiMemory.discoveredTools.length > 22) aiMemory.discoveredTools.length = 22;
            battleState.memorySummary = buildMemorySummary();
            saveMemory(aiMemory);
            actionsTakenHe.push(`פותח כלי חדש: ${nameHe}`);
          }
        }
      }

      if (actionsTakenHe.length === 0) {
        plannedPayload.tapCalloutTextHe = 'DOUBLE TAP BOOST!';
        plannedPayload.tapDurationSec = 7;
        actionsTakenHe.push('שמירת קצב וגירוי דאבל-טאפ ממוקד');
      }

      const nowTs = Date.now();
      const approvalStatus: DecisionApprovalStatus = needsApproval ? 'PENDING_APPROVAL' : 'AUTO_EXECUTED';
      const decidedBy = openAiStage.ok || claudeStage.ok ? 'OPENAI_CLAUDE_GEMINI' : 'GEMINI';
      const pipelineTrace = buildPipelineTrace({
        nowTs,
        liveConnected: battleState.tiktokRoom.connected,
        liveTargetUsername: battleState.tiktokRoom.targetUsername,
        liveRoomId: battleState.tiktokRoom.roomId,
        liveViewerCount: battleState.tiktokRoom.viewerCount,
        packetsCaptured: battleState.wsSniffer.totalPacketsCaptured,
        dataSummaryHe: `מצב ${battleState.streamMode} · שלב ${battleState.phase} · ניקוד ${battleState.myScore}:${battleState.opponentScore} · קצב ${battleState.likesPerSecond}/שנ׳`,
        openai: openAiStage,
        claude: claudeStage,
        gemini: {
          configured: geminiConfigured,
          called: true,
          ok: true,
          model: 'gemini-4-hydrogen',
          summaryHe: detectedSituationHe,
          timestamp: nowTs,
        },
        decisionSummaryHe: actionsTakenHe.join(' · '),
        approvalMode: needsApproval ? 'REQUIRE_APPROVAL' : 'AUTO_EXECUTE',
        approvalStatus,
        executionDetailHe: needsApproval
          ? 'ממתין לאישור מפעיל'
          : `בוצע ישירות על מנוע הבמה (${actionsTakenHe.join(' · ')})`,
        executionEvidence: [
          chosenVfx ? `vfx=${chosenVfx}` : '',
          chosenSound ? `sound=${chosenSound}` : '',
          chosenMusic ? `music=${chosenMusic}` : '',
          plannedPayload.cameraPreset ? `camera=${plannedPayload.cameraPreset}` : '',
        ]
          .filter(Boolean)
          .join(' '),
        resultDetailHe: `התוצאה עודכנה ב-battleState ושודרה ל-${wss.clients.size} לקוחות מחוברים`,
      });

      const decision = recordAiDecision({
        streamMode: battleState.streamMode,
        detectedSituationHe,
        tensionScore,
        energyScore,
        actionsTakenHe,
        musicTrackId: chosenMusic,
        soundCueId: chosenSound,
        vfxId: chosenVfx,
        approvalStatus,
        decidedBy,
        plannedPayload,
        pipelineTrace,
      });

      broadcast({ type: 'ai:decision', decision, state: battleState });
      res.json({ ok: true, decision, state: battleState });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'שגיאת מנוע AI';
      const nowTs = Date.now();
      const approvalStatus: DecisionApprovalStatus = needsApproval ? 'PENDING_APPROVAL' : 'AUTO_EXECUTED';
      const plannedPayload: PlannedExecutionPayload = {
        cameraPreset: 'BASS_PUMP',
        cameraReasonHe: 'שמירת קצב אוטומטית',
        tapCalloutTextHe: 'TAP-TAP BOOST!',
        tapDurationSec: 8,
      };
      if (!needsApproval) {
        activateTapStimulus(8, 'TAP-TAP BOOST!');
        triggerCameraKinetic('BASS_PUMP', 0.95, 2000, 'שמירת קצב אוטומטית');
      }

      const pipelineTrace = buildPipelineTrace({
        nowTs,
        liveConnected: battleState.tiktokRoom.connected,
        liveTargetUsername: battleState.tiktokRoom.targetUsername,
        liveRoomId: battleState.tiktokRoom.roomId,
        liveViewerCount: battleState.tiktokRoom.viewerCount,
        packetsCaptured: battleState.wsSniffer.totalPacketsCaptured,
        dataSummaryHe: `מצב ${battleState.streamMode} · ניקוד ${battleState.myScore}:${battleState.opponentScore}`,
        openai: openAiStage,
        claude: claudeStage,
        gemini: {
          configured: geminiConfigured,
          called: true,
          ok: false,
          model: 'gemini-4-hydrogen',
          summaryHe: '',
          errorHe: errMsg,
          timestamp: nowTs,
        },
        decisionSummaryHe: 'מסלול גיבוי דטרמיניסטי: גירוי אצבע (TAP-TAP BOOST!) + פעימת מצלמה BASS_PUMP',
        approvalMode: needsApproval ? 'REQUIRE_APPROVAL' : 'AUTO_EXECUTE',
        approvalStatus,
        executionDetailHe: needsApproval ? 'ממתין לאישור מפעיל' : 'בוצע במסלול גיבוי על הבמה המקומית',
        executionEvidence: 'camera=BASS_PUMP tap=TAP-TAP_BOOST',
        resultDetailHe: 'סטייט עודכן במנוע הבמה',
      });

      const decision = recordAiDecision({
        streamMode: battleState.streamMode,
        detectedSituationHe: 'הופעל גירוי טאפ ופעימת מצלמה לשמירת אנרגיית הצופים (מסלול גיבוי).',
        tensionScore: battleState.aiTensionScore,
        energyScore: battleState.aiEnergyScore,
        actionsTakenHe: ['גירוי אצבע (TAP-TAP BOOST!) + פעימת מצלמה BASS_PUMP'],
        approvalStatus,
        decidedBy: 'DETERMINISTIC',
        plannedPayload,
        pipelineTrace,
      });
      broadcast({ type: 'ai:decision', decision, state: battleState });
      res.json({ ok: true, decision, fallbackUsed: true, note: errMsg, state: battleState });
    }
  });

  // ============================================================================
  // 6B. PERMANENT ALWAYS-ON SERVER-SIDE AUTONOMOUS AI MOOD SHOWRUNNER LOOP (24/7)
  // ============================================================================
  // Runs continuously whenever aiAutopilot is ON — even when no browser mic is open
  // or when streaming purely via OBS / TikTok LIVE Studio!
  let autonomousDirectorCycleIdx = 0;
  let autonomousGeminiBusy = false;

  setInterval(() => {
    if (!battleState.aiAutopilot || battleState.approvalMode === 'REQUIRE_APPROVAL') return;
    // Do not interrupt Intentional Quiet Valleys except in Snipe Window or Glove x5
    const sec = battleState.elapsedSec;
    const inQuietValley =
      battleState.streamMode === 'BATTLE' &&
      battleState.gloveRemainingSec <= 0 &&
      ((sec >= 42 && sec <= 54) || (sec >= 104 && sec <= 114) || (sec >= 165 && sec <= 174));
    if (inQuietValley) return;

    autonomousDirectorCycleIdx += 1;
    const mood = battleState.aiMoodProfile;
    const isSolo = battleState.streamMode === 'SOLO';
    const scoreGap = battleState.myScore - battleState.opponentScore;
    const tightScore = Math.abs(scoreGap) <= 1200;

    // Every 2nd cycle (~28s), if Gemini is idle, let Gemini Showrunner evaluate live mood & memory rules;
    // on alternating cycles (or as instant choreography), execute deterministic mood-smart showrunning!
    if (
      autonomousDirectorCycleIdx % 2 === 0 &&
      !autonomousGeminiBusy &&
      process.env.GEMINI_API_KEY
    ) {
      autonomousGeminiBusy = true;
      const ai = getGeminiClient();
      const quickSnapshot = {
        aiMoodProfile: mood,
        streamMode: battleState.streamMode,
        phase: battleState.phase,
        elapsedSec: battleState.elapsedSec,
        myScore: battleState.myScore,
        opponentScore: battleState.opponentScore,
        gloveRemainingSec: battleState.gloveRemainingSec,
        snipeWindowActive: battleState.snipeWindowActive,
        likesPerSecond: battleState.likesPerSecond,
        likeComboCount: battleState.likeComboCount,
        activeMusicTrackId: battleState.activeMusicTrackId,
        recentChat: battleState.recentChatMessages.slice(0, 4),
      };

      void ai.models
        .generateContent({
          model: 'gemini-4-hydrogen',
          contents: `You are BOOSTERA's Permanent Autonomous AI Live Showrunner running in mode "${mood}".
Current live room state: ${JSON.stringify(quickSnapshot)}
Call 'assessLiveMood' and pick 1-2 fitting actions (preferring our 7 real studio video VFX: VID_01_FIREBALL_SNIPE_BLAST, VID_02_CRYO_CO2_CANNONS, VID_03_TWIN_LIGHTNING_ARCS, VID_04_COLD_SPARK_FOUNTAINS, VID_05_PK_FACTION_SMOKE_CLASH, VID_06_PLASMA_SPARK_SURGE, VID_07_QUAD_PYRO_FLAME_JETS, plus camera/tap/music/sound) matching the mood!`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            tools: [{ functionDeclarations: AI_DIRECTOR_TOOLS }],
          },
        })
        .then((resp) => {
          const calls = resp.functionCalls || [];
          let situationHe = `טייס אוטומטי (${mood}) מנתח את קצב החדר ומנהל את השידור החי.`;
          let tScore = battleState.aiTensionScore;
          let eScore = battleState.aiEnergyScore;
          const actionsHe: string[] = [];
          let vfxChosen: string | null = null;
          let sndChosen: string | null = null;
          let musChosen: string | null = null;

          for (const c of calls) {
            const args = (c.args || {}) as Record<string, unknown>;
            if (c.name === 'assessLiveMood') {
              if (typeof args.situationSummaryHe === 'string' && args.situationSummaryHe.trim()) {
                situationHe = args.situationSummaryHe.trim();
              }
              if (typeof args.tensionScore === 'number') tScore = Math.max(0, Math.min(100, Math.round(args.tensionScore)));
              if (typeof args.energyScore === 'number') eScore = Math.max(0, Math.min(100, Math.round(args.energyScore)));
              aiMoodBias = { tension: tScore, energy: eScore, updatedAt: Date.now() };
            } else if (c.name === 'triggerVisualEffect') {
              const eid = String(args.effectId || '');
              if (EFFECT_RULES[eid]) {
                const r = tryTriggerOneShot(eid, 'טייס AI אוטומטי', 1.0, false);
                if (r.triggered && r.instance) {
                  broadcast({ type: 'effect:triggered', effect: r.instance, state: battleState });
                  vfxChosen = eid;
                  actionsHe.push(`אפקט: ${eid}`);
                }
              }
            } else if (c.name === 'triggerCameraMove') {
              const p = String(args.preset || 'ZOOM_PUNCH') as CameraPresetId;
              if (VALID_CAMERA_PRESETS.has(p)) {
                triggerCameraKinetic(p, Number(args.intensity) || 1.0, Number(args.durationMs) || 1500, String(args.reasonHe || 'בימוי מצלמה אוטונומי'));
                actionsHe.push(`מצלמה: ${p}`);
              }
            } else if (c.name === 'triggerTapStimulus') {
              const txt = String(args.calloutTextHe || 'DOUBLE TAP!');
              activateTapStimulus(Number(args.durationSec) || 8, txt);
              emitSoundCue('SND_TAP_DOPAMINE_PULSE');
              actionsHe.push(`גירוי אצבע: ${txt}`);
            } else if (c.name === 'triggerSoundCue') {
              const sid = String(args.soundId || '');
              if (VALID_SOUND_IDS.has(sid)) {
                emitSoundCue(sid);
                sndChosen = sid;
                actionsHe.push(`סאונד: ${sid}`);
              }
            } else if (c.name === 'selectMusicTrack') {
              const tid = String(args.trackId || '');
              if (VALID_MUSIC_IDS.has(tid) && tid !== battleState.activeMusicTrackId) {
                emitMusicChange(tid);
                musChosen = tid;
                actionsHe.push(`מוזיקה: ${tid}`);
              }
            }
          }

          if (actionsHe.length > 0) {
            const dec = recordAiDecision({
              streamMode: battleState.streamMode,
              detectedSituationHe: situationHe,
              tensionScore: tScore,
              energyScore: eScore,
              actionsTakenHe: actionsHe,
              musicTrackId: musChosen,
              soundCueId: sndChosen,
              vfxId: vfxChosen,
              decidedBy: 'GEMINI',
            });
            broadcast({ type: 'ai:decision', decision: dec, state: battleState });
          }
        })
        .catch(() => {})
        .finally(() => {
          autonomousGeminiBusy = false;
        });
      return;
    }

    // Deterministic Zero-Latency Mood Showrunner Choreography
    let selectedVfx = 'VID_02_CRYO_CO2_CANNONS';
    let selectedCam: CameraPresetId = 'BASS_PUMP';
    let selectedSound: string | null = null;
    let situationHe = '';
    const actionsHe: string[] = [];

    const calib = battleState.countryCalibration;
    const chillLpsThreshold = Math.max(2.5, Number((8 / Math.max(0.7, calib.dynamicSensitivityMult)).toFixed(1)));
    const hypeLpsThreshold = Math.max(4.5, Number((12 / Math.max(0.7, calib.dynamicSensitivityMult)).toFixed(1)));

    if (mood === 'CHILL_HOST' || (mood === 'AUTO_SMART' && isSolo && battleState.likesPerSecond < chillLpsThreshold)) {
      selectedVfx = autonomousDirectorCycleIdx % 2 === 0 ? 'VID_04_COLD_SPARK_FOUNTAINS' : 'SOLO_WARM_LOUNGE';
      selectedCam = 'STEADY_BREATH';
      selectedSound = 'SND_ENERGY_WAKEUP_SWEEP';
      situationHe = `טייס AI קבוע (${calib.code} · אירוח חכם): שומר על זרימה יוקרתית וחמה מותאמת לגודל הקהל.`;
    } else if (mood === 'HYPE_PARTY' || (mood === 'AUTO_SMART' && battleState.likesPerSecond >= hypeLpsThreshold)) {
      const hypePool = [
        'VID_02_CRYO_CO2_CANNONS',
        'VID_04_COLD_SPARK_FOUNTAINS',
        'BEAST_09_SOLAR_TIGER',
        'VID_03_TWIN_LIGHTNING_ARCS',
        'VID_07_QUAD_PYRO_FLAME_JETS',
      ];
      selectedVfx = hypePool[autonomousDirectorCycleIdx % hypePool.length];
      selectedCam = 'ZOOM_PUNCH';
      selectedSound = 'SND_HYPE_STADIUM_CHEER';
      activateTapStimulus(8, 'KEEP TAPPING!');
      situationHe = `טייס AI קבוע (${calib.code} · שיא יחסי לקהל): מזהה קצב גבוה ביחס למדינה ומשגר פירוטכניקה / טיגריס אש + זום-פאנץ׳!`;
      actionsHe.push('גירוי אצבע היקפי פעיל');
    } else if (battleState.gloveRemainingSec > 0) {
      selectedVfx = autonomousDirectorCycleIdx % 2 === 0 ? 'VID_06_PLASMA_SPARK_SURGE' : 'BEAST_09_SOLAR_TIGER';
      selectedCam = 'ZOOM_PUNCH';
      activateTapStimulus(9, 'GLOVE x5 — TAP!');
      situationHe = 'טייס AI קבוע: ממקסם חלון כפפה x5 עם זרמי פלזמה וטיגריס אש שואג!';
    } else if (battleState.snipeWindowActive) {
      selectedVfx = scoreGap < 0 ? 'VID_01_FIREBALL_SNIPE_BLAST' : 'BEAST_10_ROYAL_FIRE_LION';
      selectedCam = 'SNIPE_CREEP';
      selectedSound = 'SND_SNIPE_LOCK';
      activateTapStimulus(9, 'SNIPE WINDOW — TAP!');
      situationHe = 'טייס AI קבוע (חלון סנייפ): דריכות שיא עם אריה אש מלכותי / כדור אש ומיקוד מצלמה דרמטי!';
    } else if (tightScore || mood === 'TACTICAL_PK') {
      const pkPool = ['VID_05_PK_FACTION_SMOKE_CLASH', 'BEAST_08_VIOLET_PHOENIX', 'VID_03_TWIN_LIGHTNING_ARCS'];
      selectedVfx = pkPool[autonomousDirectorCycleIdx % pkPool.length];
      selectedCam = 'DUTCH_WHIP';
      if (battleState.likesPerSecond < chillLpsThreshold) {
        activateTapStimulus(8, 'PUSH THE LEAD — TAP!');
        selectedSound = 'SND_TAP_DOPAMINE_PULSE';
      }
      situationHe = 'טייס AI קבוע (קרב PK צמוד): משלב עשן דו-מחנאי, פניקס מהפך סגול וברקים להצתת הקהל!';
    } else {
      selectedVfx = 'VID_02_CRYO_CO2_CANNONS';
      selectedCam = 'BASS_PUMP';
      activateTapStimulus(7, 'DOUBLE TAP BOOST!');
      situationHe = `טייס AI קבוע (${calib.code}): מרים אנרגיה מותאמת לגודל החדר עם תותחי CO₂ וגירוי דאבל-טאפ.`;
    }

    const vfxOut = tryTriggerOneShot(selectedVfx, 'טייס AI קבוע', 0.95, false);
    if (vfxOut.triggered && vfxOut.instance) {
      broadcast({ type: 'effect:triggered', effect: vfxOut.instance, state: battleState });
      actionsHe.push(`VFX: ${selectedVfx}`);
    }
    if (selectedCam !== 'STEADY_BREATH') {
      triggerCameraKinetic(selectedCam, 0.95, 1400, 'טייס AI קבוע');
      actionsHe.push(`מצלמה: ${selectedCam}`);
    }
    if (selectedSound) {
      emitSoundCue(selectedSound);
      actionsHe.push(`סאונד: ${selectedSound}`);
    }

    if (actionsHe.length > 0) {
      const dec = recordAiDecision({
        streamMode: battleState.streamMode,
        detectedSituationHe: situationHe,
        tensionScore: battleState.aiTensionScore,
        energyScore: battleState.aiEnergyScore,
        actionsTakenHe: actionsHe,
        vfxId: vfxOut.instance?.effectId || null,
        soundCueId: selectedSound,
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
          rec.binding.enabled = Boolean(a.enabled);
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
