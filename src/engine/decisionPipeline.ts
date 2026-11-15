export type PipelineStageId =
  | 'LIVE'
  | 'DATA'
  | 'OPENAI'
  | 'CLAUDE'
  | 'GEMINI'
  | 'DECISION'
  | 'APPROVAL'
  | 'EXECUTION'
  | 'RESULT';

export type PipelineStageStatus =
  | 'COMPLETED'
  | 'ACTIVE'
  | 'PENDING'
  | 'SKIPPED'
  | 'NOT_CONFIGURED'
  | 'FAILED'
  | 'REJECTED';

export type DecisionApprovalMode = 'AUTO_EXECUTE' | 'REQUIRE_APPROVAL';

export type DecisionApprovalStatus =
  | 'AUTO_EXECUTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED_EXECUTED'
  | 'REJECTED'
  | 'COUNCIL_BLOCKED'
  | 'EXPIRED'
  | 'EXECUTION_FAILED';

export type ClaudeVerdict = 'APPROVE' | 'REJECT' | 'DISAGREE' | 'ERROR';

export interface PipelineStageLog {
  stage: PipelineStageId;
  labelHe: string;
  status: PipelineStageStatus;
  timestamp: number;
  detailHe: string;
  evidence?: string;
}

export interface PlannedExecutionPayload {
  vfxId?: string | null;
  vfxPlacementLayer?: string | null;
  targetUsername?: string | null;
  timingSec?: number | null;
  musicTrackId?: string | null;
  soundCueId?: string | null;
  cameraPreset?: string | null;
  cameraReasonHe?: string | null;
  tapCalloutTextHe?: string | null;
  tapDurationSec?: number | null;
  chatLineHe?: string | null;
  chatRole?: string | null;
  ruleId?: string | null;
  ruleVersion?: number | null;
}

export interface StructuredDirectorPlan {
  situationSummaryHe: string;
  tensionScore: number;
  energyScore: number;
  targetRoomOrScope: string;
  layerPlacement: string;
  vfxId: string | null;
  soundCueId: string | null;
  musicTrackId: string | null;
  cameraPreset: string | null;
  cameraReasonHe: string | null;
  tapCalloutTextHe: string | null;
  tapDurationSec: number | null;
  timingNoteHe: string;
  rationaleHe: string;
  chatLineHe?: string | null;
}

export interface ClaudeInspectionResult {
  verdict: ClaudeVerdict;
  summaryHe: string;
  reasonHe?: string;
  concernsHe?: string[];
  suggestedAdjustmentsHe?: string;
  requestedModel?: string;
  actualModel?: string | null;
  authOk?: boolean;
  modelOk?: boolean;
  errorHe?: string;
  timestamp?: number;
}

export interface ProviderStageInput {
  configured: boolean;
  called: boolean;
  ok: boolean;
  model?: string;
  role?: string;
  requestedModel?: string;
  actualModel?: string | null;
  authOk?: boolean;
  modelOk?: boolean;
  keyDiagnostic?: {
    present: boolean;
    hadKeyPrefix: boolean;
    hadBearerPrefix: boolean;
    hadQuotes: boolean;
    hasNonAscii: boolean;
    length: number;
  };
  summaryHe: string;
  errorHe?: string;
  timestamp?: number;
}

export interface CouncilGateEvaluation {
  approved: boolean;
  approvedByCouncil: boolean;
  blockedBy?: 'OPENAI' | 'CLAUDE';
  status: 'COUNCIL_APPROVED' | 'COUNCIL_BLOCKED';
  reasonHe: string;
  blockReasonHe?: string;
  finalPayload: PlannedExecutionPayload | null;
}

export interface PipelineTraceBuildInput {
  nowTs: number;
  liveConnected: boolean;
  liveTargetUsername: string | null;
  liveRoomId: string | null;
  liveViewerCount: number;
  packetsCaptured: number;
  dataSummaryHe: string;
  openai: ProviderStageInput;
  claude: ProviderStageInput;
  gemini: ProviderStageInput;
  decisionSummaryHe: string;
  approvalMode: DecisionApprovalMode;
  approvalStatus: DecisionApprovalStatus;
  executionDetailHe: string;
  executionEvidence?: string;
  resultDetailHe: string;
}

export interface ApprovableDecisionLike {
  id: string;
  timestamp: number;
  expiresAt?: number | null;
  approvalStatus?: DecisionApprovalStatus;
  approvedAt?: number | null;
  approvedBy?: string | null;
  executedAt?: number | null;
  councilApproved?: boolean;
  plannedPayload?: PlannedExecutionPayload | null;
  pipelineTrace?: PipelineStageLog[];
}

