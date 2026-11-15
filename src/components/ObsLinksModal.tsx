import { useState } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';

interface ObsLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ObsLinksModal({ isOpen, onClose }: ObsLinksModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const origin = window.location.origin;
  const sources = [
    {
      key: 'info',
      titleHe: '1. מידע וקידומים (L8 INFO & PROMOTIONS — מופרד מ-Front VFX)',
      descHe: 'פודיום תומכים, שובר-ענן, זרקורי משתתפים וקריאות טאפ — בשכבה עליונה נפרדת מעל הכל.',
      url: `${origin}/?mode=obs&layer=info`,
    },
    {
      key: 'ai_video',
      titleHe: '2. וידאו AI מתמונת לקוח (L7 AI VIDEO — מוצג רק כשמוכן READY)',
      descHe: 'מקור Browser Source ייעודי שמציג וידאו שיוצר מתמונת לקוח רק לאחר השלמת הרינדור.',
      url: `${origin}/?mode=obs&layer=ai_video`,
    },
    {
      key: 'opponent',
      titleHe: '3. Overlay יריב מקושר (L6 OPPONENT OVERLAY)',
      descHe: 'כרטיס סקור ונתוני קרב המקושרים אוטומטית לשם היריב הנבחר בלבד.',
      url: `${origin}/?mode=obs&layer=opponent`,
    },
    {
      key: 'tracked_front',
      titleHe: '4. אפקטים קדמיים במעקב ראש/פנים/גוף (L5 TRACKED FRONT FX)',
      descHe: 'אפקטי הילה, להבות ועיטורים הנצמדים לנקודות MediaPipe אמיתיות מעל המגיש.',
      url: `${origin}/?mode=obs&layer=tracked_front`,
    },
    {
      key: 'front',
      titleHe: '5. אפקטים קדמיים רגילים (L4 FRONT VFX — נקי ללא מידע/HUD)',
      descHe: 'תותחי CO₂, ניצוצות וגלי הדף בלבד — מופרד לחלוטין משכבת המידע והקידומים.',
      url: `${origin}/?mode=obs&layer=front`,
    },
    {
      key: 'back',
      titleHe: '6. אפקטים אחוריים (L2 BACK VFX — מאחורי המצלמה הקיימת)',
      descHe: 'מקם ב-OBS מתחת למצלמה הקיימת (L3) ומעל קיר האולפן הקבוע (L1).',
      url: `${origin}/?mode=obs&layer=back`,
    },
    {
      key: 'composite',
      titleHe: '7. שכבה משולבת שקופה (כל שכבות השידור לפי הסדר 1→8)',
      descHe: 'שכבת-על מלאה בסדר הגובה המדויק (מועברת מעל המצלמה הקיימת L3 וקיר L1 ב-OBS).',
      url: `${origin}/?mode=obs&layer=composite`,
    },
  ];

  const copyUrl = (key: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-[#121722] border border-[#1E2636] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-[#1E2636] pb-3.5">
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              חיבור שקוף ל-OBS ול-TikTok LIVE Studio (Browser Source)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              הגדר רזולוציה 1080×1920 או 2160×3840 וקצב 60fps — הרקע שקוף לחלוטין (True RGBA Alpha) ומסתנכרן בזמן אמת.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="סגור חלון"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1A2233] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {sources.map((s) => (
            <div
              key={s.key}
              className="bg-[#0B0E14] border border-[#1E2636] rounded-lg p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-100">{s.titleHe}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => copyUrl(s.key, s.url)}
                    className="px-2.5 py-1 text-xs rounded-md bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    {copiedKey === s.key ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>הועתק</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>העתק URL</span>
                      </>
                    )}
                  </button>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1 text-xs rounded-md bg-[#161D2B] text-slate-300 hover:text-white transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>תצוגה</span>
                  </a>
                </div>
              </div>
              <p className="text-xs text-slate-400">{s.descHe}</p>
              <code dir="ltr" className="block text-[11px] font-mono text-amber-300/90 truncate text-left">
                {s.url}
              </code>
            </div>
          ))}
        </div>

        <div className="bg-[#0B0E14] border border-[#1E2636] rounded-lg p-3.5 space-y-1.5 text-xs">
          <div className="font-semibold text-slate-200">
            חיבור אירועים חיים מ-TikTok LIVE (TikFinity / Streamer.bot Webhook):
          </div>
          <p className="text-slate-400">
            הגדר בקשה מסוג <code className="text-slate-200">POST {origin}/api/events</code> עם גוף JSON כמו{' '}
            <code dir="ltr" className="text-amber-300">
              {`{"type":"like","count":10}`}
            </code>{' '}
            או{' '}
            <code dir="ltr" className="text-amber-300">
              {`{"type":"share","count":1}`}
            </code>{' '}
            — כל שכבות ה-OBS יגיבו בפחות מ-16 מילישניות!
          </p>
        </div>
      </div>
    </div>
  );
}
