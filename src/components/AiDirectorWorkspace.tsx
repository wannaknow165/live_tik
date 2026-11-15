import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Brain,
  Camera,
  CloudOff,
  Crown,
  Eye,
  Flame,
  FolderOpen,
  Globe,
  Hand,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  Radio,
  Send,
  ShieldAlert,
  Sparkles,
  Upload,
  Users,
  Volume2,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  AI_MOOD_PROFILES,
  AiDirectorDecision,
  AiMoodProfileId,
  BattleState,
  BOOSTERA_ASSETS,
  BROADCAST_COUNTRY_CALIBRATIONS,
  BroadcastCountryCode,
  CameraPresetId,
  MusicTrackSpec,
  PresenterGestureId,
  RoundPaletteId,
  STANDALONE_SOUND_CUES,
  StreamMode,
} from '../data/boosteraCatalog';
import { BroadcastStage9x16, StagePerfMetrics } from './BroadcastStage9x16';
import { LearningVaultPanel } from './LearningVaultPanel';
import { WsEventSnifferPanel } from './WsEventSnifferPanel';
import { ChatCompanionCrewPanel } from './ChatCompanionCrewPanel';
import { musicDeck } from '../engine/musicDeckEngine';
import { soundEngine } from '../engine/soundEngine';

function pctToTailwindWidth(pct: number): string {
  if (pct <= 3) return 'w-0';
  if (pct <= 10) return 'w-1/12';
  if (pct <= 20) return 'w-2/12';
  if (pct <= 28) return 'w-3/12';
  if (pct <= 37) return 'w-4/12';
  if (pct <= 46) return 'w-5/12';
  if (pct <= 55) return 'w-6/12';
  if (pct <= 64) return 'w-7/12';
  if (pct <= 73) return 'w-8/12';
  if (pct <= 82) return 'w-9/12';
  if (pct <= 91) return 'w-10/12';
  if (pct < 98) return 'w-11/12';
  return 'w-full';
}

interface AiDirectorWorkspaceProps {
  battleState: BattleState;
  wsConnected: boolean;
  sendTikTokEvent: (payload: {
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
    message?: string;
    bypassCooldown?: boolean;
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
      | 'set_broadcast_country'
      | 'set_ai_mood_profile';
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
    aiMoodProfile?: AiMoodProfileId;
  }) => Promise<void>;
  askAiDirectorNow: (payload: {
    audioBase64?: string;
    audioMimeType?: string;
    micMetrics?: {
      rmsPct: number;
      isSpeaking: boolean;
      deadAirSec: number;
      musicEnergy: number;
    };
    availableCustomTracks?: { id: string; titleHe: string }[];
    directorPromptHe?: string;
  }) => Promise<AiDirectorDecision | null>;
  generateAiClientVideo?: (payload: {
    imageBase64: string;
    mimeType?: string;
    promptHe?: string;
  }) => Promise<{ ok?: boolean; errorHe?: string }>;
  clearAiClientVideo?: () => Promise<unknown>;
  approveProposal?: (
    kind: 'rule' | 'tool' | 'ws_binding',
    id: string,
    action: 'APPROVE' | 'REJECT'
  ) => Promise<{ ok?: boolean; errorHe?: string }>;
  refreshState: () => Promise<void>;
  onPerfSample: (metrics: StagePerfMetrics) => void;
  onOpenTikTokTab: () => void;
}

