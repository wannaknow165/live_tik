import {
  ClaudeInspectionResult,
  DecisionApprovalMode,
  DecisionApprovalStatus,
  IntegrationAuditReport,
  PipelineStageLog,
  PlannedExecutionPayload,
  StructuredDirectorPlan,
} from '../engine/decisionPipeline';

export type VfxLayer = 'BACK' | 'FRONT' | 'HYBRID';
export type PlaybackMode = 'LOOP' | 'STATE_CONTINUOUS' | 'ONE_SHOT' | 'CHOREOGRAPHED';
export type BattlePhaseId = 'IGNITION' | 'MOMENTUM' | 'PRESSURE' | 'TENSION' | 'FINALE';
export type LikeEnergyTier = 'IDLE' | 'SPARK' | 'CHARGING' | 'HYPE' | 'OVERDRIVE';
export type RoundPaletteId = 'molten_gold' | 'cobalt_storm' | 'crimson_forge';
export type StreamMode = 'BATTLE' | 'SOLO';
export type AiMoodProfileId = 'AUTO_SMART' | 'HYPE_PARTY' | 'TACTICAL_PK' | 'CHILL_HOST';

export interface AiMoodProfileSpec {
  id: AiMoodProfileId;
  labelHe: string;
  shortDescHe: string;
}

export const AI_MOOD_PROFILES: AiMoodProfileSpec[] = [
  {
    id: 'AUTO_SMART',
    labelHe: 'אוטומטי חכם (כל המצבים)',
    shortDescHe: 'מזהה לבד מתי יש מתח, שקט, מסיבה, כפפה או סנייפ ומנהל את כל השידור 24/7',
  },
  {
    id: 'HYPE_PARTY',
    labelHe: 'מוד מסיבה והייפ גבוה',
    shortDescHe: 'קצב גבוה, תותחי CO₂, ניצוצות זהב, גירוי דאבל-טאפ וזום-פאנץ׳ אנרגטי',
  },
  {
    id: 'TACTICAL_PK',
    labelHe: 'מוד קרב PK טקטי וסנייפים',
    shortDescHe: 'מיקוד בפער ניקוד, עשן דו-מחנאי, ברקים, וואקום לפני סנייפ וכדורי אש בהכרעה',
  },
  {
    id: 'CHILL_HOST',
    labelHe: 'מוד אירוח ושיחה זורמת',
    shortDescHe: 'מוזיקה חמה, תאורת אולפן רכה והרמות אנרגיה עדינות כשיש שקט בלי להעמיס',
  },
];

export type TikTokTriggerType =
  | 'ambient_always'
  | 'like'
  | 'share'
  | 'follow'
  | 'join'
  | 'chat'
  | 'goal'
  | 'glove_optional'
  | 'snipe_critical'
  | 'solo_ambient'
  | 'phase_tension'
  | 'finale_clock';

export interface MusicTrackSpec {
  id: string;
  titleHe: string;
  titleEn: string;
  bpm: number;
  energyLevel: number; // 1 - 10
  idealMode: 'SOLO' | 'BATTLE' | 'BOTH';
  moodTagHe: string;
  whenAiPicksHe: string;
  synthProfile:
    | 'velvet_lofi'
    | 'warm_house'
    | 'dark_ignition'
    | 'kinetic_drive'
    | 'pressure_trap'
    | 'glove_overclock'
    | 'snipe_clockwork'
    | 'victory_anthem';
  customUrl?: string;
}

export interface StandaloneSoundCue {
  id: string;
  titleHe: string;
  titleEn: string;
  category: 'SNIPE_GLOVE' | 'SCORE_MOMENTUM' | 'SOLO_CROWD' | 'TENSION_RECOVERY';
  durationSec: number;
  whenAiTriggersHe: string;
}

