import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { beginGoogleLogin } from '../lib/auth';
import ThemeToggle from '../components/ThemeToggle';

/**
 * 未ログイン時のトップページ。
 *
 * デザインは「.notes-landing 配下にスコープした CSS(<style>)+ 直接DOM操作のアニメーション」で
 * 自己完結させる(CSP は style-src 'unsafe-inline' 許可。script は使わず useEffect で駆動)。
 * アニメーションは React state を持たず DOM を直接触るだけなので、Landing は再レンダーしない。
 */

// ---- スコープCSS(トークンは .notes-landing に閉じ込め、ライト/ダークは data-theme に追従)----
const CSS = `
.notes-landing { color-scheme: light; background: var(--lp-bg); min-height: 100dvh; overflow-x: hidden;
  --lp-bg:#f7f6f2; --lp-surface:#fff; --lp-surface-2:#f0eee8; --lp-fg:#17171a; --lp-muted:#6f6d68; --lp-border:#e6e3db;
  --lp-accent:#2f6bd6; --lp-accent-2:#7a5cf0; --lp-ok:#2f9e6b; --lp-accent-soft: color-mix(in srgb, var(--lp-accent) 11%, transparent);
  --lp-screen:#fff; --lp-screen-line:#eceae4; --lp-shadow: 0 30px 60px -24px rgba(24,30,60,.30), 0 8px 20px -12px rgba(24,30,60,.18);
  --lp-mono: ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) .notes-landing {
  color-scheme: dark; --lp-bg:#0f1116; --lp-surface:#191c22; --lp-surface-2:#20242c; --lp-fg:#edecf0; --lp-muted:#9a988f; --lp-border:#2c313a;
  --lp-accent:#6ea8ff; --lp-accent-2:#a78bff; --lp-ok:#5cd39a; --lp-screen:#12151b; --lp-screen-line:#262b34;
  --lp-shadow: 0 30px 70px -22px rgba(0,0,0,.7), 0 8px 24px -12px rgba(0,0,0,.6); } }
:root[data-theme='dark'] .notes-landing {
  color-scheme: dark; --lp-bg:#0f1116; --lp-surface:#191c22; --lp-surface-2:#20242c; --lp-fg:#edecf0; --lp-muted:#9a988f; --lp-border:#2c313a;
  --lp-accent:#6ea8ff; --lp-accent-2:#a78bff; --lp-ok:#5cd39a; --lp-screen:#12151b; --lp-screen-line:#262b34;
  --lp-shadow: 0 30px 70px -22px rgba(0,0,0,.7), 0 8px 24px -12px rgba(0,0,0,.6); }

.notes-landing .wrap { max-width: 960px; margin: 0 auto; padding: 18px 22px 72px; position: relative; color: var(--lp-fg); }
.notes-landing .topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; position: relative; z-index: 2; }
.notes-landing .wordmark { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; letter-spacing: -.01em; }

.notes-landing .glow { position: absolute; top: -80px; left: 50%; transform: translateX(-50%); width: 820px; max-width: 130vw; height: 520px; z-index: 0; pointer-events: none;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--lp-accent) 26%, transparent), transparent 70%),
              radial-gradient(closest-side, color-mix(in srgb, var(--lp-accent-2) 20%, transparent), transparent 70%);
  background-position: 30% 40%, 72% 30%; background-repeat: no-repeat; filter: blur(18px); opacity: .42; }

.notes-landing .hero { position: relative; z-index: 1; text-align: center; padding: 52px 0 8px; }
.notes-landing .kicker { display: inline-block; font-size: 11.5px; letter-spacing: .28em; text-transform: uppercase; color: var(--lp-accent); font-weight: 700; margin-bottom: 18px; }
.notes-landing h1 { font-size: clamp(32px, 7vw, 58px); line-height: 1.08; letter-spacing: -.03em; margin: 0 0 18px; text-wrap: balance; font-weight: 750; }
.notes-landing h1 .grad { background: linear-gradient(100deg, var(--lp-accent), var(--lp-accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.notes-landing .note { font-size: 12.5px; color: var(--lp-muted); margin: 14px 0 0; }

.notes-landing .gbtn { display: inline-flex; align-items: center; gap: 12px; height: 50px; padding: 0 24px; background: #fff; color: #3c4043; border: 1px solid #dadce0; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer; box-shadow: 0 6px 18px -8px rgba(30,40,90,.4); transition: transform .15s, box-shadow .15s; }
.notes-landing .gbtn:hover { transform: translateY(-1px); box-shadow: 0 12px 26px -10px rgba(30,40,90,.5); }

.notes-landing .stage { position: relative; z-index: 1; margin: 46px auto 0; border-radius: 26px; border: 1px solid var(--lp-border);
  background: radial-gradient(130% 100% at 50% -18%, color-mix(in srgb, var(--lp-accent) 22%, transparent), transparent 60%), linear-gradient(180deg, color-mix(in srgb, var(--lp-accent) 8%, var(--lp-surface-2)), var(--lp-surface-2));
  box-shadow: var(--lp-shadow); overflow: hidden; padding: clamp(32px, 6vw, 60px) clamp(14px, 4vw, 40px); }
.notes-landing .scene { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: clamp(10px, 5vw, 56px); flex-wrap: wrap; margin: 0 auto; }

.notes-landing .memo-bar { display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-bottom: 1px solid var(--lp-screen-line); }
.notes-landing .memo-bar .mdot { width: 7px; height: 7px; border-radius: 50%; background: var(--lp-screen-line); }
.notes-landing .memo-bar .url { margin-left: 8px; font-family: var(--lp-mono); font-size: 10px; color: var(--lp-muted); background: var(--lp-surface-2); border-radius: 5px; padding: 2px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notes-landing .memo-body { padding: 14px 16px; text-align: left; transition: opacity .45s ease; }
.notes-landing .memo-title { font-weight: 680; font-size: 14px; height: 22px; line-height: 22px; margin-bottom: 8px; white-space: nowrap; overflow: hidden; }
.notes-landing .memo-line { font-family: var(--lp-mono); font-size: 12px; color: var(--lp-fg); height: 21px; line-height: 21px; white-space: nowrap; overflow: hidden; }
.notes-landing .memo-line.reflected { animation: lp-lineIn .3s ease; }
@keyframes lp-lineIn { from { opacity: 0; } to { opacity: 1; } }
.notes-landing .typing::after { content: '▏'; color: var(--lp-accent); animation: lp-blink 1s steps(1) infinite; margin-left: 1px; }
@keyframes lp-blink { 50% { opacity: 0; } }
.notes-landing .save { display: inline-flex; align-items: center; gap: 5px; margin-top: 12px; font-size: 10.5px; color: var(--lp-muted); }
.notes-landing .save .led { width: 6px; height: 6px; border-radius: 50%; background: var(--lp-ok); }
.notes-landing .save[data-s="save"] .led { background: var(--lp-accent); }

.notes-landing .laptop { display: flex; flex-direction: column; align-items: center; }
.notes-landing .laptop .screen { position: relative; width: min(360px, 78vw); border-radius: 14px 14px 4px 4px; border: 1px solid var(--lp-border); background: var(--lp-screen); box-shadow: var(--lp-shadow); overflow: hidden; }
.notes-landing .laptop .memo-body { min-height: 176px; }
.notes-landing .laptop .base { width: min(430px, 92vw); height: 13px; margin-top: -1px; border-radius: 0 0 12px 12px; border: 1px solid var(--lp-border); border-top: none; background: linear-gradient(180deg, var(--lp-surface-2), var(--lp-surface)); position: relative; }
.notes-landing .laptop .base::after { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 60px; height: 5px; border-radius: 0 0 6px 6px; background: var(--lp-screen-line); }

.notes-landing .phone { position: relative; width: min(158px, 42vw); border-radius: 30px; border: 1px solid var(--lp-border); background: var(--lp-screen); box-shadow: var(--lp-shadow); overflow: hidden; padding: 8px 6px 14px; }
.notes-landing .phone .notch { width: 46px; height: 5px; border-radius: 99px; background: var(--lp-screen-line); margin: 4px auto 6px; }
.notes-landing .phone .memo-title { font-size: 12.5px; height: 20px; line-height: 20px; }
.notes-landing .phone .memo-line { font-size: 11px; height: 19px; line-height: 19px; }
.notes-landing .phone .memo-body { min-height: 236px; padding: 10px 12px; }

.notes-landing .loadbar { position: absolute; top: 0; left: 0; height: 2px; width: 0; z-index: 4; opacity: 0; background: linear-gradient(90deg, var(--lp-accent), var(--lp-accent-2)); }
.notes-landing .loadbar.go { animation: lp-loadsweep .72s ease forwards; }
@keyframes lp-loadsweep { 0%{width:0;opacity:1} 84%{width:100%;opacity:1} 100%{width:100%;opacity:0} }
.notes-landing .url, .notes-landing .p-url { transition: color .2s, background .2s; }
.notes-landing .url.active, .notes-landing .p-url.active { color: var(--lp-accent); background: var(--lp-accent-soft); }
.notes-landing .p-url { display: flex; align-items: center; gap: 5px; margin: 0 8px 8px; font-family: var(--lp-mono); font-size: 9px; color: var(--lp-muted); background: var(--lp-surface-2); border-radius: 7px; padding: 4px 8px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.notes-landing .p-url .lock { font-size: 9px; flex-shrink: 0; }

.notes-landing .link { position: relative; align-self: center; display: flex; align-items: center; justify-content: center; }
.notes-landing .link .wire { width: clamp(34px, 8vw, 90px); height: 2px; background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--lp-accent) 55%, transparent) 0 6px, transparent 6px 12px); }
.notes-landing .link .pip { position: absolute; width: 9px; height: 9px; border-radius: 50%; background: var(--lp-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--lp-accent) 22%, transparent); opacity: 0; }
.notes-landing .link .pip.go-r { animation: lp-pipR .6s ease forwards; }
.notes-landing .link .pip.go-l { animation: lp-pipL .6s ease forwards; }
@keyframes lp-pipR { 0%{opacity:1;left:0} 100%{opacity:0;left:100%} }
@keyframes lp-pipL { 0%{opacity:1;left:100%} 100%{opacity:0;left:0} }
.notes-landing .link .tag { position: absolute; top: -26px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 10px; font-family: var(--lp-mono); color: var(--lp-accent); background: var(--lp-accent-soft); border-radius: 99px; padding: 2px 9px; }
@media (max-width: 620px) { .notes-landing .link { width: 100%; }
  .notes-landing .link .wire { width: 2px; height: 34px; background: repeating-linear-gradient(180deg, color-mix(in srgb, var(--lp-accent) 55%, transparent) 0 6px, transparent 6px 12px); }
  .notes-landing .link .tag { position: static; transform: none; } .notes-landing .link .pip { display: none; } }

.notes-landing .features { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 96px; }
.notes-landing .feat { flex: 1 1 250px; display: flex; gap: 13px; align-items: flex-start; padding: 6px 2px; }
.notes-landing .fbadge { width: 42px; height: 42px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; color: var(--lp-accent); background: var(--lp-accent-soft); flex-shrink: 0; }
.notes-landing .feat h3 { font-size: 15px; margin: 3px 0 4px; }
.notes-landing .feat p { font-size: 13px; color: var(--lp-muted); margin: 0; line-height: 1.6; }

.notes-landing .cta2 { text-align: center; margin-top: 84px; }
.notes-landing .cta2 h2 { font-size: clamp(22px, 4vw, 32px); letter-spacing: -.02em; margin: 0 0 22px; text-wrap: balance; }
.notes-landing footer { border-top: 1px solid var(--lp-border); margin-top: 72px; padding-top: 18px; text-align: center; font-size: 12px; color: var(--lp-muted); }
.notes-landing footer a { color: var(--lp-muted); }

.notes-landing .reveal { opacity: 0; transform: translateY(22px); transition: opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1); }
.notes-landing .reveal.in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .notes-landing .reveal { opacity: 1 !important; transform: none !important; transition: none; }
  .notes-landing .typing::after, .notes-landing .link .pip, .notes-landing .memo-line.reflected, .notes-landing .loadbar { animation: none !important; }
}
`;

