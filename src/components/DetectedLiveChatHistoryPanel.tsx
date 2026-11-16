import React, { useMemo, useState } from 'react';
import { Filter, MessageSquare, Plus, X } from 'lucide-react';
import { BattleState } from '../data/boosteraCatalog';
import {
  collectDetectedLiveChatHistory,
  countMessagesPerKeywordGroup,
  filterLiveChatByKeywords,
  PREDEFINED_CHAT_KEYWORD_GROUPS,
  resolveActiveKeywords,
  splitTextByMatchedKeywords,
} from '../engine/liveChatFilter';

interface DetectedLiveChatHistoryPanelProps {
  battleState: BattleState;
}

function formatChatTimeHe(ts: number): string {
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

export const DetectedLiveChatHistoryPanel: React.FC<DetectedLiveChatHistoryPanelProps> = ({
  battleState,
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string>('ALL');
  const [selectedSingleKeyword, setSelectedSingleKeyword] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState<string>('ALL');
  const [customKeywords, setCustomKeywords] = useState<string[]>(['סנייפ', 'כפפה', 'אלוף']);
  const [newKeywordInput, setNewKeywordInput] = useState<string>('');

  const allMessages = useMemo(
    () =>
      collectDetectedLiveChatHistory({
        recentChatMessages: battleState.recentChatMessages,
        monitoredRooms: battleState.tiktokRoom?.monitoredRooms,
        fallbackRoomUsername: battleState.tiktokRoom?.targetUsername,
      }),
    [
      battleState.recentChatMessages,
      battleState.tiktokRoom?.monitoredRooms,
      battleState.tiktokRoom?.targetUsername,
    ]
  );

  const detectedRoomHandles = useMemo(() => {
    const set = new Set<string>();
    for (const room of battleState.tiktokRoom?.monitoredRooms || []) {
      if (room.username) set.add(`@${room.username.replace(/^@/, '')}`);
    }
    if (battleState.tiktokRoom?.targetUsername) {
      set.add(`@${battleState.tiktokRoom.targetUsername.replace(/^@/, '')}`);
    }
    for (const msg of allMessages) {
      if (msg.roomUsername) set.add(msg.roomUsername);
    }
    return Array.from(set);
  }, [allMessages, battleState.tiktokRoom?.monitoredRooms, battleState.tiktokRoom?.targetUsername]);

  const groupCounts = useMemo(
    () => countMessagesPerKeywordGroup(allMessages, roomFilter, PREDEFINED_CHAT_KEYWORD_GROUPS),
    [allMessages, roomFilter]
  );

  const customCount = useMemo(
    () =>
      filterLiveChatByKeywords({
        messages: allMessages,
        keywords: customKeywords,
        roomFilter,
      }).length,
    [allMessages, customKeywords, roomFilter]
  );

  const activeKeywords = useMemo(
    () =>
      resolveActiveKeywords({
        selectedGroupId,
        selectedSingleKeyword,
        customKeywords,
        groups: PREDEFINED_CHAT_KEYWORD_GROUPS,
      }),
    [selectedGroupId, selectedSingleKeyword, customKeywords]
  );

  const filteredMessages = useMemo(
    () =>
      filterLiveChatByKeywords({
        messages: allMessages,
        keywords: activeKeywords,
        roomFilter,
      }),
    [allMessages, activeKeywords, roomFilter]
  );

  const currentGroupKeywords = useMemo(() => {
    if (selectedGroupId === 'CUSTOM') return customKeywords;
    const found = PREDEFINED_CHAT_KEYWORD_GROUPS.find((g) => g.id === selectedGroupId);
    return found ? found.keywords : [];
  }, [selectedGroupId, customKeywords]);

  const handleAddCustomKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newKeywordInput.trim();
    if (!cleaned) return;
    if (!customKeywords.some((k) => k.toLowerCase() === cleaned.toLowerCase())) {
      setCustomKeywords((prev) => [...prev, cleaned]);
    }
    setSelectedGroupId('CUSTOM');
    setSelectedSingleKeyword(null);
    setNewKeywordInput('');
  };

  const handleRemoveCustomKeyword = (kw: string) => {
    setCustomKeywords((prev) => prev.filter((k) => k !== kw));
    if (selectedSingleKeyword === kw) {
      setSelectedSingleKeyword(null);
    }
  };

  return (
    <section
      data-testid="detected-live-chat-history"
      className="bg-[#121722] border border-[#1E2636] rounded-xl p-5 sm:p-6 space-y-4"
    >
      {/* Header & Room Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#1E2636]">
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-400 shrink-0" />
            <span>היסטוריית צ׳אט אחרונה בלייב שזוהה וסינון מילות מפתח</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
            <span>מוצגות {filteredMessages.length} מתוך {allMessages.length} הודעות</span>
            <span aria-hidden="true">·</span>
            <span>
              {battleState.tiktokRoom?.connected && battleState.tiktokRoom?.targetUsername
                ? `קליטה חיה פעילה מ-@${battleState.tiktokRoom.targetUsername}`
                : 'מציג היסטוריית הודעות אחרונות שנקלטו'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <label htmlFor="detected-live-room-select" className="text-xs text-slate-400">
            מקור שידור:
          </label>
          <select
            id="detected-live-room-select"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="bg-[#0B0E14] border border-[#253047] rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">כל החדרים שזוהו ({allMessages.length})</option>
            {detectedRoomHandles.map((handle) => (
              <option key={handle} value={handle}>
                {handle}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Predefined Keyword Group Segmented Controls */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Filter className="w-3.5 h-3.5 text-amber-400" />
          <span>קבוצות מילות מפתח מוגדרות מראש:</span>
        </div>

        <div
          role="group"
          aria-label="סינון צ׳אט לפי קבוצות מילות מפתח מוגדרות מראש"
          className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#0B0E14] border border-[#1E2636] rounded-lg"
        >
          {PREDEFINED_CHAT_KEYWORD_GROUPS.map((group) => {
            const isActive = selectedGroupId === group.id && !selectedSingleKeyword;
            const count = groupCounts[group.id] ?? 0;
            return (
              <button
                key={group.id}
                type="button"
                data-keyword-group={group.id}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setSelectedSingleKeyword(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-slate-100 hover:bg-[#171F2E]'
                }`}
              >
                {group.labelHe} ({count})
              </button>
            );
          })}

          <button
            type="button"
            data-keyword-group="CUSTOM"
            onClick={() => {
              setSelectedGroupId('CUSTOM');
              setSelectedSingleKeyword(null);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums ${
              selectedGroupId === 'CUSTOM' && !selectedSingleKeyword
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-slate-100 hover:bg-[#171F2E]'
            }`}
          >
            מילות מפתח מותאמות ({customCount})
          </button>
        </div>

        {/* Individual Predefined Keyword Quick Buttons + Custom Keyword Adder */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {currentGroupKeywords.length > 0 ? (
              <>
                <span className="text-xs text-slate-400 ml-1">מילות מפתח פעילות לסינון ממוקד:</span>
                {currentGroupKeywords.map((kw) => {
                  const isFocused = selectedSingleKeyword === kw;
                  return (
                    <div key={kw} className="inline-flex items-center bg-[#0B0E14] border border-[#253047] rounded-md">
                      <button
                        type="button"
                        onClick={() => setSelectedSingleKeyword(isFocused ? null : kw)}
                        className={`px-2.5 py-1 text-xs transition-colors rounded-md ${
                          isFocused
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'text-slate-200 hover:text-amber-300'
                        }`}
                      >
                        {kw}
                      </button>
                      {selectedGroupId === 'CUSTOM' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomKeyword(kw)}
                          aria-label={`הסר מילת מפתח ${kw}`}
                          className="pl-1.5 pr-1 text-slate-500 hover:text-rose-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {selectedSingleKeyword && (
                  <button
                    type="button"
                    onClick={() => setSelectedSingleKeyword(null)}
                    className="px-2.5 py-1 text-xs text-amber-300 hover:text-amber-200 underline underline-offset-2"
                  >
                    הצג את כל מילות הקבוצה
                  </button>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-500">
                מוצגות כל ההודעות ללא סינון — בחר קבוצת מילות מפתח למעלה או הוסף מילת מפתח קבועה.
              </span>
            )}
          </div>

          <form onSubmit={handleAddCustomKeyword} className="flex items-center gap-1.5 shrink-0">
            <input
              type="text"
              value={newKeywordInput}
              onChange={(e) => setNewKeywordInput(e.target.value)}
              placeholder="הוסף מילת מפתח לסינון..."
              aria-label="הוספת מילת מפתח מוגדרת לסינון צ׳אט"
              className="bg-[#0B0E14] border border-[#253047] rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 w-48"
            />
            <button
              type="submit"
              disabled={!newKeywordInput.trim()}
              className="px-3 py-1.5 rounded-lg bg-[#192233] hover:bg-[#233047] disabled:opacity-50 text-xs font-medium text-slate-100 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>הוסף</span>
            </button>
          </form>
        </div>
      </div>

      {/* Chat History Feed */}
      <div className="bg-[#0B0E14] border border-[#1E2636] rounded-lg divide-y divide-[#161D2B] max-h-80 overflow-y-auto">
        {filteredMessages.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-sm text-slate-300">
              {allMessages.length === 0
                ? 'טרם נקלטו הודעות צ׳אט בלייב — חבר שידור חי או הפעל סריקת חדרים למעלה.'
                : 'לא נמצאו הודעות התואמות למילות המפתח שנבחרו.'}
            </p>
            {selectedGroupId !== 'ALL' && allMessages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedGroupId('ALL');
                  setSelectedSingleKeyword(null);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-[#192233] hover:bg-[#233047] text-xs font-medium text-amber-300 transition-colors"
              >
                נקה סינון והצג את כל {allMessages.length} ההודעות
              </button>
            )}
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const segments = splitTextByMatchedKeywords(msg.text, activeKeywords);
            return (
              <div
                key={msg.id}
                data-testid="live-chat-history-row"
                className="px-4 py-2.5 flex items-start justify-between gap-3 text-xs hover:bg-[#111622] transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-200">{msg.user}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-sky-400">{msg.roomUsername}</span>
                  </div>
                  <p className="text-sm text-slate-100 leading-relaxed break-words">
                    {segments.map((seg, i) =>
                      seg.matched ? (
                        <mark
                          key={i}
                          className="bg-amber-500/25 text-amber-200 rounded px-1 font-medium"
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <React.Fragment key={i}>{seg.text}</React.Fragment>
                      )
                    )}
                  </p>
                </div>

                <span className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0 pt-0.5">
                  {formatChatTimeHe(msg.ts)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
