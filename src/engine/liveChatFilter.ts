export interface LiveChatHistoryItem {
  id: string;
  user: string;
  text: string;
  ts: number;
  roomUsername: string;
  avatarUrl?: string;
}

export interface PredefinedKeywordGroup {
  id: string;
  labelHe: string;
  descriptionHe: string;
  keywords: string[];
}

export const PREDEFINED_CHAT_KEYWORD_GROUPS: PredefinedKeywordGroup[] = [
  {
    id: 'ALL',
    labelHe: 'כל ההודעות',
    descriptionHe: 'כל הודעות הצ׳אט האחרונות שנקלטו בלייב שזוהה',
    keywords: [],
  },
  {
    id: 'PK_TACTICS',
    labelHe: 'כפפה וסנייפ',
    descriptionHe: 'קריאות קרב, כפפות בוסט ושניות הכרעה',
    keywords: ['כפפה', 'glove', 'סנייפ', 'snipe', 'בוסט', 'boost', 'x5', 'x3', 'x2'],
  },
  {
    id: 'CLOUD_SMOKE',
    labelHe: 'ענן ומיסוך',
    descriptionHe: 'התראות קהל על ענן עשן או הסתרת ניקוד',
    keywords: ['ענן', 'ערפל', 'עשן', 'smoke', 'cloud', 'mist', 'fog'],
  },
  {
    id: 'GIFTS_HYPE',
    labelHe: 'מתנות ותמיכה',
    descriptionHe: 'אזכורי מתנות, יהלומים ותומכים בולטים',
    keywords: ['מתנה', 'שושנה', 'ורד', 'אריה', 'יקום', 'יהלומים', 'gift', 'rose', 'lion', 'galaxy', 'universe'],
  },
  {
    id: 'TAP_LIKES',
    labelHe: 'טאפים ולייקים',
    descriptionHe: 'עידוד הקשות כפולות, קומבו ולייקים על המסך',
    keywords: ['טאפ', 'לייק', 'מסך', 'קומבו', 'tap', 'double', 'like', 'combo', 'heart'],
  },
  {
    id: 'QUESTIONS',
    labelHe: 'שאלות ופניות',
    descriptionHe: 'שאלות מהקהל ופניות ישירות לשדרן',
    keywords: ['?', 'איך', 'מתי', 'למה', 'אפשר', 'שאלה', 'מישהו'],
  },
];

export interface TextHighlightSegment {
  text: string;
  matched: boolean;
}

function normalizeRoomHandle(raw?: string | null): string {
  const clean = (raw || '').replace(/^@/, '').trim();
  return clean ? `@${clean}` : '@studio';
}

/**
 * Merges recentChatMessages with CHAT events from monitoredRooms into a deduplicated,
 * newest-first list of chat messages from detected live streams.
 */