function GoogleButton() {
  return (
    <button className="gbtn" onClick={() => void beginGoogleLogin()}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
        <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
        <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
        <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
      </svg>
      Google で続ける
    </button>
  );
}

export default function Landing() {
  // アニメーション + スクロールリビール。DOM を直接操作するだけで React state は持たない。
  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((res, rej) => {
        const t = setTimeout(() => (alive ? res() : rej(new Error('cancel'))), ms);
        timers.push(t);
      });

    // スクロールリビール
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.16 },
    );
    document.querySelectorAll('.notes-landing .reveal:not(.in)').forEach((el) => io.observe(el));

    const $ = (id: string) => document.getElementById(id);
    const dev = {
      lap: { title: $('lap-title')!, lines: [0, 1, 2, 3, 4].map((i) => $(`lap-${i}`)!), save: $('lap-save')!, body: $('lap-body')!, url: $('lap-url')!, load: $('lap-load')! },
      ph: { title: $('ph-title')!, lines: [0, 1, 2, 3, 4].map((i) => $(`ph-${i}`)!), save: $('ph-save')!, body: $('ph-body')!, url: $('ph-url')!, load: $('ph-load')! },
    };
    const pip = $('pip')!;
    if (!dev.lap.title || !dev.ph.title || !pip) return;

    type Dev = 'lap' | 'ph';
    const fieldEl = (d: Dev, f: number | 't') => (f === 't' ? dev[d].title : dev[d].lines[f]);
    const setSave = (d: Dev, mode: 'save' | 'saved') => {
      const s = dev[d].save;
      s.dataset.s = mode === 'saved' ? '' : 'save';
      if (s.lastChild) s.lastChild.textContent = mode === 'saved' ? '保存済み' : '保存中…';
    };
    const clearText = () => {
      for (const d of ['lap', 'ph'] as const) {
        dev[d].title.textContent = '';
        dev[d].title.classList.remove('typing');
        dev[d].lines.forEach((l) => {
          l.textContent = '';
          l.classList.remove('reflected', 'typing');
        });
        setSave(d, 'saved');
      }
    };
    const typeInto = async (el: HTMLElement, text: string) => {
      el.classList.add('typing');
      for (let i = 1; i <= text.length; i++) {
        el.textContent = text.slice(0, i);
        await sleep(52);
      }
      el.classList.remove('typing');
    };
    const pulse = (dir: 'r' | 'l') => {
      pip.className = 'pip';
      void pip.offsetWidth;
      pip.classList.add(dir === 'r' ? 'go-r' : 'go-l');
    };
    const sweep = (el: HTMLElement) => {
      el.classList.remove('go');
      void el.offsetWidth;
      el.classList.add('go');
    };

    const DOCS: { title: string; lap: string[]; ph: string[] }[] = [
      { title: '本番エラー調査', lap: ['$ npm run deploy', 'Error: ECONNREFUSED'], ph: ['→ DB起動で直った'] },
      { title: 'デプロイ手順', lap: ['git pull', 'npm run build', 'pm2 restart api'], ph: ['→ 本番反映 OK'] },
      { title: 'テスト結果', lap: ['✓ 42 passed', '✗ 2 failed (auth)'], ph: ['→ auth だけ直す'] },
      { title: 'あとで直す', lap: ['TODO: リトライ', 'tokens.ts:214'], ph: ['→ max 3回まで'] },
      { title: 'よく使う絵文字', lap: ['🎉 🙏 🔥 ✨', '🍣 🍜 🍺 ☕'], ph: ['😴 💤 👍 🙌'] },
      { title: '顔文字ストック', lap: ['¯\\_(ツ)_/¯', '(╯°□°)╯︵ ┻━┻'], ph: ['ヽ(´▽`)/'] },
      { title: 'ねこ (ASCII)', lap: [' /\\_/\\', '( o.o )', ' > ^ <'], ph: ['→ かわいい'] },
      { title: '買い物メモ', lap: ['・牛乳', '・卵'], ph: ['・パンも!'] },
      { title: '週末やること', lap: ['・部屋の片付け', '・映画みる'], ph: ['・散歩いく 🐕'] },
      { title: '引用ストック', lap: ['“Done is better', 'than perfect.”'], ph: ['— 名言メモ'] },
    ];
    const HEX = 'abcdef0123456789';
    const randHash = (n: number) => {
      let s = '';
      for (let i = 0; i < n; i++) s += HEX[Math.floor(Math.random() * HEX.length)];
      return s;
    };
    const setUrl = () => {
      const u = 'notes.rou39.com/m#' + randHash(6) + '…';
      dev.lap.url.textContent = u;
      dev.ph.url.innerHTML = '<span class="lock">🔒</span>' + u;
    };

    const openUrl = async () => {
      dev.lap.body.style.opacity = '0';
      dev.ph.body.style.opacity = '0';
      setUrl();
      dev.lap.url.classList.add('active');
      dev.ph.url.classList.add('active');
      sweep(dev.lap.load);
      await sleep(140);
      sweep(dev.ph.load);
      await sleep(680);
      dev.lap.body.style.opacity = '1';
      dev.ph.body.style.opacity = '1';
      pulse('r');
      dev.lap.url.classList.remove('active');
      dev.ph.url.classList.remove('active');
      await sleep(360);
    };

    const step = async (s: { d: Dev; f: number | 't'; text: string }) => {
      const other: Dev = s.d === 'lap' ? 'ph' : 'lap';
      setSave(s.d, 'save');
      await typeInto(fieldEl(s.d, s.f), s.text);
      await sleep(340);
      pulse(s.d === 'lap' ? 'r' : 'l');
      await sleep(320);
      const dst = fieldEl(other, s.f);
      dst.textContent = s.text;
      dst.classList.remove('reflected');
      void dst.offsetWidth;
      dst.classList.add('reflected');
      setSave('lap', 'saved');
      setSave('ph', 'saved');
      await sleep(720);
    };

    // PC が title + lap 行 → スマホが1行空けて ph 行を追記(双方向が分かるように)
    const scriptFor = (doc: (typeof DOCS)[number]) => {
      const steps: { d: Dev; f: number | 't'; text: string }[] = [{ d: 'lap', f: 't', text: doc.title }];
      let slot = 0;
      doc.lap.forEach((t) => {
        steps.push({ d: 'lap', f: slot, text: t });
        slot++;
      });
      if (doc.ph.length) {
        slot++; // 1行あける
        doc.ph.forEach((t) => {
          steps.push({ d: 'ph', f: slot, text: t });
          slot++;
        });
      }
      return steps;
    };

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const run = async () => {
      if (reduced) {
        setUrl();
        for (const s of scriptFor(DOCS[0])) {
          fieldEl(s.d, s.f).textContent = s.text;
          fieldEl(s.d === 'lap' ? 'ph' : 'lap', s.f).textContent = s.text;
        }
        dev.lap.body.style.opacity = '1';
        dev.ph.body.style.opacity = '1';
        return;
      }
      let last = -1;
      while (alive) {
        let i: number;
        do {
          i = Math.floor(Math.random() * DOCS.length);
        } while (i === last && DOCS.length > 1);
        last = i;
        clearText();
        await openUrl();
        await sleep(280);
        for (const s of scriptFor(DOCS[i])) await step(s);
        await sleep(1700);
      }
    };
    run().catch(() => {
      /* unmount 時の cancel は無視 */
    });

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      io.disconnect();
    };
  }, []);

  return (
    <div className="notes-landing">
      <style>{CSS}</style>
      <main className="wrap">
        <div className="glow" />
        <div className="topbar">
          <span className="wordmark">
            <span aria-hidden="true">🗒️</span> Stash Notes
          </span>
          <ThemeToggle />
        </div>

        <section className="hero">
          <span className="kicker reveal in">no login · secret url</span>
          <h1 className="reveal in">
            Paste it here.
            <br />
            <span className="grad">Grab it anywhere.</span>
          </h1>
          <div className="reveal in" style={{ marginTop: 26 }}>
            <GoogleButton />
          </div>
          <p className="note reveal in">無料・登録不要。お持ちの Google アカウントですぐ始められます。</p>

          {/* 動くデモ: 同じURLのメモが PC / スマホ 両方に反映される */}
          <div className="stage reveal in">
            <div className="scene">
              <div className="laptop">
                <div className="screen">
                  <span className="loadbar" id="lap-load" />
                  <div className="memo-bar">
                    <span className="mdot" />
                    <span className="mdot" />
                    <span className="mdot" />
                    <span className="url" id="lap-url">
                      notes.rou39.com/m#a7f2c9…
                    </span>
                  </div>
                  <div className="memo-body" id="lap-body">
                    <div className="memo-title" id="lap-title" />
                    <div className="memo-line" id="lap-0" />
                    <div className="memo-line" id="lap-1" />
                    <div className="memo-line" id="lap-2" />
                    <div className="memo-line" id="lap-3" />
                    <div className="memo-line" id="lap-4" />
                    <span className="save" id="lap-save">
                      <span className="led" />
                      保存済み
                    </span>
                  </div>
                </div>
                <div className="base" />
              </div>

              <div className="link">
                <span className="tag">🔗 同じURL</span>
                <span className="wire" />
                <span className="pip" id="pip" />
              </div>

              <div className="phone">
                <span className="loadbar" id="ph-load" />
                <div className="notch" />
                <div className="p-url" id="ph-url">
                  <span className="lock">🔒</span>notes.rou39.com/m#a7f2c9…
                </div>
                <div className="memo-body" id="ph-body">
                  <div className="memo-title" id="ph-title" />
                  <div className="memo-line" id="ph-0" />
                  <div className="memo-line" id="ph-1" />
                  <div className="memo-line" id="ph-2" />
                  <div className="memo-line" id="ph-3" />
                  <div className="memo-line" id="ph-4" />
                  <span className="save" id="ph-save">
                    <span className="led" />
                    保存済み
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="features">
          <div className="feat reveal">
            <span className="fbadge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
            <div>
              <h3>漏れても無効化</h3>
              <p>再発行で旧URLを即失効。PIN・有効期限で、見せたくないものもそっと。</p>
            </div>
          </div>
          <div className="feat reveal">
            <span className="fbadge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </span>
            <div>
              <h3>貼ればすぐ保存</h3>
              <p>複数タブで整理。通信が不安定でも、編集はこの端末に残ります。</p>
            </div>
          </div>
          <div className="feat reveal">
            <span className="fbadge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <div>
              <h3>アクセス履歴</h3>
              <p>誰がいつ開いたかを、そのメモの画面で確認できます。</p>
            </div>
          </div>
        </section>

        <section className="cta2 reveal">
          <h2>No login. Just a link.</h2>
          <GoogleButton />
        </section>

        <footer>
          <Link to="/privacy">プライバシーポリシー</Link> ·{' '}
          <Link to="/terms">利用規約</Link> · © 2026 rou39
        </footer>
      </main>
    </div>
  );
}