export interface ProposalGovernanceFields {
  approved?: boolean;
  status?: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  version?: number;
  active?: boolean;
  autoEnabled?: boolean;
  approvedAt?: number | null;
  approvedBy?: string | null;
}

export interface IntegrationAuditInput {
  geelarkConfigured: boolean;
  geelarkDevicesCount: number;
  geelarkLastErrorHe: string | null;
  geelarkRpaReady?: boolean;
  geelarkRpaNoteHe?: string | null;
  tiktokOauthConfigured: boolean;
  tiktokOauthUser: string | null;
  tiktokWebcastConnected: boolean;
  tiktokWebcastUsername: string | null;
  tiktokWebcastRoomId: string | null;
  tiktokWebcastViewers: number;
  tiktokOwnedRoomUsername?: string | null;
  openaiConfigured: boolean;
  claudeConfigured: boolean;
  geminiConfigured: boolean;
  openaiRequestedModel?: string;
  claudeRequestedModel?: string;
  externalWsConnectedCount: number;
}

export interface ChatPermissionCapability {
  id: string;
  actionHe: string;
  channel: 'TIKTOK_WEBCAST' | 'TIKTOK_OAUTH' | 'BOOSTERA_LOCAL' | 'GEELARK_DEVICE';
  supportLevel: 'LIVE_READ_ONLY' | 'LOCAL_PREVIEW_ONLY' | 'REQUIRES_GEELARK_OR_BRIDGE' | 'NOT_PERMITTED_BY_API';
  allowedInRealTikTok: boolean;
  detailHe: string;
}

export interface IntegrationAuditReport {
  generatedAt: number;
  geelark: {
    configured: boolean;
    connected: boolean;
    devicesCount: number;
    rpaReady: boolean;
    statusHe: string;
  };
  tiktokAccount: {
    oauthConfigured: boolean;
    oauthUser: string | null;
    oauthScopes: string[];
    webcastConnected: boolean;
    webcastUsername: string | null;
    webcastRoomId: string | null;
    webcastViewers: number;
    ownedRoomUsername: string | null;
    accessSummaryHe: string;
  };
  aiProviders: {
    openaiConfigured: boolean;
    claudeConfigured: boolean;
    geminiConfigured: boolean;
    openaiRequestedModel: string;
    claudeRequestedModel: string;
  };
  chatCapabilities: ChatPermissionCapability[];
}

export function sanitizeSecretHeaderValue(rawInput: string | undefined, envName: string): {
  value: string;
  present: boolean;
  hadKeyPrefix: boolean;
  hadBearerPrefix: boolean;
  hadQuotes: boolean;
  hasNonAscii: boolean;
  length: number;
} {
  let raw = (rawInput || '').trim();
  if (!raw) {
    return {
      value: '',
      present: false,
      hadKeyPrefix: false,
      hadBearerPrefix: false,
      hadQuotes: false,
      hasNonAscii: false,
      length: 0,
    };
  }
  let hadKeyPrefix = false;
  let hadBearerPrefix = false;
  let hadQuotes = false;

  const exactPrefix = `${envName}=`;
  if (raw.startsWith(exactPrefix)) {
    raw = raw.slice(exactPrefix.length).trim();
    hadKeyPrefix = true;
  } else if (/^(?:OPENAI_API_KEY|OPENAI_MODEL|ANTHROPIC_API_KEY|ANTHROPIC_MODEL|GEMINI_API_KEY|GEELARK_API_KEY|GEELARK_APP_ID|KEY)=/i.test(raw)) {
    raw = raw.replace(/^[A-Z0-9_]+=/i, '').trim();
    hadKeyPrefix = true;
  }

  if (/^Bearer\s+/i.test(raw)) {
    raw = raw.replace(/^Bearer\s+/i, '').trim();
    hadBearerPrefix = true;
  }

  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
    hadQuotes = true;
  }

  // Remove accidental line breaks / carriage returns inside pasted secret values
  raw = raw.replace(/[\r\n]+/g, '').trim();
  const hasNonAscii = /[^\x20-\x7E]/.test(raw);

  return {
    value: raw,
    present: Boolean(raw),
    hadKeyPrefix,
    hadBearerPrefix,
    hadQuotes,
    hasNonAscii,
    length: raw.length,
  };
}

/**
 * Server-side approval policy enforcement.
 * Client passing `requireApproval: false` CANNOT disable a server policy of `REQUIRE_APPROVAL`.
 */
