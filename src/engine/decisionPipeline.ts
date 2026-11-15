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
  | 'REJECTED';

export interface PipelineStageLog {
  stage: PipelineStageId;
  labelHe: string;
  status: PipelineStageStatus;
  timestamp: number;
  detailHe: string;
  evidence?: string;
}

export interface PlannedExecutionPayload {
  musicTrackId?: string | null;
  soundCueId?: string | null;
  vfxId?: string | null;
  cameraPreset?: string | null;
  cameraReasonHe?: string | null;
  tapCalloutTextHe?: string | null;
  tapDurationSec?: number | null;
  chatLineHe?: string | null;
  chatRole?: string | null;
}

export interface ProviderStageInput {
  configured: boolean;
  called: boolean;
  ok: boolean;
  model?: string;
  summaryHe: string;
  errorHe?: string;
  timestamp?: number;
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
  approvalStatus?: DecisionApprovalStatus;
  approvedAt?: number | null;
  approvedBy?: string | null;
  executedAt?: number | null;
  plannedPayload?: PlannedExecutionPayload | null;
  pipelineTrace?: PipelineStageLog[];
}

export interface IntegrationAuditInput {
  geelarkConfigured: boolean;
  geelarkDevicesCount: number;
  geelarkLastErrorHe: string | null;
  tiktokOauthConfigured: boolean;
  tiktokOauthUser: string | null;
  tiktokWebcastConnected: boolean;
  tiktokWebcastUsername: string | null;
  tiktokWebcastRoomId: string | null;
  tiktokWebcastViewers: number;
  openaiConfigured: boolean;
  claudeConfigured: boolean;
  geminiConfigured: boolean;
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
    accessSummaryHe: string;
  };
  aiProviders: {
    openaiConfigured: boolean;
    claudeConfigured: boolean;
    geminiConfigured: boolean;
  };
  chatCapabilities: ChatPermissionCapability[];
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

  const approvalStageStatus: PipelineStageStatus = isPending
    ? 'PENDING'
    : isRejected
      ? 'REJECTED'
      : 'COMPLETED';

  const executionStageStatus: PipelineStageStatus = isPending
    ? 'PENDING'
    : isRejected
      ? 'SKIPPED'
      : 'COMPLETED';

  const resultStageStatus: PipelineStageStatus = isPending
    ? 'PENDING'
    : isRejected
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
        : 'אין חדר TikTok חי מחובר כרגע — נשען על מצב הבמה והסימולציה המקומית',
      evidence: input.liveRoomId ? `roomId=${input.liveRoomId}` : undefined,
    },
    {
      stage: 'DATA',
      labelHe: 'עיבוד נתונים וטלמטריה (DATA)',
      status: 'COMPLETED',
      timestamp: ts,
      detailHe: input.dataSummaryHe,
      evidence: `wsPackets=${input.packetsCaptured}`,
    },
    {
      stage: 'OPENAI',
      labelHe: 'שכבת OpenAI',
      status: resolveProviderStatus(input.openai),
      timestamp: input.openai.timestamp ?? ts,
      detailHe: !input.openai.configured
        ? 'OPENAI_API_KEY לא מוגדר בסביבת השרת — השלב דולג ללא הדמיה'
        : !input.openai.called
          ? 'שלב OpenAI דולג במחזור זה'
          : input.openai.ok
            ? input.openai.summaryHe
            : input.openai.errorHe || 'קריאת OpenAI נכשלה',
      evidence: input.openai.model ? `model=${input.openai.model}` : undefined,
    },
    {
      stage: 'CLAUDE',
      labelHe: 'שכבת Claude (Anthropic)',
      status: resolveProviderStatus(input.claude),
      timestamp: input.claude.timestamp ?? ts,
      detailHe: !input.claude.configured
        ? 'ANTHROPIC_API_KEY לא מוגדר בסביבת השרת — השלב דולג ללא הדמיה'
        : !input.claude.called
          ? 'שלב Claude דולג במחזור זה'
          : input.claude.ok
            ? input.claude.summaryHe
            : input.claude.errorHe || 'קריאת Claude נכשלה',
      evidence: input.claude.model ? `model=${input.claude.model}` : undefined,
    },
    {
      stage: 'GEMINI',
      labelHe: 'שכבת Gemini Showrunner',
      status: resolveProviderStatus(input.gemini),
      timestamp: input.gemini.timestamp ?? ts,
      detailHe: !input.gemini.configured
        ? 'GEMINI_API_KEY לא מוגדר — פעל מסלול דטרמיניסטי'
        : !input.gemini.called
          ? 'שלב Gemini דולג במחזור זה (מסלול דטרמיניסטי מהיר)'
          : input.gemini.ok
            ? input.gemini.summaryHe
            : input.gemini.errorHe || 'קריאת Gemini נכשלה — הופעל מסלול גיבוי',
      evidence: input.gemini.model ? `model=${input.gemini.model}` : undefined,
    },
    {
      stage: 'DECISION',
      labelHe: 'החלטת בימוי (DECISION)',
      status: 'COMPLETED',
      timestamp: ts,
      detailHe: input.decisionSummaryHe,
    },
    {
      stage: 'APPROVAL',
      labelHe: 'שער אישור (APPROVAL)',
      status: approvalStageStatus,
      timestamp: ts,
      detailHe: isPending
        ? 'ממתין לאישור מפעיל ב-AI Decision & Approval Center לפני ביצוע'
        : isRejected
          ? 'החלטה נדחתה ע״י המפעיל ולא תבוצע'
          : input.approvalMode === 'AUTO_EXECUTE'
            ? 'מצב אוטונומי פעיל (AUTO_EXECUTE) — אושר לביצוע מיידי'
            : 'אושר ידנית ע״י המפעיל',
    },
    {
      stage: 'EXECUTION',
      labelHe: 'ביצוע פעולות (EXECUTION)',
      status: executionStageStatus,
      timestamp: ts,
      detailHe: isPending
        ? 'ממתין לאישור לפני הפעלת VFX / מצלמה / סאונד / גשר חיצוני'
        : isRejected
          ? 'בוטל — ההחלטה נדחתה בשלב האישור'
          : input.executionDetailHe,
      evidence: !isPending && !isRejected ? input.executionEvidence : undefined,
    },
    {
      stage: 'RESULT',
      labelHe: 'תוצאה מאומתת (RESULT)',
      status: resultStageStatus,
      timestamp: ts,
      detailHe: isPending
        ? 'טרם הופקה תוצאה — ממתין לאישור'
        : isRejected
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
      errorHe: `לא ניתן לבצע ${action} על החלטה בסטטוס ${currentStatus}`,
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
    executionOutcome?.resultDetailHe || 'הסטייט שודר לבמת 9:16 וללקוחות WebSocket מחוברים'
  );

  return {
    ok: true,
    updated: {
      ...decision,
      approvalStatus: 'APPROVED_EXECUTED',
      approvedAt: nowTs,
      approvedBy: actor,
      executedAt: nowTs,
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
      statusHe: !input.geelarkConfigured
        ? 'לא מוגדר בסביבה (חסרים GEELARK_APP_ID / GEELARK_API_KEY)'
        : input.geelarkLastErrorHe
          ? `שגיאת חיבור GeeLark: ${input.geelarkLastErrorHe}`
          : input.geelarkDevicesCount > 0
            ? `מחובר — זוהו ${input.geelarkDevicesCount} מכשירי ענן`
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
      accessSummaryHe: input.tiktokWebcastConnected
        ? `מאזין חי (Read-Only WebCast) ל-@${input.tiktokWebcastUsername} (${input.tiktokWebcastViewers} צופים)`
        : 'אין חיבור WebCast פעיל כרגע',
    },
    aiProviders: {
      openaiConfigured: input.openaiConfigured,
      claudeConfigured: input.claudeConfigured,
      geminiConfigured: input.geminiConfigured,
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
        actionHe: 'שליחת הודעת צ׳אט אמיתית או פעולת מודרציה מתוך מכשיר GeeLark',
        channel: 'GEELARK_DEVICE',
        supportLevel: input.geelarkConfigured && input.geelarkDevicesCount > 0
          ? 'REQUIRES_GEELARK_OR_BRIDGE'
          : 'NOT_PERMITTED_BY_API',
        allowedInRealTikTok: input.geelarkConfigured && input.geelarkDevicesCount > 0,
        detailHe:
          input.geelarkConfigured && input.geelarkDevicesCount > 0
            ? 'זמין לביצוע מאושר דרך מכשיר הענן הפעיל.'
            : 'חסום/לא פעיל — אין מכשיר GeeLark מחובר ואין גשר כתיבה חיצוני פעיל' +
              (input.externalWsConnectedCount > 0 ? ` (${input.externalWsConnectedCount} גשרי WS חיצוניים מחוברים)` : '.'),
      },
    ],
  };
}
