import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyApprovalTransition,
  assertOwnedTikTokRoomForSend,
  buildIntegrationAuditReport,
  buildPipelineTrace,
  canDeterministicRuleExecute,
  enforceServerApprovalPolicy,
  evaluateCouncilDecision,
  sanitizeSecretHeaderValue,
  toProposedGovernanceDefaults,
  type ApprovableDecisionLike,
  type PipelineStageLog,
  type StructuredDirectorPlan,
} from './decisionPipeline';

const SAMPLE_PLAN: StructuredDirectorPlan = {
  situationSummaryHe: 'דחיפת קומבו וסנייפ ב-15 שניות לסיום',
  tensionScore: 84,
  energyScore: 78,
  targetRoomOrScope: 'OWN_STAGE',
  layerPlacement: 'L4_STANDARD_FRONT_FX',
  vfxId: 'VID_04_COLD_SPARK_FOUNTAINS',
  soundCueId: 'SND_SNIPE_LOCK',
  musicTrackId: 'MUS_SNIPE_TENSION_CLOCK',
  cameraPreset: 'ZOOM_PUNCH',
  cameraReasonHe: 'הדגשת סנייפ סיום',
  tapCalloutTextHe: 'DOUBLE TAP NOW!',
  tapDurationSec: 8,
  timingNoteHe: 'מיד עם נעילת הסנייפ',
  rationaleHe: 'מגביר תמיכה בשניות ההכרעה',
};

test('enforceServerApprovalPolicy blocks client requireApproval:false bypass when server requires approval', () => {
  const res = enforceServerApprovalPolicy({
    serverApprovalMode: 'REQUIRE_APPROVAL',
    clientRequireApproval: false,
  });

  assert.equal(res.needsApproval, true);
  assert.equal(res.requiresApproval, true);
  assert.equal(res.effectiveMode, 'REQUIRE_APPROVAL');
  assert.equal(res.bypassBlocked, true);
  assert.equal(res.overrideBlocked, true);
});

test('evaluateCouncilDecision blocks execution with NO Gemini decision fallback when OpenAI or Claude fails/rejects/disagrees', () => {
  const openAiFail = evaluateCouncilDecision({
    openai: { ok: false, plan: null, errorHe: 'OpenAI gpt-6-astra timeout' },
    claude: { ok: true, inspection: { verdict: 'APPROVE', summaryHe: 'ok' } },
  });
  assert.equal(openAiFail.approved, false);
  assert.equal(openAiFail.status, 'COUNCIL_BLOCKED');
  assert.equal(openAiFail.blockedBy, 'OPENAI');

  const claudeReject = evaluateCouncilDecision({
    openai: { ok: true, plan: SAMPLE_PLAN },
    claude: { ok: true, inspection: { verdict: 'REJECT', summaryHe: 'קולדאון אפקט פעיל' } },
  });
  assert.equal(claudeReject.approved, false);
  assert.equal(claudeReject.status, 'COUNCIL_BLOCKED');
  assert.equal(claudeReject.blockedBy, 'CLAUDE');

  const claudeDisagree = evaluateCouncilDecision({
    openai: { ok: true, plan: SAMPLE_PLAN },
    claude: { ok: true, inspection: { verdict: 'DISAGREE', summaryHe: 'שכבת היעד שגויה' } },
  });
  assert.equal(claudeDisagree.approved, false);
  assert.equal(claudeDisagree.status, 'COUNCIL_BLOCKED');
  assert.equal(claudeDisagree.blockedBy, 'CLAUDE');

  const bothPass = evaluateCouncilDecision({
    openai: { ok: true, plan: SAMPLE_PLAN },
    claude: { ok: true, inspection: { verdict: 'APPROVE', summaryHe: 'תוכנית מאומתת ותקינה' } },
  });
  assert.equal(bothPass.approved, true);
  assert.equal(bothPass.status, 'COUNCIL_APPROVED');
});

test('toProposedGovernanceDefaults and canDeterministicRuleExecute ensure Gemini rules/tools save as inactive proposals', () => {
  const proposed = toProposedGovernanceDefaults();
  assert.equal(proposed.approved, false);
  assert.equal(proposed.status, 'PROPOSED');
  assert.equal(proposed.active, false);
  assert.equal(proposed.autoEnabled, false);

  const blockedProposed = canDeterministicRuleExecute(proposed);
  assert.equal(blockedProposed.allowed, false);

  const missingVersion = canDeterministicRuleExecute({
    approved: true,
    status: 'APPROVED',
    active: true,
    version: 0,
  });
  assert.equal(missingVersion.allowed, false);

  const validApproved = canDeterministicRuleExecute({
    approved: true,
    status: 'APPROVED',
    active: true,
    version: 1,
  });
  assert.equal(validApproved.allowed, true);
});