export function enforceServerApprovalPolicy(params: {
  serverApprovalMode: DecisionApprovalMode;
  clientRequireApproval?: unknown;
  clientRequestedRequireApproval?: unknown;
  bypassAttemptReason?: string;
}): {
  needsApproval: boolean;
  requiresApproval: boolean;
  effectiveMode: DecisionApprovalMode;
  bypassBlocked: boolean;
  overrideBlocked: boolean;
  policyReasonHe: string;
} {
  const clientFlag =
    params.clientRequireApproval !== undefined
      ? params.clientRequireApproval
      : params.clientRequestedRequireApproval;

  if (params.serverApprovalMode === 'REQUIRE_APPROVAL') {
    const clientTriedBypass = clientFlag === false;
    return {
      needsApproval: true,
      requiresApproval: true,
      effectiveMode: 'REQUIRE_APPROVAL',
      bypassBlocked: clientTriedBypass,
      overrideBlocked: clientTriedBypass,
      policyReasonHe: clientTriedBypass
        ? 'נחסמה בקשת לקוח לעקוף אישור (requireApproval:false) — מדיניות השרת מחייבת אישור מפעיל'
        : 'מדיניות השרת במצב REQUIRE_APPROVAL — נדרש אישור מפורש לפני ביצוע',
    };
  }
  const forceFromClient = clientFlag === true;
  return {
    needsApproval: forceFromClient,
    requiresApproval: forceFromClient,
    effectiveMode: 'AUTO_EXECUTE',
    bypassBlocked: false,
    overrideBlocked: false,
    policyReasonHe: forceFromClient
      ? 'מדיניות השרת מתירה אוטונומיה אך הבקשה סומנה ידנית לאישור מפעיל'
      : 'מדיניות השרת במצב AUTO_EXECUTE (עבור תוכניות שאושרו במועצה או חוקים מאושרי-גרסה)',
  };
}

type EvaluateCouncilInput =
  | {
      openai: { ok: boolean; plan: StructuredDirectorPlan | null; errorHe?: string };
      claude: { ok: boolean; inspection: ClaudeInspectionResult | null; errorHe?: string };
    }
  | {
      openAiStage: ProviderStageInput;
      openAiPlan: StructuredDirectorPlan | null;
      claudeStage: ProviderStageInput;
      claudeInspection: ClaudeInspectionResult | null;
    };

/**
 * Authority boundary for OpenAI (Planner) + Claude (Inspector).
 * Gemini NEVER decides or substitutes when OpenAI or Claude fails, disagrees, or rejects.
 */
export function evaluateCouncilDecision(params: EvaluateCouncilInput): CouncilGateEvaluation {
  const oaOk = 'openai' in params ? params.openai.ok : params.openAiStage.configured && params.openAiStage.ok;
  const oaPlan = 'openai' in params ? params.openai.plan : params.openAiPlan;
  const oaErr = 'openai' in params ? params.openai.errorHe : params.openAiStage.errorHe;

  const clOk = 'claude' in params ? params.claude.ok : params.claudeStage.configured && params.claudeStage.ok;
  const clInspection = 'claude' in params ? params.claude.inspection : params.claudeInspection;
  const clErr = 'claude' in params ? params.claude.errorHe : params.claudeStage.errorHe;

  if (!oaOk || !oaPlan) {
    const reasonHe =
      oaErr || 'OpenAI לא הפיק תוכנית מובנית תקינה — הביצוע נעצר (אין מעבר להחלטת Gemini).';
    return {
      approved: false,
      approvedByCouncil: false,
      blockedBy: 'OPENAI',
      status: 'COUNCIL_BLOCKED',
      reasonHe,
      blockReasonHe: reasonHe,
      finalPayload: null,
    };
  }

  if (!clOk || !clInspection) {
    const reasonHe =
      clErr || 'בדיקת Claude נכשלה או לא זמינה — התוכנית נעצרה (אין מעבר אוטומטי ל-Gemini).';
    return {
      approved: false,
      approvedByCouncil: false,
      blockedBy: 'CLAUDE',
      status: 'COUNCIL_BLOCKED',
      reasonHe,
      blockReasonHe: reasonHe,
      finalPayload: null,
    };
  }

  if (
    clInspection.verdict === 'REJECT' ||
    clInspection.verdict === 'DISAGREE' ||
    clInspection.verdict === 'ERROR'
  ) {
    const note = clInspection.summaryHe || clInspection.reasonHe || 'נדחה בבדיקת המועצה';
    const reasonHe = `Claude בלם את התוכנית (${clInspection.verdict}): ${note}`;
    return {
      approved: false,
      approvedByCouncil: false,
      blockedBy: 'CLAUDE',
      status: 'COUNCIL_BLOCKED',
      reasonHe,
      blockReasonHe: reasonHe,
      finalPayload: null,
    };
  }

  return {
    approved: true,
    approvedByCouncil: true,
    status: 'COUNCIL_APPROVED',
    reasonHe: `תוכנית OpenAI אושרה ע״י Claude (${clInspection.summaryHe || clInspection.reasonHe || 'APPROVE'})`,
    finalPayload: {
      vfxId: oaPlan.vfxId,
      vfxPlacementLayer: oaPlan.layerPlacement,
      targetUsername: oaPlan.targetRoomOrScope,
      musicTrackId: oaPlan.musicTrackId,
      soundCueId: oaPlan.soundCueId,
      cameraPreset: oaPlan.cameraPreset,
      cameraReasonHe: oaPlan.cameraReasonHe,
      tapCalloutTextHe: oaPlan.tapCalloutTextHe,
      tapDurationSec: oaPlan.tapDurationSec,
      chatLineHe: oaPlan.chatLineHe,
    },
  };
}