export function AiDirectorWorkspace({
  battleState,
  wsConnected,
  sendTikTokEvent,
  controlBattle,
  askAiDirectorNow,
  generateAiClientVideo,
  clearAiClientVideo,
  approveProposal,
  refreshState,
  onPerfSample,
  onOpenTikTokTab,
}: AiDirectorWorkspaceProps) {
  const [micListening, setMicListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [voiceRmsPct, setVoiceRmsPct] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [deadAirSec, setDeadAirSec] = useState(0);

  const [tracks, setTracks] = useState<MusicTrackSpec[]>(() => musicDeck.getAllTracks());
  const [musicPlaying, setMusicPlaying] = useState(() => musicDeck.getIsPlaying());
  const [musicEnergy, setMusicEnergy] = useState(0);
  const [musicFilter, setMusicFilter] = useState<'ALL' | 'SOLO' | 'BATTLE'>('ALL');
  const [rackTab, setRackTab] = useState<'SOUNDS' | 'VFX'>('SOUNDS');

  const [aiThinking, setAiThinking] = useState(false);
  const [directorInstruction, setDirectorInstruction] = useState('');
  const [chatUser, setChatUser] = useState('צופה_חי');
  const [chatInput, setChatInput] = useState('');
  const [useWebcam, setUseWebcam] = useState(false);

  // Quick Feed-Live-Streams, Learning Transparency, Discovered Tools & Vault state
  const [quickFeedInput, setQuickFeedInput] = useState('');
  const [quickFeeding, setQuickFeeding] = useState(false);
  const [quickGlobalScanning, setQuickGlobalScanning] = useState(false);
  const [quickLearnHandle, setQuickLearnHandle] = useState<string | null>(null);
  const [quickFeedBannerHe, setQuickFeedBannerHe] = useState<string | null>(null);
  const [selectedLearnedUser, setSelectedLearnedUser] = useState<string>('');
  const [showVaultInline, setShowVaultInline] = useState<boolean>(false);
  const [showWsSnifferInline, setShowWsSnifferInline] = useState<boolean>(true);
  const [showChatCompanionInline, setShowChatCompanionInline] = useState<boolean>(false);
  const [executingPlaybookId, setExecutingPlaybookId] = useState<string | null>(null);

  // Opponent Cloud X-Ray handle input
  const [opponentHandleInput, setOpponentHandleInput] = useState<string>(
    battleState.cloudRadar?.opponentUsername || ''
  );

  // Layer 7: AI Client Photo -> Video Generator state
  const clientPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [clientVideoPrompt, setClientVideoPrompt] = useState<string>(
    'אולפן לייב אנרגטי 9:16 מתוך תמונת הלקוח עם תאורה קולנועית'
  );
  const [generatingClientVid, setGeneratingClientVid] = useState<boolean>(false);
  const [clientVideoErrorHe, setClientVideoErrorHe] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestAudioBase64Ref = useRef<{ base64: string; mimeType: string } | null>(null);
  const micMetricsRef = useRef({ rmsPct: 0, isSpeaking: false, deadAirSec: 0, musicEnergy: 0 });
  const lastSpokeAtRef = useRef<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const playing = musicDeck.getIsPlaying();
      const energy = musicDeck.getMusicEnergyMeter();
      setMusicPlaying(playing);
      setMusicEnergy(energy);
      micMetricsRef.current.musicEnergy = energy;
    }, 220);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    musicDeck.setVolumePct(battleState.musicVolumePct);
    if (musicDeck.getIsPlaying() && musicDeck.getCurrentTrackId() !== battleState.activeMusicTrackId) {
      musicDeck.selectAndPlayTrack(battleState.activeMusicTrackId, true);
    }
  }, [battleState.activeMusicTrackId, battleState.musicVolumePct]);

  useEffect(() => {
    if (!micListening) {
      setVoiceRmsPct(0);
      setIsSpeaking(false);
      setDeadAirSec(0);
      musicDeck.setVoiceDuckingActive(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let meterTimer: ReturnType<typeof setInterval> | null = null;
    let recorderTimer: ReturnType<typeof setInterval> | null = null;
    let activeRecorder: MediaRecorder | null = null;

    navigator.mediaDevices
      ?.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = mediaStream;
        setMicError(null);
        lastSpokeAtRef.current = Date.now();

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AudioCtx();
        const source = audioCtx.createMediaStreamSource(mediaStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);

        meterTimer = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let sumSq = 0;
          for (let i = 0; i < buf.length; i++) {
            sumSq += buf[i] * buf[i];
          }
          const rms = Math.sqrt(sumSq / buf.length);
          const pct = Math.min(100, Math.round(rms * 340));
          const speakingNow = pct >= 14;

          if (speakingNow) {
            lastSpokeAtRef.current = Date.now();
          }
          const silentSec = Number(((Date.now() - lastSpokeAtRef.current) / 1000).toFixed(1));

          setVoiceRmsPct(pct);
          setIsSpeaking(speakingNow);
          setDeadAirSec(silentSec);

          micMetricsRef.current = {
            rmsPct: pct,
            isSpeaking: speakingNow,
            deadAirSec: silentSec,
            musicEnergy: musicDeck.getMusicEnergyMeter(),
          };

          musicDeck.setVoiceDuckingActive(speakingNow);
        }, 140);

        const startSnippetCycle = () => {
          if (cancelled || !stream) return;
          try {
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : 'audio/webm';
            const rec = new MediaRecorder(stream, { mimeType });
            activeRecorder = rec;
            const chunks: BlobPart[] = [];
            rec.ondataavailable = (ev) => {
              if (ev.data && ev.data.size > 0) chunks.push(ev.data);
            };
            rec.onstop = () => {
              if (cancelled || chunks.length === 0) return;
              const blob = new Blob(chunks, { type: mimeType });
              const reader = new FileReader();
              reader.onloadend = () => {
                const resStr = String(reader.result || '');
                const commaIdx = resStr.indexOf(',');
                if (commaIdx > -1) {
                  latestAudioBase64Ref.current = {
                    base64: resStr.slice(commaIdx + 1),
                    mimeType: 'audio/webm',
                  };
                }
              };
              reader.readAsDataURL(blob);
            };
            rec.start();
            setTimeout(() => {
              if (rec.state === 'recording') {
                rec.stop();
              }
            }, 3000);
          } catch {
            // Fallback to numeric telemetry
          }
        };

        startSnippetCycle();
        recorderTimer = setInterval(startSnippetCycle, 4500);
      })
      .catch(() => {
        if (!cancelled) {
          setMicListening(false);
          setMicError('לא ניתנה הרשאת מיקרופון בדפדפן — הבמאי ממשיך לעבוד לפי צ׳אט, מצלמה, כפפות וניקוד.');
        }
      });

    return () => {
      cancelled = true;
      if (meterTimer) clearInterval(meterTimer);
      if (recorderTimer) clearInterval(recorderTimer);
      if (activeRecorder && activeRecorder.state === 'recording') {
        try {
          activeRecorder.stop();
        } catch {
          // ignore
        }
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      musicDeck.setVoiceDuckingActive(false);
    };
  }, [micListening]);

  const triggerAiEvaluation = useCallback(
    async (explicitNoteHe?: string, overrideDeadAirSec?: number) => {
      setAiThinking(true);
      try {
        const customList = tracks
          .filter((t) => t.customUrl)
          .map((t) => ({ id: t.id, titleHe: t.titleHe }));

        const metrics = {
          ...micMetricsRef.current,
          deadAirSec:
            typeof overrideDeadAirSec === 'number'
              ? overrideDeadAirSec
              : micMetricsRef.current.deadAirSec,
        };

        await askAiDirectorNow({
          audioBase64: latestAudioBase64Ref.current?.base64,
          audioMimeType: latestAudioBase64Ref.current?.mimeType,
          micMetrics: metrics,
          availableCustomTracks: customList,
          directorPromptHe: explicitNoteHe,
        });
      } finally {
        setAiThinking(false);
      }
    },
    [askAiDirectorNow, tracks]
  );

  useEffect(() => {
    if (!battleState.aiAutopilot || !micListening) return;
    const interval = setInterval(() => {
      triggerAiEvaluation();
    }, 8000);
    return () => clearInterval(interval);
  }, [battleState.aiAutopilot, micListening, triggerAiEvaluation]);

  const handleToggleMusicPlay = () => {
    soundEngine.ensureInitialized();
    if (musicPlaying) {
      musicDeck.stop();
      setMusicPlaying(false);
    } else {
      musicDeck.selectAndPlayTrack(battleState.activeMusicTrackId, true);
      setMusicPlaying(true);
    }
  };

  const handleSelectTrack = (trackId: string) => {
    soundEngine.ensureInitialized();
    musicDeck.selectAndPlayTrack(trackId, true);
    setMusicPlaying(true);
    sendTikTokEvent({ type: 'music_select', trackId, volumePct: battleState.musicVolumePct });
  };

  const handleUploadTrack = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const added = musicDeck.addCustomTrack(file);
    setTracks(musicDeck.getAllTracks());
    musicDeck.selectAndPlayTrack(added.id, true);
    setMusicPlaying(true);
    sendTikTokEvent({ type: 'music_select', trackId: added.id, volumePct: battleState.musicVolumePct });
    e.target.value = '';
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    await sendTikTokEvent({ type: 'chat', user: chatUser || 'צופה_חי', message: text, bypassCooldown: true });
    if (battleState.aiAutopilot) {
      setTimeout(() => {
        triggerAiEvaluation(`הודעה חדשה בצ׳אט מאת ${chatUser}: "${text}"`);
      }, 250);
    }
  };

  const handleSendDirectorNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!directorInstruction.trim()) return;
    const note = directorInstruction.trim();
    setDirectorInstruction('');
    await triggerAiEvaluation(note);
  };

  const filteredTracks = tracks.filter((t) => {
    if (musicFilter === 'ALL') return true;
    return t.idealMode === musicFilter || t.idealMode === 'BOTH';
  });

  const scoreDiff = battleState.myScore - battleState.opponentScore;
  const activeTrackObj = tracks.find((t) => t.id === battleState.activeMusicTrackId) || tracks[0];

  const handleQuickFeedLiveStreams = async (e: FormEvent) => {
    e.preventDefault();
    const raw = quickFeedInput.trim();
    if (!raw) {
      setQuickFeedBannerHe('הדבק לינק ללייב בטיקטוק או @שם_משתמש (אפשר כמה מופרדים בפסיק) כדי להזין ל-AI ללמידה וניצול מיידי!');
      return;
    }
    setQuickFeeding(true);
    setQuickFeedBannerHe('מחבר את ה-AI ללייב, מאזין לצ׳אט/מתנות/קרב ומחלץ חוקי אנרגיה וכלי במה מכוילים למדינה שלך...');
    try {
      const resp = await fetch('/api/tiktok/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: raw }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setQuickFeedBannerHe(json.error || 'שגיאה בהזנת הלייבים.');
      } else {
        setQuickFeedInput('');
        const liveNow: string[] = json.connectedNow || [];
        const queued: string[] = json.queuedForAutoWatch || [];
        const firstHandle = liveNow[0] || queued[0];
        if (firstHandle) {
          await fetch('/api/tiktok/learn-from-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: firstHandle }),
          }).catch(() => {});
          setSelectedLearnedUser(firstHandle);
        }
        await refreshState();
        if (liveNow.length > 0) {
          setQuickFeedBannerHe(
            `מחובר עכשיו בלייב אל ${liveNow.map((u) => '@' + u).join(', ')}! ה-AI מאזין לאנרגיה, מסיק כלים חדשים ומנרמל אותם לגודל הקהל במדינה שלך.`
          );
        } else {
          setQuickFeedBannerHe(
            `נוסף למעקב 24/7 ונלמד פרופיל אנרגיה + כלי חדש מ-${queued.map((u) => '@' + u).join(', ')} — לחץ למטה "הפעל מסקנה בבמה" לביצוע מיידי!`
          );
        }
      }
    } catch {
      setQuickFeedBannerHe('שגיאת תקשורת בהזנת הלייבים.');
    } finally {
      setQuickFeeding(false);
    }
  };

  const handleQuickScanGlobalLive = async () => {
    setQuickGlobalScanning(true);
    setQuickFeedBannerHe('סורק את דירוגי TikLeap הגלובליים + רשימת המעקב ומתחבר במקביל לכל הלייבים החזקים שכרגע באוויר...');
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
        setQuickFeedBannerHe(
          `ה-AI מאזין ולומד עכשיו בשידור חי מ-${activeCount} חדרים במקביל! התובנות מנורמלות אוטומטית למדינה שלך.`
        );
      } else {
        setQuickFeedBannerHe(
          `נסרקו ${json.checkedCount || 0} יוצרים ועדכנו דירוגי TikLeap — המכ״ם האוטומטי ממשיך לדגום כל 40 שניות ומתחבר מיד כשיוצר עולה ללייב!`
        );
      }
    } catch {
      setQuickFeedBannerHe('שגיאה בסריקת לייבים גלובלית.');
    } finally {
      setQuickGlobalScanning(false);
    }
  };

  const handleQuickSynthesizeCreator = async (username: string) => {
    setQuickLearnHandle(username);
    setSelectedLearnedUser(username);
    setQuickFeedBannerHe(`מחלץ מה למד ומה הסיק מ-@${username} + מפתח כלי במה חדש מותאם לגודל הקהל שלך...`);
    try {
      const resp = await fetch('/api/tiktok/learn-from-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const json = await resp.json();
      await refreshState();
      setQuickFeedBannerHe(
        json.synthesisHe ||
          `נלמד פרופיל @${username} ונוצר כלי חדש בארגז הכלים של ה-AI!`
      );
    } catch {
      setQuickFeedBannerHe('שגיאה בחילוץ תובנות מהיוצר.');
    } finally {
      setQuickLearnHandle(null);
    }
  };

  const handleExecutePlaybookOnStage = async (payload: {
    username?: string;
    ruleId?: string;
    toolId?: string;
    vaultItemId?: string;
  }) => {
    soundEngine.ensureInitialized();
    const key = payload.toolId || payload.ruleId || payload.username || payload.vaultItemId || 'exec';
    setExecutingPlaybookId(key);
    try {
      const resp = await fetch('/api/tiktok/apply-creator-playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      await refreshState();
      if (json.executedSummaryHe) {
        setQuickFeedBannerHe(json.executedSummaryHe);
      }
    } catch {
      setQuickFeedBannerHe('שגיאה בהפעלת המסקנה על הבמה.');
    } finally {
      setExecutingPlaybookId(null);
    }
  };

  const handleToggleMirrorCreatorRoom = async (username: string) => {
    setQuickFeedBannerHe(`מחבר ומשקף את הלייב של @${username} ישירות לבמה שלך (מותאם יחסית למדינה)...`);
    await fetch('/api/tiktok/connect-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, listenMode: 'OBSERVER_LEARN', mirrorToStage: true }),
    }).catch(() => {});
    await refreshState();
  };

  const prioritizedVfxAssets = [
    ...BOOSTERA_ASSETS.filter((a) => a.id.startsWith('VID_') || a.id.startsWith('BEAST_')),
    ...BOOSTERA_ASSETS.filter((a) => !a.id.startsWith('VID_') && !a.id.startsWith('BEAST_')),
  ];

  const learnedCreators = battleState.memorySummary.learnedCreators || [];
  const discoveredTools = battleState.memorySummary.discoveredTools || [];
  const vaultItems = battleState.memorySummary.learningVaultItems || [];
  const activeLearnedProfile =
    learnedCreators.find((c) => c.username.toLowerCase() === selectedLearnedUser.toLowerCase()) ||
    learnedCreators[0] ||
    null;

  const learningMaturityPct = Math.min(
    100,
    Math.round(
      battleState.memorySummary.totalRoundsAnalyzed * 2.2 +
        learnedCreators.length * 8 +
        battleState.memorySummary.energyRules.length * 5 +
        discoveredTools.length * 6 +
        vaultItems.length * 7
    )
  );

  const calib = battleState.countryCalibration;

  return (
    <div className="space-y-6">
      {/* Top Autonomous AI Command Strip + Permanent Mood Autopilot + Country-Relative Crowd Calibration */}
      <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold font-display text-slate-100">
                במאי AI קצה-יכולת + טייס אוטומטי קבוע מכויל-מדינה (24/7)
              </h1>
              <span className="text-xs text-emerald-300 font-semibold">
                {battleState.aiAutopilot ? 'טייס אוטומטי קבוע: פעיל 24/7' : 'טייס אוטומטי: מושהה ידנית'} ·{' '}
                {wsConnected ? 'סנכרון חי' : 'מתחבר...'}
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-[76ch]">
              מנהל אוטונומית אפקטי גרין-סקרין, מצלמה קינטית, אווטארים של תומכים, שובר-ענן יריב והפעלות שמכוילות יחסית לגודל הקהל במדינה שלך.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="inline-flex rounded-lg border border-[#283246] bg-[#0B0E14] p-1">
              <button
                onClick={() => controlBattle({ action: 'set_stream_mode', streamMode: 'BATTLE' })}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  battleState.streamMode === 'BATTLE'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                קרב (4 דק׳)
              </button>
              <button
                onClick={() => controlBattle({ action: 'set_stream_mode', streamMode: 'SOLO' })}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  battleState.streamMode === 'SOLO'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                שידור לבד (סולו)
              </button>
            </div>

            <button
              onClick={() => controlBattle({ action: 'toggle_ai_autopilot' })}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                battleState.aiAutopilot
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-[#0B0E14] border-[#283246] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {battleState.aiAutopilot ? 'טייס AI קבוע: דולק' : 'הפעל טייס AI קבוע'}
            </button>

            <button
              onClick={() => {
                soundEngine.ensureInitialized();
                setMicListening((v) => !v);
              }}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                micListening
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-[#0B0E14] border-[#283246] text-slate-200 hover:border-slate-500'
              }`}
            >
              {micListening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              {micListening ? 'מאזין למיקרופון' : 'האזנה למיקרופון'}
            </button>
          </div>
        </div>

        {/* COUNTRY-RELATIVE CROWD & TRIGGER CALIBRATION BAR */}
        <div className="bg-[#0B0E14] border border-sky-500/35 rounded-xl p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Globe className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="font-bold text-slate-100">
                כיול כמות צופים והפעלות יחסי למדינה:
              </span>
              <span className="text-sky-300 font-semibold">{calib?.labelHe}</span>
              <span className="text-[11px] font-mono tabular-nums text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5">
                רגישות x{calib?.dynamicSensitivityMult}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {calib?.noteHe} — גם כשלומדים מלייב במצרים/ברזיל עם אלפי צופים, הטריגרים מתורגמים אוטומטית לגודל הקהל במדינה שלך!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {BROADCAST_COUNTRY_CALIBRATIONS.map((c) => {
              const selected = battleState.broadcastCountryCode === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  title={c.shortDescHe}
                  onClick={() =>
                    controlBattle({ action: 'set_broadcast_country', countryCode: c.code })
                  }
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold'
                      : 'bg-[#121722] border-[#253047] text-slate-300 hover:border-sky-500/50'
                  }`}
                >
                  {c.code === 'IL'
                    ? 'ישראל (IL)'
                    : c.code === 'AE'
                      ? 'מפרץ (AE)'
                      : c.code === 'EU_UK'
                        ? 'אירופה (EU)'
                        : c.code === 'US'
                          ? 'ארה״ב (US)'
                          : c.code === 'TR'
                            ? 'טורקיה (TR)'
                            : c.code === 'EG_MENA'
                              ? 'מצרים/ערב (EG)'
                              : c.code === 'BR_LATAM'
                                ? 'ברזיל (BR)'
                                : 'אוטומטי חי'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mood Profile Selector Bar */}
        <div className="pt-2 border-t border-[#1E2636] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {AI_MOOD_PROFILES.map((profile) => {
            const active = battleState.aiMoodProfile === profile.id;
            return (
              <button
                key={profile.id}
                onClick={() =>
                  controlBattle({ action: 'set_ai_mood_profile', aiMoodProfile: profile.id })
                }
                className={`text-right rounded-lg p-3 border transition-colors ${
                  active
                    ? 'bg-amber-500/15 border-amber-500 text-slate-100'
                    : 'bg-[#0B0E14] border-[#243044] text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{profile.labelHe}</span>
                  {active && <span className="text-[11px] font-semibold text-amber-400">פעיל</span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{profile.shortDescHe}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* LEARNING TRANSPARENCY, RATE, DISCOVERED TOOLS & LEARNING VAULT CONSOLE */}
      <section className="bg-[#121722] border border-amber-500/35 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <Brain className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-bold font-display text-slate-100">
                קצב למידה חי: מה ה-AI למד, מה הסיק, אילו כלים חדשים פיתח והפעלה על הבמה
              </h2>
              <span className="text-xs text-emerald-300 font-mono tabular-nums">
                {battleState.tiktokRoom.monitoredRooms.length} חדרים בהאזנה ·{' '}
                {discoveredTools.length} כלים שה-AI פיתח ·{' '}
                {vaultItems.length} קבצים בתיקיית הלמידה
              </span>
            </div>
            <p className="text-xs text-slate-400">
              בכל שידור או קובץ שה-AI קולט, הוא מפרק מה עבד, מסיק מסקנה מותאמת לכמות הצופים במדינה שלך, מפתח כלי חדש אם חסר — ומאפשר לך להפעיל הכל בלחיצה!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowWsSnifferInline((v) => !v)}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                showWsSnifferInline
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                  : 'bg-cyan-500/15 border-cyan-500/45 text-cyan-200 hover:bg-cyan-500/25'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>
                קולט WebSocket ושיבוץ הפעלות ({battleState.wsSniffer?.uniqueEventTypesCount || 0})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowChatCompanionInline((v) => !v)}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                showChatCompanionInline
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-amber-500/15 border-amber-500/45 text-amber-200 hover:bg-amber-500/25'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>
                מנחים מלווים וסינון צ׳אט ({battleState.chatCompanion?.accounts.length || 0})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowVaultInline((v) => !v)}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                showVaultInline
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                  : 'bg-emerald-500/15 border-emerald-500/45 text-emerald-200 hover:bg-emerald-500/25'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>תיקיית למידה והעלאת חומרים ({vaultItems.length})</span>
            </button>
            <button
              type="button"
              onClick={handleQuickScanGlobalLive}
              disabled={quickGlobalScanning}
              className="px-3 py-2 rounded-lg bg-sky-500/15 border border-sky-500/45 hover:bg-sky-500/25 text-xs font-semibold text-sky-200 transition-colors whitespace-nowrap"
            >
              {quickGlobalScanning ? 'סורק TikLeap ולייבים...' : 'סרוק TikLeap גלובלי'}
            </button>
            <button
              type="button"
              onClick={onOpenTikTokTab}
              className="px-3 py-2 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-amber-500/60 text-xs font-semibold text-slate-200 transition-colors whitespace-nowrap"
            >
              מעבדת למידה מלאה ({learnedCreators.length} יוצרים)
            </button>
          </div>
        </div>

        {/* Learning Rate & Maturity Progress Bar */}
        <div className="bg-[#0B0E14] border border-[#1E2636] rounded-lg p-3 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-200">
              מד קצב ובשלות למידה מתמשכת ({battleState.memorySummary.totalRoundsAnalyzed} סשנים פורקו ·{' '}
              {battleState.memorySummary.energyRules.filter((r) => r.active).length} חוקים פעילים ·{' '}
              {discoveredTools.filter((t) => t.autoEnabled).length} כלים אוטונומיים דולקים)
            </span>
            <span className="font-mono tabular-nums font-bold text-amber-400">
              {learningMaturityPct}% בשלות מוח AI
            </span>
          </div>
          <div className="h-2 bg-[#141B29] rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-l from-emerald-400 via-amber-400 to-sky-400 transition-all duration-300 ${pctToTailwindWidth(
                learningMaturityPct
              )}`}
            />
          </div>
        </div>

        {/* Feed Live URL / @handle Form */}
        <form onSubmit={handleQuickFeedLiveStreams} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={quickFeedInput}
            onChange={(e) => setQuickFeedInput(e.target.value)}
            placeholder="הדבק לינק ללייב (https://www.tiktok.com/@.../live) או @username (אפשר כמה מופרדים בפסיק)..."
            className="flex-1 bg-[#0B0E14] border border-[#283246] focus:border-amber-500 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
          />
          <button
            type="submit"
            disabled={quickFeeding}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
          >
            {quickFeeding ? 'מתחבר, מפרק ומסיק...' : 'הזן לייב ל-AI ולמד עכשיו'}
          </button>
        </form>

        {quickFeedBannerHe && (
          <div className="bg-[#0B0E14] border border-amber-500/30 rounded-lg px-3.5 py-2 text-xs text-amber-200">
            {quickFeedBannerHe}
          </div>
        )}

        {/* Inline Live WebSocket Sniffer & Custom Auto-Trigger Router */}
        {showWsSnifferInline && (
          <WsEventSnifferPanel battleState={battleState} refreshState={refreshState} compact />
        )}

        {/* Inline Live Chat Companion Crew & Moderation Shield */}
        {showChatCompanionInline && (
          <ChatCompanionCrewPanel
            battleState={battleState}
            refreshState={refreshState}
            sendTikTokEvent={sendTikTokEvent}
          />
        )}

        {/* Inline Expandable Learning Vault Folder */}
        {showVaultInline && (
          <LearningVaultPanel items={vaultItems} refreshState={refreshState} compact />
        )}

        {/* Two-Column Inspector: (1) What AI Learned & Concluded from Streams + 1-Click Stage Fire, (2) Autonomous Tools AI Invented */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
          {/* Column 1 (7 cols): Learned Stream Inspector ("מה למד -> מה הסיק -> הפעל על הלייב") */}
          <div className="lg:col-span-7 bg-[#0B0E14] border border-[#1E2636] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-200">
                מפקח למידת שידורים: בחר לייב שנלמד כדי לראות מה ה-AI למד, מה הסיק ולהפעיל בבמה
              </span>
              <div className="flex flex-wrap gap-1.5">
                {learnedCreators.slice(0, 6).map((c) => {
                  const isSel = activeLearnedProfile?.username === c.username;
                  return (
                    <button
                      key={c.username}
                      type="button"
                      onClick={() => setSelectedLearnedUser(c.username)}
                      className={`px-2 py-1 rounded text-[11px] font-mono transition-colors border ${
                        isSel
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                          : 'bg-[#121722] border-[#253047] text-slate-300 hover:text-white'
                      }`}
                    >
                      @{c.username}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeLearnedProfile && (
              <div className="bg-[#121722] border border-[#1E2636] rounded-lg p-3.5 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2636] pb-2">
                  <div>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      @{activeLearnedProfile.username}
                    </span>
                    <span className="text-slate-400 mr-2">
                      ({activeLearnedProfile.region} · עוצמה {activeLearnedProfile.strengthScore}/100)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={executingPlaybookId === activeLearnedProfile.username}
                      onClick={() =>
                        handleExecutePlaybookOnStage({ username: activeLearnedProfile.username })
                      }
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>הפעל מסקנה עכשיו בבמה!</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleMirrorCreatorRoom(activeLearnedProfile.username)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-emerald-500/50 text-emerald-300 font-semibold text-[11px] transition-colors"
                    >
                      שקף חדר חי לבמה
                    </button>
                    <button
                      type="button"
                      disabled={quickLearnHandle === activeLearnedProfile.username}
                      onClick={() => handleQuickSynthesizeCreator(activeLearnedProfile.username)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-sky-500/50 text-sky-300 font-semibold text-[11px] transition-colors"
                    >
                      {quickLearnHandle === activeLearnedProfile.username ? 'מנתח...' : 'רענן למידה'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="bg-[#0B0E14] border border-[#1E2636] rounded-lg p-2.5 space-y-1">
                    <div className="font-bold text-sky-300">מה ה-AI ראה ולמד בשידור שלו:</div>
                    <p className="text-slate-200 leading-relaxed">{activeLearnedProfile.battleStyleHe}</p>
                    <p className="text-[11px] text-slate-400">
                      סנייפ וכפפה: {activeLearnedProfile.snipeTendencyHe} · {activeLearnedProfile.gloveStrategyHe}
                    </p>
                  </div>

                  <div className="bg-[#0B0E14] border border-[#1E2636] rounded-lg p-2.5 space-y-1">
                    <div className="font-bold text-emerald-300">מה ה-AI הסיק ואיך הוא מפעיל אצלך:</div>
                    <p className="text-slate-200 leading-relaxed">{activeLearnedProfile.counterTacticHe}</p>
                    <div className="text-[11px] font-mono text-amber-300/90 pt-0.5">
                      קומבו במה: {activeLearnedProfile.recommendedVfxId || 'VID_02_CRYO_CO2_CANNONS'} +{' '}
                      {activeLearnedProfile.recommendedCamera || 'ZOOM_PUNCH'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Column 2 (5 cols): Autonomous Tools AI Invented from Listening to Broadcasts */}
          <div className="lg:col-span-5 bg-[#0B0E14] border border-[#1E2636] rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span>כלים חדשים שה-AI הסיק ופיתח מהשידורים ({discoveredTools.length})</span>
              </span>
              <span className="text-[11px] text-emerald-400 font-semibold">מתפתח כל הזמן</span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
              {discoveredTools.slice(0, 6).map((tool) => (
                <div
                  key={tool.id}
                  className="bg-[#121722] border border-[#1E2636] rounded-lg p-2.5 space-y-1.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-amber-300 truncate">{tool.nameHe}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[9px] border ${
                            tool.approved && tool.status === 'APPROVED'
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          {tool.approved && tool.status === 'APPROVED'
                            ? `APPROVED v${tool.version || 1}`
                            : 'PROPOSED'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{tool.sourceLabelHe}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!tool.approved && approveProposal && (
                        <button
                          type="button"
                          onClick={() => approveProposal('tool', tool.id, 'APPROVE')}
                          className="px-2 py-1 rounded bg-emerald-500 text-slate-950 font-bold text-[11px] hover:bg-emerald-400 transition-colors"
                        >
                          אשר כלי
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={executingPlaybookId === tool.id || !tool.approved}
                        title={!tool.approved ? 'יש לאשר הצעה לפני הפעלה' : undefined}
                        onClick={() => handleExecutePlaybookOnStage({ toolId: tool.id })}
                        className="px-2 py-1 rounded bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-[11px] hover:bg-amber-400 transition-colors"
                      >
                        הפעל
                      </button>
                      <button
                        type="button"
                        disabled={!tool.approved}
                        onClick={() =>
                          controlBattle({ action: 'toggle_discovered_tool', toolId: tool.id })
                        }
                        className={`px-2 py-1 rounded text-[11px] font-semibold border disabled:opacity-40 ${
                          tool.autoEnabled && tool.approved
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-[#0B0E14] border-[#283246] text-slate-500'
                        }`}
                      >
                        {tool.autoEnabled && tool.approved ? 'אוטו׳' : 'כבוי'}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    <span className="text-slate-400">למה נדרש: </span>
                    {tool.whyNeededHe}
                  </p>
                  <p className="text-[11px] text-emerald-300/90 leading-snug">
                    <span className="text-slate-400">פעולה: </span>
                    {tool.howItWorksHe}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {micError && (
        <div className="bg-[#121722] border border-amber-500/40 rounded-lg px-4 py-2.5 text-xs text-amber-300">
          {micError}
        </div>
      )}

      {/* Live Telemetry Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>מתח דרמטי (Tension)</span>
            <span className="font-mono tabular-nums font-bold text-slate-100">
              {battleState.aiTensionScore}%
            </span>
          </div>
          <div className="h-2 bg-[#0B0E14] rounded-full overflow-hidden">
            <div
              className={`h-full bg-rose-500 transition-all duration-300 ${pctToTailwindWidth(
                battleState.aiTensionScore
              )}`}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            {battleState.aiTensionScore >= 75
              ? 'מתח שיא: סנייפים / כפפה / קרב צמוד'
              : battleState.aiTensionScore >= 40
                ? 'דריכות תחרותית מבוקרת'
                : 'אווירה פתוחה לשיחה'}
          </p>
        </div>

        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>קומבו מכויל ({calib?.code})</span>
            <span className="font-mono tabular-nums font-bold text-amber-300">
              x{battleState.likeComboCount} (שיא כל x{calib?.effectiveComboStep})
            </span>
          </div>
          <div className="h-2 bg-[#0B0E14] rounded-full overflow-hidden">
            <div
              className={`h-full bg-amber-500 transition-all duration-200 ${pctToTailwindWidth(
                Math.min(100, battleState.likeComboCount)
              )}`}
            />
          </div>
          <p className="text-[11px] text-slate-500 tabular-nums">
            קצב: {battleState.likesPerSecond}/שנ׳ · כניסה כל {calib?.effectiveJoinTrigger} צופים
          </p>
        </div>

        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>קול מגיש ו-Sidechain Ducking</span>
            <span className="font-mono tabular-nums font-bold text-slate-100">
              {micListening ? `${voiceRmsPct}%` : 'כבוי'}
            </span>
          </div>
          <div className="h-2 bg-[#0B0E14] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                isSpeaking ? 'bg-emerald-400' : 'bg-slate-600'
              } ${pctToTailwindWidth(micListening ? voiceRmsPct : 0)}`}
            />
          </div>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {!micListening
              ? 'הפעל מיקרופון להנמכת מוזיקה בדיבור'
              : isSpeaking
                ? 'מזהה דיבור — המוזיקה מונמכת אוטומטית!'
                : `שקט רציף: ${deadAirSec} שנ׳ · מוזיקה ${musicEnergy}%`}
          </p>
        </div>

        <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>מוזיקה פעילה ({battleState.memorySummary.energyRules.length} חוקי AI)</span>
            <button
              onClick={handleToggleMusicPlay}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                musicPlaying
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-[#1A2233] text-slate-200 hover:bg-[#232E44]'
              }`}
            >
              {musicPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {musicPlaying ? 'מתנגן' : 'נגן'}
            </button>
          </div>
          <div className="text-sm font-semibold text-slate-100 truncate mt-1">
            {activeTrackObj?.titleHe || battleState.activeMusicTrackId}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            {activeTrackObj?.bpm || 120} BPM · עוצמה {battleState.musicVolumePct}%
          </div>
        </div>
      </section>

      {/* Main 12-Column Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Right Column (5 cols): 9:16 Stage + Anti-Cloud X-Ray & Supporter Avatars + Camera Rig + Scoreboard */}
        <div className="lg:col-span-5 space-y-5">
          {/* Live 9:16 Monitor */}
          <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-sm font-semibold text-slate-200 block">
                  מוניטור 9:16 חי (כולל אווטארים ושובר-ענן חי ב-OBS!)
                </span>
                <span className="text-[11px] text-slate-400">
                  פודיום תומכים למעלה + זרקורי משתתפים בשוליים בלי להסתיר פנים
                </span>
              </div>
              <button
                onClick={() => setUseWebcam((v) => !v)}
                className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors shrink-0 ${
                  useWebcam
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-semibold'
                    : 'border-[#283246] text-slate-300 hover:text-white'
                }`}
              >
                {useWebcam ? 'מצלמה + מחוות: פעיל' : 'הפעל מצלמה ומחוות'}
              </button>
            </div>

            <BroadcastStage9x16
              battleState={battleState}
              useLiveWebcam={useWebcam}
              onPerfSample={onPerfSample}
              onStageTap={() => sendTikTokEvent({ type: 'like', count: 5, user: 'טאפ מסך' })}
              onGestureDetected={(gesture) => sendTikTokEvent({ type: 'gesture', gesture })}
            />

            {/* Layer 7: Client Photo -> AI Video Studio Control (Only overlays stage when READY) */}
            <div className="pt-3 border-t border-[#1E2636] space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-200">
                  שכבה 7: וידאו AI מתמונת לקוח (מוצג רק כשהסרטון READY)
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                    battleState.aiClientVideo?.status === 'READY'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : battleState.aiClientVideo?.status === 'GENERATING'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : battleState.aiClientVideo?.status === 'FAILED'
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                          : 'bg-[#0B0E14] border-[#283246] text-slate-400'
                  }`}
                >
                  {battleState.aiClientVideo?.status || 'IDLE'}
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={clientVideoPrompt}
                  onChange={(e) => setClientVideoPrompt(e.target.value)}
                  placeholder="תיאור תנועה/אווירה לסרטון הלקוח (9:16)..."
                  className="flex-1 bg-[#0B0E14] border border-[#283246] rounded px-2.5 py-1.5 text-[11px] text-slate-100"
                />
                <input
                  ref={clientPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file || !generateAiClientVideo) return;
                    setGeneratingClientVid(true);
                    setClientVideoErrorHe(null);
                    const reader = new FileReader();
                    reader.onload = async () => {
                      try {
                        const res = await generateAiClientVideo({
                          imageBase64: String(reader.result || ''),
                          mimeType: file.type || 'image/jpeg',
                          promptHe: clientVideoPrompt,
                        });
                        if (!res?.ok && res?.errorHe) {
                          setClientVideoErrorHe(res.errorHe);
                        }
                      } finally {
                        setGeneratingClientVid(false);
                      }
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={generatingClientVid || !generateAiClientVideo}
                  onClick={() => clientPhotoInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-500/40 text-fuchsia-200 text-[11px] font-semibold shrink-0 disabled:opacity-50"
                >
                  {generatingClientVid ? 'מייצר וידאו...' : 'העלה תמונת לקוח'}
                </button>
                {battleState.aiClientVideo?.status === 'READY' && clearAiClientVideo && (
                  <button
                    type="button"
                    onClick={() => clearAiClientVideo()}
                    className="px-2 py-1.5 rounded bg-[#0B0E14] border border-[#283246] text-slate-300 text-[11px]"
                  >
                    הסר
                  </button>
                )}
              </div>
              {(clientVideoErrorHe || battleState.aiClientVideo?.errorHe) && (
                <div className="text-[11px] text-rose-300">
                  {clientVideoErrorHe || battleState.aiClientVideo?.errorHe}
                </div>
              )}
            </div>
          </div>

          {/* OPPONENT ANTI-CLOUD SCORE X-RAY + SUPPORTER AVATARS STAGE DECK */}
          <div className="bg-[#121722] border border-cyan-500/40 rounded-xl p-4 space-y-4">
            {/* Part A: Opponent Smoke/Cloud Detector & Cross-Room Score X-Ray */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400 shrink-0" />
                  <h2 className="text-sm font-bold text-slate-100">
                    מכ״ם זיהוי "ענן" יריב + חשיפת הסקור שלי דרך החדר שלו
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => controlBattle({ action: 'toggle_cloud_auto_detect' })}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                    battleState.cloudRadar?.autoDetectEnabled
                      ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300'
                      : 'bg-[#0B0E14] border-[#283246] text-slate-500'
                  }`}
                >
                  {battleState.cloudRadar?.autoDetectEnabled ? 'זיהוי ענן אוטו׳: פעיל' : 'זיהוי אוטו׳: כבוי'}
                </button>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                מזהה אוטומטית פתיחת כרטיס עשן/ענן (`useSmokeCard` / ערפול ניקוד) ע״י היריב, מתחבר בשקט לחדר של היריב ושואב משם את הסקור האמיתי שלך ישירות לבמה!
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={opponentHandleInput}
                  onChange={(e) => setOpponentHandleInput(e.target.value)}
                  placeholder="@username של היריב בקרב (נשמר גם אוטומטית בבאטל חי)..."
                  className="flex-1 bg-[#0B0E14] border border-[#283246] focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    controlBattle({
                      action: 'set_opponent_username',
                      opponentUsername: opponentHandleInput,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#1A2436] hover:bg-[#24324B] border border-[#2E3E5C] text-xs font-semibold text-cyan-200 shrink-0 transition-colors"
                >
                  נעל חדר יריב
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.ensureInitialized();
                    controlBattle({
                      action: 'trigger_cloud_xray',
                      opponentUsername: opponentHandleInput || undefined,
                      durationSec: 25,
                    });
                  }}
                  className="px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>הפעל טריגר ענן יריב (25s)</span>
                </button>

                <button
                  type="button"
                  disabled={!battleState.cloudRadar?.active}
                  onClick={() => controlBattle({ action: 'clear_cloud_xray' })}
                  className="px-3 py-2 rounded-lg bg-[#0B0E14] border border-[#283246] disabled:opacity-40 hover:border-slate-500 text-xs font-semibold text-slate-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <CloudOff className="w-3.5 h-3.5" />
                  <span>כבה באנר שובר-ענן</span>
                </button>
              </div>

              {battleState.cloudRadar?.active && (
                <div className="bg-[#08121E] border border-cyan-400/50 rounded-lg p-2.5 text-xs flex items-center justify-between tabular-nums">
                  <span className="text-cyan-300 font-semibold">
                    שובר-ענן פעיל ({Math.ceil(battleState.cloudRadar.remainingSec)}s):
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    שלי: {battleState.cloudRadar.myTrueScore.toLocaleString()} | יריב:{' '}
                    {battleState.cloudRadar.opponentTrueScore.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Part B: Broadcast-Grade Supporter & Participant Avatars */}
            <div className="pt-3 border-t border-[#1E2636] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                  <h3 className="text-xs font-bold text-slate-100">
                    אווטארים של תומכים ומשתתפים על הבמה ({battleState.topSupporters?.length || 0})
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => controlBattle({ action: 'spawn_demo_supporters' })}
                    className="px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-[11px] font-semibold transition-colors"
                  >
                    + הדגם תומכים בבמה
                  </button>
                  <button
                    type="button"
                    onClick={() => controlBattle({ action: 'toggle_avatars_overlay' })}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                      battleState.avatarsOverlayEnabled
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-[#0B0E14] border-[#283246] text-slate-500'
                    }`}
                  >
                    {battleState.avatarsOverlayEnabled ? 'אווטארים: דולק' : 'אווטארים: כבוי'}
                  </button>
                </div>
              </div>

              {battleState.topSupporters && battleState.topSupporters.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {battleState.topSupporters.slice(0, 6).map((sup, i) => (
                    <div
                      key={sup.userId || sup.username}
                      className="flex items-center gap-1.5 bg-[#0B0E14] border border-[#243047] rounded-full px-2.5 py-1 shrink-0"
                    >
                      <img
                        src={sup.avatarUrl}
                        alt={sup.displayName}
                        referrerPolicy="no-referrer"
                        className={`w-6 h-6 rounded-full object-cover ${
                          i === 0 ? 'ring-2 ring-amber-400' : 'ring-1 ring-sky-400/70'
                        }`}
                      />
                      <span className="text-[11px] font-semibold text-slate-200 max-w-[85px] truncate">
                        {sup.displayName}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-amber-300 font-bold">
                        {sup.points.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* AI Virtual Camera Rig, Screen Shakes, Gestures & Finger-Tap Dopamine Deck */}
          <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  שליטת מצלמה, תזוזות מסך, מחוות וגירוי לאצבע
                </h2>
              </div>
              <div className="inline-flex rounded-md border border-[#283246] bg-[#0B0E14] p-0.5 text-[11px]">
                {(
                  [
                    { id: 'AI_DYNAMIC', label: 'AI דינמי' },
                    { id: 'HYPER_KINETIC', label: 'היפר' },
                    { id: 'LOCKED', label: 'יציב' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => controlBattle({ action: 'set_camera_mode', cameraMode: m.id })}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      battleState.cameraMode === m.id
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  sendTikTokEvent({
                    type: 'tap_stimulus',
                    calloutHe: 'DOUBLE TAP NOW!',
                  })
                }
                className="px-3 py-2.5 rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 text-xs font-bold transition-colors"
              >
                הפעל גירוי לאצבע (Tap-Tap Boost)
              </button>
              <button
                onClick={() =>
                  sendTikTokEvent({
                    type: 'like',
                    count: calib?.effectiveComboStep || 25,
                    user: 'רצף מהיר',
                  })
                }
                className="px-3 py-2.5 rounded-lg bg-[#1A2233] border border-[#2A3650] text-amber-300 hover:bg-[#222D42] text-xs font-semibold transition-colors"
              >
                הזרק מדרגת קומבו (+{calib?.effectiveComboStep || 25})
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-slate-400">תזוזות מסך ובימוי מצלמה (פעיל גם ב-OBS):</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'ZOOM_PUNCH', label: 'זום-פאנץ׳' },
                    { id: 'EARTHQUAKE_SHAKE', label: 'רעידת הדף' },
                    { id: 'BASS_PUMP', label: 'פעימת בס' },
                    { id: 'DUTCH_WHIP', label: 'הטיית מהפך' },
                    { id: 'SNIPE_CREEP', label: 'זחילת סנייפ' },
                    { id: 'VACUUM_DROP', label: 'וואקום מתח' },
                  ] as const
                ).map((cam) => (
                  <button
                    key={cam.id}
                    onClick={() => sendTikTokEvent({ type: 'camera_move', cameraPreset: cam.id })}
                    className="px-2.5 py-2 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-amber-500/60 text-xs text-slate-200 transition-colors"
                  >
                    {cam.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-[#1E2636]">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Hand className="w-3.5 h-3.5 text-amber-400" />
                  מחוות מגיש (מזוהות במצלמה או בלחיצה):
                </span>
                {battleState.lastGesture && (
                  <span className="text-emerald-300 truncate max-w-[140px]">
                    {battleState.lastGesture.labelHe}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => sendTikTokEvent({ type: 'gesture', gesture: 'HANDS_UP_HYPE' })}
                  className="px-2 py-1.5 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-emerald-500/50 text-[11px] text-slate-200 transition-colors"
                >
                  ידיים למעלה (הייפ)
                </button>
                <button
                  onClick={() => sendTikTokEvent({ type: 'gesture', gesture: 'TAP_CALLOUT_WAVE' })}
                  className="px-2 py-1.5 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-emerald-500/50 text-[11px] text-slate-200 transition-colors"
                >
                  תנועת דאבל-טאפ
                </button>
                <button
                  onClick={() => sendTikTokEvent({ type: 'gesture', gesture: 'LEAN_IN_CLOSE' })}
                  className="px-2 py-1.5 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-emerald-500/50 text-[11px] text-slate-200 transition-colors"
                >
                  קריבה לעדשה (מתח)
                </button>
              </div>
            </div>
          </div>

          {/* Scoreboard, Gloves, Snipes & Live Chat with Participant Avatars */}
          <div className="bg-[#121722] border border-[#1E2636] rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">
                {battleState.streamMode === 'BATTLE'
                  ? 'לוח קרב, כפפות (x5) וסנייפים'
                  : 'מצבי אווירה וקהל בשידור סולו'}
              </h2>
              {battleState.streamMode === 'BATTLE' && (
                <button
                  onClick={() => controlBattle({ action: 'reset_scores' })}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  אפס ניקוד
                </button>
              )}
            </div>

            {battleState.streamMode === 'BATTLE' ? (
              <>
                <div className="grid grid-cols-3 gap-2 items-center bg-[#0B0E14] border border-[#1E2636] rounded-lg p-3 text-center">
                  <div>
                    <div className="text-[11px] text-slate-400">הניקוד שלנו</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-amber-400">
                      {battleState.myScore.toLocaleString()}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-500">הפרש חי</div>
                    <div
                      className={`text-xs font-mono tabular-nums font-bold ${
                        scoreDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {scoreDiff >= 0 ? `+${scoreDiff.toLocaleString()}` : scoreDiff.toLocaleString()}
                    </div>
                    {battleState.gloveRemainingSec > 0 && (
                      <div className="text-[11px] font-mono tabular-nums text-amber-300 font-semibold">
                        כפפה x5: {Math.ceil(battleState.gloveRemainingSec)}s
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">ניקוד יריב</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-rose-400">
                      {battleState.opponentScore.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => sendTikTokEvent({ type: 'glove', user: 'מגיש / קהל' })}
                    className="px-3 py-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    כפפה x5 (30 שנ׳)
                  </button>

                  <button
                    onClick={() => controlBattle({ action: 'seek', timeSec: 206 })}
                    className="px-3 py-2.5 rounded-lg bg-[#1A2233] border border-[#2A3650] text-slate-200 hover:bg-[#222D42] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Radio className="w-3.5 h-3.5 text-amber-400" />
                    חלון סנייפ (03:26)
                  </button>

                  <button
                    onClick={() =>
                      sendTikTokEvent({
                        type: 'snipe_us',
                        points: Math.max(400, calib?.effectiveWhaleGiftThreshold || 500),
                        user: 'תומך ראשי',
                      })
                    }
                    className="px-3 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    מתנת-על / סנייפ (+{(calib?.effectiveWhaleGiftThreshold || 500).toLocaleString()})
                  </button>

                  <button
                    onClick={() => sendTikTokEvent({ type: 'snipe_opponent', points: 2600, user: 'יריב' })}
                    className="px-3 py-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    איום סנייפ יריב! (+2,600)
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    triggerAiEvaluation(
                      'אני משדר לבד ויש שקט של 8 שניות — תרים בעדינות את האווירה והמצלמה.',
                      8.5
                    )
                  }
                  className="px-3 py-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold transition-colors"
                >
                  דמה שקט בסולו
                </button>
                <button
                  onClick={() =>
                    triggerAiEvaluation('המגיש והצ׳אט מתלהבים בשידור הסולו! תן זום-פאנץ׳, עידוד קהל וניצוצות זהב.')
                  }
                  className="px-3 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-xs font-semibold transition-colors"
                >
                  רגע שיא והתלהבות בסולו!
                </button>
              </div>
            )}

            <form onSubmit={handleSendChat} className="pt-2 border-t border-[#1E2636] space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  צ׳אט חי משולב אווטארים של משתתפים
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatUser}
                  onChange={(e) => setChatUser(e.target.value)}
                  placeholder="שם צופה"
                  className="w-24 bg-[#0B0E14] border border-[#283246] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="למשל: פתחו ענן תיזהר! / כולם דאבל טאפ..."
                  className="flex-1 bg-[#0B0E14] border border-[#283246] rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#1E2636] hover:bg-[#2A354B] text-slate-100 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  שלח
                </button>
              </div>
              {battleState.recentChatMessages.length > 0 && (
                <div className="space-y-1.5 pt-1 max-h-28 overflow-y-auto text-xs">
                  {battleState.recentChatMessages.slice(0, 6).map((m, idx) => (
                    <div key={`${m.ts}_${idx}`} className="flex items-center gap-2 text-slate-300 truncate">
                      {m.avatarUrl && (
                        <img
                          src={m.avatarUrl}
                          alt={m.user}
                          referrerPolicy="no-referrer"
                          className="w-5 h-5 rounded-full object-cover ring-1 ring-amber-400/50 shrink-0"
                        />
                      )}
                      <span className="font-semibold text-amber-200 shrink-0">{m.user}:</span>
                      <span className="truncate text-slate-300">{m.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Left Column (7 cols): AI Brain + Music Playlist Deck + Full Sound & VFX Rack */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. AI Showrunner Brain */}
          <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold font-display text-slate-100">
                  מוח הבמאי ומועצת ההחלטות (OpenAI + Claude | Gemini איסוף וביצוע)
                </h2>
                <p className="text-xs text-slate-400">
                  OpenAI + Claude מחליטים על אפקטים, שכבות, יעד ותזמון · Gemini אוסף ומבצע תוכנית מאושרת בלבד ({calib?.code})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={aiThinking}
                  onClick={() =>
                    triggerAiEvaluation(
                      'נתח את המצב בלייב כרגע, הפעל שילוב מדויק של מצלמה/אפקט/סאונד, ואם חסר כלי במה חדש — הצע והוסף אותו לארגז הכלים.'
                    )
                  }
                  className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap"
                >
                  {aiThinking ? 'מנתח ומפעיל...' : 'נתח והפעל החלטת AI עכשיו'}
                </button>
              </div>
            </div>

            <form onSubmit={handleSendDirectorNote} className="flex gap-2">
              <input
                type="text"
                value={directorInstruction}
                onChange={(e) => setDirectorInstruction(e.target.value)}
                placeholder="בקש מהבמאי בחופשיות (למשל: ׳צור לי כלי חדש לשבירת שקט בקהל ישראלי והפעל אותו!׳)..."
                className="flex-1 bg-[#0B0E14] border border-[#283246] rounded-lg px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={aiThinking}
                className="px-4 py-2 rounded-lg bg-[#1E2636] hover:bg-[#2A364F] text-xs font-semibold text-slate-100 transition-colors shrink-0"
              >
                הנחה במאי
              </button>
            </form>

            <div className="divide-y divide-[#1E2636] border-t border-[#1E2636] max-h-56 overflow-y-auto">
              {battleState.aiDecisions.slice(0, 6).map((dec) => (
                <div key={dec.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-100">{dec.detectedSituationHe}</span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0 mr-2">
                      מתח {dec.tensionScore}% · אנרגיה {dec.energyScore}%
                    </span>
                  </div>
                  <div className="text-xs text-amber-300/90">{dec.actionsTakenHe.join(' · ')}</div>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Dynamic Music Playlist Deck */}
          <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Music className="w-4 h-4 text-amber-400" />
                <div>
                  <h2 className="text-base font-bold font-display text-slate-100">
                    פלייליסט מוזיקה חכם (קרב + שידור סולו)
                  </h2>
                  <p className="text-xs text-slate-400">
                    ה-AI מחליף רצועות אוטומטית לפי מתח/שקט/כפפה/סולו, כולל הנמכה אוטומטית כשאתה מדבר
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMusicPlay}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    musicPlaying
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#1E2636] text-slate-100 hover:bg-[#2A364F]'
                  }`}
                >
                  {musicPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {musicPlaying ? 'עצור מוזיקה' : 'הפעל נגן מוזיקה'}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleUploadTrack}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-slate-500 text-xs text-slate-200 flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  העלה MP3/WAV
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[#1E2636]">
              <div className="flex items-center gap-2 text-xs">
                {(
                  [
                    { id: 'ALL', label: 'כל הרצועות' },
                    { id: 'SOLO', label: 'סולו (לבד)' },
                    { id: 'BATTLE', label: 'קרב 4 דק׳' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setMusicFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      musicFilter === tab.id
                        ? 'bg-[#1E2636] text-slate-100 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                <span>עוצמה:</span>
                <input
                  type="range"
                  min={10}
                  max={85}
                  value={battleState.musicVolumePct}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    musicDeck.setVolumePct(v);
                    controlBattle({ action: 'set_music_volume', volumePct: v });
                  }}
                  className="w-24 accent-amber-500"
                />
                <span className="font-mono tabular-nums w-9">{battleState.musicVolumePct}%</span>
              </div>
            </div>

            <div className="divide-y divide-[#1E2636] max-h-64 overflow-y-auto">
              {filteredTracks.map((track) => {
                const isSelected = battleState.activeMusicTrackId === track.id;
                return (
                  <div
                    key={track.id}
                    className={`py-2.5 px-2 flex items-center justify-between gap-3 transition-colors rounded-lg ${
                      isSelected ? 'bg-amber-500/[0.07]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold truncate ${
                            isSelected ? 'text-amber-300' : 'text-slate-100'
                          }`}
                        >
                          {track.titleHe}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                          {track.bpm} BPM · אנרגיה {track.energyLevel}/10
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {track.moodTagHe} — {track.whenAiPicksHe}
                      </p>
                    </div>

                    <button
                      onClick={() => handleSelectTrack(track.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                        isSelected && musicPlaying
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#0B0E14] border border-[#283246] text-slate-200 hover:border-amber-500/60'
                      }`}
                    >
                      {isSelected && musicPlaying ? 'מתנגן כעת' : 'נגן רצועה'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. Complete Sound Cues & Visual Effects Rack */}
          <section className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E2636] pb-3">
              <div>
                <h2 className="text-base font-bold font-display text-slate-100">
                  מחסנית קולות ואפקטים בשליטת ה-AI
                </h2>
                <p className="text-xs text-slate-400">
                  כולל סרטוני גרין-סקרין, חיות אנרגיה תלת-ממדיות, קול דופמין ללחיצה וצליל שיא קומבו
                </p>
              </div>

              <div className="inline-flex rounded-lg border border-[#283246] bg-[#0B0E14] p-1">
                <button
                  onClick={() => setRackTab('SOUNDS')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    rackTab === 'SOUNDS'
                      ? 'bg-[#1E2636] text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  קולות וסאונד ({STANDALONE_SOUND_CUES.length + 2})
                </button>
                <button
                  onClick={() => setRackTab('VFX')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    rackTab === 'VFX'
                      ? 'bg-[#1E2636] text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  אפקטים ויזואליים VFX ({BOOSTERA_ASSETS.length})
                </button>
              </div>
            </div>

            {rackTab === 'SOUNDS' ? (
              <div className="divide-y divide-[#1E2636] max-h-64 overflow-y-auto">
                {[
                  {
                    id: 'SND_TAP_DOPAMINE_PULSE',
                    titleHe: 'פעימת דופמין לאצבע (Tactile Thumb Thump)',
                    durationSec: 0.2,
                    whenAiTriggersHe: 'בכל הפעלת גירוי לחיצות (Tap-Tap Boost) או בלחיצה על מסך השידור.',
                  },
                  {
                    id: 'SND_COMBO_MILESTONE',
                    titleHe: `אקורד שיא רצף לייקים מכויל-מדינה (כל x${calib?.effectiveComboStep || 25})`,
                    durationSec: 0.6,
                    whenAiTriggersHe: 'אוטומטית בכל חציית מדרגת קומבו ביחס לגודל המדינה שלך.',
                  },
                  ...STANDALONE_SOUND_CUES,
                ].map((cue) => (
                  <div key={cue.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-sm font-semibold text-slate-100 truncate">
                        {cue.titleHe}{' '}
                        <span className="text-[11px] font-mono tabular-nums text-slate-500">
                          · {cue.durationSec}s
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{cue.whenAiTriggersHe}</p>
                    </div>
                    <button
                      onClick={() => {
                        soundEngine.ensureInitialized();
                        sendTikTokEvent({ type: 'sound_cue', soundId: cue.id });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-amber-500/60 text-xs font-semibold text-slate-200 shrink-0 transition-colors"
                    >
                      השמע קול
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-[#1E2636] max-h-72 overflow-y-auto">
                {prioritizedVfxAssets.map((fx) => {
                  const isRealVid = fx.id.startsWith('VID_');
                  const isBeast = fx.id.startsWith('BEAST_');
                  return (
                    <div key={fx.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-semibold text-slate-100 truncate flex items-center gap-2">
                          {(isRealVid || isBeast) && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                                isBeast
                                  ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              {isBeast ? 'חיית גרין-סקרין' : 'וידאו 9:16 חי'}
                            </span>
                          )}
                          <span className="truncate">
                            #{fx.order} {fx.titleHe}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                            · {fx.layer} · {fx.durationSec}s
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">טריגר: {fx.triggerLabelHe}</p>
                      </div>
                      <button
                        onClick={() => {
                          soundEngine.ensureInitialized();
                          sendTikTokEvent({ type: 'manual_vfx', effectId: fx.id, bypassCooldown: true });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#0B0E14] border border-[#283246] hover:border-amber-500/60 text-xs font-semibold text-slate-200 shrink-0 transition-colors"
                      >
                        שגר VFX + קול
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
