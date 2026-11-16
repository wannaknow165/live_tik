import React, { useEffect, useState } from 'react';
import {
  Activity,
  Brain,
  CheckCircle2,
  ExternalLink,
  Eye,
  Flame,
  Globe,
  Link2,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Swords,
  Trash2,
  Upload,
  Users,
  Video,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  BattleState,
  BROADCAST_COUNTRY_CALIBRATIONS,
  BroadcastCountryCode,
  MonitoredLiveRoomSummary,
  RoundPaletteId,
  ScoutedBattleCreator,
  StreamMode,
} from '../data/boosteraCatalog';
import { LearningVaultPanel } from './LearningVaultPanel';
import { WsEventSnifferPanel } from './WsEventSnifferPanel';
import { ChatCompanionCrewPanel } from './ChatCompanionCrewPanel';
import { DetectedLiveChatHistoryPanel } from './DetectedLiveChatHistoryPanel';
import { soundEngine } from '../engine/soundEngine';

interface TikTokIntelAndMemoryWorkspaceProps {
  battleState: BattleState;
  sendTikTokEvent?: (payload: {
    type: string;
    user?: string;
    message?: string;
  }) => Promise<void>;
  controlBattle: (payload: {
    action:
      | 'start'
      | 'pause'
      | 'reset'
      | 'seek'
      | 'set_palette'
      | 'toggle_crowd_test'
      | 'set_stream_mode'
      | 'toggle_ai_autopilot'
      | 'set_music_volume'
      | 'reset_scores'
      | 'set_camera_mode'
      | 'toggle_memory_rule'
      | 'toggle_discovered_tool'
      | 'toggle_avatars_overlay'
      | 'spawn_demo_supporters'
      | 'toggle_cloud_auto_detect'
      | 'trigger_cloud_xray'
      | 'clear_cloud_xray'
      | 'set_opponent_username'
      | 'set_broadcast_country';
    timeSec?: number;
    palette?: RoundPaletteId;
    streamMode?: StreamMode;
    volumePct?: number;
    cameraMode?: 'AI_DYNAMIC' | 'HYPER_KINETIC' | 'LOCKED';
    ruleId?: string;
    toolId?: string;
    opponentUsername?: string;
    durationSec?: number;
    countryCode?: BroadcastCountryCode;
  }) => Promise<void>;
  refreshState: () => Promise<void>;
}

interface SetupVideoAnalysisResult {
  hypnosisSecretsHe: string[];
  cameraAndFramingAnalysisHe: string;
  energyArcAndPacingHe: string;
  recommendedCameraPreset: string;
  recommendedVfxIds: string[];
  learnedRuleTitleHe: string;
  learnedRuleTriggerHe: string;
  learnedRuleDirectiveEn: string;
}

const SCOUT_REGIONS = [
  { code: 'il', label: 'ישראל (IL)' },
  { code: 'eg', label: 'מצרים / ערבית (EG)' },
  { code: 'ae', label: 'אמירויות / מפרץ (AE)' },
  { code: 'tr', label: 'טורקיה (TR)' },
  { code: 'us', label: 'ארה״ב (US)' },
  { code: 'br', label: 'ברזיל / לטינו (BR)' },
  { code: 'gb', label: 'בריטניה (GB)' },
  { code: 'de', label: 'אירופה / גרמניה (DE)' },
];

function energyWidthClass(score: number): string {
  if (score >= 90) return 'w-full';
  if (score >= 75) return 'w-5/6';
  if (score >= 60) return 'w-4/6';
  if (score >= 45) return 'w-3/6';
  if (score >= 25) return 'w-2/6';
  return 'w-1/6';
}

