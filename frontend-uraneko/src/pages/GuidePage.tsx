import { Fragment, useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import SectionLabel from '../components/bar/SectionLabel';
import Ornament from '../components/bar/Ornament';
import { useIsNarrow } from '../lib/useIsNarrow';

/**
 * はじめての送金ガイド。図・表・カードを中心に、文章は最小限にする。
 * 「初心者が、使っているアプリから何をどうすればいいか」わかることを目標にする。
 * 個人情報はページに一切書かない(第三者登録が要る人は contact 経由で個別対応=案B)。
 * 手数料など変動する具体値は断定せず「取引所しだい/要確認」で扱う。
 */

const CONTACT = 'contact@rou39.com';
const CONTACT_MAILTO = 'mailto:' + CONTACT + '?subject=' + encodeURIComponent('uraneko 送金について');

// ---------- 小物 ----------
function Term({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          font: 'inherit',
          color: 'var(--color-gold-bright)',
          borderBottom: '1px dotted var(--color-gold)',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
      {open && (
        <span
          className="anim-soft"
          style={{
            display: 'block',
            margin: '8px 0 4px',
            padding: '10px 14px',
            borderLeft: '2px solid var(--color-gold)',
            background: 'rgba(184,181,172,0.05)',
            fontSize: 12.5,
            lineHeight: 1.9,
            color: 'var(--muted)',
          }}
        >
          {children}
        </span>
      )}
    </>
  );
}

function Accordion({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--faint)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 4px',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-serif-jp)',
            fontSize: 14,
            fontWeight: 300,
            letterSpacing: 1,
            color: 'var(--color-fg)',
          }}
        >
          {title}
        </span>
        <span
          style={{
            color: 'var(--color-gold)',
            fontSize: 13,
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform .2s',
          }}
        >
          ▸
        </span>
      </button>
      {open && (
        <div
          className="anim-soft"
          style={{
            padding: '0 4px 20px',
            fontFamily: 'var(--font-serif-jp)',
            fontSize: 13.5,
            lineHeight: 2,
            color: 'var(--muted)',
            fontWeight: 300,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: '14px 0',
        padding: '12px 14px',
        border: '1px solid rgba(168,67,63,0.4)',
        background: 'rgba(168,67,63,0.06)',
        fontSize: 13,
        lineHeight: 1.9,
        color: 'var(--color-fg)',
      }}
    >
      ⚠ {children}
    </div>
  );
}

// セクション見出し
function Head({ label, title }: { label: string; title: string }) {
  return (
    <div style={{ marginTop: 44, marginBottom: 14 }}>
      <SectionLabel style={{ marginBottom: 6 }}>— {label}</SectionLabel>
      <h2
        style={{
          fontFamily: 'var(--font-serif-jp)',
          fontSize: 'clamp(18px, 4.5vw, 22px)',
          fontWeight: 300,
          letterSpacing: 3,
          margin: 0,
          color: 'var(--color-fg)',
        }}
      >
        {title}
      </h2>
    </div>
  );
}

// ○ / △ マーク
function Mk({ good, children }: { good?: boolean; children: ReactNode }) {
  return <span style={{ color: good ? 'var(--color-gold-bright)' : 'var(--dim)' }}>{children}</span>;
}

// ---------- テーブル用スタイル ----------
const tWrap: CSSProperties = { overflowX: 'auto', margin: '6px 0' };
const tbl: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 460,
  fontFamily: 'var(--font-serif-jp)',
};
const th: CSSProperties = {
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 1.5,
  color: 'var(--color-gold)',
  padding: '9px 12px',
  borderBottom: '1px solid rgba(168,166,158,0.3)',
  whiteSpace: 'nowrap',
};
const td: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 300,
  color: 'var(--muted)',
  padding: '11px 12px',
  borderBottom: '1px solid var(--faint)',
  verticalAlign: 'top',
  lineHeight: 1.7,
};
const tdName: CSSProperties = { ...td, color: 'var(--color-fg)', whiteSpace: 'nowrap' };

// カード
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 220,
        border: '1px solid var(--faint)',
        background: 'var(--color-panel)',
        padding: '16px 18px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// コイン札(記号 + 名前 + 一言 + ○/△)