export interface AiDirectorDecision {
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

export const BOOSTERA_MUSIC_TRACKS: MusicTrackSpec[] = [
  {
    id: 'MUS_SOLO_VELVET_LOFI',
    titleHe: 'אולפן לילה רגוע (Velvet Lounge)',
    titleEn: 'Velvet Studio Lounge',
    bpm: 84,
    energyLevel: 2,
    idealMode: 'SOLO',
    moodTagHe: 'חם · אינטימי · שיחה פתוחה',
    whenAiPicksHe: 'כשאתה משדר לבד (ללא קרב), מספר סיפור או עונה בנחת לצ׳אט.',
    synthProfile: 'velvet_lofi',
  },
  {
    id: 'MUS_SOLO_WARM_HOUSE',
    titleHe: 'גרוב אירוח חם (Midnight Groove)',
    titleEn: 'Midnight Deep Groove',
    bpm: 112,
    energyLevel: 5,
    idealMode: 'BOTH',
    moodTagHe: 'זורם · מרים אנרגיה · נעים',
    whenAiPicksHe: 'כשיש ירידת אנרגיה בשידור סולו וצריך להכניס קצב חי בלי להלחיץ, או בפתיחה קלילה.',
    synthProfile: 'warm_house',
  },
  {
    id: 'MUS_BATTLE_IGNITION_PULSE',
    titleHe: 'דופק כניסה לזירה (Arena Ignition)',
    titleEn: 'Dark Arena Ignition',
    bpm: 100,
    energyLevel: 4,
    idealMode: 'BATTLE',
    moodTagHe: 'מסתורי · דרוך · פתיחת קרב',
    whenAiPicksHe: 'בדקה הראשונה של קרב (00:00–00:55) לבניית ציפייה קולנועית.',
    synthProfile: 'dark_ignition',
  },
  {
    id: 'MUS_BATTLE_MOMENTUM_DRIVE',
    titleHe: 'תנופה קצבית (Kinetic Bass Drive)',
    titleEn: 'Kinetic Bass Drive',
    bpm: 122,
    energyLevel: 6,
    idealMode: 'BOTH',
    moodTagHe: 'אנרגטי · סוחף · קהל פעיל',
    whenAiPicksHe: 'כשקצב הלייקים והצ׳אט עולה בדקה השנייה או ברגעי שיא של שידור סולו.',
    synthProfile: 'kinetic_drive',
  },
  {
    id: 'MUS_BATTLE_PRESSURE_TRAP',
    titleHe: 'לחץ תחרותי כבד (Hybrid Trap Pressure)',
    titleEn: 'Heavy Hybrid Pressure',
    bpm: 136,
    energyLevel: 8,
    idealMode: 'BATTLE',
    moodTagHe: 'אגרסיבי מבוקר · קרב צמוד',
    whenAiPicksHe: 'כשהניקוד צמוד או כשאנחנו בפיגור בדקות 2–3 והמגיש דוחף את הקהל.',
    synthProfile: 'pressure_trap',
  },
  {
    id: 'MUS_GLOVE_OVERCLOCK',
    titleHe: 'כפפה פעילה x5! (Glove Overclock)',
    titleEn: 'Glove x5 Overclock',
    bpm: 145,
    energyLevel: 9,
    idealMode: 'BATTLE',
    moodTagHe: 'אדרנלין גבוה · מכפיל 30 שניות',
    whenAiPicksHe: 'מיידית ברגע שמופעלת כפפת בוסט (Glove) לניצול חלון 30 השניות.',
    synthProfile: 'glove_overclock',
  },
  {
    id: 'MUS_SNIPE_TENSION_CLOCK',
    titleHe: 'דריכת סנייפ סיום (Final Snipe Clockwork)',
    titleEn: 'Final Snipe Clockwork',
    bpm: 150,
    energyLevel: 10,
    idealMode: 'BATTLE',
    moodTagHe: 'מתח שיא · שעון מתקתק · הכרעה',
    whenAiPicksHe: 'ב-35 השניות האחרונות של הקרב או כשמזוהה איום סנייפ מצד היריב.',
    synthProfile: 'snipe_clockwork',
  },
  {
    id: 'MUS_VICTORY_EUPHORIA',
    titleHe: 'שחרור וניצחון (Afterglow Anthem)',
    titleEn: 'Afterglow Victory Anthem',
    bpm: 118,
    energyLevel: 7,
    idealMode: 'BOTH',
    moodTagHe: 'חגיגי · מרגש · הודיה לקהל',
    whenAiPicksHe: 'מיד לאחר ניצחון בסנייפ, השלמת יעד גדול או סיום קרב מוצלח.',
    synthProfile: 'victory_anthem',
  },
];

export const STANDALONE_SOUND_CUES: StandaloneSoundCue[] = [
  {
    id: 'SND_SNIPE_LOCK',
    titleHe: 'התראת סנייפ קריטית (Snipe Radar & Sub Drop)',
    titleEn: 'Critical Snipe Lock',
    category: 'SNIPE_GLOVE',
    durationSec: 2.2,
    whenAiTriggersHe: 'בכניסה לחלון הסנייפ (03:40+) או בקפיצת ניקוד פתאומית בשניות ההכרעה.',
  },
  {
    id: 'SND_GLOVE_POWERUP',
    titleHe: 'טעינת כפפה x5 (Glove Turbine Charge)',
    titleEn: 'Glove x5 Power-Up',
    category: 'SNIPE_GLOVE',
    durationSec: 2.6,
    whenAiTriggersHe: 'ברגע הפעלת כפפת קרב שלנו או של היריב להעלאת דריכות מיידית.',
  },
  {
    id: 'SND_LEAD_TAKEN',
    titleHe: 'מהפך יתרון לטובתנו! (Lead Surge Brass)',
    titleEn: 'Lead Taken Cinema Hit',
    category: 'SCORE_MOMENTUM',
    durationSec: 2.0,
    whenAiTriggersHe: 'כשהניקוד שלנו חוצה את ניקוד היריב ועובר להובלה.',
  },
  {
    id: 'SND_LEAD_LOST_TENSION',
    titleHe: 'פיגור בניקוד — קריאת השכמה (Deficit Pulse)',
    titleEn: 'Deficit Tension Sting',
    category: 'SCORE_MOMENTUM',
    durationSec: 1.8,
    whenAiTriggersHe: 'כשהיריב פותח פער וצריך להעיר את הקהל בלייב בלי להישמע פאניקה זולה.',
  },
  {
    id: 'SND_FINAL_10S_HEARTBEAT',
    titleHe: 'דופק 10 שניות אחרונות (Climax Heartbeat)',
    titleEn: 'Final 10s Sub Heartbeat',
    category: 'TENSION_RECOVERY',
    durationSec: 4.0,
    whenAiTriggersHe: 'בשניות הספירה לאחור (03:50–04:00) בקרב צמוד.',
  },
  {
    id: 'SND_ENERGY_WAKEUP_SWEEP',
    titleHe: 'מרים אנרגיה בשקט (Dead-Air Warm Riser)',
    titleEn: 'Subtle Energy Awakener',
    category: 'TENSION_RECOVERY',
    durationSec: 2.8,
    whenAiTriggersHe: 'כשהבמאי מזהה "נפילת מתח" ושקט של מעל 6 שניות בסולו או באמצע קרב.',
  },
  {
    id: 'SND_HYPE_STADIUM_CHEER',
    titleHe: 'גל התלהבות קהל מבוקר (Arena Swell)',
    titleEn: 'Controlled Arena Hype Swell',
    category: 'SOLO_CROWD',
    durationSec: 2.5,
    whenAiTriggersHe: 'כשהמגיש צוחק/מתלהב במיקרופון או כשהצ׳אט מתפוצץ בתגובות חיוביות (גם בסולו!).',
  },
  {
    id: 'SND_CINEMATIC_BRAAM',
    titleHe: 'בראם קולנועי כבד (Dramatic Low Braam)',
    titleEn: 'Cinematic Low Braam',
    category: 'SNIPE_GLOVE',
    durationSec: 2.4,
    whenAiTriggersHe: 'ברגעי שיא דרמטיים, סנייפ מוצלח או הכרזה גדולה של המגיש.',
  },
];

export interface AudioCueSpec {
  cueId: string;
  filename: string;
  conceptHe: string;
  conceptEn: string;
  durationSec: number;
  targetPeakDbfs: number;
  relativeLoudnessLufs: number;
  stereoMovement: string;
  vocalCarveHz: string;
  cooldownMs: number;
  allowOverlap: boolean;
}

export interface VfxAssetSpec {
  id: string;
  order: number;
  filename: string;
  titleHe: string;
  titleEn: string;
  category: 'AMBIENT' | 'REACTIVE_ENERGY' | 'SHARE_IMPACT' | 'SOCIAL_REWARD' | 'ESCALATION' | 'CLIMAX';
  triggerEvent: TikTokTriggerType;
  triggerLabelHe: string;
  triggerThreshold: string;
  optionalManualTrigger: boolean;
  cooldownMs: number;
  priority: number;
  durationSec: number;
  layer: VfxLayer;
  playbackMode: PlaybackMode;
  compositingMethod: 'TRUE_ALPHA_WEBM_VP9' | 'SCREEN_ADDITIVE_BLACK' | 'CHROMA_KEY_00FF00';
  compositingRationaleHe: string;
  simultaneousAllowed: number;
  minPerformanceSpec: string;
  safeZoneBehaviorHe: string;
  centerCrossMs: number;
  reusabilityHe: string;
  directorNotesHe: string;
  audio: AudioCueSpec;
  promptEn: string;
  videoSrc?: string;
  videoFramingMode?: 'SPLIT_EDGES_9X16' | 'IMPACT_LOWER_BACK' | 'UPPER_CREST_BACK';
  cropBottomPct?: number;
  fadeTailSec?: number;
  trimStartSec?: number;
  maskBottomFeatherPct?: number;
  playEmbeddedAudio?: boolean;
  measuredVideoSpecs?: {
    width: number;
    height: number;
    fps: number;
    durationSec: number;
    sizeMb: string;
    rawAspect: string;
  };
  supervisorAuditHe?: {
    identifiedHe: string;
    triggerFitHe: string;
    chromaAlphaVerdictHe: string;
    framingSafeZoneHe: string;
    reusabilityHe: string;
  };
}

export interface CustomUserVideoVfx {
  id: string;
  titleHe: string;
  videoUrl: string;
  layer: VfxLayer;
  framingMode: 'SPLIT_EDGES_9X16' | 'IMPACT_LOWER_BACK' | 'UPPER_CREST_BACK';
  durationSec: number;
  cropBottomPct: number;
  trimStartSec?: number;
  maskBottomFeatherPct?: number;
  playEmbeddedAudio?: boolean;
}


export interface ActiveEffectInstance {
  instanceId: string;
  effectId: string;
  triggeredAt: number;
  durationMs: number;
  layer: VfxLayer;
  intensity: number;
  sourceLabel: string;
}

export interface LiveEventLogItem {
  id: string;
  timestamp: number;
  battleTimeSec: number;
  eventType: string;
  userLabel: string;
  triggeredEffectId: string | null;
  status: 'TRIGGERED' | 'COOLDOWN_SKIPPED' | 'ACCUMULATED' | 'BLOCKED' | 'FAILED';
  detailHe: string;
}

export type CameraPresetId =
  | 'STEADY_BREATH'
  | 'BASS_PUMP'
  | 'ZOOM_PUNCH'
  | 'SNIPE_CREEP'
  | 'EARTHQUAKE_SHAKE'
  | 'DUTCH_WHIP'
  | 'VACUUM_DROP';

export type PresenterGestureId = 'HANDS_UP_HYPE' | 'TAP_CALLOUT_WAVE' | 'LEAN_IN_CLOSE';

export interface CameraKineticEvent {
  id: string;
  preset: CameraPresetId;
  intensity: number; // 0.3 - 1.5
  durationMs: number;
  triggeredAt: number;
  reasonHe: string;
}

export interface LearnedCreatorProfile {
  username: string;
  displayName: string;
  region: string;
  avatarUrl?: string;
  strengthScore: number; // 1 - 100
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

export interface SetupEnergyRule {
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

export interface CueEffectivenessStat {
  cueId: string;
  labelHe: string;
  timesTriggered: number;
  avgLpsBoost: number;
  lastUsedTs: number;
}

export interface WatchedCreatorEntry {
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

export interface SwarmFeedEvent {
  id: string;
  ts: number;
  username: string;
  kind: 'CHAT' | 'GIFT' | 'LIKE_SURGE' | 'BATTLE_PK' | 'GLOVE_CARD' | 'PARTY_ENV' | 'JOIN_SHARE' | 'CAPTION';
  summary: string;
  languageTag?: string;
}

export interface MonitoredLiveRoomSummary {
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
  energyScore: number; // 0 - 100
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

export interface DiscoveredStageTool {
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

export type LearningMaterialKind = 'VIDEO' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'NOTE';

export interface LearningVaultItem {
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

export interface AiMemorySummary {
  totalRoundsAnalyzed: number;
  watchedCreators: WatchedCreatorEntry[];
  learnedCreators: LearnedCreatorProfile[];
  energyRules: SetupEnergyRule[];
  discoveredTools: DiscoveredStageTool[];
  learningVaultItems: LearningVaultItem[];
  cueStats: CueEffectivenessStat[];
}

export interface TikTokLiveRoomStatus {
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
}

export interface ScoutedBattleCreator {
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

export interface StageSupporterAvatar {
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

export interface StageAvatarSpotlight {
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

export type BroadcastCountryCode =
  | 'IL'
  | 'AE'
  | 'EU_UK'
  | 'US'
  | 'TR'
  | 'EG_MENA'
  | 'BR_LATAM'
  | 'AUTO_GLOBAL';

export interface BroadcastCountryCalibrationSpec {
  code: BroadcastCountryCode;
  labelHe: string;
  shortDescHe: string;
  referenceStrongViewers: number;
  joinBatchTrigger: number;
  likeEnergyMult: number;
  comboMilestoneStep: number;
  shareStreakThreshold: number;
  whaleGiftPointsThreshold: number;
}

export const BROADCAST_COUNTRY_CALIBRATIONS: BroadcastCountryCalibrationSpec[] = [
  {
    code: 'IL',
    labelHe: 'ישראל (IL · קהל ממוקד)',
    shortDescHe: 'מכויל לקהל ישראלי (35–150 צופים = שידור חזק): הפעלות מהירות על כל 2 מצטרפים, קומבו x25 ומתנות מ-299 נק׳',
    referenceStrongViewers: 75,
    joinBatchTrigger: 2,
    likeEnergyMult: 2.35,
    comboMilestoneStep: 25,
    shareStreakThreshold: 2,
    whaleGiftPointsThreshold: 299,
  },
  {
    code: 'AE',
    labelHe: 'אמירויות / מפרץ (AE)',
    shortDescHe: 'קהל בינוני עתיר מתנות כבדות: רגישות לייקים גבוהה וספי מתנות מותאמים ללווייתנים',
    referenceStrongViewers: 220,
    joinBatchTrigger: 3,
    likeEnergyMult: 1.55,
    comboMilestoneStep: 35,
    shareStreakThreshold: 2,
    whaleGiftPointsThreshold: 1200,
  },
  {
    code: 'EU_UK',
    labelHe: 'אירופה / בריטניה (EU/UK)',
    shortDescHe: 'קהל אירופי בינוני (200–500 צופים): איזון מדויק בין כניסות צופים, שיתופים וקומבו',
    referenceStrongViewers: 350,
    joinBatchTrigger: 4,
    likeEnergyMult: 1.3,
    comboMilestoneStep: 40,
    shareStreakThreshold: 3,
    whaleGiftPointsThreshold: 750,
  },
  {
    code: 'US',
    labelHe: 'ארה״ב / קנדה (US)',
    shortDescHe: 'שוק רחב (500–1,500 צופים): ספי הפעלה גבוהים יותר למניעת הצפת אפקטים',
    referenceStrongViewers: 900,
    joinBatchTrigger: 7,
    likeEnergyMult: 0.95,
    comboMilestoneStep: 60,
    shareStreakThreshold: 4,
    whaleGiftPointsThreshold: 1000,
  },
  {
    code: 'TR',
    labelHe: 'טורקיה (TR · זירות ענק)',
    shortDescHe: 'זירות PK המוניות (800–3,000+ צופים): סינון רעשי רקע והפעלה בגלי שיא אמיתיים',
    referenceStrongViewers: 1200,
    joinBatchTrigger: 9,
    likeEnergyMult: 0.82,
    comboMilestoneStep: 75,
    shareStreakThreshold: 5,
    whaleGiftPointsThreshold: 1300,
  },
  {
    code: 'EG_MENA',
    labelHe: 'מצרים / ערב (EG · 100M+)',
    shortDescHe: 'חדרי ענק (1,500–8,000+ צופים): נרמול שטף צופים ולייקים גבוה מאוד',
    referenceStrongViewers: 2200,
    joinBatchTrigger: 12,
    likeEnergyMult: 0.65,
    comboMilestoneStep: 90,
    shareStreakThreshold: 6,
    whaleGiftPointsThreshold: 1500,
  },
  {
    code: 'BR_LATAM',
    labelHe: 'ברזיל / לטינו (BR · מגה-קהל)',
    shortDescHe: 'תנועת צופים ושיתופים המונית: ספי כניסה וקומבו רחבים לשמירה על במה נקייה',
    referenceStrongViewers: 2400,
    joinBatchTrigger: 14,
    likeEnergyMult: 0.62,
    comboMilestoneStep: 100,
    shareStreakThreshold: 6,
    whaleGiftPointsThreshold: 1500,
  },
  {
    code: 'AUTO_GLOBAL',
    labelHe: 'אוטומטי אדפטיבי חי',
    shortDescHe: 'מתאים לבד בזמן אמת את ספי ההפעלה לפי שפת החדר וכמות הצופים החיה בפועל!',
    referenceStrongViewers: 160,
    joinBatchTrigger: 3,
    likeEnergyMult: 1.5,
    comboMilestoneStep: 35,
    shareStreakThreshold: 3,
    whaleGiftPointsThreshold: 550,
  },
];

export interface CountryCalibrationTelemetry {
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

export interface OpponentCloudRadarState {
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

export type WsCollectedEventCategory =
  | 'BATTLE_PK'
  | 'CARDS_BOOSTS'
  | 'GIFTS_DIAMONDS'
  | 'CROWD_SOCIAL'
  | 'RANKS_GOALS'
  | 'EXTERNAL_CUSTOM';

export type WsSpecialStageAction =
  | 'NONE'
  | 'CLOUD_XRAY'
  | 'GLOVE_30S'
  | 'SNIPE_WINDOW'
  | 'AVATAR_SPOTLIGHT'
  | 'TAP_BOOST_BANNER';

export type WsTriggerScope = 'MIRRORED_ONLY' | 'ALL_CONNECTED_SOCKETS';

export interface WsEventTriggerBinding {
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

export interface DiscoveredWsEventRecord {
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

export interface RecentCapturedWsPacket {
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

export interface ExternalWsBridgeStatus {
  url: string;
  mode: 'SERVER' | 'BROWSER_LOCAL';
  connected: boolean;
  connecting: boolean;
  messagesReceived: number;
  lastErrorHe: string | null;
  connectedSinceTs: number | null;
}

export interface WsSnifferState {
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

export type CompanionRoleId = 'TACTICAL_SNIPE' | 'VIBE_HYPE' | 'MOD_SHIELD' | 'WELCOME_VIP';

export type ChatMomentType =
  | 'OPENING_WARMUP'
  | 'DEAD_AIR_ICEBREAKER'
  | 'GLOVE_X5_PUSH'
  | 'CLOUD_DEFENSE'
  | 'FINAL_30S_SNIPE'
  | 'VIP_THANK_YOU'
  | 'ANTI_TROLL_SHIELD';

export interface CompanionAccountSlot {
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

export interface LearnedChatModeratorPattern {
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

export interface ChatModerationFlagItem {
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

export interface CompanionDispatchActionItem {
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

export interface ChatCompanionState {
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

export interface AiClientVideoState {
  status: 'IDLE' | 'GENERATING' | 'READY' | 'FAILED';
  sourceImageUrl?: string | null;
  videoUrl?: string | null;
  promptHe?: string | null;
  errorHe?: string | null;
  updatedAt: number;
}

export interface ProviderDiagnosticEntry {
  requestedModel: string;
  actualModel: string | null;
  configured: boolean;
  authOk: boolean;
  modelOk: boolean;
  ok: boolean;
  keyDiagnostic?: {
    present: boolean;
    hadKeyPrefix: boolean;
    hadBearerPrefix: boolean;
    hadQuotes: boolean;
    hasNonAscii: boolean;
    length: number;
  };
  errorHe?: string | null;
}

export interface ProviderDiagnosticsSnapshot {
  checkedAt: number;
  openai: ProviderDiagnosticEntry;
  claude: ProviderDiagnosticEntry;
  gemini: ProviderDiagnosticEntry;
  geelark: {
    configured: boolean;
    connected: boolean;
    devicesCount: number;
    rpaReady: boolean;
    rpaFlowsCount: number;
    errorHe?: string | null;
  };
}

export interface BattleState {
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
  providerDiagnostics?: ProviderDiagnosticsSnapshot | null;
  geelarkDevices?: Array<{ id: string; serialName: string; status: string; envName?: string }>;
  geelarkRpaFlows?: Array<{ id: string; title: string }>;
  geelarkRpaReady?: boolean;
  aiClientVideo?: AiClientVideoState;
  recentChatMessages: { user: string; text: string; ts: number; source?: string; avatarUrl?: string }[];
  aiDecisions: AiDirectorDecision[];
  tiktokRoom: TikTokLiveRoomStatus;
  memorySummary: AiMemorySummary;
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

export interface RoundPaletteSpec {
  id: RoundPaletteId;
  nameHe: string;
  nameEn: string;
  primaryHex: string;
  secondaryHex: string;
  smokeTintRgb: [number, number, number];
  sparkCoreHex: string;
  arcHex: string;
}

export const ROUND_PALETTES: Record<RoundPaletteId, RoundPaletteSpec> = {
  molten_gold: {
    id: 'molten_gold',
    nameHe: 'זהב מותך ובזלת',
    nameEn: 'Molten Gold & Obsidian',
    primaryHex: '#F59E0B',
    secondaryHex: '#FDE68A',
    smokeTintRgb: [148, 163, 184],
    sparkCoreHex: '#FFFBEB',
    arcHex: '#93C5FD',
  },
  cobalt_storm: {
    id: 'cobalt_storm',
    nameHe: 'סופת קובלט ופלטינה',
    nameEn: 'Cobalt Storm & Platinum',
    primaryHex: '#38BDF8',
    secondaryHex: '#E0F2FE',
    smokeTintRgb: [130, 155, 185],
    sparkCoreHex: '#F8FAFC',
    arcHex: '#60A5FA',
  },
  crimson_forge: {
    id: 'crimson_forge',
    nameHe: 'להבת כבשן וטונגסטן',
    nameEn: 'Crimson Forge & Tungsten',
    primaryHex: '#FB7185',
    secondaryHex: '#FDBA74',
    smokeTintRgb: [160, 145, 155],
    sparkCoreHex: '#FFF7ED',
    arcHex: '#FCA5A5',
  },
};

export interface BattlePhaseSpec {
  id: BattlePhaseId;
  index: number;
  nameHe: string;
  nameEn: string;
  startSec: number;
  endSec: number;
  timeRangeLabel: string;
  smokeDensity: number;
  electricalRate: number;
  summaryHe: string;
  directorGoalHe: string;
}

export const BATTLE_PHASES: BattlePhaseSpec[] = [
  {
    id: 'IGNITION',
    index: 1,
    nameHe: 'פתיחה והצתה',
    nameEn: 'Ignition',
    startSec: 0,
    endSec: 55,
    timeRangeLabel: '00:00–00:55',
    smokeDensity: 0.32,
    electricalRate: 0.15,
    summaryHe: 'עשן במה נמוך ורך, תנועה חשמלית זעירה בשוליים, בניית ציפייה מבוקרת.',
    directorGoalHe: 'להכניס את הצופה לאווירת קולנוע בלי להסיח את הדעת מהמגיש בדקת הפתיחה.',
  },
  {
    id: 'MOMENTUM',
    index: 2,
    nameHe: 'תנופה ומעורבות',
    nameEn: 'Momentum',
    startSec: 55,
    endSec: 115,
    timeRangeLabel: '00:55–01:55',
    smokeDensity: 0.48,
    electricalRate: 0.35,
    summaryHe: 'האצת תנועת החלקיקים; קצב הלייקים מתרגם מיד להילת אנרגיה מתפתחת בשולי הפריים.',
    directorGoalHe: 'ליצור משוב מיידי ומוחשי כך שהקהל מבין שלחיצות ושיתופים משנים פיזית את החדר.',
  },
  {
    id: 'PRESSURE',
    index: 3,
    nameHe: 'לחץ והתעצמות',
    nameEn: 'Pressure',
    startSec: 115,
    endSec: 175,
    timeRangeLabel: '01:55–02:55',
    smokeDensity: 0.65,
    electricalRate: 0.6,
    summaryHe: 'סילוני עשן חזקים יותר, ניצוצות מהירים, פריקות חשמל בהירות ומעברי תאורה דרמטיים.',
    directorGoalHe: 'להעלות את המתח התחרותי באמצע הקרב ולהבליט רגעי שיתוף ויעדים קהילתיים.',
  },
  {
    id: 'TENSION',
    index: 4,
    nameHe: 'מתח לקראת שיא',
    nameEn: 'Tension',
    startSec: 175,
    endSec: 225,
    timeRangeLabel: '02:55–03:45',
    smokeDensity: 0.78,
    electricalRate: 0.82,
    summaryHe: 'החשכת שוליים דרמטית, פעימות קצביות בתדר נמוך, גחלים עולות וברקים מבוקרים.',
    directorGoalHe: 'לייצר תחושה שמשהו עצום מתקרב — כולל עצירת נשימה מתוכננת ב-03:38 לפני הפינאלה.',
  },
  {
    id: 'FINALE',
    index: 5,
    nameHe: 'גראנד פינאלה',
    nameEn: 'Finale',
    startSec: 225,
    endSec: 240,
    timeRangeLabel: '03:45–04:00',
    smokeDensity: 0.95,
    electricalRate: 1.0,
    summaryHe: 'קליימקס רב-שכבתי מתוזמן: מזרקות פירוטכניקה, התכנסות פלזמה ואימפקט סיום ב-03:59.',
    directorGoalHe: 'לספק שיא קולנועי בלתי נשכח ב-15 השניות האחרונות ודעיכה נקייה אל הסיבוב הבא.',
  },
];

export interface LikeTierSpec {
  tier: LikeEnergyTier;
  minEnergy: number;
  maxEnergy: number;
  lpsThreshold: string;
  labelHe: string;
  visualBehaviorHe: string;
}

export const LIKE_ENERGY_TIERS: LikeTierSpec[] = [
  {
    tier: 'IDLE',
    minEnergy: 0,
    maxEnergy: 14,
    lpsThreshold: '0–2 לייקים/שנייה',
    labelHe: 'רגיעה (IDLE)',
    visualBehaviorHe: 'אפס עומס אנרגטי נוסף; רק שכבת האווירה הבסיסית פעילה.',
  },
  {
    tier: 'SPARK',
    minEnergy: 15,
    maxEnergy: 34,
    lpsThreshold: '3–7 לייקים/שנייה',
    labelHe: 'ניצוץ ראשוני (SPARK)',
    visualBehaviorHe: 'גיצים חמים בודדים עולים בפינות התחתונות של המסגרת.',
  },
  {
    tier: 'CHARGING',
    minEnergy: 35,
    maxEnergy: 59,
    lpsThreshold: '8–16 לייקים/שנייה',
    labelHe: 'טעינה (CHARGING)',
    visualBehaviorHe: 'זרמי פלזמה עדינים זוחלים לאורך ה-20% החיצוניים משני צידי המגיש.',
  },
  {
    tier: 'HYPE',
    minEnergy: 60,
    maxEnergy: 84,
    lpsThreshold: '17–30 לייקים/שנייה',
    labelHe: 'התלהטות (HYPE)',
    visualBehaviorHe: 'נחילי גיצים מואצים, תאורת Rim אחורית חמה וקשתות חשמל קצרות בשוליים.',
  },
  {
    tier: 'OVERDRIVE',
    minEnergy: 85,
    maxEnergy: 100,
    lpsThreshold: '31+ לייקים/שנייה',
    labelHe: 'עומס-על קולנועי (OVERDRIVE)',
    visualBehaviorHe: 'שדה אנרגיה היקפי מלא, עמודי להט וולומטריים מאחורי הכתפיים וניצוצות במהירות גבוהה — המרכז נשאר נקי לפני המגיש.',
  },
];

export const BOOSTERA_ASSETS: VfxAssetSpec[] = [
  {
    id: 'AMB_VOLUMETRIC_SMOKE',
    order: 1,
    filename: 'boostera_01_ambient_volumetric_smoke_loop_back.webm',
    titleHe: 'עשן במה וולומטרי רציף (Ambient Loop)',
    titleEn: 'Volumetric Stage Smoke Loop',
    category: 'AMBIENT',
    triggerEvent: 'ambient_always',
    triggerLabelHe: 'פועל ברציפות לאורך כל הקרב (עוצמה משתנה לפי שלב 1–5)',
    triggerThreshold: 'battle_active == true',
    optionalManualTrigger: false,
    cooldownMs: 0,
    priority: 1,
    durationSec: 10,
    layer: 'BACK',
    playbackMode: 'LOOP',
    compositingMethod: 'TRUE_ALPHA_WEBM_VP9',
    compositingRationaleHe:
      'עשן דליל וחצי-שקוף נפגע קשות מחיתוך כרומה ירוק (#00FF00) ויוצר הילה ירקרקה. מומלץ לעבוד עם WebM VP9 בעל ערוץ Alpha אמיתי או רינדור על רקע שחור במיזוג Screen.',
    simultaneousAllowed: 1,
    minPerformanceSpec: 'WebGL2 / Canvas2D 60fps, < 4% GPU load',
    safeZoneBehaviorHe: 'זורם בשליש התחתון ומאחורי כתפי המגיש בלבד; אינו מסתיר פנים לעולם.',
    centerCrossMs: 0,
    reusabilityHe: 'שימוש רב-פעמי מלא כבסיס לכל סיבוב עם שינוי גוון תאורה אוטומטי.',
    directorNotesHe: 'מעניק עומק קולנועי שמפריד את המגיש מהקיר האחורי הקבוע באולפן.',
    audio: {
      cueId: 'SFX_AMB_SUB_AIR',
      filename: 'sfx_01_ambient_room_air_loop.wav',
      conceptHe: 'אווירת חלל נמוכה ועדינה מאוד (45Hz–90Hz) המדמה אולם מופעים חי.',
      conceptEn: 'Subtle low-frequency stage air rumble',
      durationSec: 10,
      targetPeakDbfs: -24,
      relativeLoudnessLufs: -32,
      stereoMovement: 'Wide static stereo image (85% width)',
      vocalCarveHz: 'High-cut above 160Hz — zero interference with speech',
      cooldownMs: 0,
      allowOverlap: true,
    },
    promptEn:
      'Vertical 9:16 locked-off static broadcast camera VFX plate (1080x1920 native 24fps, scalable for compositing; pure pitch-black #000000 background for clean Screen/Luma compositing — do NOT use green screen because translucent smoke absorbs green spill). Realistic low-lying volumetric theatrical dry-ice smoke drifting slowly from bottom-left and bottom-right corners across the lower 30% of the frame and softly rising along the outer 25% side margins. Starting state: faint atmospheric wisps near the bottom frame border. Peak action: rich turbulent fluid curls backlit by subtle tungsten-silver rim light at 5 seconds. Ending state: seamlessly crossfading back to the starting density at 10 seconds for an invisible loop. Keep the central 50% middle-to-upper presenter zone dark and clear. No people, no studio walls, no camera motion, no text, no logos.',
  },
  {
    id: 'LIKE_PROGRESSIVE_CHARGE',
    order: 2,
    filename: 'boostera_02_like_progressive_charge_back.webm',
    titleHe: 'צבירת אנרגיית לייקים מדורגת (Like Charge 5-Tier)',
    titleEn: 'Progressive Like Energy Accumulation',
    category: 'REACTIVE_ENERGY',
    triggerEvent: 'like',
    triggerLabelHe: 'לייקים ורצפי לייקים (מעבר חלק: IDLE → SPARK → CHARGING → HYPE → OVERDRIVE)',
    triggerThreshold: 'likes_per_sec >= 3 (continuous smooth interpolation & decay)',
    optionalManualTrigger: false,
    cooldownMs: 0,
    priority: 4,
    durationSec: 6,
    layer: 'BACK',
    playbackMode: 'STATE_CONTINUOUS',
    compositingMethod: 'SCREEN_ADDITIVE_BLACK',
    compositingRationaleHe:
      'פליטת אור, ניצוצות ופלזמה מתחברים באופן מושלם בשיטת Additive/Screen מעל רקע שחור או Alpha ישיר ב-Browser Source ללא קצוות שבורים.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps real-time particle & filament state machine',
    safeZoneBehaviorHe: 'מוגבל ל-26% השמאליים והימניים של הפריים; בונה מסגרת אנרגטית סביב המגיש.',
    centerCrossMs: 0,
    reusabilityHe: 'ליבת המעורבות המרכזית של הקרב — מגיבה ברציפות לעלייה ולירידה בקצב הקהל.',
    directorNotesHe: 'במקום פיצוץ חוזר על כל לייק, הקהל מרגיש שהוא "טוען כור אנרגיה" חי שדועך אם מפסיקים להקיש.',
    audio: {
      cueId: 'SFX_LIKE_HARMONIC_CHARGE',
      filename: 'sfx_02_like_charge_riser_stem.wav',
      conceptHe: 'תדר הרמוני עולה ונושם שמגיב לעוצמת הטעינה ומתרכך מיד כשהקצב יורד.',
      conceptEn: 'Dynamic rising electromagnetic hum & subtle spark crackle',
      durationSec: 6,
      targetPeakDbfs: -14,
      relativeLoudnessLufs: -22,
      stereoMovement: 'Dual-mono outer left/right shimmer (-0.8 / +0.8 pan)',
      vocalCarveHz: '-6dB parametric dip at 400Hz–3.2kHz',
      cooldownMs: 250,
      allowOverlap: true,
    },
    promptEn:
      'Vertical 9:16 static camera Hollywood VFX plate on a pure pitch-black #000000 background for additive Screen compositing, 6 seconds duration. Progressive kinetic energy accumulation rising strictly along the left 25% and right 25% vertical borders of the frame while keeping the central 50% presenter area completely black and unobstructed. Starting state (0s): subtle warm golden-amber embers lifting gently from the bottom corners. Peak action (3.5s): surging upward ribbons of ionized plasma filaments, hot metallic sparks with realistic aerodynamic drag, and turbulent heat shimmer climbing both vertical edges. Ending state (6s): smooth natural dissipation into glowing micro-embers. Realistic physics acceleration and decay, AAA Unreal Engine Niagara aesthetic, no cartoon glow, no people, no camera shake, no text.',
  },
  {
    id: 'SHARE_CO2_CANNONS',
    order: 3,
    filename: 'boostera_03_share_cryo_co2_cannons_front.webm',
    titleHe: 'תותחי CO₂ קריוגניים בלחץ גבוה (Share Cryo Jets)',
    titleEn: 'Twin Pressurized CO2 Stage Cannons',
    category: 'SHARE_IMPACT',
    triggerEvent: 'share',
    triggerLabelHe: 'שיתוף שידור (Share)',
    triggerThreshold: 'share_event >= 1',
    optionalManualTrigger: false,
    cooldownMs: 3200,
    priority: 7,
    durationSec: 2.8,
    layer: 'FRONT',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'סילון CO₂ לבן ואטום ברובו בולט היטב מול כרומה ירוקה #00FF00 עם Despill, ובמנוע ה-Web שלנו מרונדר ישירות עם ערוץ Alpha נקי ב-60fps.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps high-velocity fluid cone emitter',
    safeZoneBehaviorHe: 'נורה מהפינות התחתונות בזווית 72° לאורך השוליים החיצוניים — ממסגר את המגיש מלפנים בלי לכסות את הפנים.',
    centerCrossMs: 0,
    reusabilityHe: 'גבוהה מאוד — אפקט אנרגטי חד ונקי שנותן תחושת מופע אצטדיון בכל שיתוף.',
    directorNotesHe: 'התפרצות מהירה מאוד (0.15 שניות לשיא) והתפוגגות טבעית לאדים דקים בתוך פחות מ-3 שניות.',
    audio: {
      cueId: 'SFX_CO2_CRYO_BLAST',
      filename: 'sfx_03_co2_cannon_burst.wav',
      conceptHe: 'פריקת אוויר דחוס קצרה וחדה (CO₂ Jet Hiss) עם דעיכת לחץ מהירה.',
      conceptEn: 'Short pressurized cryo air discharge burst',
      durationSec: 2.2,
      targetPeakDbfs: -7,
      relativeLoudnessLufs: -15,
      stereoMovement: 'Simultaneous wide L/R corner blast narrowing slightly upward',
      vocalCarveHz: 'Band-notch -5dB at 1.2kHz–2.8kHz to keep speech intelligible',
      cooldownMs: 3200,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 locked-off camera live-concert VFX asset on a flat evenly lit pure chroma green background (#00FF00) with zero green spill onto the effect, duration 3 seconds. Twin high-pressure cryogenic CO2 stage cannons firing simultaneously from the bottom-left and bottom-right corners sharply upward along the outer 25% margins of the frame, leaving the central 50% presenter face zone unobstructed. Starting state (0.0s): clean #00FF00 frame before valve release. Peak action (0.2s–1.1s): violent supersonic white condensed vapor jets shooting 75% up the left and right edges with realistic turbulent shear vortices. Ending state (1.2s–3.0s): valve shuts cleanly and dense white vapor expands, slows down with air resistance, and evaporates completely back to pure #00FF00. No nozzles or hardware visible, no people, no camera movement.',
  },
  {
    id: 'SHARE_SMOKE_PLUMES',
    order: 4,
    filename: 'boostera_04_share_streak_pyro_plumes_back.webm',
    titleHe: 'עמודי עשן מוארים ברצף שיתופים (Backstage Plumes)',
    titleEn: 'Backlit Vertical Smoke Columns',
    category: 'SHARE_IMPACT',
    triggerEvent: 'share',
    triggerLabelHe: 'רצף שיתופים (3+ שיתופים ב-10 שניות)',
    triggerThreshold: 'shares_in_10s >= 3',
    optionalManualTrigger: false,
    cooldownMs: 5500,
    priority: 6,
    durationSec: 3.5,
    layer: 'BACK',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'TRUE_ALPHA_WEBM_VP9',
    compositingRationaleHe: 'מאפשר ערבוב תאורה אחורית חמה בתוך גוף העשן מאחורי המגיש ללא קצוות כהים או ירוקים.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps volumetric puff advection',
    safeZoneBehaviorHe: 'מתרומם מאחורי המגיש בשכבת BACK ויוצר עומק תלת-ממדי אדיר בלי להסתיר את הדובר.',
    centerCrossMs: 0,
    reusabilityHe: 'וריאציה משלימה לתותחי ה-CO₂ כך שרצף שיתופים לא נראה זהה ומשעמם.',
    directorNotesHe: 'תאורת בסיס חמה מדמה תאורת במה תחתית שמאירה את העשן מבפנים.',
    audio: {
      cueId: 'SFX_PLUME_WHOOSH_SUB',
      filename: 'sfx_04_deep_smoke_plume_whoosh.wav',
      conceptHe: 'נשיפת להט עמוקה ונמוכה (Low Air Whoosh) שמעניקה נפח פיזי לעמודי העשן.',
      conceptEn: 'Deep pneumatic air whoosh with warm low-end body',
      durationSec: 3.0,
      targetPeakDbfs: -9,
      relativeLoudnessLufs: -17,
      stereoMovement: 'Bottom-to-top psychoacoustic filter sweep across wide stereo',
      vocalCarveHz: '-5dB cut at 800Hz–2.5kHz',
      cooldownMs: 5500,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 static broadcast camera VFX element on a pure black #000000 background for Screen/Luma compositing, duration 4 seconds. Two powerful vertical concert smoke columns erupting behind the presenter zone at x=22% and x=78% from the bottom edge, illuminated from underneath by warm amber-tungsten stage uplights. Starting state: dark empty frame. Peak action (0.6s–1.8s): thick billowing dark-gray and amber-lit turbulent smoke plumes surging vertically to the top quarter of the frame while keeping the central 45% face region clear. Ending state (2.0s–4.0s): upward momentum decelerates naturally and plumes disperse softly into thin wisps until black. Realistic fluid vorticity, no cartoon flames, no people, no camera movement.',
  },
  {
    id: 'FOLLOW_GOLDEN_SPARKS',
    order: 5,
    filename: 'boostera_05_follower_golden_sparks_front.webm',
    titleHe: 'מפל ניצוצות זהב מתכתיים (Follower Pyro Shower)',
    titleEn: 'Golden Metallic Pyro SparkBurst',
    category: 'SOCIAL_REWARD',
    triggerEvent: 'follow',
    triggerLabelHe: 'עוקב חדש (New Follower)',
    triggerThreshold: 'new_follower >= 1',
    optionalManualTrigger: false,
    cooldownMs: 2800,
    priority: 6,
    durationSec: 3.6,
    layer: 'FRONT',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'SCREEN_ADDITIVE_BLACK',
    compositingRationaleHe:
      'גיצים דקים עם טשטוש תנועה (Motion Blur) נחתכים רע בכרומה ירוקה; מיזוג Screen על שחור או Alpha ישיר שומר על ברק מתכתי חד ב-100%.',
    simultaneousAllowed: 2,
    minPerformanceSpec: '60fps velocity-stretched ballistic spark solver',
    safeZoneBehaviorHe: 'נפתח בפינות העליונות ונופל כווילון זהב עדין בשוליים הימניים והשמאליים.',
    centerCrossMs: 0,
    reusabilityHe: 'אפקט תגמול אלגנטי ויוקרתי שגורם לעוקבים חדשים להרגיש מוערכים בלי להפוך לקונפטי מצויר.',
    directorNotesHe: 'משתמש בכבידה אמיתית, חיכוך אוויר והתפצלות משנית של גיצי מגנזיום/טיטניום.',
    audio: {
      cueId: 'SFX_GOLD_SPARK_SHIMMER',
      filename: 'sfx_05_golden_pyro_sparks.wav',
      conceptHe: 'פצפוץ פירוטכני מתכתי עדין משולב בצליל הרמוני חם ונקי.',
      conceptEn: 'Refined metallic sparkler crackle with subtle warm harmonic swell',
      durationSec: 3.2,
      targetPeakDbfs: -10,
      relativeLoudnessLufs: -18,
      stereoMovement: 'Gentle cascading stereo pan from upper corners outward',
      vocalCarveHz: 'High-passed shimmer above 3.8kHz + warm 220Hz root, completely clear midrange',
      cooldownMs: 2800,
      allowOverlap: true,
    },
    promptEn:
      'Vertical 9:16 static camera cinematic VFX asset on a pure black #000000 background for additive Screen compositing, duration 4 seconds. Elegant real-world indoor cold-sparkler titanium fountain burst originating from the upper-left and upper-right frame margins and cascading gracefully downward along the outer 25% side corridors. Starting state: clean black frame. Peak action (0.4s–1.6s): brilliant white-hot golden metallic sparks shooting outward and arcing downward under realistic gravity with natural shutter motion-blur trails and tiny secondary micro-crackles, keeping the central 50% presenter face zone completely clear. Ending state (1.7s–4.0s): sparks cool from white-gold to deep amber and extinguish naturally before reaching empty black. Photorealistic concert pyrotechnics, no confetti, no stars, no text.',
  },
  {
    id: 'JOIN_ANAMORPHIC_SWEEP',
    order: 6,
    filename: 'boostera_06_viewer_join_light_reveal_back.webm',
    titleHe: 'מעבר אלומת אור קולנועית (Viewer Wave Light Sweep)',
    titleEn: 'Anamorphic Volumetric Light Reveal',
    category: 'SOCIAL_REWARD',
    triggerEvent: 'join',
    triggerLabelHe: 'גל כניסת צופים / העלאת אנרגיה עדינה בשידור סולו',
    triggerThreshold: 'viewer_joins_batch >= 5',
    optionalManualTrigger: false,
    cooldownMs: 6000,
    priority: 3,
    durationSec: 2.5,
    layer: 'BACK',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'SCREEN_ADDITIVE_BLACK',
    compositingRationaleHe: 'קרני אור וולומטריות חייבות להתמזג בשיטת Additive/Screen או Alpha רך לקבלת מעבר הדרגתי טבעי.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps smooth gradient shader sweep',
    safeZoneBehaviorHe: 'עובר מאחורי המגיש בשכבת BACK בלבד כקרן אור אלכסונית עדינה שמבליטה את קווי המתאר של הכתפיים.',
    centerCrossMs: 0,
    reusabilityHe: 'מעניק תנועת אור יוקרתית בלי להעמיס חלקיקים נוספים על המסך.',
    directorNotesHe: 'משמש את במאי ה-AI גם כשהאנרגיה נמוכה כדי לרענן את הפריים בעדינות.',
    audio: {
      cueId: 'SFX_LIGHT_SWEEP_AIR',
      filename: 'sfx_06_anamorphic_light_sweep.wav',
      conceptHe: 'תנועת אוויר משיית ורכה מאוד מצד שמאל לימין.',
      conceptEn: 'Soft cinematic optical air shimmer L-to-R',
      durationSec: 2.2,
      targetPeakDbfs: -16,
      relativeLoudnessLufs: -24,
      stereoMovement: 'Smooth left-to-right pan (-0.7 to +0.7)',
      vocalCarveHz: '-7dB dip across 350Hz–3.5kHz',
      cooldownMs: 6000,
      allowOverlap: true,
    },
    promptEn:
      'Vertical 9:16 static camera optical VFX plate on a pure black #000000 background for Screen blending, duration 3 seconds. Subtle, refined cinematic volumetric studio spotlight beam sweeping diagonally across the upper-outer background through faint atmospheric haze. Starting state: complete darkness. Peak action (1.2s): soft warm-tungsten and cool-silver anamorphic light shafts illuminating thin dust motes along the outer upper margins while avoiding harsh glare in the center 50% presenter zone. Ending state (3.0s): smooth fade to pure black. Understated luxury broadcast lighting transition, no lens-flare rings, no text, no people.',
  },
  {
    id: 'CHAT_TESLA_FILAMENT',
    order: 7,
    filename: 'boostera_07_chat_perimeter_arc_back.webm',
    titleHe: 'ניצוץ חשמלי היקפי עדין לצ׳אט (Chat Micro-Arc)',
    titleEn: 'Subtle Perimeter Electrical Arc',
    category: 'REACTIVE_ENERGY',
    triggerEvent: 'chat',
    triggerLabelHe: 'אינטראקציית צ׳אט משמעותית / מילות מפתח בקרב',
    triggerThreshold: 'meaningful_chat == true (not every message)',
    optionalManualTrigger: false,
    cooldownMs: 4000,
    priority: 3,
    durationSec: 1.8,
    layer: 'BACK',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'SCREEN_ADDITIVE_BLACK',
    compositingRationaleHe: 'קשתות פלזמה דקות בעובי 1–3 פיקסלים שומרות על חדות מושלמת והילה טבעית במיזוג Screen/Alpha.',
    simultaneousAllowed: 2,
    minPerformanceSpec: '60fps procedural midpoint-displacement arc',
    safeZoneBehaviorHe: 'מטפס לאורך 15% החיצוניים של המסגרת בלבד — תגובה חכמה ומאופקת שלא מפריעה לקריאת הדיבור.',
    centerCrossMs: 0,
    reusabilityHe: 'וריאציה פרוצדורלית בכל הפעלה כך שאף קשת חשמלית אינה זהה לקודמתה.',
    directorNotesHe: 'מוגדר עם Cooldown של 4 שניות וסינון הודעות משמעותיות כדי שהצ׳אט לעולם לא יהפוך להבהוב מציק.',
    audio: {
      cueId: 'SFX_TESLA_SNAP_SUBTLE',
      filename: 'sfx_07_subtle_electrical_snap.wav',
      conceptHe: 'קליק פלזמה קצר, נקי ומרוסן בשוליים הסטריאופוניים.',
      conceptEn: 'Short restrained high-voltage static snap',
      durationSec: 0.9,
      targetPeakDbfs: -15,
      relativeLoudnessLufs: -23,
      stereoMovement: 'Randomized hard left (-0.85) or hard right (+0.85) matching visual side',
      vocalCarveHz: 'Short transient < 120ms, notched at 1.5kHz',
      cooldownMs: 4000,
      allowOverlap: true,
    },
    promptEn:
      'Vertical 9:16 locked-off VFX plate on pure black #000000 background for Screen compositing, duration 2 seconds. A crisp, physically realistic high-voltage blue-white electrical plasma filament briefly crawling upward along only the far-left 12% vertical edge of the frame, accompanied by tiny ionized ozone sparks. Starting state: pure black. Peak action (0.3s–0.9s): sharp branching electrical arc dancing along the outer margin while the entire central 75% of the frame remains untouched black. Ending state (1.0s–2.0s): arc snaps off cleanly with a faint lingering violet afterglow fading to black. Realistic Tesla coil discharge, no cartoon lightning bolts.',
  },
  {
    id: 'GOAL_SHOCKWAVE_RING',
    order: 8,
    filename: 'boostera_08_goal_concussive_shockwave_hybrid.webm',
    titleHe: 'גל הדף אוויר וטבעת אנרגיה (Engagement Goal Shockwave)',
    titleEn: 'Concussive Refractive Shockwave Impact',
    category: 'ESCALATION',
    triggerEvent: 'goal',
    triggerLabelHe: 'השלמת יעד מעורבות או מהפך ניקוד משמעותי',
    triggerThreshold: 'engagement_goal_reached == true',
    optionalManualTrigger: false,
    cooldownMs: 12000,
    priority: 9,
    durationSec: 3.2,
    layer: 'HYBRID',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'TRUE_ALPHA_WEBM_VP9',
    compositingRationaleHe: 'משלב גל הדף מהיר מאוד בשכבת FRONT (חוצה את המרכז בפחות מ-0.25 שניות כטבעת שקופה למחצה) עם התפרצות גיצים בשכבת BACK.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps radial shock ring + debris burst',
    safeZoneBehaviorHe: 'טבעת ההדף השקופה חוצה את המרכז במהירות שיא (240ms) מבלי להסתיר את הפנים, ומתפוגגת אל השוליים.',
    centerCrossMs: 240,
    reusabilityHe: 'שמור לרגעי שיא של השלמת יעדים או מהפך גדול כדי לשמור על תחושת הישג נדירה.',
    directorNotesHe: 'מדגים בדיוק את העיקרון הקולנועי: אפקט גדול יכול לחצות לרגע את הפריים ברגע חשוב מבלי לחסום את המגיש.',
    audio: {
      cueId: 'SFX_SHOCKWAVE_IMPACT',
      filename: 'sfx_08_concussive_shockwave_boom.wav',
      conceptHe: 'אימפקט קולנועי עמוק (Sub-Drop 38Hz + Air Crack) שמרגישים בחזה בלי לכסות את תדרי הקול.',
      conceptEn: 'Deep cinematic air-pressure shockwave impact & metallic tail',
      durationSec: 3.0,
      targetPeakDbfs: -4,
      relativeLoudnessLufs: -13,
      stereoMovement: 'Center sub-impact expanding rapidly to 100% wide stereo tail',
      vocalCarveHz: 'Clean scoop between 300Hz–3kHz so presenter celebration shouts cut right through',
      cooldownMs: 12000,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 static camera Hollywood blockbuster VFX plate on a pure black #000000 background for Screen/Luma compositing, duration 3 seconds. A powerful radial air-pressure shockwave ring expanding rapidly from center-frame outward to the edges in under 0.3 seconds, immediately followed by turbulent golden embers and ionized vapor swirling strictly in the outer 25% perimeter. Starting state: clean black frame with a 2-frame pinpoint flash. Peak action (0.15s–0.8s): crisp supersonic condensation ring and thin refractive heat wave rushing past camera edges, leaving the center 50% completely clear right after the initial 0.25s wave transit. Ending state (0.9s–3.0s): outer perimeter embers decelerate with air drag and fade smoothly to pure black. Photorealistic ordnance shockwave physics, no fireballs blocking center.',
  },
  {
    id: 'PRESSURE_FORKED_LIGHTNING',
    order: 9,
    filename: 'boostera_09_pressure_forked_lightning_back.webm',
    titleHe: 'מכת ברק מתפצלת ברגעי לחץ (Forked Lightning Strike)',
    titleEn: 'High-Tension Atmospheric Lightning Discharge',
    category: 'ESCALATION',
    triggerEvent: 'glove_optional',
    triggerLabelHe: 'שלב הלחץ (Phase 3–4) או מהפך ניקוד בקרב',
    triggerThreshold: 'phase IN [PRESSURE, TENSION] OR lead_change == true',
    optionalManualTrigger: true,
    cooldownMs: 9000,
    priority: 8,
    durationSec: 2.4,
    layer: 'BACK',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'SCREEN_ADDITIVE_BLACK',
    compositingRationaleHe: 'ברק אמיתי מורכב מליבה לבנה בוהקת והילה אטמוספרית רחבה שרק מיזוג Screen או Alpha אמיתי מעבירים בצורה אמינה.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps recursive branching bolt generator',
    safeZoneBehaviorHe: 'מתפצל בשמיים האחוריים ובצידי המגיש בשכבת BACK; יוצר צללית קולנועית דרמטית לשבריר שנייה.',
    centerCrossMs: 0,
    reusabilityHe: 'מותאם גם לטריגר אוטומטי מנתוני קרב אמינים וגם להחלטת במאי ה-AI.',
    directorNotesHe: 'יוצר אימפקט חשמלי חד מאחורי הכתפיים ברגעי מתח גבוהים.',
    audio: {
      cueId: 'SFX_LIGHTNING_THUNDER_CRACK',
      filename: 'sfx_09_lightning_crack_sub_impact.wav',
      conceptHe: 'פיצוח חשמלי חד בחלק העליון של הספקטרום ורעם נמוך מבוקר מתחת ל-90Hz.',
      conceptEn: 'Sharp electrical crack followed by tight cinematic low-frequency thunder',
      durationSec: 2.4,
      targetPeakDbfs: -5,
      relativeLoudnessLufs: -14,
      stereoMovement: 'Overhead wide strike with subtle rolling stereo thunder tail',
      vocalCarveHz: '-6dB carve at 350Hz–2.8kHz',
      cooldownMs: 9000,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 locked-off cinema VFX plate on pure black #000000 background for Screen compositing, duration 3 seconds. Dramatic natural forked lightning bolts striking downward from the top corners along the upper-left and upper-right background, illuminating surrounding dark storm vapor briefly while keeping the central 48% presenter silhouette corridor free of primary bolt trunks. Starting state: dark frame with faint pre-strike static corona at top border. Peak action (0.2s–0.7s): two rapid high-intensity forked blue-white lightning re-strikes with realistic micro-branches and atmospheric bloom. Ending state (0.8s–3.0s): ionized trail breaks into glowing beads and dissipates naturally with fading thunderhead mist to pure black. Photorealistic storm physics, no cartoon zig-zags.',
  },
  {
    id: 'TENSION_EMBER_VORTEX',
    order: 10,
    filename: 'boostera_10_tension_ember_containment_back.webm',
    titleHe: 'מערבולת גחלים ופעימת מתח בדקה הרביעית (Tension Pulse)',
    titleEn: 'Dark Ember Vortex & Rhythmic Tension Field',
    category: 'ESCALATION',
    triggerEvent: 'phase_tension',
    triggerLabelHe: 'אוטומטי בשלב 4 — מתח (02:55–03:45)',
    triggerThreshold: 'battle_time >= 175 && battle_time < 225',
    optionalManualTrigger: false,
    cooldownMs: 0,
    priority: 5,
    durationSec: 8,
    layer: 'BACK',
    playbackMode: 'LOOP',
    compositingMethod: 'TRUE_ALPHA_WEBM_VP9',
    compositingRationaleHe: 'משלב החשכת Vignette היקפית (שדורשת Alpha אמיתי להכהיית השוליים) יחד עם גחלים לוהטות עולות.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps rhythmic vignette + curl-noise ember field',
    safeZoneBehaviorHe: 'מכהה בעדינות את היקף הפריים כדי למקד את העין בפני המגיש במרכז לקראת שניות ההכרעה.',
    centerCrossMs: 0,
    reusabilityHe: 'בונה את תחושת הדחיפות הפסיכולוגית של ה-50 שניות שלפני הפינאלה.',
    directorNotesHe: 'ב-03:38 עד 03:45 העוצמה יורדת במכוון ל"שקט מתוח" כדי שהכניסה לפינאלה תכה בעוצמה כפולה.',
    audio: {
      cueId: 'SFX_TENSION_PULSE_BED',
      filename: 'sfx_10_rhythmic_sub_tension_pulse.wav',
      conceptHe: 'פעימה קצבית נמוכה ועמומה (Sub Pulse) שמאיצה בהדרגה מבלי להתנגש בדיבור המהיר של המגיש.',
      conceptEn: 'Controlled low-frequency rhythmic pulse building anticipation',
      durationSec: 8,
      targetPeakDbfs: -13,
      relativeLoudnessLufs: -21,
      stereoMovement: 'Centered sub pulse (<80Hz) with wide stereo ember texture',
      vocalCarveHz: 'Strict low-pass on pulse at 110Hz + high-pass air at 5kHz',
      cooldownMs: 0,
      allowOverlap: true,
    },
    promptEn:
      'Vertical 9:16 static camera seamless loopable VFX plate (8 seconds) with genuine alpha channel or pure black #000000 background for compositing. Dark brooding atmospheric smoke swirling slowly around the outer 28% perimeter of the vertical frame while glowing orange-red forge cinders and fine metallic ash spiral upward with subtle rhythmic brightness pulses every 1.0 second. Starting state, midpoint, and ending state matched seamlessly for looping. Central 48% presenter area remains completely clear and sharp. Moody Christopher Nolan / Dune cinema aesthetic, realistic turbulence and buoyancy, no text, no people.',
  },
  {
    id: 'FINALE_PYRO_CONVERGENCE',
    order: 11,
    filename: 'boostera_11_grand_finale_climax_sequence_hybrid.webm',
    titleHe: 'גראנד פינאלה רב-שלבי 15 שניות (Grand Finale Climax)',
    titleEn: 'Multi-Stage Cinematic Battle Climax',
    category: 'CLIMAX',
    triggerEvent: 'finale_clock',
    triggerLabelHe: 'נעול לטיימר הקרב בשלב 5 (03:45–04:00)',
    triggerThreshold: 'battle_time >= 225 && battle_time <= 240',
    optionalManualTrigger: true,
    cooldownMs: 30000,
    priority: 10,
    durationSec: 15,
    layer: 'HYBRID',
    playbackMode: 'CHOREOGRAPHED',
    compositingMethod: 'TRUE_ALPHA_WEBM_VP9',
    compositingRationaleHe: 'רצף בימוי דו-שכבתי: מזרקות פירוטכניקה וברקים ב-BACK, סילוני CO₂ בפינות וגל הדף סיום ב-FRONT עם דעיכת עשן נקייה לסיבוב הבא.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps multi-emitter choreographed timeline sequence',
    safeZoneBehaviorHe: 'ב-03:45–03:58 כל האנרגיה ממסגרת את המגיש בעוצמה אדירה מהצדדים ומאחור; ב-03:59.0 גל ההדף הסופי חוצה את הפריים ב-280ms ומיד מתפזר.',
    centerCrossMs: 280,
    reusabilityHe: 'משנה פלטת צבעים אוטומטית בין סיבובים (זהב מותך / קובלט חשמלי / להבת טונגסטן) כך שכל קרב מסתיים בחתימה ייחודית.',
    directorNotesHe: 'שלוש מערכות בתוך 15 שניות: הסלמה (0–8s), התכנסות חשמלית (8–13.5s), פיצוץ שיא ושחרור עשן רך לסיבוב הבא (13.5–15s).',
    audio: {
      cueId: 'SFX_GRAND_FINALE_SEQUENCE',
      filename: 'sfx_11_grand_finale_15s_master.wav',
      conceptHe: 'בניית מתח עולה בת 13.5 שניות, שבריר שנייה של דממה אקוסטית ב-03:58.6, ואימפקט קולנועי אדיר ב-03:59 עם זנב הדהוד נקי.',
      conceptEn: '15s layered cinematic riser, micro-silence drop, and massive finale impact',
      durationSec: 15,
      targetPeakDbfs: -2.0,
      relativeLoudnessLufs: -11,
      stereoMovement: 'Converging wide stereo riser -> full-spectrum impact -> spacious decay',
      vocalCarveHz: '-4.5dB dynamic ducking at 500Hz–3kHz so presenter countdown stays crystal clear',
      cooldownMs: 30000,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 locked-off static camera multi-stage Hollywood finale VFX plate on pure black #000000 background for Screen/Luma compositing, exact duration 15 seconds. Seconds 0–8: twin golden stadium pyrotechnic spark fountains and pressurized white smoke plumes rising steadily along the left and right 25% margins while keeping the center 50% presenter zone clear. Seconds 8–13.5: escalating high-voltage electrical arcs crown the upper frame corners as rising embers accelerate upward in high tension. Second 13.8: brief 4-frame containment contraction followed at Second 14.0 by a massive concussive radial shockwave ring briefly crossing the frame in 0.25 seconds and erupting into a luxurious golden metallic spark rain around the perimeter. Seconds 14.2–15.0: natural decelerating decay into soft lingering stage smoke. AAA live broadcast pyrotechnics, realistic physics, no text, no countdown numbers, no people.',
  },
  {
    id: 'GLOVE_POWER_SURGE',
    order: 12,
    filename: 'boostera_12_glove_x5_overdrive_surge_hybrid.webm',
    titleHe: 'פרץ אנרגיית כפפה x5 (Glove Power Surge)',
    titleEn: 'Boosting Glove Plasma Overdrive',
    category: 'ESCALATION',
    triggerEvent: 'glove_optional',
    triggerLabelHe: 'הפעלת כפפת בוסט x5 בקרב (30 שניות חלון כוח)',
    triggerThreshold: 'glove_active == true',
    optionalManualTrigger: true,
    cooldownMs: 5000,
    priority: 9,
    durationSec: 5.0,
    layer: 'HYBRID',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'SCREEN_ADDITIVE_BLACK',
    compositingRationaleHe: 'משלב פלזמה חשמלית זהובה-כחולה ונחילי ניצוצות מהירים בשוליים החיצוניים שמתמזגים מושלם ב-Screen/Alpha.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps dual-corridor plasma + ballistic sparks',
    safeZoneBehaviorHe: 'בונה עמודי כוח אינטנסיביים ב-25% השמאליים והימניים ומשאיר את פני המגיש חדים וברורים לקריאות עידוד.',
    centerCrossMs: 0,
    reusabilityHe: 'מופעל אוטומטית על ידי במאי ה-AI או ידנית בכל זריקת כפפה.',
    directorNotesHe: 'מעניק לצופים סימן ויזואלי מיידי שכל נקודה עכשיו מוכפלת וחייבים ללחוץ.',
    audio: {
      cueId: 'SND_GLOVE_POWERUP',
      filename: 'sfx_12_glove_turbine_powerup.wav',
      conceptHe: 'טעינת טורבינה חשמלית עולה עם אימפקט פלזמה חד.',
      conceptEn: 'High-voltage turbine charge and kinetic lock',
      durationSec: 2.6,
      targetPeakDbfs: -4.5,
      relativeLoudnessLufs: -14,
      stereoMovement: 'Wide L/R inward power lock',
      vocalCarveHz: '-5.5dB carve at 450Hz–3kHz',
      cooldownMs: 5000,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 locked-off static broadcast VFX plate on pure black #000000 background for Screen compositing, duration 5 seconds. Intense high-energy power-up surge running strictly up the left 24% and right 24% vertical corridors of the frame while keeping the central 52% presenter zone completely clear. Starting state: rapid dual corner plasma ignition flash. Peak action (0.3s–3.5s): spiraling golden-amber and electric cobalt plasma ribbons, upward-shooting metallic sparks, and shimmering heat waves framing the screen edges. Ending state (3.6s–5.0s): clean decay into floating ionized embers until pure black. AAA Unreal Engine VFX quality, no cartoon glove icons, no text.',
  },
  {
    id: 'SNIPE_CRITICAL_FLASH',
    order: 13,
    filename: 'boostera_13_snipe_critical_pulse_hybrid.webm',
    titleHe: 'פולס סנייפ קריטי בשניות ההכרעה (Critical Snipe Pulse)',
    titleEn: 'Critical Snipe Perimeter Shock & Flare',
    category: 'CLIMAX',
    triggerEvent: 'snipe_critical',
    triggerLabelHe: 'אירוע סנייפ (Snipe) או איום מהפך בשניות הסיום',
    triggerThreshold: 'snipe_detected == true || (battle_time >= 215 && score_gap_tight)',
    optionalManualTrigger: true,
    cooldownMs: 4000,
    priority: 10,
    durationSec: 3.0,
    layer: 'HYBRID',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'TRUE_ALPHA_WEBM_VP9',
    compositingRationaleHe: 'טבעת דופק מהירה מאוד ופליטת גיצי ארגמן-זהב בפינות לשדר דחיפות שיא.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps rapid shockwave + corner flare',
    safeZoneBehaviorHe: 'גל הדף מהיר (200ms) ופליטת גיצים ב-4 הפינות בלבד — אפס חסימת פנים בזמן קריאות הסנייפ.',
    centerCrossMs: 200,
    reusabilityHe: 'נשק יום הדין של במאי ה-AI ב-25 השניות האחרונות של קרב צמוד.',
    directorNotesHe: 'מסונכרן עם אזעקת הדריכה הקולנועית כדי להקפיץ את האדרנלין בחדר בשנייה הנכונה.',
    audio: {
      cueId: 'SND_SNIPE_LOCK',
      filename: 'sfx_13_snipe_radar_sub_drop.wav',
      conceptHe: 'פולס סונאר חד ותת-תדר דרוך שמסמן רגע סנייפ קריטי.',
      conceptEn: 'Tactical cinema sonar lock & sub-bass drop',
      durationSec: 2.2,
      targetPeakDbfs: -3.5,
      relativeLoudnessLufs: -13,
      stereoMovement: 'Four-corner stereo ping collapsing into deep sub drop',
      vocalCarveHz: '-6dB scoop at 500Hz–2.8kHz',
      cooldownMs: 4000,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 static camera Hollywood cinema VFX asset on pure black #000000 background for Screen compositing, duration 3 seconds. High-urgency tactical climax pulse triggered from all four corners of the vertical frame: crisp crimson-amber optical edge flares, a razor-thin supersonic air-pressure ring expanding across the frame in 0.2 seconds, and fast inward-angled tungsten sparks staying strictly within the outer 24% frame borders. Central 52% presenter face area stays dark and unobstructed. Clean decay to pure black by 3.0s. Realistic pyrotechnic & optical lens physics, no crosshair HUD graphics, no text.',
  },
  {
    id: 'SOLO_WARM_LOUNGE',
    order: 14,
    filename: 'boostera_14_solo_warm_tungsten_dust_back.webm',
    titleHe: 'אווירת אולפן סולו חמה (Solo Lounge Warm Dust)',
    titleEn: 'Solo Host Warm Tungsten Bokeh & Dust',
    category: 'AMBIENT',
    triggerEvent: 'solo_ambient',
    triggerLabelHe: 'מופעל אוטומטית במצב סולו (כשאין קרב פעיל)',
    triggerThreshold: 'stream_mode == SOLO',
    optionalManualTrigger: true,
    cooldownMs: 0,
    priority: 2,
    durationSec: 12,
    layer: 'BACK',
    playbackMode: 'LOOP',
    compositingMethod: 'SCREEN_ADDITIVE_BLACK',
    compositingRationaleHe: 'חלקיקי אבק מוארים ובוקה טונגסטן רך נראים טבעיים וקולנועיים במיזוג Screen/Alpha מאחורי המגיש.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps lightweight floating bokeh motes',
    safeZoneBehaviorHe: 'מרחף בעדינות בשכבת BACK מאחורי המגיש; מעניק עומק יוקרתי ונעים לשיחה אישית עם הקהל.',
    centerCrossMs: 0,
    reusabilityHe: 'מושלם לשעות שידור ארוכות מחוץ לקרבות בלי לעייף את העין.',
    directorNotesHe: 'במאי ה-AI עובר לשכבה זו אוטומטית כשאתה לבד בלייב ומתאים את צפיפות התאורה לטון הדיבור שלך.',
    audio: {
      cueId: 'SND_ENERGY_WAKEUP_SWEEP',
      filename: 'sfx_14_solo_warm_air_swell.wav',
      conceptHe: 'משב אוויר אנלוגי חם ורך למעברים עדינים בשידור סולו.',
      conceptEn: 'Warm analog studio air swell',
      durationSec: 2.8,
      targetPeakDbfs: -18,
      relativeLoudnessLufs: -26,
      stereoMovement: 'Wide gentle stereo breathe',
      vocalCarveHz: 'High-cut at 280Hz + soft air above 6kHz',
      cooldownMs: 8000,
      allowOverlap: true,
    },
    promptEn:
      'Vertical 9:16 locked-off cinema camera atmospheric plate on pure black #000000 background for Screen blending, seamless 12-second loop. Warm intimate studio lighting atmosphere: delicate out-of-focus golden tungsten dust motes floating lazily in slow air currents along the outer background margins, paired with a very soft breathing warm rim-light haze at the bottom corners. Central 50% presenter area remains dark and clean. Leica Summilux shallow-depth-of-field bokeh aesthetic, calm luxury podcast/livestream mood, no people, no text.',
  },
  {
    id: 'VID_01_FIREBALL_SNIPE_BLAST',
    order: 15,
    filename: 'gemini_generated_video_9cc2b890_e223786f.mp4',
    titleHe: 'וידאו אולפן #1: סילון כדור-אש ועשן בליסטי (Snipe Fireball Jet)',
    titleEn: 'Studio Video #1: Ballistic Fireball & Smoke Blast',
    category: 'CLIMAX',
    triggerEvent: 'snipe_critical',
    triggerLabelHe: 'סנייפ התקפי / קפיצת ניקוד אדירה בשניות ההכרעה',
    triggerThreshold: 'snipe_us == true || massive_gift_combo',
    optionalManualTrigger: true,
    cooldownMs: 7500,
    priority: 10,
    durationSec: 9.2,
    layer: 'BACK',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'קליפ וידאו מרונדר (1280×720, 24fps) על כרומה ירוקה #00FF00. ליבת האש נחתכת בחדות גבוהה, ועל שובל העשן הכהה (00:07–00:09) מופעל אלגוריתם Despill בזמן אמת המנטרל הילה ירקרקה.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps Offscreen Chroma-Key + Despill Video Compositor',
    safeZoneBehaviorHe:
      'ממופה אוטומטית לשכבת BACK בגובה הכתפיים והחלק התחתון כך שסילון האש חולף מאחורי המגיש בעוצמה קולנועית בלי לכסות את הפנים.',
    centerCrossMs: 260,
    reusabilityHe: 'מעולה כנשק שיא בסנייפים ורגעי הכרעה; משולב במינון מבוקר ע״י הטייס האוטומטי.',
    directorNotesHe: 'הטייס האוטומטי משגר אפקט זה בסנייפ גדול יחד עם רעידת מסך (EARTHQUAKE_SHAKE) ובראם קולנועי.',
    videoSrc: '/assets/aistudio/gemini_generated_video_9cc2b890_e223786f.mp4',
    videoFramingMode: 'IMPACT_LOWER_BACK',
    cropBottomPct: 4,
    fadeTailSec: 0.9,
    measuredVideoSpecs: {
      width: 1280,
      height: 720,
      fps: 24,
      durationSec: 10.0,
      sizeMb: '6.86',
      rawAspect: '16:9 אופקי (ממופה חכם ל-9:16)',
    },
    supervisorAuditHe: {
      identifiedHe: 'סילון להביור וכדור אש אופקי משמאל לימין עם שובל עשן שחור סמיך וגיצים חמים.',
      triggerFitHe: 'סנייפ קריטי (Snipe) או מתנה כבדה בשניות ההכרעה — בשכבת BACK מאחורי המגיש.',
      chromaAlphaVerdictHe: 'ללא Alpha מובנה (MP4 אטום על #00FF00). האש הכתומה נחתכת נקי מאוד; העשן הכהה מקבל ניקוי Green Despill אוטומטי במנוע.',
      framingSafeZoneHe: 'במקור חוצה את מרכז ה-16:9 — המנוע ממקם אותו בשכבת BACK הנמוכה כך שפני המגיש נשארות חדות ונקיות מלפנים.',
      reusabilityHe: 'אימפקט גבוה מאוד לרגעי שיא (Cooldown 7.5s כדי לשמור על תחושת פיצוץ נדיר).',
    },
    audio: {
      cueId: 'VID_01_FIREBALL_SNIPE_BLAST',
      filename: 'sfx_vid01_fireball_roar_impact.wav',
      conceptHe: 'שאגת להבה תת-תדרית וגל הדף חם (Sub-Fireball Roar + Ember Tail).',
      conceptEn: 'Deep pressurized fireball ignition roar and sub impact',
      durationSec: 3.4,
      targetPeakDbfs: -3.5,
      relativeLoudnessLufs: -13,
      stereoMovement: 'Left-to-right kinetic flame sweep (-0.85 to +0.85)',
      vocalCarveHz: '-6dB scoop at 450Hz–2.9kHz',
      cooldownMs: 7500,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 locked-off static camera cinematic VFX plate on pure black #000000 background for Screen/Luma compositing, 5 seconds. High-pressure theatrical fireball jet erupting behind the lower presenter zone from left to right with turbulent orange-gold flames and backlit dark smoke, keeping central upper face zone clear.',
  },
  {
    id: 'VID_02_CRYO_CO2_CANNONS',
    order: 16,
    filename: 'gemini_generated_video_4adcaf66_155a6ade.mp4',
    titleHe: 'וידאו אולפן #2: צמד תותחי CO₂ קריוגניים מהפינות (Cryo Stage Jets)',
    titleEn: 'Studio Video #2: Twin Pressurized Cryo CO2 Cannons',
    category: 'SHARE_IMPACT',
    triggerEvent: 'share',
    triggerLabelHe: 'שיתוף שידור (Share) / התפרצות הייפ במוד מסיבה',
    triggerThreshold: 'share_event >= 1 || hype_drop == true',
    optionalManualTrigger: true,
    cooldownMs: 3800,
    priority: 8,
    durationSec: 8.6,
    layer: 'FRONT',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'הקיטור הלבן הצפוף יוצר ניגודיות מצוינת מול הכרומה הירוקה (#00FF00). המנוע מבצע חיתוך רך של שולי האדים וחיתוך אוטומטי של 6% תחתונים להסתרת קצה נחיר המתכת.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps Split-Edge 9:16 Chroma-Key Video Compositor',
    safeZoneBehaviorHe:
      'המרכז נקי לחלוטין! שני סילוני הקיטור ממופים לשוליים השמאליים והימניים של מסך ה-9:16 וממסגרים את המגיש מלפנים.',
    centerCrossMs: 0,
    reusabilityHe: 'אחד הקליפים השימושיים ביותר בספרייה — מתאים לשיתופים, פתיחת קרב ומוד מסיבה שוב ושוב.',
    directorNotesHe: 'מסתיים בדעיכה טבעית נקייה ב-00:08.6 ללא חיתוך חד.',
    videoSrc: '/assets/aistudio/gemini_generated_video_4adcaf66_155a6ade.mp4',
    videoFramingMode: 'SPLIT_EDGES_9X16',
    cropBottomPct: 6,
    fadeTailSec: 0.7,
    measuredVideoSpecs: {
      width: 1280,
      height: 720,
      fps: 24,
      durationSec: 10.0,
      sizeMb: '3.40',
      rawAspect: '16:9 אופקי (פיצול שוליים חכם ל-9:16)',
    },
    supervisorAuditHe: {
      identifiedHe: 'זוג סילוני CO₂ קריוגניים לבנים הנורים בלחץ גבוה משתי הפינות התחתונות כלפי מעלה בקשת ממסגרת.',
      triggerFitHe: 'שיתוף שידור (Share), עליית אנרגיה במוד מסיבה, או כניסה לשלב Momentum — בשכבת FRONT.',
      chromaAlphaVerdictHe: 'נחתך נקי מאוד מ-#00FF00 בזכות הלובן הגבוה של הקיטור, עם החלקת קצוות (Soft Alpha Ramp) לאדים המתפוגגים.',
      framingSafeZoneHe: 'מצוין — המרכז נקי ב-100%, וחיתוך 6% תחתון מסתיר לחלוטין את פיות המתכת בפינות.',
      reusabilityHe: 'גבוהה ביותר — אפקט מועדונים/אצטדיון קלאסי שנראה טבעי בכל הפעלה חוזרת.',
    },
    audio: {
      cueId: 'VID_02_CRYO_CO2_CANNONS',
      filename: 'sfx_vid02_twin_cryo_co2_jets.wav',
      conceptHe: 'נשיפת לחץ קריוגנית כפולה בסטריאו רחב (Wide Stereo Cryo Jet Hiss).',
      conceptEn: 'Twin high-pressure stadium CO2 cryo cannon blast',
      durationSec: 2.5,
      targetPeakDbfs: -5.5,
      relativeLoudnessLufs: -14,
      stereoMovement: 'Hard L/R corner blast (-0.82 / +0.82)',
      vocalCarveHz: '-5.5dB notch at 1.1kHz–2.9kHz',
      cooldownMs: 3800,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 locked-off broadcast VFX plate on pure black #000000 background, 4 seconds. Twin pressurized white cryogenic CO2 jets blasting upward from bottom-left and bottom-right outer margins, framing the central 50% presenter safe zone cleanly with zero hardware visible.',
  },
  {
    id: 'VID_03_TWIN_LIGHTNING_ARCS',
    order: 17,
    filename: 'gemini_generated_video_d0149679_ebad1da7.mp4',
    titleHe: 'וידאו אולפן #3: עמודי ברק חשמליים בשוליים (Twin Perimeter Lightning)',
    titleEn: 'Studio Video #3: Twin Vertical Electric Lightning Columns',
    category: 'REACTIVE_ENERGY',
    triggerEvent: 'like',
    triggerLabelHe: 'רצף לייקים מהיר (HYPE/OVERDRIVE) / שלב לחץ ומתח',
    triggerThreshold: 'likes_per_sec >= 14 || phase IN [PRESSURE, TENSION]',
    optionalManualTrigger: true,
    cooldownMs: 5500,
    priority: 8,
    durationSec: 9.4,
    layer: 'FRONT',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'ליבת הברק הכחולה-לבנה חדה מאוד ונחתכת היטב מ-#00FF00 יחד עם הסרת הירוק מההילה הסגולה-כחולה סביב הפלזמה.',
    simultaneousAllowed: 2,
    minPerformanceSpec: '60fps Split-Edge 9:16 Chroma-Key + Violet Glow Recovery',
    safeZoneBehaviorHe:
      'הברקים מטפסים אך ורק לאורך השוליים החיצוניים השמאליים והימניים — 60% המרכזיים פנויים לחלוטין לפני המגיש!',
    centerCrossMs: 0,
    reusabilityHe: 'גבוהה מאוד — מחשמל את המסגרת בכל קפיצת קצב לייקים, צ׳אט סוער או שלב לחץ.',
    directorNotesHe: 'הטייס האוטומטי מפעיל קליפ זה כשקצב הטאפים מזנק או כשנכנסים לדקה השלישית של הקרב.',
    videoSrc: '/assets/aistudio/gemini_generated_video_d0149679_ebad1da7.mp4',
    videoFramingMode: 'SPLIT_EDGES_9X16',
    cropBottomPct: 5,
    fadeTailSec: 0.85,
    measuredVideoSpecs: {
      width: 1280,
      height: 720,
      fps: 24,
      durationSec: 10.0,
      sizeMb: '3.99',
      rawAspect: '16:9 אופקי (פיצול שוליים חכם ל-9:16)',
    },
    supervisorAuditHe: {
      identifiedHe: 'צמד עמודי פלזמה וברקים כחולים-סגולים מתפצלים המטפסים לאורך הקצה השמאלי והימני של הפריים.',
      triggerFitHe: 'רצף לייקים מהיר (OVERDRIVE), שטף צ׳אט חזק או כניסה לשלב הלחץ — ב-FRONT היקפי או BACK.',
      chromaAlphaVerdictHe: 'הברק הבהיר נפרד מצוין מהרקע הירוק; תיקון Despill שומר על ההילה הסגולה-כחולה נקייה משאריות ירוק.',
      framingSafeZoneHe: 'אידיאלי ל-9:16 — 60% ממרכז המסך נקי לגמרי וחיתוך 5% תחתון מסתיר את נקודות הפליטה בפינות.',
      reusabilityHe: 'מעולה לשימוש תדיר לאורך הקרב ובשידורי הייפ מבלי לעייף או לחסום את המגיש.',
    },
    audio: {
      cueId: 'VID_03_TWIN_LIGHTNING_ARCS',
      filename: 'sfx_vid03_twin_tesla_lightning_arcs.wav',
      conceptHe: 'זמזום מתח גבוה ופיצוחי טסלה בסטריאו היקפי (Stereo High-Voltage Arcs).',
      conceptEn: 'Dual perimeter high-voltage plasma arc crackle',
      durationSec: 2.6,
      targetPeakDbfs: -6.0,
      relativeLoudnessLufs: -15,
      stereoMovement: 'Alternating outer-edge electrical snaps (-0.88 / +0.88)',
      vocalCarveHz: '-6dB carve at 500Hz–3kHz',
      cooldownMs: 5500,
      allowOverlap: true,
    },
    promptEn:
      'Vertical 9:16 static broadcast VFX plate on pure black #000000 background for Screen compositing, 5 seconds. Twin blue-violet branching high-voltage electrical arcs climbing strictly along the far-left 20% and far-right 20% borders, central presenter safe zone completely clear.',
  },
  {
    id: 'VID_04_COLD_SPARK_FOUNTAINS',
    order: 18,
    filename: 'gemini_generated_video_d8e07070_d2e75493.mp4',
    titleHe: 'וידאו אולפן #4: מזרקות ניצוצות זהב קרים 4-פינות (Golden Cold Sparks)',
    titleEn: 'Studio Video #4: Quad Golden Cold-Sparkler Stage Fountains',
    category: 'SOCIAL_REWARD',
    triggerEvent: 'follow',
    triggerLabelHe: 'עוקב חדש / מתנה חגיגית / הרמת אווירה בסולו ומסיבה',
    triggerThreshold: 'new_follower >= 1 || victory_moment == true',
    optionalManualTrigger: true,
    cooldownMs: 4200,
    priority: 7,
    durationSec: 9.0,
    layer: 'FRONT',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'גיצים זהובים-לבנים לוהטים בולטים בניגודיות חדה מול #00FF00, עם שחזור חום זהוב (Warm Amber Despill) שמונע כהות בקצוות הניצוצות.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps Split-Edge 9:16 Warm-Despill Video Compositor',
    safeZoneBehaviorHe:
      'מזרקות עליונות ותחתונות לאורך המסדרונות החיצוניים בלבד — המגיש ממוסגר בווילון ניצוצות יוקרתי של אולפן טלוויזיה.',
    centerCrossMs: 0,
    reusabilityHe: 'גבוהה ביותר — מעניק תגמול VIP יוקרתי גם בקרב וגם בשידור סולו לבד.',
    directorNotesHe: 'דועך באופן טבעי ונקי ב-00:09.0; מושלם לחגיגת עוקבים, יעדים ורגעי שיא חיוביים.',
    videoSrc: '/assets/aistudio/gemini_generated_video_d8e07070_d2e75493.mp4',
    videoFramingMode: 'SPLIT_EDGES_9X16',
    cropBottomPct: 4,
    fadeTailSec: 0.7,
    measuredVideoSpecs: {
      width: 1280,
      height: 720,
      fps: 24,
      durationSec: 10.0,
      sizeMb: '7.48',
      rawAspect: '16:9 אופקי (פיצול שוליים חכם ל-9:16)',
    },
    supervisorAuditHe: {
      identifiedHe: 'מזרקות זיקוקים קרים (Indoor Titanium Cold Sparks) זהובים היורדים מהפינות העליונות ועולים מהפינות התחתונות במקביל.',
      triggerFitHe: 'עוקב חדש (Follow), חגיגת ניצחון, או הרמת אנרגיה חגיגית בשידור סולו — בשכבת FRONT.',
      chromaAlphaVerdictHe: 'ניצוצות הזהב הבהירים נחתכים היטב מכרומה ירוקה עם Warm Despill שמחזיר את הברק הזהוב החם.',
      framingSafeZoneHe: '55% ממרכז הפריים נקי לגמרי — ממסגר את המגיש כמו במת גמר טלוויזיונית יוקרתית.',
      reusabilityHe: 'גבוהה מאוד — עובד נהדר גם מחוץ לקרבות בשידור אירוח או מסיבה.',
    },
    audio: {
      cueId: 'VID_04_COLD_SPARK_FOUNTAINS',
      filename: 'sfx_vid04_golden_cold_spark_fountains.wav',
      conceptHe: 'פצפוץ זיקוקי טיטניום קרים ואקורד זהב אוורירי (Cold Sparkler Fountain Fizz).',
      conceptEn: 'Luxury titanium cold-sparkler fountain fizz and warm shimmer',
      durationSec: 3.0,
      targetPeakDbfs: -7.5,
      relativeLoudnessLufs: -16,
      stereoMovement: 'Four-corner sparkling cascade (-0.78 / +0.78)',
      vocalCarveHz: 'Clear vocal midrange 350Hz–3.6kHz',
      cooldownMs: 4200,
      allowOverlap: true,
    },
    promptEn:
      'Vertical 9:16 locked-off broadcast VFX plate on pure black #000000 background, 5 seconds. Indoor golden titanium cold-sparkler fountains spraying from top and bottom outer corners along left and right 22% borders while central presenter zone stays unobstructed.',
  },
  {
    id: 'VID_05_PK_FACTION_SMOKE_CLASH',
    order: 19,
    filename: 'gemini_generated_video_ffdacbbb_d992f4f5.mp4',
    titleHe: 'וידאו אולפן #5: התנגשות עשן וברקים כחול מול אדום (PK Faction Clash)',
    titleEn: 'Studio Video #5: Blue vs Red PK Smoke & Lightning Columns',
    category: 'ESCALATION',
    triggerEvent: 'phase_tension',
    triggerLabelHe: 'פתיחת קרב PK / קרב צמוד בלחץ גבוה (כחול מול אדום)',
    triggerThreshold: 'stream_mode == BATTLE && score_gap_tight == true',
    optionalManualTrigger: true,
    cooldownMs: 9000,
    priority: 8,
    durationSec: 9.2,
    layer: 'BACK',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'שני עמודי עשן צבעוניים עשירים (כחול חשמלי משמאל, אדום מגמה מימין) עם הבזקי ברק פנימיים. המנוע מוסיף מעטפת Fade-Out אוטומטית של 0.9 שניות בסוף הקליפ למניעת קטיעה חדה.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps Split-Edge 9:16 Chroma-Key + Smooth Envelope',
    safeZoneBehaviorHe:
      'בונה תפאורת זירת קרב דו-מחנאית (כחול מול אדום כמו מד ה-PK של טיקטוק!) בשוליים מאחורי המגיש ב-BACK ללא חדירה למרכז.',
    centerCrossMs: 0,
    reusabilityHe: 'אפקט דגל ייחודי לקרבות PK צמודים — ממחיש ויזואלית את המאבק בין שני הצדדים.',
    directorNotesHe: 'מופעל אוטומטית ע״י הטייס במוד קרב כשפער הנקודות צמוד או בפתיחת שלב הלחץ.',
    videoSrc: '/assets/aistudio/gemini_generated_video_ffdacbbb_d992f4f5.mp4',
    videoFramingMode: 'SPLIT_EDGES_9X16',
    cropBottomPct: 4,
    fadeTailSec: 1.0,
    measuredVideoSpecs: {
      width: 1280,
      height: 720,
      fps: 24,
      durationSec: 10.0,
      sizeMb: '3.96',
      rawAspect: '16:9 אופקי (פיצול שוליים חכם ל-9:16)',
    },
    supervisorAuditHe: {
      identifiedHe: 'עמוד עשן סמיך כחול עם ברקים משמאל מול עמוד עשן אדום-מגמה עם ברקים מימין (סימבוליקה קלאסית של קרב PK).',
      triggerFitHe: 'פתיחת קרב PK, מהפך יתרון או קרב צמוד בדקות 2–4 — בשכבת BACK מאחורי המגיש.',
      chromaAlphaVerdictHe: 'הצבעים הכחולים והאדומים רחוקים מאוד מהירוק (#00FF00) בספקטרום הצבע ולכן נחתכים בצורה מצוינת וללא אובדן רוויה.',
      framingSafeZoneHe: '60% מרכזיים נקיים לחלוטין; נוספה דעיכת שקיפות אוטומטית בשנייה האחרונה כדי שהעשן יתפוגג בחלקות.',
      reusabilityHe: 'מושלם לכל סיבוב קרב PK לזיהוי מיידי שהחדר נמצא בעימות תחרותי חי.',
    },
    audio: {
      cueId: 'VID_05_PK_FACTION_SMOKE_CLASH',
      filename: 'sfx_vid05_pk_dual_smoke_thunder.wav',
      conceptHe: 'נהמת תת-בס דו-צדדית ורעם חשמלי מרוסן (PK Arena Clash Rumble).',
      conceptEn: 'Dual-faction cinematic low smoke rumble and electric crack',
      durationSec: 3.2,
      targetPeakDbfs: -5.5,
      relativeLoudnessLufs: -15,
      stereoMovement: 'Opposing left-blue / right-red stereo tension image',
      vocalCarveHz: '-6dB dip at 400Hz–2.8kHz',
      cooldownMs: 9000,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 static camera PK battle VFX plate on pure black #000000 background, 6 seconds. Electric cobalt-blue storm smoke column with internal lightning on left 22% border opposing crimson-red magma smoke column on right 22% border, center presenter zone clear.',
  },
  {
    id: 'VID_06_PLASMA_SPARK_SURGE',
    order: 20,
    filename: 'gemini_generated_video_ad6ccac4_9b011dca.mp4',
    titleHe: 'וידאו אולפן #6: זרמי פלזמה כחולה והתפרצות גיצי כפפה (Glove Plasma Surge)',
    titleEn: 'Studio Video #6: Hybrid Cyan Plasma & Golden Spark Overdrive',
    category: 'ESCALATION',
    triggerEvent: 'glove_optional',
    triggerLabelHe: 'הפעלת כפפת בוסט x5 / קומבו לייקים גבוה (x100+)',
    triggerThreshold: 'glove_active == true || like_combo >= 100',
    optionalManualTrigger: true,
    cooldownMs: 6500,
    priority: 9,
    durationSec: 9.2,
    layer: 'FRONT',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'משלב סרטי פלזמה כחולים-טורקיז עם גלי התפרצות של גיצים זהובים (00:04–00:07). אלגוריתם ה-Chroma של המנוע שומר על שני הגוונים בחדות של 60fps.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps Split-Edge 9:16 Dual-Hue Chroma Compositor',
    safeZoneBehaviorHe:
      'זורם לאורך שני המסדרונות האנכיים החיצוניים ב-9:16 ומשאיר את המגיש חד וברור לקריאות עידוד בזמן הכפפה.',
    centerCrossMs: 0,
    reusabilityHe: 'אפקט בוסט אולטימטיבי לחלון 30 השניות של כפפת x5 ולשיאי קומבו.',
    directorNotesHe: 'מסונכרן אוטומטית עם טעינת הטורבינה (SND_GLOVE_POWERUP) ומוזיקת Glove Overclock.',
    videoSrc: '/assets/aistudio/gemini_generated_video_ad6ccac4_9b011dca.mp4',
    videoFramingMode: 'SPLIT_EDGES_9X16',
    cropBottomPct: 4,
    fadeTailSec: 0.75,
    measuredVideoSpecs: {
      width: 1280,
      height: 720,
      fps: 24,
      durationSec: 10.0,
      sizeMb: '5.35',
      rawAspect: '16:9 אופקי (פיצול שוליים חכם ל-9:16)',
    },
    supervisorAuditHe: {
      identifiedHe: 'שילוב היברידי של זרמי פלזמה כחולים עולים בשוליים עם התפרצויות קצביות של ניצוצות זהב חמים.',
      triggerFitHe: 'כפפת בוסט x5 (Boosting Glove) או חציית מדרגת קומבו x100 — בשכבת FRONT.',
      chromaAlphaVerdictHe: 'הפרדת צבע נקייה מאוד מ-#00FF00 גם לפלזמה הכחולה וגם לגיצי הזהב, עם דעיכה טבעית בסיום הקליפ.',
      framingSafeZoneHe: 'שומר על אזור הפנים והגוף המרכזי נקי ב-100% ומייצר תחושת "הילוך חמישי" מסביב למסך.',
      reusabilityHe: 'גבוהה מאוד — אידיאלי לחלונות כוח, יעדי קהל ושיאי אנרגיה.',
    },
    audio: {
      cueId: 'VID_06_PLASMA_SPARK_SURGE',
      filename: 'sfx_vid06_glove_plasma_spark_overdrive.wav',
      conceptHe: 'טורבינת פלזמה עולה בשילוב גיצי מתח גבוה (Glove Plasma Overdrive).',
      conceptEn: 'Rising plasma turbine charge with golden spark bursts',
      durationSec: 2.8,
      targetPeakDbfs: -4.5,
      relativeLoudnessLufs: -14,
      stereoMovement: 'Wide stereo upward acceleration (-0.85 / +0.85)',
      vocalCarveHz: '-5.5dB carve at 450Hz–3kHz',
      cooldownMs: 6500,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 static broadcast VFX plate on pure black #000000 background, 5 seconds. Rising cyan-cobalt plasma ribbons erupting with rhythmic golden spark bursts strictly along left and right 22% frame margins, central presenter area untouched.',
  },
  {
    id: 'VID_07_QUAD_PYRO_FLAME_JETS',
    order: 21,
    filename: 'gemini_generated_video_eeace2ac_f706771b.mp4',
    titleHe: 'וידאו אולפן #7: ארבעה תותחי להבות פירוטכניקה לגראנד פינאלה (Quad Stage Pyro)',
    titleEn: 'Studio Video #7: Quad Concert Pyrotechnic Vertical Flame Projectors',
    category: 'CLIMAX',
    triggerEvent: 'finale_clock',
    triggerLabelHe: 'גראנד פינאלה (03:45–04:00) / השלמת יעד ענק / שיא מסיבה',
    triggerThreshold: 'battle_time >= 225 || engagement_goal_reached == true',
    optionalManualTrigger: true,
    cooldownMs: 10000,
    priority: 10,
    durationSec: 8.8,
    layer: 'BACK',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'ארבעה עמודי אש אנכיים אמיתיים של במת מופעים (שניים משמאל, שניים מימין). המנוע חותך אוטומטית 7% תחתונים להסתרת מבערים שחורים ומבצע Despill על כיפות העשן מעל הלהבות.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps Split-Edge 9:16 Stage Pyro Chroma Compositor',
    safeZoneBehaviorHe:
      'הלהבות מתרוממות בשני הצדדים בשכבת BACK מאחורי כתפי המגיש כמו במת פסטיבל ענקית — הפנים במרכז נשארות חדות ומוארות.',
    centerCrossMs: 0,
    reusabilityHe: 'נשק הפינאלה והניצחון החזק ביותר בספריית הווידאו — הופך כל סיום קרב להפקת ענק.',
    directorNotesHe: 'נכבה ומתפזר באופן טבעי ב-00:08.8 ומאפשר מעבר חלק לסיבוב הבא או למצב סולו.',
    videoSrc: '/assets/aistudio/gemini_generated_video_eeace2ac_f706771b.mp4',
    videoFramingMode: 'SPLIT_EDGES_9X16',
    cropBottomPct: 7,
    fadeTailSec: 0.75,
    measuredVideoSpecs: {
      width: 1280,
      height: 720,
      fps: 24,
      durationSec: 10.0,
      sizeMb: '5.30',
      rawAspect: '16:9 אופקי (פיצול שוליים חכם ל-9:16)',
    },
    supervisorAuditHe: {
      identifiedHe: 'ארבעה מבערים פירוטכניים אנכיים של במת הופעות חיה (2 משמאל ו-2 מימין) היורים עמודי להבה גבוהים עם עשן חם.',
      triggerFitHe: 'גראנד פינאלה ב-15 השניות האחרונות (03:45–04:00), השלמת יעד מתנות גדול או שיא מסיבה — בשכבת BACK.',
      chromaAlphaVerdictHe: 'גוף הלהבות הכתום-צהוב נחתך חד מאוד מ-#00FF00; כיפות העשן בראש הלהבה מנוקות אוטומטית מהילה ירוקה.',
      framingSafeZoneHe: 'חיתוך 7% תחתון מסתיר לחלוטין את ראשי המבערים השחורים ומותיר במת אש נקייה משני צידי המגיש ב-9:16.',
      reusabilityHe: 'גבוהה ביותר לרגעי שיא, יעדים וסיומי סיבובים.',
    },
    audio: {
      cueId: 'VID_07_QUAD_PYRO_FLAME_JETS',
      filename: 'sfx_vid07_quad_stage_pyro_flames.wav',
      conceptHe: 'שאגת מבערי גז בימתיים בארבעה ערוצים ורעידת אוויר חם (Quad Stage Flame Roar).',
      conceptEn: 'Quad concert flame projector ignition whoosh and low roar',
      durationSec: 3.5,
      targetPeakDbfs: -3.0,
      relativeLoudnessLufs: -12,
      stereoMovement: 'Wide arena quad-column flame image (-0.9 / +0.9)',
      vocalCarveHz: '-5.5dB dynamic scoop at 500Hz–3kHz',
      cooldownMs: 10000,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 locked-off live arena VFX plate on pure black #000000 background, 5 seconds. Four vertical concert pyrotechnic flame columns erupting along left and right outer margins with zero burner hardware visible and central 50% presenter face zone completely clear.',
  },
  {
    id: 'BEAST_08_VIOLET_PHOENIX',
    order: 22,
    filename: 'vfx_1739519991280.mp4',
    titleHe: 'חיית עוצמה #8 (גרין-סקרין): פניקס אסטרלי סגול למהפך יתרון (Astral Violet Phoenix)',
    titleEn: 'Green-Screen Beast #8: Astral Violet-Magenta Comeback Phoenix',
    category: 'ESCALATION',
    triggerEvent: 'goal',
    triggerLabelHe: 'מהפך יתרון בקרב (Comeback!) / מתנת ביניים-ענק (Galaxy 500+ יהלומים)',
    triggerThreshold: 'took_lead == true || gift_diamonds >= 500',
    optionalManualTrigger: true,
    cooldownMs: 8500,
    priority: 9,
    durationSec: 8.2,
    layer: 'BACK',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'סגול-מג׳נטה חשמלי הוא הצבע המשלים המדויק לירוק (#00FF00) ולכן הכנפיים נחתכות בחדות מושלמת! זוהתה בסריקה האפלת פינות ירוקה כהה (#063B06) בשניות 00:00–00:02 — המנוע מפעיל אוטומטית חיתוך כרומה מנורמל (Vignette-Proof Chroma Key) + ניקוי הילה ירוקה מענן הערפל התחתון.',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps Upper-Crest 9:16 Vignette-Proof Chroma Keyer',
    safeZoneBehaviorHe:
      'ממוקם במצב UPPER_CREST_BACK (4%–52% עליון בשכבת BACK) כך שמוטת הכנפיים הסגולה נפרשת בהוד מאחורי ראש וכתפי המגיש בלי לכסות את הפנים!',
    centerCrossMs: 0,
    reusabilityHe: 'נשק ויזואלי אייקוני לכל רגע של "חזרה מהמתים" (Comeback) ונטילת הובלה בקרב.',
    directorNotesHe: 'הקליפ כולל צריחת פניקס ומשק כנפיים מובנים; ניתן להפעיל מיד ברינדור 60fps חי או לחבר בלחיצה את קובץ ה-MP4 עם הסאונד המקורי.',
    videoFramingMode: 'UPPER_CREST_BACK',
    cropBottomPct: 6,
    fadeTailSec: 0.75,
    trimStartSec: 1.4,
    maskBottomFeatherPct: 22,
    playEmbeddedAudio: true,
    measuredVideoSpecs: {
      width: 720,
      height: 1280,
      fps: 24,
      durationSec: 10.0,
      sizeMb: '4.80',
      rawAspect: '9:16 אנכי על מסך ירוק עם Vignette בפינות',
    },
    supervisorAuditHe: {
      identifiedHe: 'פניקס אנרגיה סגול-מג׳נטה זוהר המגיח מענן ערפל ב-00:02, פורש כנפיים בשיא הגובה (00:03–00:05), צולל ימינה וממריא באלכסון לשמאל-מעלה (00:08–00:09) בליווי צריחת פניקס.',
      triggerFitHe: 'אידיאלי למהפך יתרון בקרב (Rebirth / Comeback כשעוברים מפיגור להובלה!) או מתנת Galaxy — בשכבת BACK מעל הכתפיים.',
      chromaAlphaVerdictHe: 'הסגול נחתך ב-100% ניקיון מ-#00FF00! תיקון קריטי שבוצע במנוע: הפינות הירוקות הכהות (#063B06) והערפל החצי-שקוף בתחתית עוברים נרמול דומיננטיות ירוקה ו-Despill סגול כך שלא נשאר כתם כהה בפינות.',
      framingSafeZoneHe: 'הצבה ב-UPPER_CREST_BACK ממקמת את הפניקס ככתר כנפיים מלכותי בחלק העליון מאחורי המגיש, בשעה שהפנים במרכז נשארות חדות ונקיות.',
      reusabilityHe: 'גבוהה מאוד — אפקט "וואו" דרמטי שמזוהה מיד עם מהפך ועלייה ליתרון.',
    },
    audio: {
      cueId: 'BEAST_08_VIOLET_PHOENIX',
      filename: 'sfx_beast08_violet_phoenix_screech.wav',
      conceptHe: 'צריחת פניקס הרמונית גבוהה + משק כנפי פלזמה רחב בסטריאו.',
      conceptEn: 'Astral phoenix harmonic screech and wide wing whoosh',
      durationSec: 3.2,
      targetPeakDbfs: -4.0,
      relativeLoudnessLufs: -14,
      stereoMovement: 'Ascending diagonal stereo flight (-0.75 to +0.75)',
      vocalCarveHz: '-5dB carve at 700Hz–2.6kHz',
      cooldownMs: 8500,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 locked-off VFX plate on pure uniform #00FF00 chroma green (zero dark corner vignette), 6 seconds. Majestic glowing violet-magenta astral phoenix rising and spreading wide luminous wings in the upper 45% of the frame, clean feather particle dissipation, lower presenter zone clear.',
  },
  {
    id: 'BEAST_09_SOLAR_TIGER',
    order: 23,
    filename: 'vfx_1739595125492.mp4',
    titleHe: 'חיית עוצמה #9 (גרין-סקרין): טיגריס להבות שמש לכפפה ורצף תקיפה (Blazing Solar Tiger)',
    titleEn: 'Green-Screen Beast #9: Blazing Solar Fire Tiger Roar',
    category: 'ESCALATION',
    triggerEvent: 'glove_optional',
    triggerLabelHe: 'פתיחת כפפה אגרסיבית x5 / רצף קומבו x150+ / כניסה לשלב הלחץ',
    triggerThreshold: 'glove_active == true || like_combo >= 150',
    optionalManualTrigger: true,
    cooldownMs: 9000,
    priority: 9,
    durationSec: 7.6,
    layer: 'BACK',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'ממצא קריטי בסריקה: בשניות 00:00–00:01 יש קוביות דחיסה ירוקות ובשניות 00:03–00:06 מופיעה מריחת פיקסלים אנכית כתומה מתחת לחזה הטיגריס (עד שב-00:07–00:09 הוא עומד נקי על ענן עשן). המנוע פותר זאת אוטומטית ע״י דילוג פתיחה (Trim 2.2s) + מסכת ריכוך תחתונה (Bottom Feather Mask 36%) שחותכת את מריחת הפיקסלים ומשאירה רק את ראש הטיגריס השואג והלהבות!',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps Upper-Crest 9:16 Glitch-Masked Chroma Keyer',
    safeZoneBehaviorHe:
      'מוצג כסמל חיית טרף בוערת ב-UPPER_CREST_BACK מאחורי כתפי המגיש; המסכה התחתונה מונעת ב-100% מפסי המריחה התחתונים להופיע בשידור!',
    centerCrossMs: 0,
    reusabilityHe: 'מושלם למצבי תקיפה אגרסיביים: כפפת בוסט x5, שבירת שיא קומבו x150 או לחץ על היריב.',
    directorNotesHe: 'כולל שאגת טיגריס בשרנית ועמוקה שמקפיצה מיידית את האדרנלין בחדר.',
    videoFramingMode: 'UPPER_CREST_BACK',
    cropBottomPct: 8,
    fadeTailSec: 0.7,
    trimStartSec: 2.2,
    maskBottomFeatherPct: 36,
    playEmbeddedAudio: true,
    measuredVideoSpecs: {
      width: 720,
      height: 1280,
      fps: 24,
      durationSec: 10.0,
      sizeMb: '5.10',
      rawAspect: '9:16 אנכי על מסך ירוק (כולל סאונד שאגת טיגריס)',
    },
    supervisorAuditHe: {
      identifiedHe: 'טיגריס אש כתום-זהוב עוצמתי השואג בעוצמה (00:02.5–00:09.6) עם פסקול שאגות טורף.',
      triggerFitHe: 'הפעלת כפפת בוסט x5 תוקפנית, חציית קומבו x150 לייקים, או פתיחת התקפה בדקה ה-3 — בשכבת BACK.',
      chromaAlphaVerdictHe: 'הפרווה הבוערת כתומה-זהובה ונחתכת היטב מ-#00FF00, אך הסריקה איתרה פגם דור-וידאו: מריחת פיקסלים אנכית כתומה מהחזה למטה ב-00:03–00:06 + בלוקים ירוקים ב-00:00–00:01.',
      framingSafeZoneHe: 'פתרון מובנה במנוע: חיתוך 2.2 שניות ראשונות + מסכת Feather תחתונה של 36% שמעלימה לחלוטין את פסי המריחה ומציגה רק את פלג הגוף העליון השואג מעל כתפי המגיש (או קפיצה ל-00:06.6 לעמידה מלאה נקייה).',
      reusabilityHe: 'גבוהה — משדר כוח מתפרץ ואנרגיית קרב חסרת פשרות.',
    },
    audio: {
      cueId: 'BEAST_09_SOLAR_TIGER',
      filename: 'sfx_beast09_solar_tiger_roar.wav',
      conceptHe: 'שאגת טיגריס גרונית נמוכה + התלקחות להבות חזה (Solar Predator Roar).',
      conceptEn: 'Deep guttural tiger roar with fiery sub-bass ignition',
      durationSec: 3.0,
      targetPeakDbfs: -3.5,
      relativeLoudnessLufs: -13,
      stereoMovement: 'Wide aggressive stage roar (-0.8 / +0.8)',
      vocalCarveHz: '-5.5dB carve at 600Hz–2.8kHz',
      cooldownMs: 9000,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 locked-off VFX plate on pure uniform #00FF00 green screen, 6 seconds. Fierce blazing golden-orange fire tiger head and shoulders roaring in upper 45% of frame, clean volumetric embers, zero vertical pixel smear, lower 50% presenter zone clear.',
  },
  {
    id: 'BEAST_10_ROYAL_FIRE_LION',
    order: 24,
    filename: 'vfx_1739595086238.mp4',
    titleHe: 'חיית עוצמה #10 (גרין-סקרין): אריה האש המלכותי למתנות ענק וסנייפ ניצחון (Royal Fire Lion)',
    titleEn: 'Green-Screen Beast #10: Blazing Royal TikTok Lion Climax',
    category: 'CLIMAX',
    triggerEvent: 'snipe_critical',
    triggerLabelHe: 'מתנת אריה / לוויתן (300+ יהלומים) / סנייפ ניצחון מכריע בדקה האחרונה',
    triggerThreshold: 'gift_lion_or_whale == true || snipe_victory == true',
    optionalManualTrigger: true,
    cooldownMs: 9500,
    priority: 10,
    durationSec: 7.8,
    layer: 'BACK',
    playbackMode: 'ONE_SHOT',
    compositingMethod: 'CHROMA_KEY_00FF00',
    compositingRationaleHe:
      'מתכתב ישירות עם מתנת ה-Lion האגדית של טיקטוק (29,999 יהלומים)! בסריקה אותרה עמודת מריחת פיקסלים כתומה מתחת לרגליים הקדמיות ב-00:03–00:08 וריבועי דחיסה ירוקים ברקע, לפני עמידה נקייה על עשן ב-00:08.6–00:09.8. המנוע מפעיל אוטומטית Keyer מנורמל + מסכת ריכוך תחתונה (38% Feather) שמעלימה ב-100% את מריחת הרגליים ומשאירה רעמת אש מלכותית שואגת מאחורי המגיש!',
    simultaneousAllowed: 1,
    minPerformanceSpec: '60fps Upper-Crest 9:16 Royal Lion Chroma Keyer',
    safeZoneBehaviorHe:
      'מוצג ככתר מלכותי בוער ב-UPPER_CREST_BACK מאחורי ראש וכתפי המגיש — אפס הסתרה של הפנים ואפס זליגה של פסי המריחה התחתונים!',
    centerCrossMs: 0,
    reusabilityHe: 'אפקט הדגל האולטימטיבי לתורמים כבדים (Whales), מתנות אריה וסנייפ ניצחון בבאטל.',
    directorNotesHe: 'כשצופה זורק מתנה גדולה או סנייפ ורואה אריה אש שואג מאחורי המגיש — זה מייצר אפקט הערצה מיידי ומדרבן תורמים נוספים.',
    videoFramingMode: 'UPPER_CREST_BACK',
    cropBottomPct: 8,
    fadeTailSec: 0.75,
    trimStartSec: 2.4,
    maskBottomFeatherPct: 38,
    playEmbeddedAudio: true,
    measuredVideoSpecs: {
      width: 720,
      height: 1280,
      fps: 24,
      durationSec: 10.0,
      sizeMb: '5.25',
      rawAspect: '9:16 אנכי על מסך ירוק (כולל שאגת אריה קולנועית)',
    },
    supervisorAuditHe: {
      identifiedHe: 'אריה אש מלכותי בעל רעמת להבות זהובה-כתומה השואג בעוצמה אדירה (00:03–00:09.8) בליווי שאגות אריה מהדהדות.',
      triggerFitHe: 'מתנת Lion / Whale גדולה בלייב, סנייפ הכרעה לטובתנו ב-20 השניות האחרונות, או חגיגת ניצחון סיבוב — בשכבת BACK.',
      chromaAlphaVerdictHe: 'רעמת האש הכתומה-זהובה נפרדת בעוצמה מהירוק, אך בסריקה זוהו שני פגמים שטופלו: (1) קוביות דחיסה ירוקות ב-00:01–00:07, (2) מריחת פיקסלים אנכית כתומה מתחת לרגליים ב-00:03–00:08.',
      framingSafeZoneHe: 'פתרון מובנה במנוע: חיתוך כרומה מנורמל שמעלים את קוביות הדחיסה הירוקות + מסכת Feather תחתונה (38%) במצב UPPER_CREST_BACK שמציגה רק את רעמת האריה השואגת מעל הכתפיים בלי פסי המריחה.',
      reusabilityHe: 'עליונה — הסמל המזוהה ביותר בעולם ה-TikTok PK Battles לניצחון ותורמי ענק.',
    },
    audio: {
      cueId: 'BEAST_10_ROYAL_FIRE_LION',
      filename: 'sfx_beast10_royal_fire_lion_roar.wav',
      conceptHe: 'שאגת אריה מלכותית תת-תדרית (45Hz) + רעם להבות היקפי.',
      conceptEn: 'Royal lion sub-bass roar with blazing crown pyrotechnics',
      durationSec: 3.5,
      targetPeakDbfs: -2.8,
      relativeLoudnessLufs: -12,
      stereoMovement: 'Monumental wide arena roar (-0.9 / +0.9)',
      vocalCarveHz: '-5.5dB dynamic scoop at 500Hz–3kHz',
      cooldownMs: 9500,
      allowOverlap: false,
    },
    promptEn:
      'Vertical 9:16 locked-off VFX plate on pure uniform #00FF00 green screen, 6 seconds. Majestic roaring golden-orange fire lion head and blazing mane crowning the upper 45% of the frame, clean rising sparks, zero pixel-smear artifacts below chest, central presenter face zone clear.',
  },
];


export interface TimelineCue {
  id: string;
  timeRange: string;
  startSec: number;
  endSec: number;
  phase: BattlePhaseId;
  isQuietMoment: boolean;
  titleHe: string;
  visualDirectionHe: string;
  reactiveRulesHe: string;
  soundDirectionHe: string;
}

export const BATTLE_TIMELINE_CUES: TimelineCue[] = [
  {
    id: 'CUE_01',
    timeRange: '00:00–00:20',
    startSec: 0,
    endSec: 20,
    phase: 'IGNITION',
    isQuietMoment: false,
    titleHe: 'פתיחת שערים ואווירת במה',
    visualDirectionHe: 'עשן נמוך רך (30% צפיפות) בשכבת BACK ותאורת קצה עדינה המפרידה את המגיש מהרקע.',
    reactiveRulesHe: 'לייקים ראשונים מפעילים ניצוצות עדינים בלבד (SPARK); שיתוף מפעיל תותח CO₂ קצר בעוצמה 75%.',
    soundDirectionHe: 'מוזיקת Arena Ignition בווליום מבוקר + אווירת חלל נמוכה (-32 LUFS); הבמה שייכת לקול המגיש.',
  },
  {
    id: 'CUE_02',
    timeRange: '00:20–00:42',
    startSec: 20,
    endSec: 42,
    phase: 'IGNITION',
    isQuietMoment: false,
    titleHe: 'התעוררות ראשונית בשוליים',
    visualDirectionHe: 'הופעת גיצים בודדים וזרימת עשן איטית מצד לצד; מעברי אור רכים בגלי הצטרפות צופים.',
    reactiveRulesHe: 'פתיחת מדרגת CHARGING אם קצב הלייקים חוצה 8 לשנייה.',
    soundDirectionHe: 'הוספת אוושת אור משיית בכניסת צופים ופצפוץ זהב עדין לעוקבים חדשים.',
  },
  {
    id: 'CUE_03_QUIET',
    timeRange: '00:42–00:55',
    startSec: 42,
    endSec: 55,
    phase: 'IGNITION',
    isQuietMoment: true,
    titleHe: 'הפוגת נשימה ראשונה (Intentional Quiet Valley #1)',
    visualDirectionHe: 'דילול מכוון של החלקיקים ל-20% כדי ליצור ניגודיות ברורה לפני הכניסה לשלב התנופה.',
    reactiveRulesHe: 'רק אירועי שיתוף/עוקב פעילים; מיקרו-קשתות צ׳אט מושהות לניקוי הפריים.',
    soundDirectionHe: 'הנמכת שכבת הרקע ב-3dB ליצירת אינטימיות עם דברי המגיש.',
  },
  {
    id: 'CUE_04',
    timeRange: '00:55–01:25',
    startSec: 55,
    endSec: 85,
    phase: 'MOMENTUM',
    isQuietMoment: false,
    titleHe: 'כניסה לתנופה — הקהל מניע את החדר',
    visualDirectionHe: 'עליית צפיפות העשן ל-48% והאצת זרימת הפלזמה ההיקפית בהתאם לקצב הלייקים.',
    reactiveRulesHe: 'במאי ה-AI מעביר ל-Kinetic Bass Drive; רצף 3 שיתופים פותח עמודי עשן אחוריים.',
    soundDirectionHe: 'טעינה הרמונית חיה שעולה ויורדת עם קצב ההקשות של הקהל.',
  },
  {
    id: 'CUE_05',
    timeRange: '01:25–01:44',
    startSec: 85,
    endSec: 104,
    phase: 'MOMENTUM',
    isQuietMoment: false,
    titleHe: 'מומנטום קהילתי ויעד ראשון',
    visualDirectionHe: 'שילוב תותחי CO₂ בשכבת FRONT עם ניצוצות זהב לעוקבים ללא חדירה למרכז הפריים.',
    reactiveRulesHe: 'חלון אידיאלי להשלמת יעד מעורבות ראשון והפעלת גל ההדף (GOAL_SHOCKWAVE_RING).',
    soundDirectionHe: 'הפרדת סטריאו רחבה בין אפקטי שוליים לאימפקט המרכזי של היעד.',
  },
  {
    id: 'CUE_06_QUIET',
    timeRange: '01:44–01:55',
    startSec: 104,
    endSec: 115,
    phase: 'MOMENTUM',
    isQuietMoment: true,
    titleHe: 'רגיעה טקטית באמצע הקרב (Intentional Quiet Valley #2)',
    visualDirectionHe: 'התפוגגות טבעית של העשן העליון והשארת הילת שוליים דקה בלבד.',
    reactiveRulesHe: 'סף הכניסה ל-OVERDRIVE עולה זמנית כדי למנוע שחיקה מוקדמת של אפקט השיא.',
    soundDirectionHe: 'ניקוי זנבות הדהוד לקראת חציית קו 2 הדקות.',
  },
  {
    id: 'CUE_07',
    timeRange: '01:55–02:25',
    startSec: 115,
    endSec: 145,
    phase: 'PRESSURE',
    isQuietMoment: false,
    titleHe: 'חציית קו האמצע — שלב הלחץ וכפפות',
    visualDirectionHe: 'מכת ברק מתפצלת ראשונה ב-BACK מסמנת כניסה ל-PRESSURE; זיהוי מיידי של כפפות x5.',
    reactiveRulesHe: 'פתיחה מלאה של OVERDRIVE והילת כפפה (GLOVE_POWER_SURGE) עם מעבר ל-Glove Overclock.',
    soundDirectionHe: 'פיצוח חשמלי מבוקר, טעינת טורבינה לכפפה ותוספת משקל תת-תדרי (55Hz).',
  },
  {
    id: 'CUE_08',
    timeRange: '02:25–02:45',
    startSec: 145,
    endSec: 165,
    phase: 'PRESSURE',
    isQuietMoment: false,
    titleHe: 'קרב צמוד בלחץ גבוה',
    visualDirectionHe: 'סינרגיה בין עמודי עשן אחוריים לניצוצות מהירים בשוליים; תאורת Rim חזקה יותר.',
    reactiveRulesHe: 'בורר הקדימויות מוודא לא יותר מ-3 שכבות חד-פעמיות במקביל.',
    soundDirectionHe: 'הגנה אקטיבית על תחום הדיבור (1kHz–3kHz) גם בזמן שיאי שיתופים.',
  },
  {
    id: 'CUE_09_QUIET',
    timeRange: '02:45–02:55',
    startSec: 165,
    endSec: 175,
    phase: 'PRESSURE',
    isQuietMoment: true,
    titleHe: 'שאיפת אוויר לפני הדקה האחרונה (Intentional Quiet Valley #3)',
    visualDirectionHe: 'האטה מכוונת של תנועת העשן ומעבר לגוון כהה ועמוק יותר.',
    reactiveRulesHe: 'דיכוי אפקטים משניים (צ׳אט/כניסת צופים) כדי להכין את העין למעבר ל-TENSION.',
    soundDirectionHe: 'ירידה רגעית בעוצמה ליצירת מתח דרמטי בדקה המסכמת.',
  },
  {
    id: 'CUE_10',
    timeRange: '02:55–03:38',
    startSec: 175,
    endSec: 218,
    phase: 'TENSION',
    isQuietMoment: false,
    titleHe: 'טבעת המתח והכנה לסנייפים',
    visualDirectionHe: 'הפעלת TENSION_EMBER_VORTEX: החשכת Vignette היקפית, גחלים עולות ופעימה ויזואלית קצבית.',
    reactiveRulesHe: 'במאי ה-AI עוקב אחרי פער הניקוד ומפעיל התראת סנייפ אם הפער צמוד.',
    soundDirectionHe: 'מעבר ל-Final Snipe Clockwork ופעימת דופק תת-תדרית שמאיצה בהדרגה.',
  },
  {
    id: 'CUE_11_PRE_DROP',
    timeRange: '03:38–03:45',
    startSec: 218,
    endSec: 225,
    phase: 'TENSION',
    isQuietMoment: true,
    titleHe: 'שקט הדריכה שלפני הפינאלה והסנייפ (Pre-Climax Vacuum)',
    visualDirectionHe: 'שאיבה פנימה של הגחלים והחשכת שוליים נקייה — כל הפוקוס על פני המגיש הסופר לאחור.',
    reactiveRulesHe: 'רק אירוע סנייפ קריטי (SNIPE_CRITICAL_FLASH) או כפפה יכולים לפרוץ את השקט.',
    soundDirectionHe: 'חיתוך הדרגתי של הנמוכים לקראת ה-Riser הסופי.',
  },
  {
    id: 'CUE_12_FINALE',
    timeRange: '03:45–04:00',
    startSec: 225,
    endSec: 240,
    phase: 'FINALE',
    isQuietMoment: false,
    titleHe: 'גראנד פינאלה, חלון סנייפ אחרון ומעבר חכם',
    visualDirectionHe: '03:45 מזרקות זהב וסילוני CO₂ בפינות → 03:53 כתר ברקים → 03:59 גל הדף וגשם גיצים.',
    reactiveRulesHe: 'בסיום 04:00 הבמאי מזהה אם התחיל קרב חדש או שעברת למצב סולו ומתאים אווירה ומוזיקה.',
    soundDirectionHe: 'Riser רב-שכבתי מתוזמן, שבריר דממה ב-03:58.7, ואימפקט סיום מוגבל ל--2.0dBFS.',
  },
];

export interface QcCheckItem {
  id: string;
  categoryHe: string;
  titleHe: string;
  passCriteriaHe: string;
  howToVerifyHe: string;
}

export const QC_CHECKLIST_ITEMS: QcCheckItem[] = [
  {
    id: 'QC_01_ALPHA_CHROMA',
    categoryHe: 'שקיפות וקומפוזיטינג',
    titleHe: 'בדיקת שקיפות Alpha אמיתית מול כרומה (#00FF00) ו-Screen',
    passCriteriaHe: 'אפס הילה ירוקה על עשן חצי-שקוף ואפס חיתוך חד של שובלי ניצוצות.',
    howToVerifyHe: 'הפעל את מצב הבדיקה המפוצל במעבדת הווידאו ובדוק קצוות מעל רקע כהה ובהיר כאחד.',
  },
  {
    id: 'QC_02_SAFE_ZONE',
    categoryHe: 'קריאות פני המגיש',
    titleHe: 'שמירה על אזור בטוח של 45%–50% במרכז הפריים',
    passCriteriaHe: 'אפקטים רגילים אינם חודרים כלל לאזור הפנים; גלי הדף חוצים בפחות מ-280 מילישניות.',
    howToVerifyHe: 'הדלק את שכבת רשת ה-Safe Zone במוניטור ה-9:16 בזמן עומס OVERDRIVE, כפפות וסנייפים.',
  },
  {
    id: 'QC_03_FPS_GPU',
    categoryHe: 'ביצועי שידור חי',
    titleHe: 'יציבות 60fps וזמן פריים מתחת ל-16.6ms ב-Browser Source',
    passCriteriaHe: 'יציבות של 58–60fps גם בזמן ה-Grand Finale במקביל לקידוד NVENC ב-OBS.',
    howToVerifyHe: 'עקוב אחר מד ה-FPS וזמן הפריים האמיתי בחלונית בקרת האיכות בזמן הפעלת בדיקת עומס קהל.',
  },
  {
    id: 'QC_04_OVERLAP_CAP',
    categoryHe: 'מניעת עומס ויזואלי',
    titleHe: 'אכיפת מקסימום שכבות פעילות ו-Cooldowns',
    passCriteriaHe: 'לא יותר מ-3 אפקטים מתפרצים (One-Shot) רצים יחד מעל האווירה וטעינת הלייקים.',
    howToVerifyHe: 'שלח 10 אירועי שיתוף ועוקב ברצף מהיר וודא ביומן האירועים שהמערכת מסננת כפילויות ב-Cooldown.',
  },
  {
    id: 'QC_05_AUDIO_SPEECH',
    categoryHe: 'סאונד, מוזיקה ובהירות דיבור',
    titleHe: 'הנמכת מוזיקה אוטומטית (Voice Ducking) ופינוי תדרי קול אדם',
    passCriteriaHe: 'ברגע שהמגיש מדבר למיקרופון, המוזיקה יורדת אוטומטית ב-55% וקול המגיש נשאר חד וברור.',
    howToVerifyHe: 'הפעל האזנת מיקרופון בלשונית במאי AI, נגן רצועת מוזיקה ודבר למיקרופון.',
  },
  {
    id: 'QC_06_SOLO_VS_BATTLE',
    categoryHe: 'גמישות מצב סולו מול קרב',
    titleHe: 'מעבר חכם בין קרב תחרותי (4 דקות) לשידור סולו חופשי',
    passCriteriaHe: 'במצב סולו נכבים שעוני הלחץ ומופעלת תאורת טונגסטן רכה ומוזיקת אירוח מותאמת לאנרגיית החדר.',
    howToVerifyHe: 'החלף בין מצב קרב למצב סולו בלשונית במאי AI וצפה בשינוי האווירה, המוזיקה והחלטות ה-AI.',
  },
];

export const DIRECTOR_ASSESSMENT_HE = {
  roleSummary:
    'הערכת במאי VFX ראשי ומנהל טכני לשידור חי (BOOSTERA Master Brief + AI Live Showrunner)',
  whatWeHaveNow: [
    'במאי AI חי ואוטונומי שמאזין למיקרופון ולמוזיקה, קורא את הצ׳אט, עוקב אחרי השעון (4 דקות), פער הניקוד, סנייפים וכפפות x5, ומפעיל בעצמו מוזיקה, קולות ואפקטים.',
    'תמיכה מלאה גם במצב סולו (כשאתה משדר לבד ללא קרב): הבמאי מזהה מתי יש שיחה רגועה, מתי יש שקט/נפילת אנרגיה ומתי הקהל מתלהב, ומתאים מוזיקה ואפקטים עדינים.',
    '14 רגעי VFX קולנועיים ב-60fps (כולל הילת כפפה x5, פולס סנייפ קריטי ואווירת אולפן סולו חמה) + 8 רצועות מוזיקה דינמיות + 16 אפקטי קול ואווירה.',
    'מנוע דאקינג (Auto Voice Ducking) שמאזין לקול שלך ומנמיך אוטומטית את המוזיקה כשאתה מדבר כדי שהקול שלך תמיד יוביל.',
  ],
  whatWasMissingInTypicalSetups: [
    'במערכות רגילות האפקטים "עיוורים וחירשים" — הם פועלים לפי כפתור קבוע גם כשהמגיש באמצע משפט שקט או כשיש סנייפ דרמטי.',
    'חסרה הבחנה בין שידור קרב אינטנסיבי לבין שעות שידור שבהן היוצר לבד עם הקהל שלו.',
    'חסרה אינטגרציה בין המוזיקה המתנגנת ברקע לבין הקולות והאפקטים — כעת הבמאי שולט בשניהם יחד כמנצח תזמורת אחד.',
  ],
  whatWeMustStopMaking: [
    'להפסיק לייצר להבות, ניצוצות וברקים על רקע ירוק (#00FF00)! הפתרון המקצועי הוא Alpha אמיתי (Browser Source חי / WebM VP9) או רקע שחור (#000000) במיזוג Screen.',
    'להפסיק להפעיל צופרים רועשים או פיצוצים שמכסים את פני המגיש או קוטעים שיחה אינטימית במצב סולו.',
    'להפסיק להשמיע את אותה לולאת מוזיקה מונוטונית במשך 4 דקות בלי קשר למה שקורה בניקוד או בכפפות.',
  ],
  highestImpactEffects: [
    '1. AI Showrunner + Auto Voice Ducking — מרגיש כמו במאי וטכנאי סאונד אמיתי באולפן שידור חי.',
    '2. GLOVE_POWER_SURGE + MUS_GLOVE_OVERCLOCK — הופך 30 שניות של כפפה לחוויית אדרנלין מתואמת של אור, מוזיקה וסאונד.',
    '3. SNIPE_CRITICAL_FLASH + SND_SNIPE_LOCK — מייצר דריכות שיא ב-25 השניות האחרונות מבלי להסתיר את המגיש.',
    '4. SOLO_WARM_LOUNGE + MUS_SOLO_VELVET_LOFI — שומר על השידור חי, יוקרתי ונעים גם כשאתה לבד בין קרבות.',
  ],
  technicalHonestyAndPerformance: [
    'שקיפות טכנית לגבי מודלי וידאו ב-AI: קובצי MP4 גנרטיביים אינם כוללים ערוץ Alpha מובנה ורצים טבעית ב-24–30fps. לכן שילבנו רינדור חי ב-60fps ב-Browser Source עם אפשרות ייצוא WebM ופרומפטים מלאים.',
    'שמירה על ביצועי שידור: כל המוזיקה, הסאונד וה-VFX מסונתזים ומרונדרים בתהליך קל משקל (<5% GPU) עם סנכרון WebSocket מלא ל-OBS.',
  ],
};