export const TikTokIntelAndMemoryWorkspace: React.FC<TikTokIntelAndMemoryWorkspaceProps> = ({
  battleState,
  sendTikTokEvent,
  controlBattle,
  refreshState,
}) => {
  // Watchlist bulk/single add state
  const [newWatchHandles, setNewWatchHandles] = useState<string>('');
  const [newWatchNotesHe, setNewWatchNotesHe] = useState<string>('');
  const [addingWatchlist, setAddingWatchlist] = useState<boolean>(false);
  const [scanningAllLive, setScanningAllLive] = useState<boolean>(false);
  const [synthesizingSwarm, setSynthesizingSwarm] = useState<boolean>(false);
  const [learningHandle, setLearningHandle] = useState<string | null>(null);
  const [statusBannerHe, setStatusBannerHe] = useState<string | null>(null);
  const [executingKey, setExecutingKey] = useState<string | null>(null);

  // Direct My-Broadcast & Opponent Cloud Spy connection state
  const [myBroadcastHandle, setMyBroadcastHandle] = useState<string>('');
  const [connectingMyRoom, setConnectingMyRoom] = useState<boolean>(false);
  const [opponentCloudHandle, setOpponentCloudHandle] = useState<string>(
    battleState.cloudRadar?.opponentUsername || ''
  );

  // OAuth popup state
  const [oauthNoteHe, setOauthNoteHe] = useState<string | null>(null);
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string>('');

  // Multi-region Scout state
  const [selectedRegion, setSelectedRegion] = useState<string>('eg');
  const [scoutQuery, setScoutQuery] = useState<string>('strongest TikTok LIVE PK battle party hype any language');
  const [autoConnectScouted, setAutoConnectScouted] = useState<boolean>(true);
  const [scouting, setScouting] = useState<boolean>(false);
  const [scoutStatusHe, setScoutStatusHe] = useState<string | null>(null);
  const [scoutResults, setScoutResults] = useState<ScoutedBattleCreator[]>([]);
  const [scoutLinks, setScoutLinks] = useState<Array<{ title: string; uri: string }>>([]);

  // Viral Web Energy Search state
  const [energyVideoQuery, setEnergyVideoQuery] = useState<string>(
    'TikTok LIVE PK battle crowd party energy hypnosis snipe glove setup'
  );
  const [searchingWebVideos, setSearchingWebVideos] = useState<boolean>(false);
  const [webVideoSummaryHe, setWebVideoSummaryHe] = useState<string | null>(null);
  const [webVideoLinks, setWebVideoLinks] = useState<Array<{ title: string; uri: string }>>([]);

  // Long Setup Video Upload Analyzer state
  const [analyzingSetupVideo, setAnalyzingSetupVideo] = useState<boolean>(false);
  const [setupVideoProgressHe, setSetupVideoProgressHe] = useState<string | null>(null);
  const [setupVideoResult, setSetupVideoResult] = useState<SetupVideoAnalysisResult | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setStatusBannerHe('חשבון הטיקטוק חובר בהצלחה דרך OAuth!');
        void refreshState();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshState]);

  const handleApplyPlaybook = async (payload: {
    username?: string;
    ruleId?: string;
    toolId?: string;
    vaultItemId?: string;
  }) => {
    soundEngine.ensureInitialized();
    const k = payload.toolId || payload.ruleId || payload.username || payload.vaultItemId || 'play';
    setExecutingKey(k);
    try {
      const resp = await fetch('/api/tiktok/apply-creator-playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      await refreshState();
      if (json.executedSummaryHe) {
        setStatusBannerHe(json.executedSummaryHe);
      }
    } catch {
      setStatusBannerHe('שגיאה בהפעלת המסקנה על הבמה.');
    } finally {
      setExecutingKey(null);
    }
  };

  const handleAddCreatorsToWatchlist = async (customHandles?: string) => {
    const raw = (customHandles ?? newWatchHandles).trim();
    if (!raw) {
      setStatusBannerHe('הזן שם משתמש אחד או יותר (למשל zainabmamdouh35, sanya.mar) להוספה למעקב אוטומטי.');
      return;
    }
    setAddingWatchlist(true);
    setStatusBannerHe(null);
    try {
      const resp = await fetch('/api/tiktok/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernames: raw,
          notesHe: newWatchNotesHe.trim() || undefined,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setStatusBannerHe(json.error || 'שגיאה בהוספת יוצרים לרשימת המעקב.');
      } else {
        const liveNowList: string[] = json.connectedNow || [];
        const queuedList: string[] = json.queuedForAutoWatch || [];
        if (!customHandles) {
          setNewWatchHandles('');
          setNewWatchNotesHe('');
        }
        if (liveNowList.length > 0) {
          setStatusBannerHe(
            `נוספו למעקב 24/7 והתחברנו מיד בלייב אל: ${liveNowList.map((u) => '@' + u).join(', ')}${
              queuedList.length > 0 ? ` · בהמתנה אוטומטית לעלייה ללייב: ${queuedList.map((u) => '@' + u).join(', ')}` : ''
            }`
          );
        } else {
          setStatusBannerHe(
            `נוספו לרשימת המעקב האוטומטית 24/7: ${queuedList.map((u) => '@' + u).join(', ')} — ברגע שיעלו ללייב המערכת תתחבר, תצפה ותלמד מהם אוטומטית!`
          );
        }
        await refreshState();
      }
    } catch {
      setStatusBannerHe('שגיאת תקשורת בהוספת יוצרים לרשימת המעקב.');
    } finally {
      setAddingWatchlist(false);
    }
  };

  const handleRemoveWatchedCreator = async (username: string) => {
    await fetch('/api/tiktok/watchlist/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    await refreshState();
  };

  const handleToggleWatchSetting = async (payload: {
    username?: string;
    field?: 'autoWatchEnabled' | 'autoLearnEnabled';
    autoWatchRadarEnabled?: boolean;
    autoDiscoverOpponents?: boolean;
  }) => {
    await fetch('/api/tiktok/watchlist/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await refreshState();
  };

  const handleConnectAllLiveNow = async () => {
    setScanningAllLive(true);
    setStatusBannerHe('סורק את כל רשימת המעקב ודירוגי TikLeap בכל השפות ומתחבר במקביל לכל מי שבלייב עכשיו...');
    try {
      const resp = await fetch('/api/tiktok/connect-all-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeGlobal: true }),
      });
      const json = await resp.json();
      await refreshState();
      const activeCount = Number(json.activeStreamsCount || 0);
      if (activeCount > 0) {
        setStatusBannerHe(
          `מחובר ומאזין במקביל ל-${activeCount} חדרי שידור חיים! כל התובנות והכלים מתורגמים יחסית לגודל הקהל במדינה שלך.`
        );
      } else {
        setStatusBannerHe(
          `נסרקו ${json.checkedCount || 0} יוצרים — כרגע אף אחד מהם לא בשידור חי פעיל. רדאר 24/7 ממשיך לבדוק כל 40 שניות ויתחבר אוטומטית ברגע שמישהו יעלה!`
        );
      }
    } catch {
      setStatusBannerHe('שגיאה בסריקה רב-ערוצית של שידורים חיים.');
    } finally {
      setScanningAllLive(false);
    }
  };

  const handleConnectSingleCreator = async (
    username: string,
    listenMode: 'OBSERVER_LEARN' | 'MY_BROADCAST' = 'OBSERVER_LEARN',
    mirrorToStage = false
  ) => {
    if (!username.trim()) return;
    if (listenMode === 'MY_BROADCAST') setConnectingMyRoom(true);
    setStatusBannerHe(`מתחבר לחדר השידור של @${username.replace(/^@/, '')}...`);
    try {
      const resp = await fetch('/api/tiktok/connect-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, listenMode, mirrorToStage }),
      });
      const json = await resp.json();
      await refreshState();
      if (json.connected) {
        setStatusBannerHe(`מחובר חי אל @${username.replace(/^@/, '')} — קולט צ׳אט, אווטארים, מתנות ובאטלים!`);
      } else if (json.errorHe) {
        setStatusBannerHe(json.errorHe);
      }
    } catch {
      setStatusBannerHe('שגיאה בחיבור לחדר השידור.');
    } finally {
      setConnectingMyRoom(false);
    }
  };

  const handleDisconnectRoom = async (username?: string, all = false) => {
    await fetch('/api/tiktok/disconnect-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, all }),
    });
    await refreshState();
  };

  const handleToggleMirrorRoom = async (username: string) => {
    await fetch('/api/tiktok/toggle-mirror', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    await refreshState();
  };

  const handleSynthesizeSwarmNow = async (specificUsername?: string) => {
    if (specificUsername) setLearningHandle(specificUsername);
    else setSynthesizingSwarm(true);
    try {
      const endpoint = specificUsername ? '/api/tiktok/learn-from-stream' : '/api/tiktok/synthesize-swarm-energy';
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(specificUsername ? { username: specificUsername } : {}),
      });
      const json = await resp.json();
      await refreshState();
      const summary = json.synthesisHe || json.result?.synthesisHe;
      if (summary) {
        setStatusBannerHe(summary);
      } else {
        setStatusBannerHe('תובנות האנרגיה, החוקים והכלים החדשים זוקקו ונשמרו בזיכרון ה-AI הקבוע!');
      }
    } catch {
      setStatusBannerHe('שגיאה בזיקוק תובנות ה-AI.');
    } finally {
      setLearningHandle(null);
      setSynthesizingSwarm(false);
    }
  };

  const handleOpenTikTokOAuth = async () => {
    try {
      const resp = await fetch(`/api/auth/tiktok/url?origin=${encodeURIComponent(window.location.origin)}`);
      const json = await resp.json();
      if (json.redirectUri) setOauthRedirectUri(json.redirectUri);
      if (!json.configured || !json.url) {
        setOauthNoteHe(json.messageHe || 'חיבור ישיר לפי @username פעיל ללא צורך במפתחות OAuth.');
        return;
      }
      const w = 520;
      const h = 660;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      window.open(json.url, 'tiktok_oauth_popup', `width=${w},height=${h},left=${left},top=${top}`);
    } catch {
      setOauthNoteHe('לא ניתן לפתוח חלון OAuth כרגע — החיבור הישיר לפי @username פעיל במלואו.');
    }
  };

  const handleScoutStrongBattles = async () => {
    setScouting(true);
    setScoutStatusHe(null);
    try {
      const resp = await fetch('/api/tiktok/scout-battles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: selectedRegion,
          query: scoutQuery,
          autoConnectLive: autoConnectScouted,
        }),
      });
      const json = await resp.json();
      setScoutStatusHe(json.tikleapStatusHe || null);
      setScoutResults(Array.isArray(json.candidates) ? json.candidates : []);
      setScoutLinks(Array.isArray(json.groundingLinks) ? json.groundingLinks : []);
      await refreshState();
    } catch {
      setScoutStatusHe('שגיאה בסריקת דירוגי באטלים.');
    } finally {
      setScouting(false);
    }
  };

  const handleSearchWebEnergyVideos = async () => {
    setSearchingWebVideos(true);
    try {
      const resp = await fetch('/api/tiktok/search-energy-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: energyVideoQuery }),
      });
      const json = await resp.json();
      if (json.summaryHe) setWebVideoSummaryHe(json.summaryHe);
      if (Array.isArray(json.links)) setWebVideoLinks(json.links);
      await refreshState();
    } catch {
      setWebVideoSummaryHe('שגיאה בחיפוש סרטוני אנרגיה ברשת.');
    } finally {
      setSearchingWebVideos(false);
    }
  };

  const handleUploadLongSetupVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzingSetupVideo(true);
    setSetupVideoResult(null);
    setSetupVideoProgressHe('דוגם 6 פריימים כרונולוגיים מתוך סרטון הסאטפ...');

    try {
      const videoUrl = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('שגיאה בטעינת קובץ הווידאו'));
      });

      const duration = Math.max(1, video.duration || 30);
      const canvas = document.createElement('canvas');
      const targetWidth = 480;
      const ratio = video.videoHeight && video.videoWidth ? video.videoHeight / video.videoWidth : 16 / 9;
      canvas.width = targetWidth;
      canvas.height = Math.round(targetWidth * ratio);
      const ctx = canvas.getContext('2d');

      const frames: Array<{ base64: string; mimeType: string; timeSec: number }> = [];
      const sampleCount = 6;

      for (let i = 0; i < sampleCount; i++) {
        const t = Number((((i + 0.5) / sampleCount) * duration).toFixed(1));
        video.currentTime = t;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
        });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          const base64 = dataUrl.split(',')[1] || '';
          if (base64) {
            frames.push({ base64, mimeType: 'image/jpeg', timeSec: t });
          }
        }
      }
      URL.revokeObjectURL(videoUrl);

      setSetupVideoProgressHe('מנתח ב-Gemini איך הסאטפ מהפנט צופים ומטמיע חוקי אנרגיה בזיכרון ה-AI...');
      const resp = await fetch('/api/ai-director/analyze-setup-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames,
          durationSec: duration,
          fileName: file.name,
        }),
      });
      const json = await resp.json();
      if (json.analysis) {
        setSetupVideoResult(json.analysis);
        setSetupVideoProgressHe('הניתוח הושלם והוטמע בזיכרון ה-AI הקבוע!');
        await refreshState();
      } else {
        setSetupVideoProgressHe(json.error || 'לא התקבל ניתוח מהשרת.');
      }
    } catch {
      setSetupVideoProgressHe('שגיאה בעיבוד קובץ הווידאו.');
    } finally {
      setAnalyzingSetupVideo(false);
      e.target.value = '';
    }
  };

  const watchedCreators = battleState.memorySummary.watchedCreators || [];
  const monitoredRooms: MonitoredLiveRoomSummary[] = battleState.tiktokRoom.monitoredRooms || [];
  const connectedRoomsCount = monitoredRooms.filter((r) => r.connected).length;
  const swarmFeed = battleState.tiktokRoom.swarmRecentFeed || [];
  const discoveredTools = battleState.memorySummary.discoveredTools || [];
  const vaultItems = battleState.memorySummary.learningVaultItems || [];
  const calib = battleState.countryCalibration;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Executive Header, Country Calibration & Global Swarm Controls */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 font-display tracking-tight">
              רדאר האזנה 24/7, תיקיית למידה חכמה, המצאת כלים וכיול יחסי למדינה
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl">
              לומד במקביל מכל שפה ומדינה, מפרק קבצים בתיקיית הלמידה, מפתח לבד כלים חדשים לבמה — ומתרגם כל סף הפעלה (צופים, לייקים, מתנות וקומבו) לגודל הקהל במדינה שלך!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleConnectAllLiveNow}
              disabled={scanningAllLive}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-xs sm:text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              {scanningAllLive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              <span>סרוק והאזן במקביל לכל מי שבלייב עכשיו</span>
            </button>

            <button
              onClick={() => handleSynthesizeSwarmNow()}
              disabled={synthesizingSwarm}
              className="px-3.5 py-2.5 bg-[#192131] hover:bg-[#222C40] border border-[#2A364F] text-slate-100 font-medium text-xs sm:text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              {synthesizingSwarm ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <Brain className="w-4 h-4 text-amber-400" />}
              <span>זקק תובנות + כלי חדש מכל החדרים</span>
            </button>
          </div>
        </div>

        {/* Country-Relative Crowd Normalization Selector */}
        <div className="bg-[#0B0E14] border border-sky-500/35 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
              <span>מדינת השידור שלי לנרמול כמות צופים והפעלות: {calib?.labelHe}</span>
            </div>
            <p className="text-xs text-slate-400">{calib?.noteHe}</p>
          </div>

          <div className="flex flex-wrap gap-1.5 shrink-0">
            {BROADCAST_COUNTRY_CALIBRATIONS.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => controlBattle({ action: 'set_broadcast_country', countryCode: c.code })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  battleState.broadcastCountryCode === c.code
                    ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold'
                    : 'bg-[#121722] border-[#253047] text-slate-300 hover:border-sky-500/50'
                }`}
              >
                {c.labelHe.split(' ')[0]} ({c.code === 'AUTO_GLOBAL' ? 'AUTO' : c.code})
              </button>
            ))}
          </div>
        </div>

        {/* Live Telemetry Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-[#1E2636]">
          <div>
            <div className="text-xs text-slate-400">חדרי לייב מחוברים במקביל</div>
            <div className="text-xl font-bold text-slate-100 tabular-nums mt-0.5">
              {connectedRoomsCount} <span className="text-xs font-normal text-slate-400">/ עד 10 במקביל</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">כלים אוטונומיים שה-AI פיתח</div>
            <div className="text-xl font-bold text-amber-400 tabular-nums mt-0.5">
              {discoveredTools.length} כלים פעילים
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">קבצים מפורקים בתיקיית הלמידה</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums mt-0.5">
              {vaultItems.length} חומרים
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">חוקי אנרגיה ותיקי יוצרים בזיכרון</div>
            <div className="text-xl font-bold text-sky-400 tabular-nums mt-0.5">
              {battleState.memorySummary.energyRules.length} חוקים · {battleState.memorySummary.learnedCreators.length} יוצרים
            </div>
          </div>
        </div>

        {(statusBannerHe || battleState.tiktokRoom.lastSwarmSynthesisHe || battleState.tiktokRoom.lastErrorHe) && (
          <div className="p-3.5 rounded-lg bg-[#0B0E14] border border-[#243047] text-xs sm:text-sm text-slate-200 space-y-1">
            {statusBannerHe && <div className="font-medium text-amber-300">{statusBannerHe}</div>}
            {battleState.tiktokRoom.lastSwarmSynthesisHe && (
              <div className="text-slate-300">
                <span className="text-emerald-400 font-semibold">תובנת למידה חיה אחרונה: </span>
                {battleState.tiktokRoom.lastSwarmSynthesisHe}
              </div>
            )}
            {battleState.tiktokRoom.lastErrorHe && !statusBannerHe && (
              <div className="text-slate-400">{battleState.tiktokRoom.lastErrorHe}</div>
            )}
          </div>
        )}
      </section>

      {/* LIVE WEBSOCKET EVENT SNIFFER, COLLECTOR & CUSTOM AUTO-TRIGGER ROUTER */}
      <WsEventSnifferPanel battleState={battleState} refreshState={refreshState} />

      {/* DETECTED LIVE CHAT HISTORY WITH PREDEFINED KEYWORD FILTERING */}
      <DetectedLiveChatHistoryPanel battleState={battleState} />

      {/* LIVE CHAT TRACKING, CO-HOST MODERATOR LEARNING & MULTI-ACCOUNT CREW */}
      <ChatCompanionCrewPanel
        battleState={battleState}
        refreshState={refreshState}
        sendTikTokEvent={sendTikTokEvent}
      />

      {/* NEW SECTION A: SMART LEARNING VAULT FOLDER (Upload Video / Audio / Image / PDF / Text -> Deconstruct & Read!) */}
      <LearningVaultPanel items={vaultItems} refreshState={refreshState} />

      {/* NEW SECTION B: AUTONOMOUS STAGE TOOLS INVENTED BY AI FROM LISTENING TO STREAMS */}
      <section className="bg-[#121722] border border-amber-500/35 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-400 shrink-0" />
              <span>ארגז כלים מתפתח: כלים חדשים שה-AI הסיק שהוא צריך מהאזנה לכל שידור ({discoveredTools.length})</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              בכל פעם שה-AI מאזין ללייב או מפרק חומר בתיקייה, הוא מסיק אילו כלי במה נוספים חסרים לו, בונה אותם לבד ומפעיל אותם בטייס האוטומטי!
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {discoveredTools.map((tool) => (
            <div
              key={tool.id}
              className="bg-[#0B0E14] border border-[#1E2636] rounded-xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-amber-300">{tool.nameHe}</div>
                    <div className="text-[11px] text-slate-500">
                      מקור הסקה: {tool.sourceLabelHe} · הופעל x{tool.usageCount || 0}
                    </div>
                  </div>
                  <button
                    onClick={() => controlBattle({ action: 'toggle_discovered_tool', toolId: tool.id })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border shrink-0 transition-colors ${
                      tool.autoEnabled
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-[#141C2B] border-[#243047] text-slate-500'
                    }`}
                  >
                    {tool.autoEnabled ? 'פעיל בטייס AI' : 'מושהה'}
                  </button>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  <span className="text-slate-400 font-semibold">למה ה-AI פיתח אותו: </span>
                  {tool.whyNeededHe}
                </p>
                <p className="text-xs text-emerald-300/90 leading-relaxed">
                  <span className="text-slate-400 font-semibold">איך הכלי עובד בבמה: </span>
                  {tool.howItWorksHe}
                </p>
                <div className="text-[11px] font-mono text-sky-300/90">
                  טריגר: {tool.triggerConditionHe} · {tool.recommendedVfxId} + {tool.recommendedCamera}
                </div>
              </div>

              <div className="pt-2 border-t border-[#182030] flex items-center justify-between">
                <button
                  disabled={executingKey === tool.id}
                  onClick={() => handleApplyPlaybook({ toolId: tool.id })}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>הפעל כלי זה עכשיו על הבמה!</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 1: 24/7 UNLIMITED CREATOR WATCHLIST MANAGER */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-400 shrink-0" />
              <span>רשימת יוצרים למעקב ולמידה אוטומטית 24/7 (הוסף כמה שתרצה)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              הדבק שם משתמש בודד, קישור טיקטוק או רשימה שלמה — המערכת מתחברת לבד כשהם ב-LIVE, קולטת אווטארים וקרבות, ומנרמלת את המסקנות למדינה שלך.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              onClick={() =>
                handleToggleWatchSetting({
                  autoWatchRadarEnabled: !battleState.tiktokRoom.autoWatchRadarEnabled,
                })
              }
              className={`px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                battleState.tiktokRoom.autoWatchRadarEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-[#0B0E14] border-[#243047] text-slate-400'
              }`}
            >
              רדאר 24/7: {battleState.tiktokRoom.autoWatchRadarEnabled ? 'פעיל אוטומטית' : 'מושהה'}
            </button>

            <button
              onClick={() =>
                handleToggleWatchSetting({
                  autoDiscoverOpponents: !battleState.tiktokRoom.autoDiscoverOpponents,
                })
              }
              className={`px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                battleState.tiktokRoom.autoDiscoverOpponents
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-[#0B0E14] border-[#243047] text-slate-400'
              }`}
            >
              ציד יריבי PK אוטומטי: {battleState.tiktokRoom.autoDiscoverOpponents ? 'פעיל' : 'כבוי'}
            </button>
          </div>
        </div>

        {/* Add Creators Input Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-[#0B0E14] p-4 rounded-xl border border-[#1E2636]">
          <div className="md:col-span-5">
            <label className="block text-xs text-slate-400 mb-1">
              שמות משתמש בטיקטוק (אחד או רבים מופרדים בפסיק / רווח)
            </label>
            <input
              type="text"
              value={newWatchHandles}
              onChange={(e) => setNewWatchHandles(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddCreatorsToWatchlist();
              }}
              placeholder="למשל: zainabmamdouh35, sanya.mar, @creator3..."
              className="w-full px-3 py-2 rounded-lg bg-[#121722] border border-[#253047] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs text-slate-400 mb-1">הערת מיקוד ללמידה (אופציונלי)</label>
            <input
              type="text"
              value={newWatchNotesHe}
              onChange={(e) => setNewWatchNotesHe(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddCreatorsToWatchlist();
              }}
              placeholder="למשל: ללמוד איך מרים מסיבה בצ׳אט וסנייפים..."
              className="w-full px-3 py-2 rounded-lg bg-[#121722] border border-[#253047] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="md:col-span-3 flex items-end">
            <button
              onClick={() => handleAddCreatorsToWatchlist()}
              disabled={addingWatchlist}
              className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {addingWatchlist ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>הוסף למעקב 24/7</span>
            </button>
          </div>
        </div>

        {/* Watchlist Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {watchedCreators.map((creator) => {
            const isLearningThis = learningHandle === creator.username;
            return (
              <div
                key={creator.username}
                className={`p-4 rounded-xl border transition-colors flex flex-col justify-between gap-3 ${
                  creator.currentlyConnected
                    ? 'bg-[#151E2E] border-emerald-500/50'
                    : 'bg-[#0B0E14] border-[#1E2636]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          creator.currentlyConnected
                            ? 'bg-emerald-400 animate-pulse'
                            : creator.isLiveNow
                              ? 'bg-amber-400'
                              : 'bg-slate-600'
                        }`}
                      />
                      <a
                        href={`https://www.tiktok.com/@${creator.username}/live`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-bold text-sm sm:text-base text-slate-100 hover:text-amber-400 transition-colors flex items-center gap-1 truncate"
                      >
                        <span>@{creator.username}</span>
                        <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                      </a>
                      <span className="text-xs text-slate-400">
                        · {creator.currentlyConnected ? 'מחובר ומאזין בלייב!' : 'ממתין אוטומטית לעלייה ללייב'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">{creator.notesHe}</p>
                    <div className="text-[11px] text-slate-500 tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>שפה שזוהתה: {creator.detectedLanguage || 'כל השפות'}</span>
                      <span>סשנים שנלמדו: {creator.sessionsLearnedCount}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveWatchedCreator(creator.username)}
                    title="הסר מרשימת המעקב"
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1E2636]">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleConnectSingleCreator(creator.username, 'OBSERVER_LEARN', false)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#192233] hover:bg-[#233047] text-xs font-medium text-slate-200 transition-colors flex items-center gap-1"
                    >
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{creator.currentlyConnected ? 'רענן חיבור' : 'בדוק / האזן עכשיו'}</span>
                    </button>

                    <button
                      onClick={() => handleSynthesizeSwarmNow(creator.username)}
                      disabled={isLearningThis}
                      className="px-2.5 py-1.5 rounded-lg bg-[#192233] hover:bg-[#233047] text-xs font-medium text-amber-300 transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      {isLearningThis ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>נתח + פתח כלי חדש</span>
                    </button>
                  </div>

                  <button
                    onClick={() =>
                      handleToggleWatchSetting({ username: creator.username, field: 'autoWatchEnabled' })
                    }
                    className={`text-xs font-medium transition-colors ${
                      creator.autoWatchEnabled ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {creator.autoWatchEnabled ? 'מעקב חי אוטו׳: פעיל' : 'מעקב אוטו׳: כבוי'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: MULTI-STREAM PARALLEL LIVE LISTENING WALL */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>קיר האזנה חי במקביל — האנרגיה מנורמלת יחסית לגודל המדינה של כל שידור</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              מזהה שפה וכמות צופים יחסית למדינה, וקולט צ׳אט, מתנות, כפפות, עננים ובאטלים בזמן אמת.
            </p>
          </div>

          {monitoredRooms.length > 0 && (
            <button
              onClick={() => handleDisconnectRoom(undefined, true)}
              className="px-3 py-1.5 rounded-lg bg-[#0B0E14] hover:bg-rose-950/40 border border-[#263147] text-xs text-slate-300 hover:text-rose-400 transition-colors self-start sm:self-auto"
            >
              נתק את כל החדרים הפעילים
            </button>
          )}
        </div>

        {monitoredRooms.length === 0 ? (
          <div className="bg-[#0B0E14] border border-[#1E2636] rounded-xl p-6 text-center space-y-3">
            <p className="text-sm text-slate-300">
              כרגע אין חדרים מחוברים בלייב פעיל — לחץ על <span className="text-amber-400 font-semibold">״סרוק והאזן במקביל לכל מי שבלייב עכשיו״</span> כדי להתחבר אוטומטית לכל היוצרים שמשדרים ברגע זה!
            </p>
            <button
              onClick={handleConnectAllLiveNow}
              disabled={scanningAllLive}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-2"
            >
              {scanningAllLive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              <span>התחבר לכל השידורים החיים הזמינים עכשיו</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {monitoredRooms.map((room) => (
              <div
                key={room.username}
                className={`bg-[#0B0E14] border rounded-xl p-4 space-y-3.5 ${
                  room.mirrorToStage ? 'border-amber-500/70' : 'border-[#1E2636]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          room.connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                        }`}
                      />
                      <span className="font-mono font-bold text-base text-slate-100">@{room.username}</span>
                      <span className="text-xs text-slate-400">· {room.detectedLanguage}</span>
                    </div>
                    <div className="text-xs text-amber-300 font-medium mt-0.5">{room.partyVibeHe}</div>
                  </div>

                  <div className="text-left tabular-nums">
                    <div className="text-xs text-slate-400">אנרגיה יחסית</div>
                    <div className="text-lg font-bold text-emerald-400">{room.energyScore}/100</div>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-[#182030] rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-l from-amber-400 to-emerald-400 transition-all duration-300 ${energyWidthClass(
                      room.energyScore
                    )}`}
                  />
                </div>

                <div className="grid grid-cols-4 gap-2 text-center bg-[#121722] rounded-lg p-2.5 border border-[#1E2636] tabular-nums">
                  <div>
                    <div className="text-[11px] text-slate-400">צופים</div>
                    <div className="text-sm font-bold text-slate-100">{room.viewerCount.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">לייקים/שנ׳</div>
                    <div className="text-sm font-bold text-amber-400">{room.likesPerSec}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">יהלומי מסיבה</div>
                    <div className="text-sm font-bold text-sky-400">{room.diamondsCount.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">הודעות צ׳אט</div>
                    <div className="text-sm font-bold text-slate-100">{room.chatCount.toLocaleString()}</div>
                  </div>
                </div>

                {room.inBattle && (
                  <div className="p-2.5 rounded-lg bg-[#191524] border border-rose-500/30 flex items-center justify-between text-xs tabular-nums">
                    <div className="flex items-center gap-1.5 text-rose-300 font-semibold">
                      <Swords className="w-4 h-4" />
                      <span>
                        קרב PK חי {room.opponentUsername ? `נגד @${room.opponentUsername}` : ''}
                      </span>
                    </div>
                    <div className="font-bold text-slate-100">
                      {room.hostBattlePoints.toLocaleString()} : {room.opponentBattlePoints.toLocaleString()}
                    </div>
                  </div>
                )}

                <div className="bg-[#121722] border border-[#1E2636] rounded-lg p-2.5 h-36 overflow-y-auto space-y-1.5 text-xs">
                  {room.recentEvents.length === 0 ? (
                    <div className="text-slate-500 text-center py-8">ממתין להודעות צ׳אט, מתנות ואירועים מהחדר...</div>
                  ) : (
                    room.recentEvents.map((ev) => (
                      <div key={ev.id} className="flex items-start gap-2 text-slate-300 leading-snug">
                        <span className="text-[10px] text-slate-500 tabular-nums shrink-0 mt-0.5">
                          {new Date(ev.ts).toLocaleTimeString('he-IL', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                        <span
                          className={
                            ev.kind === 'GIFT' || ev.kind === 'PARTY_ENV'
                              ? 'text-amber-300 font-medium'
                              : ev.kind === 'BATTLE_PK' || ev.kind === 'GLOVE_CARD'
                                ? 'text-rose-300 font-semibold'
                                : ev.kind === 'CAPTION'
                                  ? 'text-sky-300'
                                  : 'text-slate-200'
                          }
                        >
                          {ev.summary}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleMirrorRoom(room.username)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        room.mirrorToStage
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#182132] hover:bg-[#222E45] text-slate-200'
                      }`}
                    >
                      {room.mirrorToStage ? 'משקף אנרגיה לבמה שלי (פעיל)' : 'שקף אנרגיה לבמה שלי'}
                    </button>

                    <button
                      onClick={() => handleSynthesizeSwarmNow(room.username)}
                      disabled={learningHandle === room.username}
                      className="px-3 py-1.5 rounded-lg bg-[#182132] hover:bg-[#222E45] text-xs font-medium text-emerald-300 transition-colors flex items-center gap-1"
                    >
                      {learningHandle === room.username ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Brain className="w-3.5 h-3.5" />
                      )}
                      <span>למד מהחדר עכשיו</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleDisconnectRoom(room.username, false)}
                    className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    נתק חדר
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {swarmFeed.length > 0 && (
          <div className="bg-[#0B0E14] border border-[#1E2636] rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                <span>נהר אירועים משולב בזמן אמת מכל השידורים והשפות</span>
              </h3>
              <span className="text-[11px] text-slate-500 tabular-nums">{swarmFeed.length} אירועים אחרונים</span>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
              {swarmFeed.slice(0, 20).map((item) => (
                <div key={item.id} className="flex items-start gap-2 py-0.5 border-b border-[#141A26] last:border-0">
                  <span className="font-mono text-amber-400 shrink-0">@{item.username}</span>
                  <span className="text-slate-300">{item.summary}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: MY LIVE ROOM + ANTI-CLOUD CROSS-ROOM X-RAY + TIKTOK OAUTH */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>חיבור השידור החי שלי</span>
            </h2>
            <p className="text-xs text-slate-400">
              כשתעלה ללייב בעצמך, הזן את ה-@username שלך כדי שכל לייק, אווטאר תומך, כפפה וקרב יפעילו את הבמה ב-9:16 בזמן אמת.
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={myBroadcastHandle}
              onChange={(e) => setMyBroadcastHandle(e.target.value)}
              placeholder="ה-@username שלך בטיקטוק..."
              className="flex-1 px-3 py-2 rounded-lg bg-[#0B0E14] border border-[#253047] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={() => handleConnectSingleCreator(myBroadcastHandle, 'MY_BROADCAST', true)}
              disabled={connectingMyRoom || !myBroadcastHandle.trim()}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap"
            >
              {connectingMyRoom ? 'מתחבר...' : 'חבר לשידור שלי'}
            </button>
          </div>
        </section>

        {/* Opponent Cloud X-Ray Spy Configuration */}
        <section className="bg-[#121722] border border-cyan-500/40 rounded-xl p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Eye className="w-4 h-4 text-cyan-400" />
              <span>טריגר זיהוי ענן יריב (דרך החדר שלו)</span>
            </h2>
            <p className="text-xs text-slate-400">
              מאזין ל-`LINK_MIC_BATTLE_ITEM_CARD` (`useSmokeCard`), מתחבר לחדר היריב ומושך משם את הסקור האמיתי שלך על הבמה!
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={opponentCloudHandle}
              onChange={(e) => setOpponentCloudHandle(e.target.value)}
              placeholder="@username של היריב בקרב..."
              className="flex-1 px-3 py-2 rounded-lg bg-[#0B0E14] border border-[#253047] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={() =>
                controlBattle({
                  action: 'trigger_cloud_xray',
                  opponentUsername: opponentCloudHandle || undefined,
                  durationSec: 25,
                })
              }
              className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg transition-colors whitespace-nowrap"
            >
              הפעל שובר-ענן
            </button>
          </div>
        </section>

        <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-sky-400" />
                <span>קישור חשבון טיקטוק רשמי (OAuth)</span>
              </h2>
              <p className="text-xs text-slate-400">
                אימות פרופיל בחלון קופץ (בנוסף להאזנה הישירה לפי @username שפועלת מיד).
              </p>
            </div>
            {battleState.tiktokRoom.oauthConnectedUser && (
              <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
                <span>@{battleState.tiktokRoom.oauthConnectedUser.displayName}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleOpenTikTokOAuth}
              className="px-4 py-2 bg-[#1A2334] hover:bg-[#232F46] border border-[#2C3B57] text-slate-100 font-medium text-xs sm:text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4 text-sky-400" />
              <span>התחברות לחשבון טיקטוק</span>
            </button>
            {oauthRedirectUri && (
              <span className="text-[11px] font-mono text-slate-400 break-all">
                Callback: {oauthRedirectUri}
              </span>
            )}
          </div>
          {oauthNoteHe && <p className="text-xs text-slate-400 leading-relaxed">{oauthNoteHe}</p>}
        </section>
      </div>

      {/* SECTION 4: GLOBAL MULTI-REGION BATTLE SCOUT */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <Globe className="w-5 h-5 text-sky-400 shrink-0" />
              <span>צייד הלייבים והבאטלים החזקים בעולם (TikLeap API + חיפוש חי בכל השפות)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              מוצא את השידורים החזקים ביותר במזרח התיכון, ישראל, טורקיה, אירופה, ארה״ב ואמריקה הלטינית — ובודק מי מהם ב-LIVE ממש עכשיו.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoConnectScouted}
              onChange={(e) => setAutoConnectScouted(e.target.checked)}
              className="rounded border-slate-600 bg-[#0B0E14] text-amber-500 focus:ring-0"
            />
            <span>התחבר והאזן אוטומטית לכל מי שנמצא LIVE בסריקה</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-3">
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0B0E14] border border-[#253047] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            >
              {SCOUT_REGIONS.map((reg) => (
                <option key={reg.code} value={reg.code}>
                  {reg.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-6">
            <input
              type="text"
              value={scoutQuery}
              onChange={(e) => setScoutQuery(e.target.value)}
              placeholder="חיפוש חופשי: באטלים חזקים, מסיבות לייב, סנייפים..."
              className="w-full px-3 py-2 rounded-lg bg-[#0B0E14] border border-[#253047] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="md:col-span-3">
            <button
              onClick={handleScoutStrongBattles}
              disabled={scouting}
              className="w-full px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {scouting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>חפש לייבים חזקים עכשיו</span>
            </button>
          </div>
        </div>

        {scoutStatusHe && <div className="text-xs text-sky-300">{scoutStatusHe}</div>}

        {scoutResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {scoutResults.map((c) => (
              <div
                key={c.username}
                className="bg-[#0B0E14] border border-[#1E2636] rounded-xl p-3.5 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={c.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono font-bold text-sm text-slate-100 hover:text-amber-400 flex items-center gap-1 truncate"
                    >
                      <span>@{c.username}</span>
                      <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                    </a>
                    <span
                      className={`text-xs font-semibold ${
                        c.isLiveNow ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {c.isLiveNow ? '● LIVE עכשיו' : 'Offline'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 tabular-nums">
                    עוצמה מוערכת: <span className="text-amber-400 font-semibold">{c.estimatedStrength}</span>
                    {c.rank ? ` · דירוג TikLeap #${c.rank}` : ''} · {c.region}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{c.styleNoteHe}</p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#182030]">
                  <button
                    onClick={() => handleAddCreatorsToWatchlist(c.username)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium transition-colors"
                  >
                    + מעקב 24/7 והאזנה
                  </button>
                  <button
                    onClick={() => handleSynthesizeSwarmNow(c.username)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#161E2E] hover:bg-[#202B42] text-slate-200 text-xs transition-colors"
                  >
                    למד
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {scoutLinks.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-2 text-xs text-slate-400">
            <span>מקורות רשת:</span>
            {scoutLinks.map((lnk, idx) => (
              <a
                key={idx}
                href={lnk.uri}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline truncate max-w-xs"
              >
                {lnk.title}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 5: LONG SETUP VIDEO ANALYZER + VIRAL WEB ENERGY RESEARCH */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Video className="w-4 h-4 text-amber-400" />
              <span>ניתוח סרטון סאטפ / קרב ארוך להבנת היפנוט הצופים</span>
            </h2>
            <p className="text-xs text-slate-400">
              העלה הקלטת מסך של לייב חזק או סאטפ אולפן — המערכת דוגמת 6 נקודות זמן, מנתחת תאורה, מצלמה, אנרגיה וקהל, ומטמיעה חוק חדש בזיכרון ה-AI.
            </p>
          </div>

          <label className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl border border-dashed border-[#2C3A56] bg-[#0B0E14] hover:border-amber-500/60 cursor-pointer transition-colors text-xs sm:text-sm text-slate-200 font-medium">
            {analyzingSetupVideo ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            ) : (
              <Upload className="w-4 h-4 text-amber-400" />
            )}
            <span>{analyzingSetupVideo ? 'מנתח וידאו ב-Gemini...' : 'בחר קובץ וידאו (MP4 / WebM / MOV) לניתוח ולמידה'}</span>
            <input
              type="file"
              accept="video/*"
              onChange={handleUploadLongSetupVideo}
              disabled={analyzingSetupVideo}
              className="hidden"
            />
          </label>

          {setupVideoProgressHe && <div className="text-xs text-amber-300">{setupVideoProgressHe}</div>}

          {setupVideoResult && (
            <div className="bg-[#0B0E14] border border-[#1E2636] rounded-xl p-4 space-y-2.5 text-xs">
              <div className="font-semibold text-emerald-400">
                חוק שהוטמע בזיכרון: {setupVideoResult.learnedRuleTitleHe}
              </div>
              <p className="text-slate-300 leading-relaxed">{setupVideoResult.cameraAndFramingAnalysisHe}</p>
              <p className="text-slate-400 leading-relaxed">{setupVideoResult.energyArcAndPacingHe}</p>
              <ul className="list-disc list-inside text-slate-300 space-y-1">
                {setupVideoResult.hypnosisSecretsHe.map((sec, i) => (
                  <li key={i}>{sec}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" />
              <span>חיפוש סרטוני אנרגיה, מסיבות לייב וטכניקות באטל ברשת</span>
            </h2>
            <p className="text-xs text-slate-400">
              סורק ברשת סרטונים ומדריכי PK מכל העולם ומלמד את הבמאי האוטומטי מתי להרים קצב, מתי ליצור שקט מתוח ומתי לפוצץ אפקטים.
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={energyVideoQuery}
              onChange={(e) => setEnergyVideoQuery(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-[#0B0E14] border border-[#253047] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleSearchWebEnergyVideos}
              disabled={searchingWebVideos}
              className="px-4 py-2 bg-[#1A2334] hover:bg-[#232F46] border border-[#2C3B57] text-slate-100 font-medium text-xs sm:text-sm rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {searchingWebVideos ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>חפש ולמד</span>
            </button>
          </div>

          {webVideoSummaryHe && (
            <div className="bg-[#0B0E14] border border-[#1E2636] rounded-xl p-3.5 text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-52 overflow-y-auto">
              {webVideoSummaryHe}
            </div>
          )}

          {webVideoLinks.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {webVideoLinks.map((l, i) => (
                <a
                  key={i}
                  href={l.uri}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:underline truncate max-w-[240px]"
                >
                  {l.title}
                </a>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* SECTION 6: PERSISTENT AI BRAIN MEMORY (LEARNED CREATOR DOSSIERS + ENERGY RULES + 1-CLICK STAGE EXECUTION) */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <Brain className="w-5 h-5 text-amber-400" />
              <span>מאגר הזיכרון המתמשך של במאי ה-AI (מה למד, מה הסיק והפעלה בלחיצה על הבמה)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              כל תובנה שנלמדת מיוצרים או מתיקיית הלמידה נשמרת בדיסק וניתנת להפעלה מיידית על במת ה-9:16 שלך.
            </p>
          </div>
          <div className="text-xs text-slate-400 tabular-nums">
            סבבי ניתוח שנצברו: <span className="text-slate-100 font-bold">{battleState.memorySummary.totalRoundsAnalyzed}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Energy & Hypnosis Rules */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              חוקי אנרגיה והיפנוט פעילים במוח ה-AI ({battleState.memorySummary.energyRules.length})
            </h3>
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {battleState.memorySummary.energyRules.map((rule) => (
                <div
                  key={rule.id}
                  className="bg-[#0B0E14] border border-[#1E2636] rounded-xl p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-100">{rule.titleHe}</div>
                      <div className="text-xs text-slate-400">תנאי הפעלה: {rule.triggerConditionHe}</div>
                      <div className="text-[11px] text-slate-500">
                        מקור: {rule.sourceLabelHe} · יעילות: {rule.effectivenessScore}%
                      </div>
                    </div>
                    <button
                      onClick={() => controlBattle({ action: 'toggle_memory_rule', ruleId: rule.id })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-colors ${
                        rule.active
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-[#151C2A] text-slate-500 border border-[#232D42]'
                      }`}
                    >
                      {rule.active ? 'פעיל' : 'כבוי'}
                    </button>
                  </div>
                  <div className="pt-1">
                    <button
                      disabled={executingKey === rule.id}
                      onClick={() => handleApplyPlaybook({ ruleId: rule.id })}
                      className="px-3 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold transition-colors inline-flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>הפעל חוק זה עכשיו על הבמה!</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Learned Creator Dossiers */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>תיקי מודיעין וסגנון שנלמדו מיוצרים ({battleState.memorySummary.learnedCreators.length})</span>
            </h3>
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {battleState.memorySummary.learnedCreators.map((c) => (
                <div key={c.username} className="bg-[#0B0E14] border border-[#1E2636] rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-amber-400">@{c.username}</span>
                    <span className="text-xs text-slate-400 tabular-nums">
                      עוצמה {c.strengthScore}/100 · {c.region}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    <span className="text-sky-300 font-semibold">מה למד: </span>
                    {c.battleStyleHe}
                  </p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    <span className="text-slate-400">סנייפ וכפפות: </span>
                    {c.snipeTendencyHe} · {c.gloveStrategyHe}
                  </p>
                  <p className="text-xs text-emerald-300/90 leading-relaxed">
                    <span className="text-emerald-300 font-semibold">מה הסיק ליישום אצלך: </span>
                    {c.counterTacticHe}
                  </p>
                  <div className="pt-1">
                    <button
                      disabled={executingKey === c.username}
                      onClick={() => handleApplyPlaybook({ username: c.username })}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors inline-flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>הפעל מסקנה זו עכשיו על הבמה!</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
