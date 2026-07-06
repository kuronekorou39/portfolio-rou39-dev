import type { ReactNode } from 'react';
import SectionLabel from '../components/bar/SectionLabel';

/**
 * 法定表示ページ(特商法表記 / プライバシーポリシー / 利用規約)。
 * 【 】で囲った箇所は運営者が実データを入れるプレースホルダ。
 * 運用に依存する項目(支払い・引渡し・返品)はシステムの実挙動に合わせて記載済み。
 */

const PLACEHOLDER = 'var(--color-accent)';

function LegalShell({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <SectionLabel style={{ marginBottom: 12 }}>— {label}</SectionLabel>
      <h1
        style={{
          fontFamily: 'var(--font-serif-jp)',
          fontSize: 'clamp(24px, 6vw, 34px)',
          fontWeight: 200,
          letterSpacing: 4,
          margin: '0 0 28px',
          color: 'var(--color-fg)',
        }}
      >
        {title}
      </h1>
      <div
        style={{
          fontFamily: 'var(--font-serif-jp)',
          fontSize: 14,
          lineHeight: 2,
          color: 'var(--muted)',
          fontWeight: 300,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '180px 1fr',
  gap: 16,
  padding: '12px 0',
  borderBottom: '1px solid var(--line-soft, rgba(168,166,158,0.15))',
};
const thStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: 1,
  color: 'var(--muted)',
};
// 未記入プレースホルダ
function TODO({ children }: { children: ReactNode }) {
  return <span style={{ color: PLACEHOLDER }}>{children}</span>;
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div style={rowStyle}>
      <div style={thStyle}>{k}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}

// ---- 特定商取引法に基づく表記 ----
export function TokushohoPage() {
  return (
    <LegalShell label="LEGAL" title="特定商取引法に基づく表記">
      <p style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 20 }}>
        【 】は準備中の項目です。公開前に必ず実際の情報を記入してください。
      </p>
      <Row k="販売事業者">
        <TODO>【 事業者名(個人の場合は氏名)】</TODO>
      </Row>
      <Row k="運営統括責任者">
        <TODO>【 氏名 】</TODO>
      </Row>
      <Row k="所在地">
        <TODO>【 住所(請求があれば遅滞なく開示)】</TODO>
      </Row>
      <Row k="電話番号">
        <TODO>【 電話番号(請求があれば遅滞なく開示)】</TODO>
      </Row>
      <Row k="メールアドレス">
        <a href="mailto:contact@rou39.com" style={{ color: 'var(--color-fg)' }}>contact@rou39.com</a>
      </Row>
      <Row k="販売価格">各商品ページに税込価格で表示します。</Row>
      <Row k="商品代金以外の必要料金">
        暗号資産の送金にかかるネットワーク手数料はお客様のご負担となります(通貨・送金元により変動)。
      </Row>
      <Row k="お支払い方法">暗号資産(NOWPayments 経由。BTC / Lightning / USDT / USDC / LTC 等)。</Row>
      <Row k="お支払い時期">ご注文時に発行される請求(invoice)に従い、その場でお支払いいただきます。</Row>
      <Row k="商品の引渡時期">
        暗号資産の入金確認後、ご登録のメールアドレスへ専用ダウンロードリンクをお送りします(通常、送金確定後 数分〜数十分)。
      </Row>
      <Row k="返品・キャンセル">
        商品はダウンロード型のデジタルコンテンツです。<strong style={{ color: 'var(--color-fg)' }}>
        購入手続き完了後およびダウンロード後の返品・キャンセル・返金はお受けできません</strong>
        (返品特約)。不具合等がある場合は上記メールアドレスへご連絡ください。
      </Row>
      <Row k="動作環境">一般的なブラウザ、および mp4 動画を再生できる環境。</Row>
      <Row k="年齢制限">本サイトは成人向け(18歳以上)の商品を取り扱います。18歳未満の方はご利用いただけません。</Row>
    </LegalShell>
  );
}