test('applyApprovalTransition blocks expired plans, double-execution, and failed GeeLark execution (never marks APPROVED_EXECUTED)', () => {
  const trace = buildPipelineTrace({
    nowTs: 1000,
    liveConnected: true,
    liveTargetUsername: 'myroom',
    liveRoomId: '101',
    liveViewerCount: 120,
    packetsCaptured: 14,
    dataSummaryHe: 'טלמטריה מלאה',
    openai: { configured: true, called: true, ok: true, requestedModel: 'gpt-6-astra', actualModel: 'gpt-6-astra', authOk: true, modelOk: true, summaryHe: 'תוכנית מוכנה' },
    claude: { configured: true, called: true, ok: true, requestedModel: 'claude-fable-5-2', actualModel: 'claude-fable-5-2', authOk: true, modelOk: true, summaryHe: 'APPROVE' },
    gemini: { configured: true, called: false, ok: true, model: 'gemini-4-hydrogen', summaryHe: 'מוכן לביצוע מאושר' },
    decisionSummaryHe: 'VFX: VID_04',
    approvalMode: 'REQUIRE_APPROVAL',
    approvalStatus: 'PENDING_APPROVAL',
    executionDetailHe: 'ממתין',
    resultDetailHe: 'ממתין',
  });

  // 1. Expired decision cannot execute
  const expiredInput: ApprovableDecisionLike = {
    id: 'dec_exp',
    timestamp: 1000,
    expiresAt: 1500,
    approvalStatus: 'PENDING_APPROVAL',
    councilApproved: true,
    pipelineTrace: trace,
  };
  const expired = applyApprovalTransition(expiredInput, 'APPROVE', 'operator', 2000);
  assert.equal(expired.ok, false);
  assert.equal(expired.updated.approvalStatus, 'EXPIRED');

  // 2. Execution failure marks EXECUTION_FAILED, NEVER APPROVED_EXECUTED
  const failedInput: ApprovableDecisionLike = {
    id: 'dec_fail',
    timestamp: 1000,
    expiresAt: 5000,
    approvalStatus: 'PENDING_APPROVAL',
    councilApproved: true,
    pipelineTrace: trace,
  };
  const failedExec = applyApprovalTransition(failedInput, 'APPROVE', 'operator', 2000, {
    ok: false,
    detailHe: 'GeeLark RPA flow missing',
    evidence: 'geelark_error=MISSING_RPA_FLOW_OR_PERMISSION',
    resultDetailHe: 'ביצוע חיצוני נכשל',
  });
  assert.equal(failedExec.ok, false);
  assert.equal(failedExec.updated.approvalStatus, 'EXECUTION_FAILED');
  assert.equal(failedExec.updated.executedAt, null);

  // 3. Double approval blocked after APPROVED_EXECUTED
  const okInput: ApprovableDecisionLike = {
    id: 'dec_ok',
    timestamp: 1000,
    expiresAt: 5000,
    approvalStatus: 'PENDING_APPROVAL',
    councilApproved: true,
    pipelineTrace: trace,
  };
  const okExec = applyApprovalTransition(okInput, 'APPROVE', 'operator', 2000, {
    ok: true,
    detailHe: 'בוצע בהצלחה',
    evidence: 'vfx=VID_04',
    resultDetailHe: 'סטייט עודכן',
  });
  assert.equal(okExec.ok, true);
  assert.equal(okExec.updated.approvalStatus, 'APPROVED_EXECUTED');

  const doubleApprove = applyApprovalTransition(okExec.updated, 'APPROVE', 'operator', 2500);
  assert.equal(doubleApprove.ok, false);
});

