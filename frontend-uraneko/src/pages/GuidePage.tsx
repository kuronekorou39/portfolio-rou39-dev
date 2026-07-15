import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import SectionLabel from '../components/bar/SectionLabel';
import Ornament from '../components/bar/Ornament';
import { useIsNarrow } from '../lib/useIsNarrow';

/**
 * はじめての送金ガイド。ぱっと見はシンプルな3ステップ図解にとどめ、
 * 詳細は用語クリック(Term)とアコーディオン(Accordion)で「必要な人にだけ」出す。
 * 個人情報はページに一切書かない(第三者登録が要る人は contact 経由で個別対応=案B)。
 */

const CONTACT = 'contact@rou39.com';
const CONTACT_MAILTO =
  'mailto:' + CONTACT + '?subject=' + encodeURIComponent('uraneko 送金について');

// --- 用語: クリックで定義を展開(少しずつ見せる) ---
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

// --- アコーディオン ---
function Accordion({
  n,
  title,
  sub,
  children,
  defaultOpen = false,
}: {
  n?: string;
  title: string;
  sub?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
          gap: 16,
          padding: '18px 4px',
          textAlign: 'left',
        }}
      >
        {n && (
          <span
            style={{
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 22,
              fontWeight: 200,
              color: 'var(--color-gold-bright)',
              minWidth: 22,
            }}
          >
            {n}
          </span>
        )}
        <span style={{ flex: 1 }}>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 16,
              fontWeight: 300,
              letterSpacing: 2,
              color: 'var(--color-fg)',
            }}
          >
            {title}
          </span>
          {sub && (
            <span
              style={{
                display: 'block',
                marginTop: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 2,
                color: 'var(--dim)',
              }}
            >
              {sub}
            </span>
          )}
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
            padding: '0 4px 24px',
            fontFamily: 'var(--font-serif-jp)',
            fontSize: 14,
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

function Tip({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: '14px 0',
        padding: '12px 14px',
        border: '1px solid rgba(214,183,110,0.3)',
        background: 'rgba(184,181,172,0.05)',
        fontSize: 13,
        lineHeight: 1.9,
        color: 'var(--color-fg)',
      }}
    >
      ◇ {children}
    </div>
  );
}

