import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  MessageSquareShare,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  XCircle,
} from 'lucide-react';
import { AiDirectorDecision, BattleState } from '../data/boosteraCatalog';
import {
  DecisionApprovalMode,
  PipelineStageLog,
  PipelineStageStatus,
} from '../engine/decisionPipeline';

interface AiDecisionApprovalCenterProps {
  battleState: BattleState;
  askAiDirectorNow: (payload: {
    directorPromptHe?: string;
    requireApproval?: boolean;
  }) => Promise<AiDirectorDecision | null>;
  setApprovalMode: (mode: DecisionApprovalMode) => Promise<void>;
  submitApprovalAction: (
    decisionId: string,
    action: 'APPROVE' | 'REJECT',
    executeToGeeLark?: boolean
  ) => Promise<{ ok?: boolean; errorHe?: string }>;
  probeGeeLarkAndAudit: () => Promise<unknown>;
  runProviderDiagnostics: () => Promise<unknown>;
  approveProposal: (
    kind: 'rule' | 'tool' | 'ws_binding',
    id: string,
    action: 'APPROVE' | 'REJECT'
  ) => Promise<{ ok?: boolean; errorHe?: string }>;
  saveGeeLarkConfig: (payload: {
    selectedDeviceId?: string;
    selectedFlowId?: string;
    ownedLiveUsername?: string;
    selectedLiveRoom?: string;
    connectOwnedLiveNow?: boolean;
  }) => Promise<{ ok?: boolean; liveConnectResult?: { connected: boolean; errorHe?: string } | null }>;
  executeGeeLarkChat: (payload: {
    messageText: string;
    deviceId?: string;
    flowId?: string;
    targetRoomUsername: string;
    confirmedOwnedRoom?: boolean;
  }) => Promise<{
    ok?: boolean;
    status?: string;
    taskId?: string | null;
    errorHe?: string;
    detailHe?: string;
    verifiedInLiveChat?: boolean;
    verificationDetailHe?: string;
  }>;
  refreshState: () => Promise<void>;
}

const STAGE_STATUS_META: Record<
  PipelineStageStatus,
  { labelHe: string; badgeClass: string; dotClass: string }
> = {
  COMPLETED: {
    labelHe: 'הושלם',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    dotClass: 'bg-emerald-400',
  },
  ACTIVE: {
    labelHe: 'פעיל',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
    dotClass: 'bg-cyan-400',
  },
  PENDING: {
    labelHe: 'ממתין לאישור',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    dotClass: 'bg-amber-400',
  },
  SKIPPED: {
    labelHe: 'דולג',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    dotClass: 'bg-slate-400',
  },
  NOT_CONFIGURED: {
    labelHe: 'לא מוגדר בסביבה',
    badgeClass: 'bg-slate-900 text-slate-400 border-slate-700',
    dotClass: 'bg-slate-500',
  },
  FAILED: {
    labelHe: 'נכשל',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    dotClass: 'bg-rose-400',
  },
  REJECTED: {
    labelHe: 'נדחה',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    dotClass: 'bg-rose-400',
  },
};

