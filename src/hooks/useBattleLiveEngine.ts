import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AiDirectorDecision,
  AiMoodProfileId,
  BattleState,
  BroadcastCountryCode,
  CameraPresetId,
  PresenterGestureId,
  RoundPaletteId,
  StreamMode,
} from '../data/boosteraCatalog';
import { soundEngine } from '../engine/soundEngine';
import { musicDeck } from '../engine/musicDeckEngine';

const INITIAL_FALLBACK_STATE: BattleState = {
  streamMode: 'BATTLE',
  isRunning: true,
  elapsedSec: 0,
  roundNumber: 1,
  roundPalette: 'molten_gold',
  phase: 'IGNITION',
  likeEnergy: 22,
  likesPerSecond: 4,
  likeTier: 'SPARK',
  likeComboCount: 12,
  comboMultiplier: 1,
  tapStimulusActiveUntil: 0,
  tapCalloutTextHe: 'TAP-TAP BOOST',
  cameraMode: 'AI_DYNAMIC',
  activeCameraEvent: null,
  lastGesture: null,
  totalLikes: 0,
  totalShares: 0,
  totalFollowers: 0,
  totalViewersJoined: 0,
  goalsCompleted: 0,
  myScore: 1450,
  opponentScore: 1320,
  gloveRemainingSec: 0,
  snipeWindowActive: false,
  activeMusicTrackId: 'MUS_BATTLE_IGNITION_PULSE',
  musicVolumePct: 36,
  aiAutopilot: true,
  aiMoodProfile: 'AUTO_SMART',
  aiTensionScore: 32,
  aiEnergyScore: 40,
  approvalMode: 'AUTO_EXECUTE',
  geelarkDevices: [],
  geelarkRpaFlows: [],
  geelarkRpaReady: false,
  aiClientVideo: { status: 'IDLE', updatedAt: 0 },
  providerDiagnostics: null,
  recentChatMessages: [],
  aiDecisions: [],
  tiktokRoom: {
    connected: false,
    connecting: false,
    targetUsername: null,
    listenMode: 'OBSERVER_LEARN',
    roomId: null,
    viewerCount: 0,
    streamLikesCount: 0,
    chatMessagesCount: 0,
    activeOpponentUsername: null,
    liveBattleDetected: false,
    lastErrorHe: null,
    autoWatchRadarEnabled: true,
    autoDiscoverOpponents: true,
    lastRadarScanTs: 0,
    monitoredRooms: [],
    swarmRecentFeed: [],
    lastSwarmSynthesisHe: null,
    oauthConnectedUser: null,
    oauthConfigured: false,
  },
  memorySummary: {
    totalRoundsAnalyzed: 12,
    watchedCreators: [],
    learnedCreators: [],
    energyRules: [],
    discoveredTools: [],
    learningVaultItems: [],
    cueStats: [],
  },
  broadcastCountryCode: 'IL',
  countryCalibration: {
    code: 'IL',
    labelHe: 'ישראל (IL · קהל ממוקד)',
    referenceStrongViewers: 75,
    currentLiveViewers: 0,
    relativeCrowdPct: 100,
    dynamicSensitivityMult: 2.35,
    effectiveJoinTrigger: 2,
    effectiveComboStep: 25,
    effectiveShareStreak: 2,
    effectiveWhaleGiftThreshold: 299,
    noteHe: 'מכויל לישראל: הפעלות מותאמות יחסית לגודל קהל מקומי (כל 2 מצטרפים, קומבו x25, מתנות מ-299 נק׳).',
  },
  avatarsOverlayEnabled: true,
  topSupporters: [],
  avatarSpotlights: [],
  cloudRadar: {
    autoDetectEnabled: true,
    active: false,
    expiresAt: 0,
    remainingSec: 0,
    opponentUsername: null,
    opponentRoomConnected: false,
    detectedReasonHe: null,
    myTrueScore: 1450,
    opponentTrueScore: 1320,
    scoreDiff: 130,
    triggeredCount: 0,
  },
  wsSniffer: {
    snifferActive: true,
    autoExecuteBoundTriggers: true,
    globalScopeOverride: 'ALL_CONNECTED_SOCKETS',
    totalPacketsCaptured: 0,
    uniqueEventTypesCount: 0,
    activeTikTokSocketsCount: 0,
    externalBridges: [],
    discoveredEvents: [],
    recentPackets: [],
  },
  chatCompanion: {
    autoCompanionEnabled: true,
    autoModerationShieldEnabled: true,
    autoLearnFromLiveChat: true,
    chatVelocityPerMin: 0,
    detectedRoomMoodHe: 'מאזין לצ׳אט חי ולמנחים מלווים...',
    accounts: [],
    learnedPatterns: [],
    moderationFlags: [],
    recentDispatches: [],
  },
  crowdTestActive: false,
  connectedClients: 1,
  activeEffects: [],
  recentLogs: [],
};

