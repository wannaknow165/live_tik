import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDetectedLiveChatHistory,
  countMessagesPerKeywordGroup,
  filterLiveChatByKeywords,
  PREDEFINED_CHAT_KEYWORD_GROUPS,
  resolveActiveKeywords,
  splitTextByMatchedKeywords,
} from './liveChatFilter';

test('collectDetectedLiveChatHistory merges and deduplicates recentChatMessages and monitoredRooms chat events', () => {
  const merged = collectDetectedLiveChatHistory({
    recentChatMessages: [
      { user: 'Noa', text: 'שימו כפפה עכשיו בבוסט!', ts: 5000, source: '@khaledashur' },
      { user: 'Rami', text: 'כולם דאבל טאפ על המסך', ts: 4000, source: '@khaledashur' },
    ],
    monitoredRooms: [
      {
        username: 'khaledashur',
        recentEvents: [
          { id: '1', ts: 5000, kind: 'CHAT', summary: 'Noa: שימו כפפה עכשיו בבוסט!' },
          { id: '2', ts: 6000, kind: 'CHAT', summary: 'Yossi: פתחו ענן ערפל בקרב!' },
          { id: '3', ts: 6500, kind: 'GIFT', summary: 'Dana sent Rose x10' },
        ],
      },
    ],
  });

  assert.equal(merged.length, 3);
  assert.equal(merged[0].user, 'Yossi');
  assert.equal(merged[0].roomUsername, '@khaledashur');
  assert.equal(merged[1].user, 'Noa');
  assert.equal(merged[2].user, 'Rami');
});

test('filterLiveChatByKeywords and countMessagesPerKeywordGroup filter accurately by predefined groups and room', () => {
  const sample = [
    { id: '1', user: 'Avi', text: 'תכינו סנייפ וכפפה ב-10 שניות', ts: 4000, roomUsername: '@roomA' },
    { id: '2', user: 'Dana', text: 'יש ענן כבד לא רואים ניקוד', ts: 3000, roomUsername: '@roomA' },
    { id: '3', user: 'Lior', text: 'איך מצטרפים לשידור?', ts: 2000, roomUsername: '@roomB' },
    { id: '4', user: 'Gal', text: 'תנו טאפ ולייקים חזק', ts: 1000, roomUsername: '@roomB' },
  ];

  const countsAll = countMessagesPerKeywordGroup(sample, 'ALL', PREDEFINED_CHAT_KEYWORD_GROUPS);
  assert.equal(countsAll.ALL, 4);
  assert.equal(countsAll.PK_TACTICS, 1);
  assert.equal(countsAll.CLOUD_SMOKE, 1);
  assert.equal(countsAll.QUESTIONS, 1);
  assert.equal(countsAll.TAP_LIKES, 1);

  const pkKeywords = resolveActiveKeywords({ selectedGroupId: 'PK_TACTICS' });
  const pkFiltered = filterLiveChatByKeywords({ messages: sample, keywords: pkKeywords, roomFilter: 'ALL' });
  assert.equal(pkFiltered.length, 1);
  assert.equal(pkFiltered[0].id, '1');

  const roomBOnly = filterLiveChatByKeywords({ messages: sample, keywords: [], roomFilter: '@roomB' });
  assert.equal(roomBOnly.length, 2);
});

test('splitTextByMatchedKeywords highlights matched predefined keywords case-insensitively', () => {
  const segments = splitTextByMatchedKeywords('שימו Snipe חזק וכפפה עכשיו!', ['כפפה', 'snipe']);
  const matchedTexts = segments.filter((s) => s.matched).map((s) => s.text);
  assert.deepEqual(matchedTexts, ['Snipe', 'כפפה']);
});