function formatTimeHe(ts?: number | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const AiDecisionApprovalCenter: React.FC<AiDecisionApprovalCenterProps> = ({
  battleState,
  askAiDirectorNow,
  setApprovalMode,
  submitApprovalAction,
  probeGeeLarkAndAudit,
  runProviderDiagnostics,
  approveProposal,
  saveGeeLarkConfig,
  executeGeeLarkChat,
  refreshState,
}) => {
  const decisions = battleState.aiDecisions || [];
  const [selectedId, setSelectedId] = useState<string | null>(decisions[0]?.id || null);
  const [promptInput, setPromptInput] = useState<string>('');
  const [busyAction, setBusyAction] = useState<boolean>(false);
  const [probing, setProbing] = useState<boolean>(false);
  const [buildingFlow, setBuildingFlow] = useState<boolean>(false);
  const [testingProviders, setTestingProviders] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [statusBannerHe, setStatusBannerHe] = useState<string | null>(null);

  // Persistent GeeLark Device & Owned Live Room Selection
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    battleState.geelarkConfig?.selectedDeviceId || '646174035834568877'
  );
  const [selectedFlowId, setSelectedFlowId] = useState<string>(
    battleState.geelarkConfig?.selectedFlowId || ''
  );
  const [ownedLiveInput, setOwnedLiveInput] = useState<string>(
    battleState.geelarkConfig?.ownedLiveUsername ||
      battleState.integrationAudit?.tiktokAccount.ownedRoomUsername ||
      ''
  );
  const [geelarkMsgInput, setGeelarkMsgInput] = useState<string>('בדיקת שידור מאושרת BOOSTERA');
  const [confirmedOwnedRoom, setConfirmedOwnedRoom] = useState<boolean>(false);
  const [approvedTestMessage, setApprovedTestMessage] = useState<boolean>(false);
  const [geelarkExecResult, setGeelarkExecResult] = useState<{
    ok: boolean;
    summaryHe: string;
    verifiedInLiveChat?: boolean;
    verificationDetailHe?: string;
  } | null>(null);

  useEffect(() => {
    if (battleState.geelarkConfig?.selectedDeviceId) {
      setSelectedDeviceId(battleState.geelarkConfig.selectedDeviceId);
    }
    if (battleState.geelarkConfig?.selectedFlowId !== undefined) {
      setSelectedFlowId(battleState.geelarkConfig.selectedFlowId);
    }
    if (battleState.geelarkConfig?.ownedLiveUsername && !ownedLiveInput) {
      setOwnedLiveInput(battleState.geelarkConfig.ownedLiveUsername);
    }
  }, [
    battleState.geelarkConfig?.selectedDeviceId,
    battleState.geelarkConfig?.selectedFlowId,
    battleState.geelarkConfig?.ownedLiveUsername,
    ownedLiveInput,
  ]);

  useEffect(() => {
    if (!battleState.geelarkCapabilityReport && (battleState.geelarkDevices || []).length === 0) {
      void probeGeeLarkAndAudit();
    }
  }, [battleState.geelarkCapabilityReport, battleState.geelarkDevices, probeGeeLarkAndAudit]);

  useEffect(() => {
    if (decisions.length > 0 && (!selectedId || !decisions.some((d) => d.id === selectedId))) {
      setSelectedId(decisions[0].id);
    }
  }, [decisions, selectedId]);

  const selectedDecision = useMemo(
    () => decisions.find((d) => d.id === selectedId) || decisions[0] || null,
    [decisions, selectedId]
  );

  const pendingCount = useMemo(
    () => decisions.filter((d) => d.approvalStatus === 'PENDING_APPROVAL').length,
    [decisions]
  );

  const proposedRules = useMemo(
    () => (battleState.memorySummary?.energyRules || []).filter((r) => r.status !== 'APPROVED' || r.approved !== true),
    [battleState.memorySummary?.energyRules]
  );

  const proposedTools = useMemo(
    () => (battleState.memorySummary?.discoveredTools || []).filter((t) => t.status !== 'APPROVED' || t.approved !== true),
    [battleState.memorySummary?.discoveredTools]
  );

  const audit = battleState.integrationAudit;
  const diag = battleState.providerDiagnostics;
  const approvalMode: DecisionApprovalMode = battleState.approvalMode || 'REQUIRE_APPROVAL';

  const handleGenerateApprovalCandidate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusyAction(true);
    setStatusBannerHe(null);
    try {
      const dec = await askAiDirectorNow({
        requireApproval: true,
        directorPromptHe:
          promptInput.trim() ||
          'נתח את מצב הלייב הנוכחי והפק תוכנית מובנית במועצת OpenAI + Claude לשער האישור.',
      });
      if (dec) {
        setSelectedId(dec.id);
        setPromptInput('');
        if (dec.approvalStatus === 'COUNCIL_BLOCKED') {
          setStatusBannerHe(`המועצה בלמה את ההחלטה (${dec.id}): ${dec.detectedSituationHe}`);
        } else {
          setStatusBannerHe(`נוצרה תוכנית מועצה (${dec.id}) בסטטוס ${dec.approvalStatus}.`);
        }
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleApproveOrReject = async (decisionId: string, action: 'APPROVE' | 'REJECT') => {
    setBusyAction(true);
    setStatusBannerHe(null);
    try {
      const res = await submitApprovalAction(decisionId, action, false);
      if (res?.ok) {
        setStatusBannerHe(
          action === 'APPROVE'
            ? `החלטה ${decisionId} אושרה ובוצעה על הבמה.`
            : `החלטה ${decisionId} נדחתה ולא בוצעה.`
        );
      } else if (res?.errorHe) {
        setStatusBannerHe(res.errorHe);
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleProbeIntegrations = async () => {
    setProbing(true);
    setStatusBannerHe(null);
    try {
      await probeGeeLarkAndAudit();
      await refreshState();
      setStatusBannerHe('בדיקת החיבורים (GeeLark + Custom Flows, TikTok, מועצת AI) עודכנה בזמן אמת.');
    } finally {
      setProbing(false);
    }
  };

  const handleEnsureCustomFlow = async () => {
    setBuildingFlow(true);
    setStatusBannerHe(null);
    try {
      const resp = await fetch('/api/geelark/ensure-chat-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId: selectedFlowId || undefined }),
      });
      const json = await resp.json();
      await refreshState();
      if (json.flowId) {
        setSelectedFlowId(json.flowId);
      }
      setStatusBannerHe(json.detailHe || (json.ok ? 'Custom Flow הוגדר בהצלחה.' : 'בניית Custom Flow נדחתה ע״י GeeLark.'));
    } catch {
      setStatusBannerHe('שגיאת תקשורת מול השרת בבניית Custom Flow.');
    } finally {
      setBuildingFlow(false);
    }
  };

  const handleRunProviderDiagnostics = async () => {
    setTestingProviders(true);
    setStatusBannerHe(null);
    try {
      await runProviderDiagnostics();
      await refreshState();
      setStatusBannerHe('הושלמה בדיקת אימות מפתחות ומודלים נפרדת (OpenAI, Anthropic Auth/Model, Gemini, GeeLark).');
    } finally {
      setTestingProviders(false);
    }
  };

  const handleSaveDeviceAndLiveSelection = async (connectNow = true) => {
    setSavingConfig(true);
    setStatusBannerHe(null);
    try {
      const cleanOwned = ownedLiveInput.replace(/^@/, '').trim();
      const res = await saveGeeLarkConfig({
        selectedDeviceId,
        selectedFlowId,
        ownedLiveUsername: cleanOwned,
        selectedLiveRoom: cleanOwned,
        connectOwnedLiveNow: connectNow && Boolean(cleanOwned),
      });
      if (res.liveConnectResult) {
        setStatusBannerHe(
          res.liveConnectResult.connected
            ? `נשמרה בחירת המכשיר (${selectedDeviceId}) והתחברנו בלייב דרך tiktok-live-connector אל @${cleanOwned}.`
            : `נשמרה הבחירה (@${cleanOwned} · מכשיר ${selectedDeviceId}). סטטוס לייב כרגע: ${
                res.liveConnectResult.errorHe || 'לא בשידור פעיל ברגע זה'
              }`
        );
      } else {
        setStatusBannerHe(`נשמרה בחירת המכשיר (${selectedDeviceId})${cleanOwned ? ` והחדר @${cleanOwned}` : ''}.`);
      }
    } finally {
      setSavingConfig(false);
    }
  };

  const handleGeeLarkChatExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvedTestMessage) {
      setGeelarkExecResult({
        ok: false,
        summaryHe: 'נדרש לאשר מפורשות את נוסח הודעת הניסיון לפני שיגור לחדר שבשליטתך.',
      });
      return;
    }
    setBusyAction(true);
    setGeelarkExecResult(null);
    try {
      const cleanOwned = ownedLiveInput.replace(/^@/, '').trim();
      await saveGeeLarkConfig({
        selectedDeviceId,
        selectedFlowId,
        ownedLiveUsername: cleanOwned,
        selectedLiveRoom: cleanOwned,
        connectOwnedLiveNow: false,
      });
      const res = await executeGeeLarkChat({
        messageText: geelarkMsgInput.trim(),
        deviceId: selectedDeviceId,
        flowId: selectedFlowId || undefined,
        targetRoomUsername: cleanOwned,
        confirmedOwnedRoom,
      });
      if (res.ok) {
        setGeelarkExecResult({
          ok: true,
          summaryHe: res.detailHe || `שוגר ל-GeeLark (taskId=${res.taskId || 'sent'})`,
          verifiedInLiveChat: res.verifiedInLiveChat,
          verificationDetailHe: res.verificationDetailHe,
        });
      } else {
        setGeelarkExecResult({
          ok: false,
          summaryHe: `${res.status || 'FAILED'}: ${res.errorHe || 'שגיאה בביצוע GeeLark'}`,
          verifiedInLiveChat: false,
          verificationDetailHe: res.verificationDetailHe,
        });
      }
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Server Approval Gate Controls */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <h1 className="text-xl font-bold font-display text-slate-100">
                AI Decision &amp; Approval Center (מועצת OpenAI + Claude ואכיפת שרת)
              </h1>
              <span className="px-2.5 py-0.5 rounded border border-[#263248] bg-[#0B0E14] text-xs font-mono text-slate-300">
                ממתינים לאישור: {pendingCount}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              OpenAI מתכנן · Claude מבקר ובולם אי־הסכמה · Gemini אוסף ומבצע תוכנית מאושרת בלבד · ללא עקיפת אישורים מהלקוח וללא הדמיות.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border border-[#263248] bg-[#0B0E14] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setApprovalMode('AUTO_EXECUTE')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  approvalMode === 'AUTO_EXECUTE'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ביצוע מאושר-מועצה
              </button>
              <button
                type="button"
                onClick={() => setApprovalMode('REQUIRE_APPROVAL')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  approvalMode === 'REQUIRE_APPROVAL'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                שער אישור שרת קשיח
              </button>
            </div>

            <button
              type="button"
              disabled={testingProviders}
              onClick={handleRunProviderDiagnostics}
              className="px-3.5 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/40 hover:bg-cyan-500/25 text-xs font-semibold text-cyan-200 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Cpu className={`w-3.5 h-3.5 ${testingProviders ? 'animate-spin' : ''}`} />
              <span>{testingProviders ? 'בודק מודלים ומפתחות...' : 'בדוק ספקים ודגמים עכשיו'}</span>
            </button>

            <button
              type="button"
              disabled={probing}
              onClick={handleProbeIntegrations}
              className="px-3.5 py-2 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-slate-500 text-xs font-semibold text-slate-200 flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
              <span>אמת GeeLark ו-WebCast</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleGenerateApprovalCandidate} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            aria-label="הנחיה להחלטת מועצה לבדיקה ואישור"
            placeholder="הזן תרחיש למועצת OpenAI + Claude (בכשל/דחייה/אי-הסכמה התוכנית נעצרת ללא מעבר ל-Gemini)..."
            className="flex-1 min-w-[240px] bg-[#0B0E14] border border-[#283246] rounded-lg px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={busyAction}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-1.5 shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>הרץ מועצת החלטות לשער האישור</span>
          </button>
        </form>

        {statusBannerHe && (
          <div className="px-3.5 py-2 rounded-lg bg-[#0B0E14] border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-2">
            <span>{statusBannerHe}</span>
            <button
              type="button"
              onClick={() => setStatusBannerHe(null)}
              className="text-slate-400 hover:text-slate-200"
            >
              סגור
            </button>
          </div>
        )}
      </section>

      {/* Live Model Diagnostics & Infrastructure Audit */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. GeeLark Device 646174035834568877 & Capability Audit */}
        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              1. אימות מכשיר GeeLark ויכולות
            </span>
            <span className="text-[11px] font-mono text-slate-300">
              {audit?.geelark.connected
                ? audit?.geelark.rpaReady
                  ? 'RPA_READY'
                  : 'DEVICE_VERIFIED'
                : 'NOT_CONNECTED'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="block text-[11px] text-slate-400">מכשיר ענן פעיל (נשלף אוטומטית מהחיבור)</label>
            <select
              aria-label="בחירת מכשיר GeeLark"
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId(e.target.value);
                void saveGeeLarkConfig({ selectedDeviceId: e.target.value });
              }}
              className="w-full bg-[#0B0E14] border border-[#283246] rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono"
            >
              {(battleState.geelarkDevices || []).length === 0 ? (
                <option value="646174035834568877">646174035834568877 (טוען מהחיבור...)</option>
              ) : (
                (battleState.geelarkDevices || []).map((dev) => {
                  const statusLabel =
                    dev.status === '0'
                      ? 'Running (פעיל)'
                      : dev.status === '1'
                        ? 'Starting (עולה)'
                        : dev.status === '2'
                          ? 'Stopped (כבוי — יופעל בשיגור)'
                          : dev.status === '3'
                            ? 'Expired'
                            : `status=${dev.status}`;
                  return (
                    <option key={dev.id} value={dev.id}>
                      {dev.serialName} · {dev.id} · {statusLabel}
                    </option>
                  );
                })
              )}
            </select>
          </div>

          {battleState.geelarkCapabilityReport && (
            <div className="text-[11px] text-slate-300 space-y-1 pt-1 border-t border-[#1E2636]">
              <div className="font-mono text-emerald-300">
                {battleState.geelarkCapabilityReport.targetDeviceVerified
                  ? `מאומת: ${battleState.geelarkCapabilityReport.targetDeviceName} (${battleState.geelarkCapabilityReport.targetDeviceId})`
                  : `מכשיר ${battleState.geelarkCapabilityReport.targetDeviceId} לא נמצא ברשימה`}
              </div>
              {battleState.geelarkCapabilityReport.installedTikTokPackage && (
                <div className="text-emerald-300/90 font-mono text-[10px]">
                  אפליקציה במכשיר: {battleState.geelarkCapabilityReport.installedTikTokPackage}
                </div>
              )}
              <div className="text-slate-400">
                חשבון TikTok במכשיר:{' '}
                {battleState.geelarkCapabilityReport.detectedTikTokHandleOnDevice
                  ? `@${battleState.geelarkCapabilityReport.detectedTikTokHandleOnDevice}`
                  : 'אינו נחשף מ-phone/list של GeeLark'}
              </div>
              <div className="flex items-center justify-between gap-2 text-slate-300">
                <span>
                  Custom Flows בחשבון: {battleState.geelarkCapabilityReport.rpaFlowList.count}
                  {selectedFlowId ? ` (${selectedFlowId})` : ''}
                </span>
                <button
                  type="button"
                  disabled={buildingFlow}
                  onClick={handleEnsureCustomFlow}
                  className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 text-[10px] font-semibold disabled:opacity-50"
                >
                  {buildingFlow ? 'מגדיר...' : 'בנה/יבא Flow'}
                </button>
              </div>
              {battleState.geelarkCapabilityReport.shellAccess && (
                <div className="text-[10px] text-slate-400 leading-relaxed">
                  • {battleState.geelarkCapabilityReport.shellAccess.detailHe}
                </div>
              )}
              {battleState.geelarkCapabilityReport.missingRequirementsHe.map((m, idx) => (
                <div key={idx} className="text-[10px] text-amber-300/95 leading-relaxed">
                  • {m}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. TikTok Open-Source Live Feed & Persistent Owned Room Selection */}
        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              2. בחירת לייב ושמירת חדר בשליטתך
            </span>
            <span className="text-[11px] font-mono text-slate-300">
              {audit?.tiktokAccount.webcastConnected ? 'tiktok-live-connector LIVE' : 'STANDBY'}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            קליטת תגובות, מתנות ואירועים פועלת בקוד פתוח דרך <span className="font-mono text-slate-200">tiktok-live-connector</span> ללא שירות בתשלום.
          </p>

          {(battleState.tiktokRoom.monitoredRooms || []).length > 0 && (
            <div className="space-y-1">
              <label className="block text-[11px] text-slate-400">חדרי לייב מחוברים כעת (קריאה בלבד)</label>
              <div className="text-[11px] font-mono text-sky-300 truncate">
                {(battleState.tiktokRoom.monitoredRooms || [])
                  .map((r) => `@${r.username} (${r.viewerCount})`)
                  .join(' · ')}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] text-slate-300 font-semibold">
              שם משתמש הלייב שבשליטתך בלבד (נשמר בשרת)
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={ownedLiveInput}
                onChange={(e) => setOwnedLiveInput(e.target.value)}
                placeholder="@your_live_username"
                aria-label="שם משתמש הלייב שבשליטתי"
                className="flex-1 min-w-0 bg-[#0B0E14] border border-[#283246] rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
              />
              <button
                type="button"
                disabled={savingConfig}
                onClick={() => handleSaveDeviceAndLiveSelection(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 disabled:opacity-50"
              >
                {savingConfig ? 'שומר...' : 'שמור והתחבר'}
              </button>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-400 truncate">
            חדר שמור לבדיקה:{' '}
            {battleState.geelarkConfig?.ownedLiveUsername
              ? `@${battleState.geelarkConfig.ownedLiveUsername}`
              : 'טרם הוזן שם משתמש שבשליטתך'}
          </div>
        </div>

        {/* 3. AI Council Models & Auth Diagnostics (Requested vs Actual, ZERO Silent Fallback) */}
        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-amber-400" />
              3. מנועי מועצה (ביקורת מודלים)
            </span>
          </div>
          <div className="space-y-2 text-[11px]">
            {/* OpenAI */}
            <div className="bg-[#0B0E14] border border-[#1E2636] rounded p-2 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-200 font-semibold">
                  OpenAI ({diag?.openai.requestedModel || audit?.aiProviders.openaiRequestedModel || 'gpt-6-astra'})
                </span>
                <span className={`font-mono ${diag?.openai.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {diag
                    ? diag.openai.ok
                      ? 'OK'
                      : diag.openai.authOk
                        ? 'MODEL_ERR'
                        : 'AUTH_ERR'
                    : audit?.aiProviders.openaiConfigured
                      ? 'CONFIGURED'
                      : 'MISSING'}
                </span>
              </div>
              {diag?.openai && (
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  actual={diag.openai.actualModel || 'NONE'} · auth={String(diag.openai.authOk)} · model=
                  {String(diag.openai.modelOk)}
                </div>
              )}
              {diag?.openai.errorHe && <div className="text-[10px] text-rose-300 break-words">{diag.openai.errorHe}</div>}
            </div>

            {/* Claude (Anthropic) — Separate Auth vs Model */}
            <div className="bg-[#0B0E14] border border-[#1E2636] rounded p-2 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-200 font-semibold">
                  Claude ({diag?.claude.requestedModel || audit?.aiProviders.claudeRequestedModel || 'claude-fable-5-2'})
                </span>
                <span className={`font-mono ${diag?.claude.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {diag
                    ? diag.claude.ok
                      ? 'OK'
                      : diag.claude.authOk
                        ? 'MODEL_ERR'
                        : 'AUTH_ERR'
                    : audit?.aiProviders.claudeConfigured
                      ? 'CONFIGURED'
                      : 'MISSING'}
                </span>
              </div>
              {diag?.claude && (
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  actual={diag.claude.actualModel || 'NONE'} · keyAuth={String(diag.claude.authOk)} · model=
                  {String(diag.claude.modelOk)}
                </div>
              )}
              {diag?.claude.errorHe && <div className="text-[10px] text-rose-300 break-words">{diag.claude.errorHe}</div>}
            </div>

            {/* Gemini Collector/Executor */}
            <div className="flex items-center justify-between text-[11px] px-1">
              <span className="text-slate-300">Gemini (איסוף וביצוע בלבד)</span>
              <span
                className={`font-mono ${
                  diag
                    ? diag.gemini.ok
                      ? 'text-emerald-300'
                      : 'text-rose-300'
                    : audit?.aiProviders.geminiConfigured
                      ? 'text-cyan-300'
                      : 'text-slate-500'
                }`}
              >
                {diag
                  ? diag.gemini.ok
                    ? 'gemini-4-hydrogen OK'
                    : 'QUOTA_OR_ERR'
                  : audit?.aiProviders.geminiConfigured
                    ? 'EXECUTOR_ONLY'
                    : 'MISSING'}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Approved Owned-Room GeeLark Real Chat Execution + Live Verification */}
        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <MessageSquareShare className="w-4 h-4 text-rose-400" />
              4. שליחת הודעת ניסיון מאושרת ואימות הופעה
            </span>
          </div>

          {(battleState.geelarkRpaFlows || []).length > 0 && (
            <select
              aria-label="בחירת תהליך RPA ב-GeeLark"
              value={selectedFlowId}
              onChange={(e) => {
                setSelectedFlowId(e.target.value);
                void saveGeeLarkConfig({ selectedFlowId: e.target.value });
              }}
              className="w-full bg-[#0B0E14] border border-[#283246] rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            >
              {(battleState.geelarkRpaFlows || []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title} ({f.id})
                </option>
              ))}
            </select>
          )}

          <form onSubmit={handleGeeLarkChatExecute} className="space-y-2 text-[11px]">
            <div className="text-[11px] text-slate-400">
              יעד שליחה:{' '}
              <span className="font-mono text-slate-100">
                {ownedLiveInput.trim() ? `@${ownedLiveInput.replace(/^@/, '').trim()}` : 'הגדר חדר בשליטתך בכרטיס 2'}
              </span>
            </div>
            <input
              type="text"
              value={geelarkMsgInput}
              onChange={(e) => {
                setGeelarkMsgInput(e.target.value);
                setApprovedTestMessage(false);
              }}
              placeholder="נוסח הודעת הניסיון לאישור..."
              className="w-full bg-[#0B0E14] border border-[#283246] rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            />
            <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedOwnedRoom}
                onChange={(e) => setConfirmedOwnedRoom(e.target.checked)}
                className="accent-amber-500"
              />
              <span>אני מאשר שהלייב הנבחר בשליטתי בלבד (לעולם לא בחדרים אחרים)</span>
            </label>
            <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={approvedTestMessage}
                onChange={(e) => setApprovedTestMessage(e.target.checked)}
                className="accent-emerald-500"
              />
              <span>אני מאשר את נוסח הודעת הניסיון לשיגור ואימות בטיקטוק</span>
            </label>
            <button
              type="submit"
              disabled={busyAction || !ownedLiveInput.trim()}
              className="w-full px-3 py-1.5 rounded-lg bg-[#1E2636] hover:bg-[#2A364F] border border-[#32405D] text-slate-100 font-semibold text-xs disabled:opacity-50"
            >
              שגר דרך המכשיר הנבחר ואמת בצ׳אט החי
            </button>
          </form>

          {geelarkExecResult && (
            <div className="text-[10px] font-mono bg-[#0B0E14] border border-[#283246] rounded-lg p-2 space-y-1 break-words">
              <div className={geelarkExecResult.ok ? 'text-emerald-300' : 'text-amber-300'}>
                שיגור ל-GeeLark: {geelarkExecResult.summaryHe}
              </div>
              {geelarkExecResult.verificationDetailHe && (
                <div className={geelarkExecResult.verifiedInLiveChat ? 'text-emerald-300' : 'text-slate-400'}>
                  אימות הופעה בטיקטוק: {geelarkExecResult.verificationDetailHe}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Pending Governance Proposals Queue (Rules & Tools Generated by Gemini as PROPOSED) */}
      {(proposedRules.length > 0 || proposedTools.length > 0) && (
        <section className="bg-[#121722] border border-amber-500/35 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-slate-100">
                תור הצעות חוקים וכלים ממתינים לאישור גרסה ({proposedRules.length + proposedTools.length})
              </h2>
            </div>
            <span className="text-[11px] text-slate-400">
              תובנות Gemini נשמרות כהצעה (PROPOSED) ואינן פועלות אוטומטית עד אישור מפעיל וקבלת גרסה
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {proposedRules.map((rule) => (
              <div
                key={rule.id}
                className="bg-[#0B0E14] border border-[#253047] rounded-lg p-3 flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono text-[10px]">
                      PROPOSED RULE · v{rule.version || 1}
                    </span>
                    <span className="font-bold text-slate-100 truncate">{rule.titleHe}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{rule.triggerConditionHe}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => approveProposal('rule', rule.id, 'APPROVE')}
                    className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px]"
                  >
                    אשר גרסה
                  </button>
                  <button
                    type="button"
                    onClick={() => approveProposal('rule', rule.id, 'REJECT')}
                    className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[11px]"
                  >
                    דחה
                  </button>
                </div>
              </div>
            ))}

            {proposedTools.map((tool) => (
              <div
                key={tool.id}
                className="bg-[#0B0E14] border border-[#253047] rounded-lg p-3 flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300 font-mono text-[10px]">
                      PROPOSED TOOL · v{tool.version || 1}
                    </span>
                    <span className="font-bold text-slate-100 truncate">{tool.nameHe}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{tool.howItWorksHe}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => approveProposal('tool', tool.id, 'APPROVE')}
                    className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px]"
                  >
                    אשר כלי
                  </button>
                  <button
                    type="button"
                    onClick={() => approveProposal('tool', tool.id, 'REJECT')}
                    className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[11px]"
                  >
                    דחה
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Split: Decision Queue (Left) + Full Pipeline Trace Inspector (Right) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Decision Queue */}
        <div className="lg:col-span-5 bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1E2636] pb-3">
            <h2 className="text-sm font-bold text-slate-100">
              תור החלטות והיסטוריה ({decisions.length})
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">
              מצב שרת: {approvalMode}
            </span>
          </div>

          <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
            {decisions.map((dec) => {
              const isSelected = selectedDecision?.id === dec.id;
              const status = dec.approvalStatus || 'AUTO_EXECUTED';
              const statusBadge =
                status === 'PENDING_APPROVAL'
                  ? { text: 'ממתין לאישור', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
                  : status === 'APPROVED_EXECUTED'
                    ? { text: 'אושר ובוצע', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }
                    : status === 'COUNCIL_BLOCKED'
                      ? { text: 'נחסם במועצה', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
                      : status === 'EXECUTION_FAILED'
                        ? { text: 'ביצוע נכשל', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
                        : status === 'EXPIRED'
                          ? { text: 'פג תוקף', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
                          : status === 'REJECTED'
                            ? { text: 'נדחה', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
                            : { text: 'אושר אוטומטית', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' };

              return (
                <div
                  key={dec.id}
                  className={`rounded-xl border p-3 space-y-2 transition-colors ${
                    isSelected
                      ? 'bg-[#172033] border-amber-500/60'
                      : 'bg-[#0B0E14] border-[#1E2636] hover:border-slate-600'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(dec.id)}
                    className="w-full text-right space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${statusBadge.cls}`}>
                        {statusBadge.text}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {formatTimeHe(dec.timestamp)} · {dec.id}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-100 leading-relaxed">
                      {dec.detectedSituationHe}
                    </p>
                    <div className="text-[11px] text-amber-300/90">
                      {dec.actionsTakenHe.join(' · ')}
                    </div>
                  </button>

                  {status === 'PENDING_APPROVAL' && (
                    <div className="flex items-center gap-2 pt-1 border-t border-[#1E2636]">
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => handleApproveOrReject(dec.id, 'APPROVE')}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center justify-center gap-1"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>אשר ובצע</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => handleApproveOrReject(dec.id, 'REJECT')}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 disabled:opacity-50 text-rose-200 text-xs font-semibold flex items-center gap-1"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        <span>דחה</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Full End-to-End Trace Inspector */}
        <div className="lg:col-span-7 bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
          {selectedDecision ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E2636] pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-slate-100">
                      מסלול החלטה מלא מתחילתו ועד סופו
                    </h2>
                    <span className="font-mono text-xs text-amber-300">{selectedDecision.id}</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    סמכות החלטה: {selectedDecision.decidedBy || 'DETERMINISTIC'} · מתח{' '}
                    {selectedDecision.tensionScore}% · אנרגיה {selectedDecision.energyScore}%
                  </p>
                </div>

                {selectedDecision.approvalStatus === 'PENDING_APPROVAL' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => handleApproveOrReject(selectedDecision.id, 'APPROVE')}
                      className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>אשר ובצע החלטה</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => handleApproveOrReject(selectedDecision.id, 'REJECT')}
                      className="px-3.5 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>דחה</span>
                    </button>
                  </div>
                )}
              </div>

              {/* OpenAI Plan + Claude Binding Verdict Cards */}
              {(selectedDecision.openAiPlan || selectedDecision.claudeInspection) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#0B0E14] border border-[#1E2636] rounded-lg p-3 space-y-1">
                    <div className="font-bold text-sky-300">תוכנית מובנית — OpenAI</div>
                    {selectedDecision.openAiPlan ? (
                      <>
                        <div className="text-slate-200">{selectedDecision.openAiPlan.situationSummaryHe}</div>
                        <div className="font-mono text-[10px] text-amber-300">
                          שכבה: {selectedDecision.openAiPlan.layerPlacement} · יעד: {selectedDecision.openAiPlan.targetRoomOrScope}
                        </div>
                      </>
                    ) : (
                      <div className="text-rose-300">לא הופקה תוכנית OpenAI</div>
                    )}
                  </div>

                  <div className="bg-[#0B0E14] border border-[#1E2636] rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300">בדיקת מועצה — Claude</span>
                      {selectedDecision.claudeInspection && (
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] border ${
                            selectedDecision.claudeInspection.verdict === 'APPROVE'
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                          }`}
                        >
                          {selectedDecision.claudeInspection.verdict}
                        </span>
                      )}
                    </div>
                    {selectedDecision.claudeInspection ? (
                      <div className="text-slate-200">{selectedDecision.claudeInspection.summaryHe}</div>
                    ) : (
                      <div className="text-rose-300">בדיקת Claude לא אושרה / נכשלה — התוכנית נעצרה</div>
                    )}
                  </div>
                </div>
              )}

              {/* 9-Stage Pipeline Trace */}
              <div className="space-y-2.5">
                {(selectedDecision.pipelineTrace || []).map((step: PipelineStageLog, idx: number) => {
                  const meta = STAGE_STATUS_META[step.status] || STAGE_STATUS_META.SKIPPED;
                  return (
                    <div
                      key={`${step.stage}_${idx}`}
                      className="rounded-xl bg-[#0B0E14] border border-[#1E2636] p-3.5 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex flex-col items-center pt-1 shrink-0">
                          <span className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`} />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-amber-300">
                              {String(idx + 1).padStart(2, '0')}. {step.stage}
                            </span>
                            <span className="text-xs font-semibold text-slate-100">
                              {step.labelHe}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">{step.detailHe}</p>
                          {step.evidence && (
                            <div className="text-[11px] font-mono text-cyan-300/90 break-all">
                              הוכחה/לוג: {step.evidence}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${meta.badgeClass}`}>
                          {meta.labelHe}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeHe(step.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {(!selectedDecision.pipelineTrace || selectedDecision.pipelineTrace.length === 0) && (
                <div className="p-4 rounded-xl bg-[#0B0E14] border border-[#1E2636] text-xs text-slate-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>החלטה זו נוצרה לפני הפעלת Trace מפורט — לחץ על "הרץ מועצת החלטות לשער האישור" להצגת מסלול מלא.</span>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              אין החלטות להצגה כרגע.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