function CoinCard({
  sym,
  name,
  tag,
  pros,
  cons,
}: {
  sym: string;
  name: string;
  tag: string;
  pros: string[];
  cons: string[];
}) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 26,
            fontWeight: 300,
            color: 'var(--color-gold-bright)',
            lineHeight: 1,
          }}
        >
          {sym}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-serif-jp)',
            fontSize: 16,
            fontWeight: 300,
            letterSpacing: 2,
            color: 'var(--color-fg)',
          }}
        >
          {name}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-serif-jp)',
          fontSize: 12,
          color: 'var(--muted)',
          fontWeight: 300,
          marginBottom: 12,
          lineHeight: 1.7,
        }}
      >
        {tag}
      </div>
      <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12.5, lineHeight: 1.9, fontWeight: 300 }}>
        {pros.map((p) => (
          <div key={p} style={{ color: 'var(--muted)' }}>
            <Mk good>○</Mk> {p}
          </div>
        ))}
        {cons.map((c) => (
          <div key={c} style={{ color: 'var(--dim)' }}>
            <Mk>△</Mk> {c}
          </div>
        ))}
      </div>
    </Card>
  );
}

// 流れの1ステップ(番号 + 見出し + タグ)
function Flow({
  n,
  title,
  tag,
}: {
  n: string;
  title: string;
  tag?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 150,
        border: '1px solid var(--faint)',
        background: 'var(--color-panel)',
        padding: '16px 14px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--color-gold)' }}>
        {n}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-serif-jp)',
          fontSize: 14,
          fontWeight: 300,
          letterSpacing: 1,
          color: 'var(--color-fg)',
          margin: '6px 0',
          lineHeight: 1.5,
        }}
      >
        {title}
      </div>
      {tag && (
        <div
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            letterSpacing: 1,
            color: 'var(--color-gold-bright)',
            border: '1px solid rgba(214,183,110,0.3)',
            padding: '2px 7px',
            marginTop: 2,
          }}
        >
          {tag}
        </div>
      )}
    </div>
  );
}