/**
 * Deterministic rule guard: only pre-approved rules explicitly saved with an integer version >= 1 may execute.
 */
export function canDeterministicRuleExecute(rule: ProposalGovernanceFields | null | undefined): {
  allowed: boolean;
  reasonHe: string;
} {
  if (!rule) {
    return { allowed: false, reasonHe: 'לא סופק חוק דטרמיניסטי מאומת' };
  }
  if (rule.approved !== true || rule.status !== 'APPROVED') {
    return {
      allowed: false,
      reasonHe: `החוק נשמר כהצעה (${rule.status || 'PROPOSED'}) ואינו מאושר להרצה אוטונומית`,
    };
  }
  if (!Number.isInteger(rule.version) || (rule.version ?? 0) < 1) {
    return { allowed: false, reasonHe: 'לחוק חסר מספר גרסה מאושר תקין (version >= 1)' };
  }
  if (rule.active !== true) {
    return { allowed: false, reasonHe: 'החוק המאושר מושבת כרגע (active=false)' };
  }
  return { allowed: true, reasonHe: `חוק מאושר v${rule.version}` };
}

/**
 * Normalizes any newly generated Gemini insight/rule/tool so it is NEVER auto-activated.
 */
export function toProposedGovernanceDefaults(): Required<
  Pick<ProposalGovernanceFields, 'approved' | 'status' | 'version' | 'active' | 'autoEnabled' | 'approvedAt' | 'approvedBy'>
> {
  return {
    approved: false,
    status: 'PROPOSED',
    version: 1,
    active: false,
    autoEnabled: false,
    approvedAt: null,
    approvedBy: null,
  };
}

type OwnedRoomCheckInput =
  | {
      requestedRoomUsername: string | null | undefined;
      configuredOwnedRoom: string | null | undefined;
      confirmedOwnedRoom?: boolean;
    }
  | {
      targetRoomUsername: string | null | undefined;
      ownedRooms: string[];
      explicitlyConfirmedOwned?: boolean;
    };

/**
 * Prevents automated or live-test chat sends to public rooms NOT explicitly controlled by the operator.
 */