export default function GuidePage() {
  const isNarrow = useIsNarrow();
  const steps = [
    { n: '1', t: '買う', d: '取引所で BTC / LTC を用意' },
    { n: '2', t: '送る', d: '表示されたアドレスへ送金' },
    { n: '3', t: '受け取る', d: '自動でダウンロード＋メール' },
  ];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
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
          margin: '0 0 32px',
        }}
      >
        暗号資産(BTC / LTC)での支払いを、はじめての方にもわかるように。基本は
        <b style={{ color: 'var(--color-fg)' }}>3ステップ</b>だけ。詳しく知りたい所は、
        <span style={{ color: 'var(--color-gold-bright)' }}>下線の用語</span>や項目をタップすると開きます。
      </p>

      {/* 3ステップ図解(ぱっと見はここだけで伝わる) */}
      <div
        className="anim-reveal"
        style={{
          display: 'flex',
          flexDirection: isNarrow ? 'column' : 'row',
          alignItems: 'stretch',
          marginBottom: 44,
        }}
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
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 3,
                  color: 'var(--color-gold)',
                  marginBottom: 8,
                }}
              >
                STEP {s.n}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 22,
                  fontWeight: 300,
                  letterSpacing: 4,
                  color: 'var(--color-fg)',
                  marginBottom: 8,
                }}
              >
                {s.t}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-serif-jp)',
                  fontSize: 12,
                  fontWeight: 300,
                  letterSpacing: 1,
                  color: 'var(--muted)',
                  lineHeight: 1.7,
                }}
              >
                {s.d}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                aria-hidden
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-gold)',
                  fontSize: 18,
                  padding: isNarrow ? '6px 0' : '0 12px',
                }}
              >
                {isNarrow ? '↓' : '→'}
              </div>
            )}
          </Fragment>
        ))}
      </div>

      {/* 詳しく(アコーディオン) */}
      <SectionLabel style={{ marginBottom: 4 }}>— 手順を詳しく</SectionLabel>
      <div style={{ marginBottom: 40 }}>
        <Accordion n="1" title="通貨をえらぶ" sub="BTC / LTC が使えます" defaultOpen>
          <div>
            <b style={{ color: 'var(--color-fg)' }}>BTC(ビットコイン)</b>と{' '}
            <b style={{ color: 'var(--color-fg)' }}>LTC(ライトコイン)</b>、どちらでも購入できます。
            BTC は最も広く使われている主要通貨、LTC は確認が数分と速く手数料も安定しています。
            使い慣れている方・お持ちの方で選んで大丈夫です。
          </div>
          <div style={{ marginTop: 8 }}>
            <Term label="手数料は取引所しだい">
              送金手数料は主に取引所の「出金手数料」で決まり、通貨よりも取引所ごとの差が大きいです。無料の
              取引所なら BTC / LTC ともほぼ無料。ただし BTC の出金手数料を高めに設定している取引所もあるので、
              送る前に確認しておくと安心です。
            </Term>
          </div>
          <Warn>
            送るときは、必ず選んだ通貨の{' '}
            <Term label="そのままのネットワーク">
              LTC は Litecoin ネットワーク、BTC は Bitcoin ネットワーク。名前が同じ “LTC” でも
              「BEP-20」など<b style={{ color: 'var(--color-fg)' }}>別ネットワークのコインは別物</b>で、
              そちらで送ると届かず、戻ってこないことがあります。
            </Term>
            {' '}で送ってください。
          </Warn>
        </Accordion>

        <Accordion n="2" title="買う(取引所)" sub="国内取引所で BTC / LTC を購入">
          <div>
            国内の取引所(GMOコイン / bitFlyer / Coincheck / bitbank など)で BTC または LTC を買います。
            どこでも大丈夫ですが、送金まわりの手軽さには差があります。
          </div>
          <Warn>
            国内取引所は、初めての送金時に{' '}
            <Term label="送金審査">
              取引所が新しい送金先を初めて登録するときに行う確認。30分前後かかることがあります。
              この間、購入ページが「時間切れ」になっても大丈夫です(下の FAQ 参照)。
            </Term>
            や{' '}
            <Term label="受取人情報の入力">
              誰に送るかの申告を求められること。これは{' '}
              <Term label="トラベルルール">
                送金の透明性のための国内規制。国内取引所が受取人情報などを求める理由です。
              </Term>
              によるものです。<b style={{ color: 'var(--color-fg)' }}>架空の名前は入れないでください</b>
              (凍結の原因になります)。回避策は STEP3 に。
            </Term>
            {' '}を求められることがあります。
          </Warn>
          <Tip>
            もっとスムーズにしたい方は「取引所 → 自分のウォレット → uraneko」の順が、審査も氏名入力も
            避けやすくおすすめです(STEP3 参照)。
          </Tip>
        </Accordion>

        <Accordion n="3" title="送る" sub="アドレスへ正確な数量を">
          <div style={{ marginBottom: 6, color: 'var(--color-fg)' }}>■ 基本のやり方</div>
          <div>
            取引所で送金先を登録するとき、{' '}
            <Term label="プライベートウォレット">
              取引所ではない送金先の総称。uraneko の送金先アドレスはこれにあたります。取引所の一覧に
              uraneko は載っていないので、この区分を選びます。
            </Term>
            {' '}→ 保有者を <b style={{ color: 'var(--color-fg)' }}>「ご本人さま(自分)」</b>で登録すると、
            受取人の氏名入力は不要になります。あとは{' '}
            <Term label="表示された正確な数量">
              決済ページにアドレスと一緒に出ている数量ぴったり。多くても少なくてもトラブルの元です。
              QR を読み取れば数量まで自動で入ります。
            </Term>
            {' '}を、QR を読み取って送るのが一番安全です。
          </div>

          <div style={{ margin: '18px 0 6px', color: 'var(--color-fg)' }}>■ もっとスムーズに</div>
          <div>
            取引所 → 自分の{' '}
            <Term label="自己管理ウォレット">
              自分だけが管理するウォレット(スマホアプリ等)。取引所を介さない送金は、氏名入力や
              送金審査が無く、届くのも速いです。
            </Term>
            {' '}→ uraneko、の順に送ると、氏名も審査も避けやすくおすすめです。
          </div>

          <div style={{ margin: '18px 0 6px', color: 'var(--color-fg)' }}>■ 受取人情報の登録が必要な方へ</div>
          <div>
            お使いの取引所で、どうしても「受取人(第三者)情報」の登録が必要な場合は、
            <a href={CONTACT_MAILTO} style={{ color: 'var(--color-gold-bright)' }}>
              {' '}
              {CONTACT}
            </a>{' '}
            までご連絡ください。登録に必要な情報を個別にお渡しします。
            <span style={{ color: 'var(--dim)' }}>(過去にやり取りのある方も、そのままどうぞ)</span>
          </div>
        </Accordion>

        <Accordion n="✓" title="受け取る" sub="自動でダウンロード＋メール">
          <div>
            送金が検知されると、<b style={{ color: 'var(--color-fg)' }}>すぐにダウンロード可能</b>になります
            (最終確認を待つ必要はありません)。ご登録のメールにもリンクが届くので、
            <b style={{ color: 'var(--color-fg)' }}>画面は閉じてしまって大丈夫</b>です。
          </div>
        </Accordion>
      </div>

      {/* FAQ */}
      <SectionLabel style={{ marginBottom: 4 }}>— よくある質問</SectionLabel>
      <div style={{ marginBottom: 40 }}>
        <Accordion title="送金待ちが「時間切れ」になった">
          <div>
            大丈夫です。送金先アドレスは<b style={{ color: 'var(--color-fg)' }}>約7日間有効</b>で、
            画面が時間切れ表示になっても、着金すれば自動でお渡しします。ただし
            <b style={{ color: 'var(--color-fg)' }}>①そのアドレスに表示された数量を送る ②二重に送らない</b>
            の2点だけ守ってください。迷ったら、新しく開いた注文の新アドレス＋新数量で1回だけ送るのが確実です。
          </div>
        </Accordion>
        <Accordion title="取引所で出金が「保留 / 審査中」になる">
          <div>
            取引所の初回審査(30分前後)です。当方側は正常で、あなたのコインはまだブロックチェーンに
            出ていないだけ。審査が終わって着金すれば、自動でお渡しします。
          </div>
        </Accordion>
        <Accordion title="アドレスが前と変わっている">
          <div>
            注文を作り直すと、アドレスも数量も新しくなります。
            <b style={{ color: 'var(--color-fg)' }}>使うアドレスと数量はセット</b>で扱い、
            どれか1つの注文にだけ送ってください(二重送金に注意)。
          </div>
        </Accordion>
        <Accordion title="BTC で払ったのに LTC で届いた">
          <div>
            ごく少額(¥2,700 未満のBTC)のときだけ、送れずに自動変換されることがあります。
            <b style={{ color: 'var(--color-fg)' }}>通常価格の購入なら、BTC はBTCのまま</b>届きます。
          </div>
        </Accordion>
        <Accordion title="送金したのに反映されない">
          <div>
            まず取引所の<b style={{ color: 'var(--color-fg)' }}>出金履歴</b>を確認してください
            (「保留」になっていないか、送金ID=txid が出ているか)。数時間たっても届かず不安なときは、
            <b style={{ color: 'var(--color-fg)' }}>注文番号</b>を添えてご連絡ください。
          </div>
        </Accordion>
      </div>

      <Ornament style={{ margin: '8px 0 28px' }} />

      {/* 困ったら連絡 */}
      <div
        style={{
          padding: '18px 20px',
          border: '1px solid rgba(214,183,110,0.35)',
          background: 'rgba(214,183,110,0.05)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-serif-jp)',
            fontSize: 14,
            fontWeight: 300,
            letterSpacing: 1,
            color: 'var(--color-gold-bright)',
            marginBottom: 8,
          }}
        >
          こまったら、気軽に連絡してね
        </div>
        <p
          style={{
            fontFamily: 'var(--font-serif-jp)',
            fontSize: 12.5,
            lineHeight: 2,
            letterSpacing: 1,
            color: 'var(--muted)',
            fontWeight: 300,
            margin: 0,
          }}
        >
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