export default function GuidePage() {
  const isNarrow = useIsNarrow();
  const arrow = isNarrow ? '↓' : '→';

  const steps = [
    { n: '1', t: '買う', d: '取引所で BTC / LTC を用意' },
    { n: '2', t: '送る', d: '表示のアドレスへ送金' },
    { n: '3', t: '受け取る', d: '自動でダウンロード＋メール' },
  ];

  const flow = [
    { n: 'STEP 1', title: '取引所で BTC / LTC を買う', tag: '' },
    { n: 'STEP 2', title: '送付先に uraneko のアドレスを登録', tag: 'プライベート/本人' },
    { n: 'STEP 3', title: 'QR で表示どおりの数量を送る', tag: '正確な数量' },
    { n: 'STEP 4', title: 'uraneko で自動受け取り', tag: 'DL＋メール' },
  ];

  const exchanges = [
    { name: 'GMOコイン', feat: '東証プライム系。手数料が比較的安いことで知られる', bg: '◎' },
    { name: 'Coincheck', feat: 'アプリが分かりやすく初心者に人気', bg: '◎' },
    { name: 'bitFlyer', feat: 'BTC取引量が国内トップ級の大手', bg: '○' },
    { name: 'bitbank', feat: '取扱通貨が多く、板取引でスプレッドが有利', bg: '○' },
  ];

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* ヒーロー */}
      <SectionLabel style={{ marginBottom: 12 }}>— PAYMENT GUIDE</SectionLabel>
      <h1
        style={{
          fontFamily: 'var(--font-serif-jp)',
          fontSize: 'clamp(24px, 6vw, 34px)',
          fontWeight: 200,
          letterSpacing: 4,
          margin: '0 0 14px',
          color: 'var(--color-fg)',
        }}
      >
        はじめての送金ガイド
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-serif-jp)',
          fontSize: 14,
          lineHeight: 2,
          fontWeight: 300,
          color: 'var(--muted)',
          margin: '0 0 28px',
        }}
      >
        暗号資産(BTC / LTC)での支払いを、はじめての方にもわかるように。基本は
        <b style={{ color: 'var(--color-fg)' }}>3ステップ</b>。
        <span style={{ color: 'var(--color-gold-bright)' }}>下線の用語</span>や項目はタップで開きます。
      </p>

      {/* 3ステップ図解 */}
      <div
        className="anim-reveal"
        style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', alignItems: 'stretch' }}
      >
        {steps.map((s, i) => (
          <Fragment key={s.n}>
            <div
              style={{
                flex: 1,
                border: '1px solid var(--faint)',
                background: 'var(--color-panel)',
                padding: '22px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--color-gold)', marginBottom: 8 }}>
                STEP {s.n}
              </div>
              <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 22, fontWeight: 300, letterSpacing: 4, color: 'var(--color-fg)', marginBottom: 8 }}>
                {s.t}
              </div>
              <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12, fontWeight: 300, color: 'var(--muted)', lineHeight: 1.7 }}>
                {s.d}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-gold)', fontSize: 18, padding: isNarrow ? '6px 0' : '0 12px' }}>
                {arrow}
              </div>
            )}
          </Fragment>
        ))}
      </div>

      {/* ===== 通貨えらび ===== */}
      <Head label="STEP 1 · COIN" title="通貨をえらぶ" />
      <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: 14 }}>
        <CoinCard
          sym="₿"
          name="BTC ビットコイン"
          tag="最も普及した主要通貨。持っている人が多い。"
          pros={['最も広く対応している', '知名度が高く安心']}
          cons={['確認が遅め(約10分/ブロック)', '混雑時は手数料が上がることも']}
        />
        <CoinCard
          sym="Ł"
          name="LTC ライトコイン"
          tag="ビットコインの軽量版。送金に向く。"
          pros={['確認が速い(約2.5分/ブロック)', '手数料が安定して低め']}
          cons={['BTC より知名度は低い']}
        />
      </div>
      <div style={tWrap}>
        <table style={tbl}>
          <thead>
            <tr>
              <th style={th}></th>
              <th style={th}>₿ BTC</th>
              <th style={th}>Ł LTC</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdName}>確認の速さ</td>
              <td style={td}>ふつう(約10分)</td>
              <td style={td}>速い(約2.5分)</td>
            </tr>
            <tr>
              <td style={tdName}>手数料の傾向</td>
              <td style={td}>混雑で上下する</td>
              <td style={td}>安定して低め</td>
            </tr>
            <tr>
              <td style={tdName}>uraneko で使える</td>
              <td style={td}><Mk good>◎</Mk> 使える</td>
              <td style={td}><Mk good>◎</Mk> 使える</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12, color: 'var(--dim)', fontWeight: 300, lineHeight: 1.8, margin: '4px 0 0' }}>
        どちらでも購入できます。使い慣れている方・お持ちの方で選んで大丈夫。
        ETH / USDT などのステーブルコイン等は<b style={{ color: 'var(--muted)' }}>現在未対応</b>です。
      </p>
      <Warn>
        送るときは、必ず選んだ通貨の{' '}
        <Term label="そのままのネットワーク">
          BTC は Bitcoin ネットワーク、LTC は Litecoin ネットワーク。名前が同じ通貨でも
          「BEP-20」など<b style={{ color: 'var(--color-fg)' }}>別ネットワークは別物</b>で、そちらで送ると
          届かず戻らないことがあります。
        </Term>
        {' '}で送ってください(通常は QR を読めば自動で正しく選ばれます)。
      </Warn>

      {/* ===== 買う場所と持ち方 ===== */}
      <Head label="STEP 2 · WHERE" title="買う場所と、持ち方" />
      <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: 14, marginBottom: 8 }}>
        <Card>
          <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 15, fontWeight: 300, letterSpacing: 1, color: 'var(--color-fg)', marginBottom: 6 }}>
            取引所(交換所)
          </div>
          <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12.5, color: 'var(--muted)', fontWeight: 300, lineHeight: 1.8 }}>
            円で暗号資産を<b style={{ color: 'var(--color-fg)' }}>買う</b>お店。まずここで BTC / LTC を用意します。
            <br />例:GMOコイン / Coincheck / bitFlyer / bitbank
          </div>
        </Card>
        <Card>
          <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 15, fontWeight: 300, letterSpacing: 1, color: 'var(--color-fg)', marginBottom: 6 }}>
            ウォレット(財布)
          </div>
          <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12.5, color: 'var(--muted)', fontWeight: 300, lineHeight: 1.8 }}>
            自分で暗号資産を<b style={{ color: 'var(--color-fg)' }}>持つ・送る</b>アプリ。使うと送金がスムーズ(任意)。
            <br />例:Trust Wallet(スマホ・無料)
          </div>
        </Card>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--color-gold)', margin: '18px 0 2px' }}>
        取引所くらべ
      </div>
      <div style={tWrap}>
        <table style={tbl}>
          <thead>
            <tr>
              <th style={th}>取引所</th>
              <th style={th}>特徴</th>
              <th style={th}>初心者</th>
              <th style={th}>BTC/LTC</th>
            </tr>
          </thead>
          <tbody>
            {exchanges.map((e) => (
              <tr key={e.name}>
                <td style={tdName}>{e.name}</td>
                <td style={td}>{e.feat}</td>
                <td style={td}><Mk good>{e.bg}</Mk></td>
                <td style={td}><Mk good>○</Mk></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12, color: 'var(--dim)', fontWeight: 300, lineHeight: 1.8, margin: '4px 0 0' }}>
        ◎ とても向く / ○ 向く。どこも BTC・LTC を購入でき、
        <b style={{ color: 'var(--muted)' }}>初回の送金には審査(〜30分)</b>があります(国内共通のルール)。
        手数料・条件は変わるので、最終的には各取引所の公式でご確認ください。
      </p>
      <p style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12.5, color: 'var(--muted)', fontWeight: 300, lineHeight: 1.9, margin: '10px 0 0' }}>
        ◇ もっとスムーズにしたい人へ:取引所 →{' '}
        <Term label="自分のウォレット">
          Trust Wallet などの自己管理ウォレット。自分だけが管理する財布で、取引所を介さない送金は
          氏名入力や送金審査が無く速いです。○ スムーズ・自分で管理 / △ 秘密鍵の管理は自己責任
          (無くすと復元できません)。
        </Term>
        {' '}→ uraneko、の順にすると、氏名入力も審査も避けやすくなります。
      </p>

      {/* ===== 送金の流れ ===== */}
      <Head label="STEP 3 · SEND" title="送金の流れ" />
      <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', alignItems: 'stretch' }}>
        {flow.map((f, i) => (
          <Fragment key={f.n}>
            <Flow n={f.n} title={f.title} tag={f.tag} />
            {i < flow.length - 1 && (
              <div aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-gold)', fontSize: 16, padding: isNarrow ? '5px 0' : '0 8px' }}>
                {arrow}
              </div>
            )}
          </Fragment>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 13, color: 'var(--muted)', fontWeight: 300, lineHeight: 2 }}>
          STEP2 の送付先登録では{' '}
          <Term label="プライベートウォレット / 本人">
            取引所ではない送金先は「プライベートウォレット」を選びます。保有者は
            <b style={{ color: 'var(--color-fg)' }}>「ご本人さま(自分)」</b>を選ぶと、受取人の氏名入力は不要です。
            架空の名前は入れないでください(凍結の原因になります)。
          </Term>
          {' '}を選ぶのがポイント。QR を読めば{' '}
          <Term label="宛先と数量">
            決済ページのQRには送金先アドレスと送るべき数量が入っています。読み取れば手入力の
            ミス(桁・アドレス間違い)を防げます。表示どおりの数量を送ってください。
          </Term>
          {' '}が自動で入ります。
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          padding: '12px 14px',
          border: '1px solid rgba(214,183,110,0.3)',
          background: 'rgba(184,181,172,0.05)',
          fontFamily: 'var(--font-serif-jp)',
          fontSize: 12.5,
          lineHeight: 1.9,
          color: 'var(--muted)',
          fontWeight: 300,
        }}
      >
        ◇ お使いの取引所で「受取人(第三者)情報」の登録が必要な場合は、
        <a href={CONTACT_MAILTO} style={{ color: 'var(--color-gold-bright)' }}>
          {' '}
          {CONTACT}
        </a>{' '}
        までご連絡ください。登録に必要な情報を個別にお渡しします
        <span style={{ color: 'var(--dim)' }}>(過去にやり取りのある方もどうぞ)</span>。
      </div>

      {/* ===== アプリから何をする? ===== */}
      <Head label="START HERE" title="いま、何をすればいい?" />
      <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: 14 }}>
        <Card>
          <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 14, fontWeight: 300, color: 'var(--color-gold-bright)', marginBottom: 8 }}>
            取引所アプリを持っている
          </div>
          <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12.5, color: 'var(--muted)', fontWeight: 300, lineHeight: 2 }}>
            ① BTC か LTC を買う<br />
            ② 送付先に uraneko のアドレスを登録(プライベート/本人)<br />
            ③ QR で表示どおりの数量を送る<br />
            → あとは自動で受け取り(メールも届きます)
          </div>
        </Card>
        <Card>
          <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 14, fontWeight: 300, color: 'var(--color-gold-bright)', marginBottom: 8 }}>
            まだ持っていない
          </div>
          <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12.5, color: 'var(--muted)', fontWeight: 300, lineHeight: 2 }}>
            ① 取引所アプリを入れて口座開設<br />
            <span style={{ color: 'var(--dim)' }}>(初心者は GMOコイン / Coincheck が分かりやすい)</span>
            <br />
            ② BTC か LTC を買う<br />
            ③ 左の②③と同じ手順で送る
          </div>
        </Card>
      </div>

      {/* ===== FAQ ===== */}
      <Head label="FAQ" title="よくある質問" />
      <div>
        <Accordion title="送金待ちが「時間切れ」になった">
          大丈夫です。送金先アドレスは<b style={{ color: 'var(--color-fg)' }}>約7日間有効</b>で、画面が時間切れ表示に
          なっても、着金すれば自動でお渡しします。ただし<b style={{ color: 'var(--color-fg)' }}>①そのアドレスの数量を送る
          ②二重に送らない</b>。迷ったら新しい注文の新アドレス＋新数量で1回だけ送るのが確実です。
        </Accordion>
        <Accordion title="取引所で出金が「保留 / 審査中」になる">
          取引所の初回審査(30分前後)です。当方側は正常で、コインはまだブロックチェーンに出ていないだけ。
          審査が終わって着金すれば、自動でお渡しします。
        </Accordion>
        <Accordion title="アドレスが前と変わっている">
          注文を作り直すとアドレスも数量も新しくなります。<b style={{ color: 'var(--color-fg)' }}>使うアドレスと数量はセット</b>で、
          どれか1つの注文にだけ送ってください(二重送金に注意)。
        </Accordion>
        <Accordion title="BTC で払ったのに LTC で届いた">
          ごく少額(¥2,700 未満のBTC)のときだけ、送れずに自動変換されることがあります。
          <b style={{ color: 'var(--color-fg)' }}>通常価格の購入なら、BTC はBTCのまま</b>届きます。
        </Accordion>
        <Accordion title="送金したのに反映されない">
          まず取引所の<b style={{ color: 'var(--color-fg)' }}>出金履歴</b>を確認(「保留」でないか、送金ID=txid が出ているか)。
          数時間たっても届かず不安なときは、<b style={{ color: 'var(--color-fg)' }}>注文番号</b>を添えてご連絡ください。
        </Accordion>
      </div>

      <Ornament style={{ margin: '36px 0 24px' }} />

      {/* 困ったら連絡 */}
      <div style={{ padding: '18px 20px', border: '1px solid rgba(214,183,110,0.35)', background: 'rgba(214,183,110,0.05)' }}>
        <div style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 14, fontWeight: 300, letterSpacing: 1, color: 'var(--color-gold-bright)', marginBottom: 8 }}>
          こまったら、気軽に連絡してね
        </div>
        <p style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12.5, lineHeight: 2, letterSpacing: 1, color: 'var(--muted)', fontWeight: 300, margin: 0 }}>
          わからないことは何でも大丈夫です。はじめての暗号資産でも、こちらで一緒に確認します。
          <br />
          <a href={CONTACT_MAILTO} style={{ color: 'var(--color-gold-bright)', textDecoration: 'underline' }}>
            {CONTACT}
          </a>
        </p>
      </div>
    </div>
  );
}