export function useBattleLiveEngine(enableAudio = true) {
  const [battleState, setBattleState] = useState<BattleState>(INITIAL_FALLBACK_STATE);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const localBridgesRef = useRef<Map<string, WebSocket>>(new Map());
  const playedSoundIdsRef = useRef<Set<string>>(new Set());

  const refreshState = useCallback(async () => {
    try {
      const r = await fetch('/api/state');
      if (r.ok) {
        const data = await r.json();
        setBattleState(data);
      }
    } catch {
      // Ignore network hiccup
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    fetch('/api/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !cancelled) setBattleState(data);
      })
      .catch(() => {});

    function connect() {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.state) {
            const next: BattleState = msg.state;
            setBattleState(next);

            if (enableAudio) {
              const phaseIntensity =
                next.streamMode === 'SOLO'
                  ? 0.2
                  : next.phase === 'IGNITION'
                    ? 0.25
                    : next.phase === 'MOMENTUM'
                      ? 0.45
                      : next.phase === 'PRESSURE'
                        ? 0.7
                        : next.phase === 'TENSION'
                          ? 0.85
                          : 1.0;
              soundEngine.updateContinuousState(
                next.isRunning || next.streamMode === 'SOLO',
                next.likeEnergy,
                next.likeTier,
                phaseIntensity
              );
            }
          }

          if (msg.type === 'effect:triggered' && msg.effect && enableAudio) {
            const instId: string = msg.effect.instanceId;
            if (!playedSoundIdsRef.current.has(instId)) {
              playedSoundIdsRef.current.add(instId);
              if (playedSoundIdsRef.current.size > 160) {
                const oldest = playedSoundIdsRef.current.values().next().value;
                if (oldest) playedSoundIdsRef.current.delete(oldest);
              }
              soundEngine.triggerEffectSound(msg.effect.effectId);
            }
          }

          if (msg.type === 'sound:triggered' && msg.soundId && enableAudio) {
            const instId: string = msg.instanceId || `${msg.soundId}_${Date.now()}`;
            if (!playedSoundIdsRef.current.has(instId)) {
              playedSoundIdsRef.current.add(instId);
              if (playedSoundIdsRef.current.size > 160) {
                const oldest = playedSoundIdsRef.current.values().next().value;
                if (oldest) playedSoundIdsRef.current.delete(oldest);
              }
              soundEngine.triggerEffectSound(msg.soundId, true);
            }
          }

          if (msg.type === 'music:changed' && enableAudio) {
            if (typeof msg.volumePct === 'number') {
              musicDeck.setVolumePct(msg.volumePct);
            }
            if (msg.trackId && msg.trackId !== musicDeck.getCurrentTrackId()) {
              musicDeck.selectAndPlayTrack(msg.trackId, false);
            }
          }

          if (msg.type === 'clients:count' && typeof msg.connectedClients === 'number') {
            setBattleState((prev) => ({ ...prev, connectedClients: msg.connectedClients }));
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      socket.onclose = () => {
        if (!cancelled) {
          setWsConnected(false);
          reconnectTimer = setTimeout(connect, 1500);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [enableAudio]);

  // Browser-to-Localhost External WebSocket Bridge Relay (e.g. TikFinity ws://localhost:21213 or Streamer.bot ws://localhost:8080)
  const browserBridgeUrlsKey = (battleState.wsSniffer?.externalBridges || [])
    .filter((b) => b.mode === 'BROWSER_LOCAL')
    .map((b) => b.url)
    .sort()
    .join('|');

  useEffect(() => {
    const desiredUrls = new Set(
      browserBridgeUrlsKey
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
    );

    // Close removed browser bridges
    for (const [url, sock] of localBridgesRef.current.entries()) {
      if (!desiredUrls.has(url)) {
        try {
          sock.close();
        } catch {
          // Ignore
        }
        localBridgesRef.current.delete(url);
      }
    }

    // Open newly requested browser-local bridges
    for (const url of desiredUrls) {
      if (localBridgesRef.current.has(url)) continue;
      try {
        const localSock = new WebSocket(url);
        localBridgesRef.current.set(url, localSock);

        localSock.onopen = () => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                action: 'browser_ws_status',
                payload: { url, connected: true, errorHe: null },
              })
            );
          }
        };

        localSock.onmessage = (ev) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                action: 'ingest_external_ws',
                payload: { url, rawFrame: String(ev.data || '').slice(0, 6000) },
              })
            );
          }
        };

        localSock.onerror = () => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                action: 'browser_ws_status',
                payload: {
                  url,
                  connected: false,
                  errorHe: 'לא זוהה שרת מקומי פעיל בכתובת זו על המחשב שלך',
                },
              })
            );
          }
        };

        localSock.onclose = () => {
          localBridgesRef.current.delete(url);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                action: 'browser_ws_status',
                payload: { url, connected: false, errorHe: null },
              })
            );
          }
        };
      } catch {
        // Ignore invalid local socket URL
      }
    }
  }, [browserBridgeUrlsKey]);

  useEffect(() => {
    const mapRef = localBridgesRef.current;
    return () => {
      for (const sock of mapRef.values()) {
        try {
          sock.close();
        } catch {
          // Ignore
        }
      }
      mapRef.clear();
    };
  }, []);

  const sendTikTokEvent = useCallback(
    async (payload: {
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
    }) => {
      soundEngine.ensureInitialized();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'tiktok_event', payload }));
        return;
      }
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.state) setBattleState(json.state);
      }
    },
    []
  );

  const controlBattle = useCallback(
    async (payload: {
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
    }) => {
      soundEngine.ensureInitialized();
      const res = await fetch('/api/battle/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.state) setBattleState(json.state);
      }
    },
    []
  );

  const askAiDirectorNow = useCallback(
    async (payload: {
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
      requireApproval?: boolean;
    }): Promise<AiDirectorDecision | null> => {
      soundEngine.ensureInitialized();
      const res = await fetch('/api/ai-director/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (json?.state) setBattleState(json.state);
      return json?.decision || null;
    },
    []
  );

  const setApprovalMode = useCallback(async (mode: 'AUTO_EXECUTE' | 'REQUIRE_APPROVAL') => {
    const res = await fetch('/api/ai-director/approval-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalMode: mode }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.state) setBattleState(json.state);
    }
  }, []);

  const submitApprovalAction = useCallback(
    async (decisionId: string, action: 'APPROVE' | 'REJECT', executeToGeeLark = false) => {
      soundEngine.ensureInitialized();
      const res = await fetch('/api/ai-director/approval-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionId, action, executeToGeeLark }),
      });
      const json = await res.json();
      if (json.state) setBattleState(json.state);
      return json;
    },
    []
  );

  const probeGeeLarkAndAudit = useCallback(async () => {
    const res = await fetch('/api/geelark/probe', { method: 'POST' });
    const json = await res.json();
    if (json.state) setBattleState(json.state);
    return json;
  }, []);

  const runProviderDiagnostics = useCallback(async () => {
    const res = await fetch('/api/integrations/test-providers', { method: 'POST' });
    const json = await res.json();
    if (json.state) setBattleState(json.state);
    return json;
  }, []);

  const approveProposal = useCallback(
    async (kind: 'rule' | 'tool' | 'ws_binding', id: string, action: 'APPROVE' | 'REJECT') => {
      const res = await fetch('/api/memory/approve-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, action }),
      });
      const json = await res.json();
      if (json.state) setBattleState(json.state);
      return json;
    },
    []
  );

  const saveGeeLarkConfig = useCallback(
    async (payload: {
      selectedDeviceId?: string;
      selectedFlowId?: string;
      ownedLiveUsername?: string;
      selectedLiveRoom?: string;
      connectOwnedLiveNow?: boolean;
    }) => {
      const res = await fetch('/api/geelark/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.state) setBattleState(json.state);
      return json;
    },
    []
  );

  const executeGeeLarkChat = useCallback(
    async (payload: {
      messageText: string;
      deviceId?: string;
      flowId?: string;
      targetRoomUsername: string;
      confirmedOwnedRoom?: boolean;
    }) => {
      const res = await fetch('/api/geelark/execute-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.state) setBattleState(json.state);
      return json;
    },
    []
  );

  const generateAiClientVideo = useCallback(
    async (payload: { imageBase64: string; mimeType?: string; promptHe?: string }) => {
      const res = await fetch('/api/ai-video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.state) setBattleState(json.state);
      return json;
    },
    []
  );

  const clearAiClientVideo = useCallback(async () => {
    const res = await fetch('/api/ai-video/clear', { method: 'POST' });
    const json = await res.json();
    if (json.state) setBattleState(json.state);
    return json;
  }, []);

  return {
    battleState,
    wsConnected,
    sendTikTokEvent,
    controlBattle,
    askAiDirectorNow,
    setApprovalMode,
    submitApprovalAction,
    probeGeeLarkAndAudit,
    runProviderDiagnostics,
    approveProposal,
    saveGeeLarkConfig,
    executeGeeLarkChat,
    generateAiClientVideo,
    clearAiClientVideo,
    refreshState,
  };
}