export function assertOwnedTikTokRoomForSend(params: OwnedRoomCheckInput): {
  allowed: boolean;
  normalizedRoom: string;
  reasonHe: string;
} {
  const isServerVariant = 'ownedRooms' in params;
  const targetRaw = isServerVariant ? params.targetRoomUsername : params.requestedRoomUsername;
  const target = (targetRaw || '').replace(/^@/, '').trim().toLowerCase();
  if (!target) {
    return {
      allowed: false,
      normalizedRoom: '',
      reasonHe: 'לא הוגדר שם חדר יעד שבבעלותך — חסום לשליחת הודעת צ׳אט',
    };
  }

  const ownedList = isServerVariant
    ? params.ownedRooms
    : (params.configuredOwnedRoom || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const normalizedOwned = ownedList.map((r) => r.replace(/^@/, '').trim().toLowerCase()).filter(Boolean);
  const confirmed = isServerVariant
    ? params.explicitlyConfirmedOwned !== false
    : params.confirmedOwnedRoom === true;

  if (normalizedOwned.length === 0) {
    return {
      allowed: false,
      normalizedRoom: target,
      reasonHe:
        'בטיחות שידור: לא הוגדר TIKTOK_OWNED_ROOM_USERNAME בשרת — לא ניתן לשלוח לחדר שאינו מאומת כשייך למפעיל.',
    };
  }

  if (normalizedOwned.includes(target) && confirmed) {
    return {
      allowed: true,
      normalizedRoom: target,
      reasonHe: `החדר @${target} מאומת כחדר בשליטת המפעיל`,
    };
  }

  return {
    allowed: false,
    normalizedRoom: target,
    reasonHe: normalizedOwned.includes(target)
      ? `נדרש אישור מפורש (confirmedOwnedRoom:true) שהחדר @${target} הוא בשליטתך כעת`
      : `בטיחות שידור: החדר @${target} אינו רשום כחדר בשליטתך (TIKTOK_OWNED_ROOM_USERNAME) — שליחה חסומה למניעת כתיבה בחדרי יוצרים אחרים.`,
  };
}

function resolveProviderStatus(input: ProviderStageInput): PipelineStageStatus {
  if (!input.configured) return 'NOT_CONFIGURED';
  if (!input.called) return 'SKIPPED';
  return input.ok ? 'COMPLETED' : 'FAILED';
}

export function buildPipelineTrace(input: PipelineTraceBuildInput): PipelineStageLog[] {
  const ts = input.nowTs;
  const isPending = input.approvalStatus === 'PENDING_APPROVAL';
  const isRejected = input.approvalStatus === 'REJECTED';
  const isBlocked = input.approvalStatus === 'COUNCIL_BLOCKED';
  const isExpired = input.approvalStatus === 'EXPIRED';
  const isExecFailed = input.approvalStatus === 'EXECUTION_FAILED';

  const approvalStageStatus: PipelineStageStatus = isBlocked
    ? 'SKIPPED'
    : isPending
      ? 'PENDING'
      : isExpired || isRejected
        ? 'REJECTED'
        : 'COMPLETED';

  const executionStageStatus: PipelineStageStatus = isBlocked || isRejected || isExpired
    ? 'SKIPPED'
    : isPending
      ? 'PENDING'
      : isExecFailed
        ? 'FAILED'
        : 'COMPLETED';

  const resultStageStatus: PipelineStageStatus = isBlocked || isExecFailed
    ? 'FAILED'
    : isPending
      ? 'PENDING'
      : isRejected || isExpired
        ? 'REJECTED'
        : 'COMPLETED';

  return [
    {
      stage: 'LIVE',
      labelHe: 'קלט לייב (TikTok WebCast / מצלמה)',
      status: input.liveConnected ? 'COMPLETED' : 'SKIPPED',
      timestamp: ts,
      detailHe: input.liveConnected
        ? `מאזין לחדר חי @${input.liveTargetUsername || 'unknown'} (${input.liveViewerCount} צופים)`
        : 'אין חדר TikTok חי מחובר כרגע — נשען על מצב הבמה והטלמטריה',
      evidence: input.liveRoomId ? `roomId=${input.liveRoomId}` : undefined,
    },
    {
      stage: 'DATA',
      labelHe: 'איסוף ועיבוד נתונים (DATA / Gemini Collector)',
      status: 'COMPLETED',
      timestamp: ts,
      detailHe: input.dataSummaryHe,
      evidence: `wsPackets=${input.packetsCaptured}`,
    },
    {
      stage: 'OPENAI',
      labelHe: 'מתכנן החלטה — OpenAI',
      status: resolveProviderStatus(input.openai),
      timestamp: input.openai.timestamp ?? ts,
      detailHe: !input.openai.configured
        ? 'OPENAI_API_KEY לא מוגדר בשרת — השלב נכשל ונחסם (ללא הדמיה וללא מודל ישן)'
        : !input.openai.called
          ? 'שלב OpenAI דולג במחזור זה'
          : input.openai.ok
            ? input.openai.summaryHe
            : input.openai.errorHe || 'קריאת OpenAI נכשלה',
      evidence: [
        input.openai.requestedModel ? `requested=${input.openai.requestedModel}` : '',
        input.openai.actualModel !== undefined
          ? `actual=${input.openai.actualModel || 'NONE'}`
          : input.openai.model
            ? `model=${input.openai.model}`
            : '',
        typeof input.openai.authOk === 'boolean' ? `authOk=${input.openai.authOk}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    {
      stage: 'CLAUDE',
      labelHe: 'מבקר מועצה — Claude (Anthropic)',
      status: resolveProviderStatus(input.claude),
      timestamp: input.claude.timestamp ?? ts,
      detailHe: !input.claude.configured
        ? 'ANTHROPIC_API_KEY לא מוגדר בשרת — הביצוע חסום'
        : !input.claude.called
          ? 'שלב Claude דולג במחזור זה'
          : input.claude.ok
            ? input.claude.summaryHe
            : input.claude.errorHe || 'בדיקת Claude נכשלה',
      evidence: [
        input.claude.requestedModel ? `requested=${input.claude.requestedModel}` : '',
        input.claude.actualModel !== undefined
          ? `actual=${input.claude.actualModel || 'NONE'}`
          : input.claude.model
            ? `model=${input.claude.model}`
            : '',
        typeof input.claude.authOk === 'boolean' ? `authOk=${input.claude.authOk}` : '',
        typeof input.claude.modelOk === 'boolean' ? `modelOk=${input.claude.modelOk}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    {
      stage: 'GEMINI',
      labelHe: 'מבצע מורשה / מאסף חומר (Gemini)',
      status: resolveProviderStatus(input.gemini),
      timestamp: input.gemini.timestamp ?? ts,
      detailHe: !input.gemini.configured
        ? 'GEMINI_API_KEY לא מוגדר — פועל איסוף טלמטריה דטרמיניסטי בלבד'
        : !input.gemini.called
          ? 'שלב Gemini דולג — אינו מחליט במקום מועצת OpenAI + Claude'
          : input.gemini.ok
            ? input.gemini.summaryHe
            : input.gemini.errorHe || 'Gemini נכשל',
      evidence: input.gemini.model ? `model=${input.gemini.model} (collector_executor_only)` : 'role=collector_executor_only',
    },
    {
      stage: 'DECISION',
      labelHe: 'פסק דין מועצה (DECISION)',
      status: isBlocked ? 'FAILED' : 'COMPLETED',
      timestamp: ts,
      detailHe: input.decisionSummaryHe,
    },
    {
      stage: 'APPROVAL',
      labelHe: 'שער אישור בשרת (APPROVAL)',
      status: approvalStageStatus,
      timestamp: ts,
      detailHe: isBlocked
        ? 'נעצר במועצה — לא עבר לשער האישור/ביצוע'
        : isPending
          ? 'ממתין לאישור מפעיל מפורש בשרת לפני ביצוע'
          : isExpired
            ? 'פג תוקף התוכנית — הביצוע חסום'
            : isRejected
              ? 'החלטה נדחתה ע״י המפעיל ולא תבוצע'
              : input.approvalMode === 'AUTO_EXECUTE'
                ? 'תוכנית מאושרת מועצה / חוק גרסה מאושר'
                : 'אושר ידנית ע״י המפעיל',
    },
    {
      stage: 'EXECUTION',
      labelHe: 'ביצוע פעולות מאומת (EXECUTION)',
      status: executionStageStatus,
      timestamp: ts,
      detailHe: isBlocked
        ? 'לא בוצע — המועצה חסמה את ההחלטה (ללא מעבר אוטומטי ל-Gemini)'
        : isPending
          ? 'ממתין לאישור לפני הפעלת שכבות הבמה / GeeLark'
          : isRejected || isExpired
            ? 'בוטל — התוכנית נדחתה או פג תוקפה'
            : input.executionDetailHe,
      evidence: !isPending && !isRejected && !isBlocked && !isExpired ? input.executionEvidence : undefined,
    },
    {
      stage: 'RESULT',
      labelHe: 'תוצאה מאומתת (RESULT)',
      status: resultStageStatus,
      timestamp: ts,
      detailHe: isBlocked
        ? 'התוכנית נחסמה במועצה — אפס פעולות בוצעו'
        : isPending
          ? 'טרם הופקה תוצאה — ממתין לאישור'
          : isRejected || isExpired
            ? 'לא בוצע שינוי במנוע הבמה או במכשיר חיצוני'
            : input.resultDetailHe,
    },
  ];
}

export function applyApprovalTransition<T extends ApprovableDecisionLike>(
  decision: T,
  action: 'APPROVE' | 'REJECT',
  actor: string,
  nowTs: number,
  executionOutcome?: {
    ok: boolean;
    detailHe: string;
    evidence?: string;
    resultDetailHe: string;
  }
): { ok: boolean; errorHe?: string; updated: T } {
  const currentStatus = decision.approvalStatus || 'AUTO_EXECUTED';
  if (currentStatus !== 'PENDING_APPROVAL') {
    return {
      ok: false,
      errorHe: `לא ניתן לבצע ${action} על החלטה בסטטוס ${currentStatus} (מניעת ביצוע כפול/חסום)`,
      updated: decision,
    };
  }

  const nextTrace = (decision.pipelineTrace || []).map((step) => ({ ...step }));
  const upsertStep = (
    stage: PipelineStageId,
    status: PipelineStageStatus,
    detailHe: string,
    evidence?: string
  ) => {
    const idx = nextTrace.findIndex((s) => s.stage === stage);
    if (idx >= 0) {
      nextTrace[idx] = {
        ...nextTrace[idx],
        status,
        timestamp: nowTs,
        detailHe,
        evidence: evidence ?? nextTrace[idx].evidence,
      };
    }
  };

  if (action === 'APPROVE' && decision.expiresAt && nowTs > decision.expiresAt) {
    upsertStep('APPROVAL', 'REJECTED', 'פג תוקף התוכנית לפני האישור — חסום לביצוע');
    upsertStep('EXECUTION', 'SKIPPED', 'לא בוצע עקב פקיעת תוקף');
    upsertStep('RESULT', 'REJECTED', 'התוכנית עברה לסטטוס EXPIRED ולא הופעלה');
    return {
      ok: false,
      errorHe: 'פג תוקף התוכנית (EXPIRED) — לא ניתן לבצע תוכנית שפג תוקפה',
      updated: {
        ...decision,
        approvalStatus: 'EXPIRED',
        approvedAt: nowTs,
        approvedBy: actor,
        pipelineTrace: nextTrace,
      },
    };
  }

  if (action === 'REJECT') {
    upsertStep('APPROVAL', 'REJECTED', `נדחה ע״י ${actor}`);
    upsertStep('EXECUTION', 'SKIPPED', 'בוטל עקב דחייה בשער האישורים');
    upsertStep('RESULT', 'REJECTED', 'לא בוצעה כל פעולה על הבמה או במכשיר חיצוני');
    return {
      ok: true,
      updated: {
        ...decision,
        approvalStatus: 'REJECTED',
        approvedAt: nowTs,
        approvedBy: actor,
        pipelineTrace: nextTrace,
      },
    };
  }

  if (decision.councilApproved === false) {
    upsertStep('APPROVAL', 'REJECTED', 'תוכנית זו נחסמה במועצה (OpenAI/Claude)');
    upsertStep('EXECUTION', 'SKIPPED', 'אין ביצוע לתוכנית שלא עברה מועצה');
    upsertStep('RESULT', 'FAILED', 'חסום במועצה');
    return {
      ok: false,
      errorHe: 'לא ניתן לאשר תוכנית שנחסמה במועצת ההחלטות (COUNCIL_BLOCKED)',
      updated: {
        ...decision,
        approvalStatus: 'COUNCIL_BLOCKED',
        pipelineTrace: nextTrace,
      },
    };
  }

  const execOk = executionOutcome ? executionOutcome.ok : true;
  upsertStep('APPROVAL', 'COMPLETED', `אושר לביצוע ע״י ${actor}`);
  upsertStep(
    'EXECUTION',
    execOk ? 'COMPLETED' : 'FAILED',
    executionOutcome?.detailHe || 'בוצע על מנוע הבמה המקומי של BOOSTERA',
    executionOutcome?.evidence
  );
  upsertStep(
    'RESULT',
    execOk ? 'COMPLETED' : 'FAILED',
    executionOutcome?.resultDetailHe ||
      (execOk
        ? 'הסטייט שודר לבמת 9:16 וללקוחות WebSocket מחוברים'
        : 'הביצוע נכשל — לא סומן כהצלחה')
  );

  return {
    ok: execOk,
    errorHe: execOk ? undefined : executionOutcome?.detailHe || 'הביצוע נכשל',
    updated: {
      ...decision,
      approvalStatus: execOk ? 'APPROVED_EXECUTED' : 'EXECUTION_FAILED',
      approvedAt: nowTs,
      approvedBy: actor,
      executedAt: execOk ? nowTs : null,
      pipelineTrace: nextTrace,
    },
  };
}

export function buildIntegrationAuditReport(input: IntegrationAuditInput): IntegrationAuditReport {
  return {
    generatedAt: Date.now(),
    geelark: {
      configured: input.geelarkConfigured,
      connected: input.geelarkConfigured && input.geelarkDevicesCount > 0 && !input.geelarkLastErrorHe,
      devicesCount: input.geelarkDevicesCount,
      rpaReady: Boolean(input.geelarkRpaReady),
      statusHe: !input.geelarkConfigured
        ? 'לא מוגדר בסביבה (חסרים GEELARK_APP_ID / GEELARK_API_KEY)'
        : input.geelarkLastErrorHe
          ? `שגיאת חיבור GeeLark: ${input.geelarkLastErrorHe}`
          : input.geelarkDevicesCount > 0
            ? `מחובר — זוהו ${input.geelarkDevicesCount} מכשירי ענן${input.geelarkRpaNoteHe ? ` · ${input.geelarkRpaNoteHe}` : ''}`
            : 'מוגדר אך לא נמצאו מכשירים פעילים כרגע',
    },
    tiktokAccount: {
      oauthConfigured: input.tiktokOauthConfigured,
      oauthUser: input.tiktokOauthUser,
      oauthScopes: ['user.info.basic', 'user.info.profile', 'user.info.stats'],
      webcastConnected: input.tiktokWebcastConnected,
      webcastUsername: input.tiktokWebcastUsername,
      webcastRoomId: input.tiktokWebcastRoomId,
      webcastViewers: input.tiktokWebcastViewers,
      ownedRoomUsername: input.tiktokOwnedRoomUsername || null,
      accessSummaryHe: input.tiktokWebcastConnected
        ? `מאזין חי (Read-Only WebCast) ל-@${input.tiktokWebcastUsername} (${input.tiktokWebcastViewers} צופים)`
        : 'אין חיבור WebCast פעיל כרגע',
    },
    aiProviders: {
      openaiConfigured: input.openaiConfigured,
      claudeConfigured: input.claudeConfigured,
      geminiConfigured: input.geminiConfigured,
      openaiRequestedModel: input.openaiRequestedModel || 'gpt-6-astra',
      claudeRequestedModel: input.claudeRequestedModel || 'claude-fable-5-2',
    },
    chatCapabilities: [
      {
        id: 'cap_read_live_chat',
        actionHe: 'קריאת צ׳אט חי, לייקים, מתנות והצטרפויות (WebCast)',
        channel: 'TIKTOK_WEBCAST',
        supportLevel: 'LIVE_READ_ONLY',
        allowedInRealTikTok: true,
        detailHe: 'מורשה ופעיל דרך tiktok-live-connector לקריאה בלבד מכל שידור חי פומבי.',
      },
      {
        id: 'cap_oauth_profile',
        actionHe: 'זיהוי פרופיל חשבון TikTok (Login Kit v2)',
        channel: 'TIKTOK_OAUTH',
        supportLevel: 'LIVE_READ_ONLY',
        allowedInRealTikTok: input.tiktokOauthConfigured,
        detailHe: 'כולל הרשאות קריאת פרופיל בלבד (user.info.basic/profile/stats) — ללא הרשאת כתיבת צ׳אט.',
      },
      {
        id: 'cap_local_companion_dispatch',
        actionHe: 'שיגור הודעות צוות מלווים וסימון טרולים ב-BOOSTERA',
        channel: 'BOOSTERA_LOCAL',
        supportLevel: 'LOCAL_PREVIEW_ONLY',
        allowedInRealTikTok: false,
        detailHe: 'פועל מקומית על תצוגת הבמה וה-WebSocket של BOOSTERA בלבד — אינו כותב לתוך צ׳אט TikTok.',
      },
      {
        id: 'cap_geelark_chat_send',
        actionHe: 'שליחת הודעת צ׳אט אמיתית מתוך מכשיר GeeLark לחדר שבבעלותך',
        channel: 'GEELARK_DEVICE',
        supportLevel:
          input.geelarkConfigured && input.geelarkDevicesCount > 0 && input.geelarkRpaReady
            ? 'REQUIRES_GEELARK_OR_BRIDGE'
            : 'NOT_PERMITTED_BY_API',
        allowedInRealTikTok: Boolean(input.geelarkConfigured && input.geelarkDevicesCount > 0 && input.geelarkRpaReady),
        detailHe:
          input.geelarkConfigured && input.geelarkDevicesCount > 0
            ? input.geelarkRpaReady
              ? `זמין לביצוע RPA מאומת דרך מכשיר הענן הפעיל${input.tiktokOwnedRoomUsername ? ` עבור @${input.tiktokOwnedRoomUsername}` : ''}.`
              : input.geelarkRpaNoteHe || 'נמצא מכשיר GeeLark אך חסר Flow RPA לשליחת צ׳אט בחשבון זה.'
            : 'חסום/לא פעיל — אין מכשיר GeeLark מחובר עם RPA מאומת' +
              (input.externalWsConnectedCount > 0 ? ` (${input.externalWsConnectedCount} גשרי WS חיצוניים מחוברים)` : '.'),
      },
    ],
  };
}
