import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

const h2: CSSProperties = { fontSize: 16, marginTop: 28, marginBottom: 8 };
const p: CSSProperties = { fontSize: 14, margin: '0 0 8px', color: 'var(--fg)' };
const li: CSSProperties = { fontSize: 14, margin: '0 0 6px' };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 64px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>プライバシーポリシー</h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
        Stash Notes(以下「本サービス」)の運営者(以下「運営者」)は、利用者の情報を以下の方針で取り扱います。
      </p>

      <h2 style={h2}>1. 収集する情報</h2>
      <ul style={{ paddingLeft: 20, margin: 0 }}>
        <li style={li}>
          <b>アカウント情報</b> — Google ログインにより、メールアドレスとアカウント識別子を取得します。パスワードは取得しません。
        </li>
        <li style={li}>
          <b>メモの内容</b> — 利用者が保存したメモのタイトル・本文。
        </li>
        <li style={li}>
          <b>アクセス記録</b> — メモの秘密URLへのアクセス日時・IPアドレス・ブラウザ情報(User-Agent)。
        </li>
        <li style={li}>
          <b>技術情報</b> — サービス提供・不正利用対策のためのサーバーログ。
        </li>
      </ul>

      <h2 style={h2}>2. 利用目的</h2>
      <ul style={{ paddingLeft: 20, margin: 0 }}>
        <li style={li}>本サービスの提供(メモの保存・表示・同期)</li>
        <li style={li}>
          アクセス履歴機能の提供(メモを「いつ・どこから開いたか」を、そのメモの発行者と閲覧者が確認できる機能)
        </li>
        <li style={li}>不正利用の防止・調査、障害対応</li>
      </ul>

      <h2 style={h2}>3. アクセス記録の保存期間</h2>
      <p style={p}>アクセス記録は 90 日間で自動的に削除されます。</p>

      <h2 style={h2}>4. メモ内容の取り扱い</h2>
      <p style={p}>
        メモは通信時・保存時に暗号化されますが、エンドツーエンド暗号化ではないため、システム上は運営者がメモ内容にアクセスできる状態にあります。運営者は、法令に基づく場合や不正利用の調査に必要な場合を除き、メモ内容を閲覧しません。
      </p>
      <p style={p}>
        パスワードやクレジットカード番号など、機密性の高い情報の保存はお控えください。
      </p>

      <h2 style={h2}>5. Cookie 等の利用</h2>
      <p style={p}>
        ログイン状態の維持と、未送信の編集内容の一時保存のために、ブラウザのストレージ(localStorage / sessionStorage)を使用します。広告目的の Cookie・トラッキングは使用しません。
      </p>

      <h2 style={h2}>6. 第三者提供・外部サービス</h2>
      <p style={p}>
        法令に基づく場合を除き、収集した情報を第三者に提供しません。本サービスは Amazon Web Services(東京リージョン)と Google(ログイン認証)を利用しており、情報はこれらの事業者のインフラ上で処理されます。
      </p>

      <h2 style={h2}>7. アクセス履歴の表示について</h2>
      <p style={p}>
        秘密URLを知る全ての人が、そのメモのアクセス履歴(日時・IPアドレス・ブラウザ情報)を閲覧できます。この仕様をご理解のうえご利用ください。
      </p>

      <h2 style={h2}>8. 削除</h2>
      <p style={p}>
        メモは管理画面からいつでも削除できます。アカウントの削除を希望される場合は、下記連絡先までご連絡ください。
      </p>

      <h2 style={h2}>9. 改定</h2>
      <p style={p}>本ポリシーは必要に応じて改定されます。重要な変更は本ページで告知します。</p>

      <h2 style={h2}>10. 連絡先</h2>
      <p style={p}>contact@rou39.com</p>

      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 28 }}>制定日: 2026年7月19日</p>

      <p style={{ marginTop: 32 }}>
        <Link to="/" style={{ fontSize: 14 }}>
          ← トップへ戻る
        </Link>
      </p>
    </main>
  );
}