// ---- プライバシーポリシー ----
export function PrivacyPage() {
  return (
    <LegalShell label="LEGAL" title="プライバシーポリシー">
      <p>
        本サイト(uraneko.rou39.com、以下「当サイト」)は、お客様の個人情報を以下の方針に基づいて取り扱います。
      </p>
      <h2 style={h2}>1. 取得する情報</h2>
      <p>
        購入時のメールアドレス、会員登録時に Google アカウント等から取得するメールアドレス・識別子、購入・支払いに関する記録(注文情報)。決済は NOWPayments が処理し、当サイトはクレジットカード番号等を保持しません。
      </p>
      <h2 style={h2}>2. 利用目的</h2>
      <p>
        商品(ダウンロードリンク)のお届け、購入履歴の提供、お問い合わせ対応、不正利用の防止、および法令の遵守のために利用します。
      </p>
      <h2 style={h2}>3. 第三者提供</h2>
      <p>
        法令に基づく場合を除き、ご本人の同意なく第三者へ提供しません。決済処理のため NOWPayments、メール送信のため Amazon SES、認証のため Google / Amazon Cognito を利用します。
      </p>
      <h2 style={h2}>4. 保管・安全管理</h2>
      <p>
        取得した情報は適切に管理し、動画には購入者を識別する不可視の識別子(透かし)を埋め込むことがあります。
      </p>
      <h2 style={h2}>5. 開示・訂正・削除</h2>
      <p>
        ご本人からの開示・訂正・削除等のご請求には、下記連絡先にて対応します。
      </p>
      <h2 style={h2}>6. お問い合わせ</h2>
      <p>
        <a href="mailto:contact@rou39.com" style={{ color: 'var(--color-fg)' }}>contact@rou39.com</a>
      </p>
      <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 24 }}>
        制定日: 2026年7月6日
      </p>
    </LegalShell>
  );
}

// ---- 利用規約 ----
export function TermsPage() {
  return (
    <LegalShell label="LEGAL" title="利用規約">
      <h2 style={h2}>第1条(適用)</h2>
      <p>本規約は、当サイトの利用・商品購入に関する一切に適用されます。</p>
      <h2 style={h2}>第2条(年齢制限)</h2>
      <p>当サイトは成人向けコンテンツを含みます。18歳未満の方は利用できません。利用者は18歳以上であることを表明したものとみなします。</p>
      <h2 style={h2}>第3条(ライセンス・禁止事項)</h2>
      <p>
        購入した動画は、購入者個人の私的視聴の範囲でのみ利用できます。
        <strong style={{ color: 'var(--color-fg)' }}>複製の再配布・公衆送信・第三者への提供・商用利用を禁止します。</strong>
        各動画には購入者を識別する情報(透かし)が埋め込まれており、流出時には購入者を特定し、法的措置を含む対応を行うことがあります。
      </p>
      <h2 style={h2}>第4条(支払い・引渡し)</h2>
      <p>支払いは暗号資産で行い、入金確認後にダウンロードリンクをメールで送付します。ダウンロードリンクは一定期間で失効します。</p>
      <h2 style={h2}>第5条(返品・返金)</h2>
      <p>デジタルコンテンツの性質上、購入完了後・ダウンロード後の返品・返金はできません(特定商取引法に基づく表記のとおり)。</p>
      <h2 style={h2}>第6条(免責)</h2>
      <p>
        当サイトは、通信環境・暗号資産の価格変動・第三者サービス(決済・メール等)に起因する損害について、法令で認められる範囲で責任を負いません。
      </p>
      <h2 style={h2}>第7条(準拠法・管轄)</h2>
      <p>本規約は日本法に準拠し、紛争は<TODO>【 管轄裁判所 】</TODO>を第一審の専属的合意管轄裁判所とします。</p>
      <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 24 }}>
        制定日: 2026年7月6日
      </p>
    </LegalShell>
  );
}

const h2: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  letterSpacing: 2,
  color: 'var(--color-gold-bright)',
  textTransform: 'uppercase',
  margin: '26px 0 6px',
  fontWeight: 500,
};
