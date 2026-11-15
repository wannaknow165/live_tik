import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyApprovalTransition,
  buildIntegrationAuditReport,
  buildPipelineTrace,
  type ApprovableDecisionLike,
} from './decisionPipeline';

test('buildPipelineTrace keeps unconfigured OpenAI/Claude honest and marks PENDING_APPROVAL', () => {
  const trace = buildPipelineTrace({
    nowTs: 1700000000000,
    liveConnected: true,
    liveTargetUsername: 'khaledashur',
    liveRoomId: '7708469257524366098',
    liveViewerCount: 439,
    packetsCaptured: 120,
    dataSummaryHe: 'נתוני קרב וטלמטריה נאספו',
    openai: { configured: false, called: false, ok: false, summaryHe: '' },
    claude: { configured: false, called: false, ok: false, summaryHe: '' },
    gemini: {
      configured: true,
      called: true,
      ok: true,
      model: 'gemini-4-hydrogen',
      summaryHe: 'זוהה רגע מתאים להפעלת ניצוצות',
    },
    decisionSummaryHe: 'הומלץ אפקט VID_04_COLD_SPARK_FOUNTAINS',
    approvalMode: 'REQUIRE_APPROVAL',
    approvalStatus: 'PENDING_APPROVAL',
    executionDetailHe: 'ממתין',
    resultDetailHe: 'ממתין',
  });

  assert.equal(trace.length, 9);
  assert.equal(trace.find((s) => s.stage === 'LIVE')?.status, 'COMPLETED');
  assert.equal(trace.find((s) => s.stage === 'OPENAI')?.status, 'NOT_CONFIGURED');
  assert.equal(trace.find((s) => s.stage === 'CLAUDE')?.status, 'NOT_CONFIGURED');
  assert.equal(trace.find((s) => s.stage === 'GEMINI')?.status, 'COMPLETED');
  assert.equal(trace.find((s) => s.stage === 'APPROVAL')?.status, 'PENDING');
  assert.equal(trace.find((s) => s.stage === 'EXECUTION')?.status, 'PENDING');
  assert.equal(trace.find((s) => s.stage === 'RESULT')?.status, 'PENDING');
});

test('applyApprovalTransition executes pending decision on APPROVE and blocks double-approval', () => {
  const trace = buildPipelineTrace({
    nowTs: 1000,
    liveConnected: false,
    liveTargetUsername: null,
    liveRoomId: null,
    liveViewerCount: 0,
    packetsCaptured: 5,
    dataSummaryHe: 'מצב מקומי',
    openai: { configured: true, called: true, ok: true, model: 'gpt-4o-mini', summaryHe: 'ניתוח OpenAI' },
    claude: { configured: true, called: true, ok: true, model: 'claude-3-5-sonnet-latest', summaryHe: 'בדיקת Claude' },
    gemini: { configured: true, called: true, ok: true, model: 'gemini-4-hydrogen', summaryHe: 'בימוי Gemini' },
    decisionSummaryHe: 'הפעל תותחי CO2',
    approvalMode: 'REQUIRE_APPROVAL',
    approvalStatus: 'PENDING_APPROVAL',
    executionDetailHe: '',
    resultDetailHe: '',
  });

  const decision: ApprovableDecisionLike = {
    id: 'ai_test_1',
    timestamp: 1000,
    approvalStatus: 'PENDING_APPROVAL',
    pipelineTrace: trace,
  };

  const approved = applyApprovalTransition(decision, 'APPROVE', 'מפעיל אולפן', 2500, {
    ok: true,
    detailHe: 'בוצע VFX + מצלמה על הבמה',
    evidence: 'vfx=VID_02_CRYO_CO2_CANNONS',
    resultDetailHe: 'סטייט עודכן ושודר ל-2 לקוחות',
  });

  assert.equal(approved.ok, true);
  assert.equal(approved.updated.approvalStatus, 'APPROVED_EXECUTED');
  assert.equal(approved.updated.approvedAt, 2500);
  assert.equal(approved.updated.pipelineTrace?.find((s) => s.stage === 'APPROVAL')?.status, 'COMPLETED');
  assert.equal(approved.updated.pipelineTrace?.find((s) => s.stage === 'EXECUTION')?.status, 'COMPLETED');
  assert.equal(approved.updated.pipelineTrace?.find((s) => s.stage === 'RESULT')?.status, 'COMPLETED');

  const secondTry = applyApprovalTransition(approved.updated, 'REJECT', 'מפעיל אולפן', 3000);
  assert.equal(secondTry.ok, false);
});