test('applyApprovalTransition skips execution and marks REJECTED on REJECT', () => {
  const pendingDecision: ApprovableDecisionLike = {
    id: 'ai_test_rej',
    timestamp: 1000,
    approvalStatus: 'PENDING_APPROVAL',
    pipelineTrace: buildPipelineTrace({
      nowTs: 1000,
      liveConnected: false,
      liveTargetUsername: null,
      liveRoomId: null,
      liveViewerCount: 0,
      packetsCaptured: 0,
      dataSummaryHe: 'טלמטריה',
      openai: { configured: true, called: true, ok: true, requestedModel: 'gpt-6-astra', summaryHe: 'plan' },
      claude: { configured: true, called: true, ok: true, requestedModel: 'claude-fable-5-2', summaryHe: 'APPROVE' },
      gemini: { configured: true, called: false, ok: true, model: 'gemini-4-hydrogen', summaryHe: 'collector' },
      decisionSummaryHe: 'המלצה',
      approvalMode: 'REQUIRE_APPROVAL',
      approvalStatus: 'PENDING_APPROVAL',
      executionDetailHe: '',
      resultDetailHe: '',
    }),
  };

  const rejected = applyApprovalTransition(pendingDecision, 'REJECT', 'מפעיל אולפן', 1800);
  assert.equal(rejected.ok, true);
  assert.equal(rejected.updated.approvalStatus, 'REJECTED');
  assert.equal(rejected.updated.pipelineTrace?.find((s) => s.stage === 'EXECUTION')?.status, 'SKIPPED');
});

test('sanitizeSecretHeaderValue strips accidental KEY=, Bearer, quotes, and newlines safely', () => {
  const cleaned = sanitizeSecretHeaderValue('ANTHROPIC_API_KEY="sk-ant-test-123"\r\n', 'ANTHROPIC_API_KEY');
  assert.equal(cleaned.value, 'sk-ant-test-123');
  assert.equal(cleaned.hadKeyPrefix, true);
  assert.equal(cleaned.hadQuotes, true);

  const modelCleaned = sanitizeSecretHeaderValue('gpt-6-astra\n', 'OPENAI_MODEL');
  assert.equal(modelCleaned.value, 'gpt-6-astra');
});

test('assertOwnedTikTokRoomForSend strictly forbids sending to unowned rooms or without explicit confirmation', () => {
  const otherRoom = assertOwnedTikTokRoomForSend({
    requestedRoomUsername: '@khaledashur',
    configuredOwnedRoom: '@my_studio_live',
    confirmedOwnedRoom: true,
  });
  assert.equal(otherRoom.allowed, false);

  const unconfirmed = assertOwnedTikTokRoomForSend({
    requestedRoomUsername: '@my_studio_live',
    configuredOwnedRoom: '@my_studio_live',
    confirmedOwnedRoom: false,
  });
  assert.equal(unconfirmed.allowed, false);

  const allowedOwn = assertOwnedTikTokRoomForSend({
    requestedRoomUsername: '@my_studio_live',
    configuredOwnedRoom: '@my_studio_live',
    confirmedOwnedRoom: true,
  });
  assert.equal(allowedOwn.allowed, true);
  assert.equal(allowedOwn.normalizedRoom, 'my_studio_live');
});

test('buildIntegrationAuditReport reports official models and separates GeeLark device presence from missing RPA chat permission', () => {
  const report = buildIntegrationAuditReport({
    geelarkConfigured: true,
    geelarkDevicesCount: 1,
    geelarkLastErrorHe: null,
    geelarkRpaReady: false,
    geelarkRpaNoteHe: 'אין משימות RPA בחשבון',
    tiktokOauthConfigured: false,
    tiktokOauthUser: null,
    tiktokWebcastConnected: true,
    tiktokWebcastUsername: 'khaledashur',
    tiktokWebcastRoomId: '7708469257524366098',
    tiktokWebcastViewers: 439,
    openaiConfigured: true,
    claudeConfigured: true,
    geminiConfigured: true,
    openaiRequestedModel: 'gpt-6-astra',
    claudeRequestedModel: 'claude-fable-5-2',
    externalWsConnectedCount: 0,
  });

  assert.equal(report.geelark.connected, true);
  assert.equal(report.geelark.rpaReady, false);
  assert.equal(report.aiProviders.openaiRequestedModel, 'gpt-6-astra');
  assert.equal(report.aiProviders.claudeRequestedModel, 'claude-fable-5-2');
  const geelarkCap = report.chatCapabilities.find((c) => c.id === 'cap_geelark_chat_send');
  assert.equal(geelarkCap?.allowedInRealTikTok, false);
});

