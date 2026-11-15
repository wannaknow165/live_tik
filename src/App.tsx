/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { useBattleLiveEngine } from './hooks/useBattleLiveEngine';
import { BroadcastStage9x16, StagePerfMetrics } from './components/BroadcastStage9x16';
import { AiDirectorWorkspace } from './components/AiDirectorWorkspace';
import { TikTokIntelAndMemoryWorkspace } from './components/TikTokIntelAndMemoryWorkspace';
import { VfxLibraryWorkspace } from './components/VfxLibraryWorkspace';
import { TimelineAndSoundWorkspace } from './components/TimelineAndSoundWorkspace';
import { ManifestAndQcWorkspace } from './components/ManifestAndQcWorkspace';
import { ObsLinksModal } from './components/ObsLinksModal';
import { AiDecisionApprovalCenter } from './components/AiDecisionApprovalCenter';

type WorkspaceTab =
  | 'ai_director'
  | 'approval_center'
  | 'tiktok_intel'
  | 'vfx_library'
  | 'timeline_sound'
  | 'manifest_qc';

export default function App() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isObsMode = urlParams.get('mode') === 'obs';
  const obsLayerParam = (urlParams.get('layer') || 'composite') as 'back' | 'front' | 'composite';
  const obsAudioEnabled = urlParams.get('audio') !== '0';

  const {
    battleState,
    wsConnected,
    sendTikTokEvent,
    controlBattle,
    askAiDirectorNow,
    setApprovalMode,
    submitApprovalAction,
    probeGeeLarkAndAudit,
    refreshState,
  } = useBattleLiveEngine(isObsMode ? obsAudioEnabled : true);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('ai_director');
  const [obsModalOpen, setObsModalOpen] = useState(false);
  const [perfMetrics, setPerfMetrics] = useState<StagePerfMetrics>({ fps: 60, frameTimeMs: 2.4 });

  useEffect(() => {
    if (isObsMode) {
      document.documentElement.classList.add('obs-transparent');
    } else {
      document.documentElement.classList.remove('obs-transparent');
    }
  }, [isObsMode]);

  // Dedicated Transparent Browser Source Mode for OBS / TikTok LIVE Studio
  if (isObsMode) {
    return (
      <BroadcastStage9x16
        battleState={battleState}
        obsMode
        obsLayer={obsLayerParam}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E2E8F0] flex flex-col">
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-[#1E2636] bg-[#0B0E14]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('ai_director');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          BOOSTERA
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto">
          {(
            [
              { id: 'ai_director', label: 'במאי AI ומצלמה' },
              { id: 'approval_center', label: 'מרכז החלטות ואישורים' },
              { id: 'tiktok_intel', label: 'הזנת לייבים ולמידת AI' },
              { id: 'vfx_library', label: 'ספריית אפקטים' },
              { id: 'timeline_sound', label: 'ציר זמן וסאונד' },
              { id: 'manifest_qc', label: 'מניפסט ובקרה' },
            ] as const
          ).map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-amber-500 text-slate-100 font-semibold'
                    : 'border-transparent hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => setObsModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            קישורי OBS
          </button>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-5 sm:px-8 py-6">
        {activeTab === 'ai_director' && (
          <AiDirectorWorkspace
            battleState={battleState}
            wsConnected={wsConnected}
            sendTikTokEvent={sendTikTokEvent}
            controlBattle={controlBattle}
            askAiDirectorNow={askAiDirectorNow}
            refreshState={refreshState}
            onPerfSample={setPerfMetrics}
            onOpenTikTokTab={() => setActiveTab('tiktok_intel')}
          />
        )}

        {activeTab === 'approval_center' && (
          <AiDecisionApprovalCenter
            battleState={battleState}
            askAiDirectorNow={askAiDirectorNow}
            setApprovalMode={setApprovalMode}
            submitApprovalAction={submitApprovalAction}
            probeGeeLarkAndAudit={probeGeeLarkAndAudit}
            refreshState={refreshState}
          />
        )}

        {activeTab === 'tiktok_intel' && (
          <TikTokIntelAndMemoryWorkspace
            battleState={battleState}
            sendTikTokEvent={sendTikTokEvent}
            controlBattle={controlBattle}
            refreshState={refreshState}
          />
        )}

        {activeTab === 'vfx_library' && (
          <VfxLibraryWorkspace
            roundPalette={battleState.roundPalette}
            onTriggerInLiveStage={(effectId) => {
              sendTikTokEvent({ type: 'manual_vfx', effectId });
              setActiveTab('ai_director');
            }}
          />
        )}

        {activeTab === 'timeline_sound' && (
          <TimelineAndSoundWorkspace
            currentElapsedSec={battleState.elapsedSec}
            onJumpToSecond={(sec) => {
              controlBattle({ action: 'seek', timeSec: sec });
              setActiveTab('ai_director');
            }}
          />
        )}

        {activeTab === 'manifest_qc' && (
          <ManifestAndQcWorkspace
            battleState={battleState}
            perfMetrics={perfMetrics}
          />
        )}
      </main>

      {/* Quiet, Clean Studio Footer */}
      <footer className="border-t border-[#1E2636] px-6 py-4 text-xs text-slate-500 flex items-center justify-between max-w-[1400px] w-full mx-auto">
        <span>BOOSTERA — מערכת במאי AI, מצלמה קינטית, חיבור טיקטוק חי, צייד באטלים ו-VFX (9:16)</span>
        <button
          onClick={() => setObsModalOpen(true)}
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          הגדרות Browser Source ו-Webhook
        </button>
      </footer>

      <ObsLinksModal isOpen={obsModalOpen} onClose={() => setObsModalOpen(false)} />
    </div>
  );
}