test('applyApprovalTransition skips execution and marks REJECTED on REJECT', () => {
  const trace = buildPipelineTrace({
    nowTs: 1000,
    liveConnected: true,
    liveTargetUsername: 'khaledashur',
    liveRoomId: '123',
    liveViewerCount: 200,
    packetsCaptured: 10,
    dataSummaryHe: 'טלמטריה',
    openai: { configured: false, called: false, ok: false, summaryHe: '' },
    claude: { configured: false, called: false, ok: false, summaryHe: '' },
    gemini: { configured: true, called: true, ok: true, model: 'gemini-4-hydrogen', summaryHe: 'בדיקה' },
    decisionSummaryHe: 'המלצה',
    approvalMode: 'REQUIRE_APPROVAL',
    approvalStatus: 'PENDING_APPROVAL',
    executionDetailHe: '',
    resultDetailHe: '',
  });

  const pendingDecision: ApprovableDecisionLike = {
    id: 'ai_test_2',
    timestamp: 1000,
    approvalStatus: 'PENDING_APPROVAL',
    pipelineTrace: trace,
  };

  const rejected = applyApprovalTransition(
    pendingDecision,
    'REJECT',
    'מפעיל אולפן',
    1800
  );

  assert.equal(rejected.ok, true);
  assert.equal(rejected.updated.approvalStatus, 'REJECTED');
  assert.equal(rejected.updated.executedAt, undefined);
  assert.equal(rejected.updated.pipelineTrace?.find((s) => s.stage === 'APPROVAL')?.status, 'REJECTED');
  assert.equal(rejected.updated.pipelineTrace?.find((s) => s.stage === 'EXECUTION')?.status, 'SKIPPED');
  assert.equal(rejected.updated.pipelineTrace?.find((s) => s.stage === 'RESULT')?.status, 'REJECTED');
});

test('buildIntegrationAuditReport accurately separates read-only webcast, local preview, and unconfigured GeeLark', () => {
  const report = buildIntegrationAuditReport({
    geelarkConfigured: false,
    geelarkDevicesCount: 0,
    geelarkLastErrorHe: null,
    tiktokOauthConfigured: false,
    tiktokOauthUser: null,
    tiktokWebcastConnected: true,
    tiktokWebcastUsername: 'khaledashur',
    tiktokWebcastRoomId: '7708469257524366098',
    tiktokWebcastViewers: 439,
    openaiConfigured: false,
    claudeConfigured: false,
    geminiConfigured: true,
    externalWsConnectedCount: 0,
  });

  assert.equal(report.geelark.connected, false);
  assert.equal(report.tiktokAccount.webcastConnected, true);
  const localCap = report.chatCapabilities.find((c) => c.id === 'cap_local_companion_dispatch');
  assert.equal(localCap?.allowedInRealTikTok, false);
  assert.equal(localCap?.supportLevel, 'LOCAL_PREVIEW_ONLY');
  const geelarkCap = report.chatCapabilities.find((c) => c.id === 'cap_geelark_chat_send');
  assert.equal(geelarkCap?.allowedInRealTikTok, false);
});

test('buildPipelineTrace reports deterministic skip cleanly when Gemini is configured but called=false', () => {
  const trace = buildPipelineTrace({
    nowTs: 2000,
    liveConnected: false,
    liveTargetUsername: null,
    liveRoomId: null,
    liveViewerCount: 0,
    packetsCaptured: 0,
    dataSummaryHe: 'נתונים מקומיים',
    openai: { configured: false, called: false, ok: false, summaryHe: '' },
    claude: { configured: false, called: false, ok: false, summaryHe: '' },
    gemini: { configured: true, called: false, ok: false, summaryHe: '' },
    decisionSummaryHe: 'החלטה דטרמיניסטית',
    approvalMode: 'AUTO_EXECUTE',
    approvalStatus: 'AUTO_EXECUTED',
    executionDetailHe: 'בוצע מקומית',
    resultDetailHe: 'הסטייט עודכן',
  });

  const geminiStage = trace.find((s) => s.stage === 'GEMINI');
  assert.equal(geminiStage?.status, 'SKIPPED');
  assert.equal(geminiStage?.detailHe.includes('נכשלה'), false);
  assert.equal(geminiStage?.detailHe.includes('דולג'), true);
});
