import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

const h2: CSSProperties = { fontSize: 16, marginTop: 28, marginBottom: 8 };
const p: CSSProperties = { fontSize: 14, margin: '0 0 8px', color: 'var(--fg)' };
const li: CSSProperties = { fontSize: 14, margin: '0 0 6px' };

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 64px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>利用規約</h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
        Stash Notes(以下「本サービス」)の利用条件を定めます。本サービスを利用した時点で、本規約に同意したものとみなします。
      </p>

      <h2 style={h2}>第1条(サービス内容)</h2>
      <p style={p}>
        本サービスは、作成したメモを「秘密URL」を通じて共有できるメモサービスです。メモの閲覧・編集はURLを知っていれば可能で、管理(発行・無効化等)には Google ログインが必要です。無償で提供されます。
      </p>

      <h2 style={h2}>第2条(秘密URLの取り扱い)</h2>
      <p style={p}>
        秘密URLを知る者は、そのメモを閲覧・編集(編集用URLの場合)できます。URLの管理は利用者の責任で行ってください。URLが漏れた場合は、管理画面から再発行・無効化・有効期限の設定・PINの設定を行えます。
      </p>

      <h2 style={h2}>第3条(禁止事項)</h2>
      <p style={p}>本サービスの利用にあたり、次の行為を禁止します。</p>
      <ul style={{ paddingLeft: 20, margin: 0 }}>
        <li style={li}>法令または公序良俗に違反する内容の保存・共有</li>
        <li style={li}>第三者の権利(著作権・プライバシー・名誉等)を侵害する行為</li>
        <li style={li}>他人の個人情報・機密情報を、権限なく保存・公開する行為</li>
        <li style={li}>フィッシング、マルウェア配布、詐欺その他の不正・迷惑行為</li>
        <li style={li}>本サービスの運営を妨げる行為(過度な自動アクセス・不正アクセス等)</li>
      </ul>
      <p style={p}>
        運営者は、禁止事項に該当すると判断したメモの削除、URLの無効化、アカウントの利用停止を、事前の通知なく行うことがあります。
      </p>

      <h2 style={h2}>第4条(データの取り扱い・消去)</h2>
      <p style={p}>
        本サービスはエンドツーエンド暗号化ではないため、システム上は運営者がメモ内容にアクセスできる状態にあります(詳細は
        <Link to="/privacy" style={{ color: 'var(--accent)' }}>プライバシーポリシー</Link>
        をご覧ください)。メモは、利用者によるURLの無効化・有効期限の経過・削除操作により閲覧できなくなります。運営者はデータのバックアップや保存を保証しません。消えて困るデータは、利用者ご自身でも控えを保管してください。
      </p>

      <h2 style={h2}>第5条(免責)</h2>
      <p style={p}>
        運営者は、本サービスの利用または利用不能に起因して利用者または第三者に生じた損害(データの消失・漏洩、通信環境や第三者サービス(Amazon Web Services・Google 等)に起因する不具合、サービスの中断・終了によるものを含む)について、法令で認められる範囲で一切の責任を負いません。本サービスは現状有姿で提供され、特定目的への適合性等を保証しません。
      </p>

      <h2 style={h2}>第6条(サービスの変更・終了)</h2>
      <p style={p}>
        運営者は、本サービスの内容を変更し、または提供を中断・終了することがあります。終了する場合は、可能な範囲で本ページ等により事前に告知します。
      </p>

      <h2 style={h2}>第7条(規約の変更)</h2>
      <p style={p}>本規約は必要に応じて変更されます。重要な変更は本ページで告知します。</p>

      <h2 style={h2}>第8条(準拠法・管轄)</h2>
      <p style={p}>
        本規約は日本法に準拠します。本サービスに関して紛争が生じた場合は、運営者の住所地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とします。
      </p>

      <h2 style={h2}>第9条(連絡先)</h2>
      <p style={p}>contact@rou39.com</p>

      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 28 }}>制定日: 2026年7月21日</p>

      <p style={{ marginTop: 32 }}>
        <Link to="/" style={{ fontSize: 14 }}>
          ← トップへ戻る
        </Link>
      </p>
    </main>
  );
}
