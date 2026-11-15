import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  ThumbsDown,
  ThumbsUp,
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
  refreshState,
}) => {
  const decisions = battleState.aiDecisions || [];
  const [selectedId, setSelectedId] = useState<string | null>(decisions[0]?.id || null);
  const [promptInput, setPromptInput] = useState<string>('');
  const [busyAction, setBusyAction] = useState<boolean>(false);
  const [probing, setProbing] = useState<boolean>(false);
  const [statusBannerHe, setStatusBannerHe] = useState<string | null>(null);

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

  const audit = battleState.integrationAudit;
  const approvalMode: DecisionApprovalMode = battleState.approvalMode || 'AUTO_EXECUTE';

  const handleGenerateApprovalCandidate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusyAction(true);
    setStatusBannerHe(null);
    try {
      const dec = await askAiDirectorNow({
        requireApproval: true,
        directorPromptHe:
          promptInput.trim() ||
          'נתח את מצב הלייב הנוכחי והפק המלצת בימוי מובנית הממתינה לאישור מפעיל.',
      });
      if (dec) {
        setSelectedId(dec.id);
        setPromptInput('');
        setStatusBannerHe(`נוצרה החלטה חדשה (${dec.id}) בסטטוס המתנה לאישור.`);
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
      setStatusBannerHe('בדיקת החיבורים (GeeLark, TikTok, AI Providers) עודכנה בזמן אמת.');
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Controls */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <h1 className="text-xl font-bold font-display text-slate-100">
                AI Decision &amp; Approval Center
              </h1>
              <span className="px-2.5 py-0.5 rounded border border-[#263248] bg-[#0B0E14] text-xs font-mono text-slate-300">
                ממתינים לאישור: {pendingCount}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              מעקב שקוף מקצה לקצה אחר מסלול ההחלטה: LIVE → DATA → OPENAI → CLAUDE → GEMINI → DECISION → APPROVAL → EXECUTION → RESULT, ללא הצגת הדמיות כפעולה אמיתית.
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
                ביצוע אוטומטי
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
                שער אישור ידני
              </button>
            </div>

            <button
              type="button"
              disabled={probing}
              onClick={handleProbeIntegrations}
              className="px-3.5 py-2 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-slate-500 text-xs font-semibold text-slate-200 flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
              <span>אמת חיבורים עכשיו</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleGenerateApprovalCandidate} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            aria-label="הנחיה להחלטת AI לבדיקה ואישור"
            placeholder="הזן תרחיש או הנחיה ליצירת החלטה הממתינה לאישור (למשל: דחוף סנייפ 15 שניות לסיום)..."
            className="flex-1 min-w-[240px] bg-[#0B0E14] border border-[#283246] rounded-lg px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={busyAction}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-1.5 shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>הפק החלטה לשער האישור</span>
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

      {/* Live Infrastructure & Permission Audit (Honest, Zero Fakes) */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. GeeLark Device Status */}
        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              1. מכשיר ענן GeeLark
            </span>
            <span
              className={`px-2 py-0.5 rounded border text-[10px] font-mono ${
                audit?.geelark.connected
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              {audit?.geelark.connected ? 'CONNECTED' : 'NOT_CONNECTED'}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {audit?.geelark.statusHe || 'בודק מצב חיבור GeeLark...'}
          </p>
          <div className="text-[11px] font-mono text-slate-400 space-y-1">
            <div>מכשירים פעילים: {audit?.geelark.devicesCount ?? 0}</div>
            {(battleState.geelarkDevices || []).slice(0, 3).map((dev) => (
              <div key={dev.id} className="text-[10px] text-emerald-300/90 truncate">
                {dev.serialName} · {dev.id} (status={dev.status})
              </div>
            ))}
          </div>
        </div>

        {/* 2. TikTok Account Verification */}
        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              2. חשבון TikTok מחובר
            </span>
            <span
              className={`px-2 py-0.5 rounded border text-[10px] font-mono ${
                audit?.tiktokAccount.webcastConnected
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              {audit?.tiktokAccount.webcastConnected ? 'WEBCAST_LIVE' : 'OFFLINE'}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {audit?.tiktokAccount.accessSummaryHe || 'אין חיבור חי כרגע'}
          </p>
          <div className="text-[11px] font-mono text-slate-500 truncate">
            OAuth:{' '}
            {audit?.tiktokAccount.oauthUser
              ? audit.tiktokAccount.oauthUser
              : audit?.tiktokAccount.oauthConfigured
                ? 'מוגדר (ממתין להתחברות)'
                : 'לא מוגדר'}
            {audit?.tiktokAccount.webcastRoomId ? ` · Room ${audit.tiktokAccount.webcastRoomId}` : ''}
          </div>
        </div>

        {/* 3. AI Providers Status */}
        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-amber-400" />
              3. מנועי AI במסלול
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">OpenAI (OPENAI_API_KEY)</span>
              <span
                className={`font-mono text-[11px] ${
                  audit?.aiProviders.openaiConfigured ? 'text-emerald-300' : 'text-slate-500'
                }`}
              >
                {audit?.aiProviders.openaiConfigured ? 'פעיל' : 'לא מוגדר'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Claude (ANTHROPIC_API_KEY)</span>
              <span
                className={`font-mono text-[11px] ${
                  audit?.aiProviders.claudeConfigured ? 'text-emerald-300' : 'text-slate-500'
                }`}
              >
                {audit?.aiProviders.claudeConfigured ? 'פעיל' : 'לא מוגדר'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Gemini Showrunner</span>
              <span
                className={`font-mono text-[11px] ${
                  audit?.aiProviders.geminiConfigured ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {audit?.aiProviders.geminiConfigured ? 'פעיל (gemini-4-hydrogen)' : 'גיבוי מקומי'}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Chat Permissions Matrix */}
        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              4. הרשאות צ׳אט בפועל
            </span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            {(audit?.chatCapabilities || []).map((cap) => (
              <div key={cap.id} className="flex items-start justify-between gap-2">
                <span className="text-slate-300 leading-tight">{cap.actionHe}</span>
                <span
                  className={`font-mono shrink-0 ${
                    cap.allowedInRealTikTok
                      ? 'text-emerald-300'
                      : cap.supportLevel === 'LOCAL_PREVIEW_ONLY'
                        ? 'text-amber-300'
                        : 'text-rose-300'
                  }`}
                >
                  {cap.allowedInRealTikTok
                    ? 'מותר חי'
                    : cap.supportLevel === 'LOCAL_PREVIEW_ONLY'
                      ? 'דמו מקומי'
                      : 'חסום'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Split: Decision Queue (Left) + Full Pipeline Trace Inspector (Right) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Decision Queue */}
        <div className="lg:col-span-5 bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1E2636] pb-3">
            <h2 className="text-sm font-bold text-slate-100">
              תור החלטות והיסטוריה ({decisions.length})
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">
              מצב נוכחי: {approvalMode}
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
                    : status === 'REJECTED'
                      ? { text: 'נדחה', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
                      : { text: 'אוטומטי', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' };

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
                    מנוע קובע: {selectedDecision.decidedBy || 'DETERMINISTIC'} · מתח{' '}
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
                  <span>החלטה זו נוצרה לפני הפעלת Trace מפורט — לחץ על "הפק החלטה לשער האישור" להצגת מסלול מלא.</span>
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