test('full end-to-end Council pipeline flow: Source Data -> OpenAI Plan -> Claude Inspection -> Server Approval Gate -> Execution -> Verified Result', () => {
  // 1. Server approval policy enforces REQUIRE_APPROVAL even when client sends requireApproval: false
  const policy = enforceServerApprovalPolicy({
    serverApprovalMode: 'REQUIRE_APPROVAL',
    clientRequireApproval: false,
  });
  assert.equal(policy.needsApproval, true);
  assert.equal(policy.bypassBlocked, true);

  // 2. OpenAI (gpt-6-astra) produces structured plan + Claude (claude-fable-5-2) inspects & approves
  const council = evaluateCouncilDecision({
    openai: { ok: true, plan: SAMPLE_PLAN },
    claude: {
      ok: true,
      inspection: {
        verdict: 'APPROVE',
        summaryHe: 'אושר — שכבה קדמית L4 ויעד OWN_STAGE בטוחים לביצוע',
        concernsHe: [],
      },
    },
  });
  assert.equal(council.approved, true);
  assert.equal(council.status, 'COUNCIL_APPROVED');

  // 3. Decision enters PENDING_APPROVAL with all stages recorded truthfully
  const initialTrace = buildPipelineTrace({
    nowTs: 10_000,
    liveConnected: true,
    liveTargetUsername: 'my_studio_live',
    liveRoomId: '99887766',
    liveViewerCount: 310,
    packetsCaptured: 48,
    dataSummaryHe: 'מצב BATTLE · שלב TENSION · ניקוד 1420:1380',
    openai: {
      configured: true,
      called: true,
      ok: true,
      requestedModel: 'gpt-6-astra',
      actualModel: 'gpt-6-astra',
      authOk: true,
      modelOk: true,
      summaryHe: `${SAMPLE_PLAN.situationSummaryHe} [${SAMPLE_PLAN.layerPlacement}]`,
    },
    claude: {
      configured: true,
      called: true,
      ok: true,
      requestedModel: 'claude-fable-5-2',
      actualModel: 'claude-fable-5-2',
      authOk: true,
      modelOk: true,
      summaryHe: '[APPROVE] אושר — שכבה קדמית L4 ויעד OWN_STAGE בטוחים לביצוע',
    },
    gemini: {
      configured: true,
      called: true,
      ok: true,
      model: 'gemini-4-hydrogen',
      role: 'collector_executor_only',
      summaryHe: 'נאספה טלמטריית שמע וקהל עבור מועצת ההחלטות',
    },
    decisionSummaryHe: 'VFX: VID_04_COLD_SPARK_FOUNTAINS · L4_STANDARD_FRONT_FX',
    approvalMode: policy.effectiveMode,
    approvalStatus: 'PENDING_APPROVAL',
    executionDetailHe: 'ממתין לאישור מפעיל בשער השרת',
    resultDetailHe: 'טרם בוצע עד לאישור',
  });

  const pendingDecision: ApprovableDecisionLike = {
    id: 'dec_e2e_full',
    timestamp: 10_000,
    expiresAt: 130_000,
    approvalStatus: 'PENDING_APPROVAL',
    councilApproved: true,
    pipelineTrace: initialTrace,
  };

  const stageById = (trace: PipelineStageLog[] | undefined, stageName: string) =>
    (trace || []).find((s) => s.stage === stageName);

  assert.equal(stageById(initialTrace, 'LIVE')?.status, 'COMPLETED');
  assert.equal(stageById(initialTrace, 'DATA')?.status, 'COMPLETED');
  assert.equal(stageById(initialTrace, 'OPENAI')?.status, 'COMPLETED');
  assert.equal(stageById(initialTrace, 'CLAUDE')?.status, 'COMPLETED');
  assert.equal(stageById(initialTrace, 'DECISION')?.status, 'COMPLETED');
  assert.equal(stageById(initialTrace, 'APPROVAL')?.status, 'PENDING');
  assert.equal(stageById(initialTrace, 'EXECUTION')?.status, 'PENDING');

  // 4. Operator approves -> Executor executes approved plan -> Verified Result
  const executed = applyApprovalTransition(pendingDecision, 'APPROVE', 'מפעיל אולפן', 15_000, {
    ok: true,
    detailHe: 'בוצע: vfx=VID_04_COLD_SPARK_FOUNTAINS · sound=SND_SNIPE_LOCK · camera=ZOOM_PUNCH',
    evidence: 'vfx=VID_04_COLD_SPARK_FOUNTAINS sound=SND_SNIPE_LOCK',
    resultDetailHe: 'אושר ונרשם ב-battleState ושודר לכל הלקוחות המחוברים',
  });

  assert.equal(executed.ok, true);
  assert.equal(executed.updated.approvalStatus, 'APPROVED_EXECUTED');
  assert.equal(executed.updated.executedAt, 15_000);
  assert.equal(stageById(executed.updated.pipelineTrace, 'APPROVAL')?.status, 'COMPLETED');
  assert.equal(stageById(executed.updated.pipelineTrace, 'EXECUTION')?.status, 'COMPLETED');
  assert.equal(stageById(executed.updated.pipelineTrace, 'RESULT')?.status, 'COMPLETED');
});