export function collectDetectedLiveChatHistory(params: {
  recentChatMessages?: Array<{
    user: string;
    text: string;
    ts: number;
    source?: string;
    avatarUrl?: string;
  }>;
  monitoredRooms?: Array<{
    username: string;
    recentEvents?: Array<{
      id: string;
      ts: number;
      kind: string;
      summary: string;
    }>;
  }>;
  fallbackRoomUsername?: string | null;
}): LiveChatHistoryItem[] {
  const seenKeys = new Set<string>();
  const items: LiveChatHistoryItem[] = [];
  const defaultRoom = normalizeRoomHandle(params.fallbackRoomUsername);

  for (const msg of params.recentChatMessages || []) {
    const text = (msg.text || '').trim();
    if (!text) continue;
    const user = (msg.user || 'צופה').trim();
    const roomUsername = msg.source?.startsWith('@') ? msg.source : defaultRoom;
    const dedupeKey = `${roomUsername.toLowerCase()}|${user.toLowerCase()}|${text}|${Math.floor((msg.ts || 0) / 2000)}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    items.push({
      id: `rcm_${msg.ts}_${items.length}`,
      user,
      text,
      ts: msg.ts || 0,
      roomUsername,
      avatarUrl: msg.avatarUrl,
    });
  }

  for (const room of params.monitoredRooms || []) {
    const roomHandle = normalizeRoomHandle(room.username);
    for (const ev of room.recentEvents || []) {
      if (ev.kind !== 'CHAT') continue;
      const raw = (ev.summary || '').trim();
      if (!raw) continue;
      const colonIdx = raw.indexOf(':');
      const user = colonIdx > 0 ? raw.slice(0, colonIdx).trim() : 'צופה';
      const text = colonIdx > 0 ? raw.slice(colonIdx + 1).trim() : raw;
      if (!text) continue;
      const dedupeKey = `${roomHandle.toLowerCase()}|${user.toLowerCase()}|${text}|${Math.floor((ev.ts || 0) / 2000)}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);
      items.push({
        id: ev.id || `mre_${ev.ts}_${items.length}`,
        user,
        text,
        ts: ev.ts || 0,
        roomUsername: roomHandle,
      });
    }
  }

  return items.sort((a, b) => b.ts - a.ts);
}

export function resolveActiveKeywords(params: {
  selectedGroupId: string;
  selectedSingleKeyword?: string | null;
  customKeywords?: string[];
  groups?: PredefinedKeywordGroup[];
}): string[] {
  if (params.selectedSingleKeyword && params.selectedSingleKeyword.trim()) {
    return [params.selectedSingleKeyword.trim()];
  }
  const groups = params.groups || PREDEFINED_CHAT_KEYWORD_GROUPS;
  if (params.selectedGroupId === 'CUSTOM') {
    return (params.customKeywords || []).map((k) => k.trim()).filter(Boolean);
  }
  const group = groups.find((g) => g.id === params.selectedGroupId);
  return group ? group.keywords.map((k) => k.trim()).filter(Boolean) : [];
}

export function messageMatchesKeywords(message: LiveChatHistoryItem, keywords: string[]): string[] {
  if (keywords.length === 0) return [];
  const haystack = `${message.text} ${message.user}`.toLowerCase();
  return keywords.filter((kw) => {
    const clean = kw.trim().toLowerCase();
    return clean.length > 0 && haystack.includes(clean);
  });
}

export function filterLiveChatByKeywords(params: {
  messages: LiveChatHistoryItem[];
  keywords: string[];
  roomFilter?: string;
}): LiveChatHistoryItem[] {
  const roomNorm = (params.roomFilter || 'ALL').trim().toLowerCase();
  return params.messages.filter((msg) => {
    if (roomNorm !== 'all' && msg.roomUsername.toLowerCase() !== roomNorm) {
      return false;
    }
    if (params.keywords.length === 0) {
      return true;
    }
    return messageMatchesKeywords(msg, params.keywords).length > 0;
  });
}

export function countMessagesPerKeywordGroup(
  messages: LiveChatHistoryItem[],
  roomFilter = 'ALL',
  groups: PredefinedKeywordGroup[] = PREDEFINED_CHAT_KEYWORD_GROUPS
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const group of groups) {
    counts[group.id] = filterLiveChatByKeywords({
      messages,
      keywords: group.keywords,
      roomFilter,
    }).length;
  }
  return counts;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitTextByMatchedKeywords(text: string, keywords: string[]): TextHighlightSegment[] {
  const cleanKeywords = Array.from(
    new Set(keywords.map((k) => k.trim()).filter((k) => k.length > 0))
  ).sort((a, b) => b.length - a.length);

  if (!text || cleanKeywords.length === 0) {
    return [{ text, matched: false }];
  }

  const pattern = new RegExp(`(${cleanKeywords.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);
  const lowerSet = new Set(cleanKeywords.map((k) => k.toLowerCase()));

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      matched: lowerSet.has(part.toLowerCase()),
    }));
}
