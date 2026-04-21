import { motion } from 'framer-motion';

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="mb-8 text-3xl font-black tracking-tight text-white">
          Privacy Policy
        </h1>

        <div className="space-y-8 text-sm leading-relaxed text-white/50">
          <p>
            このサイト（rou39.com）では、以下の情報を取得・保存しています。
            難しいことは書きません。何を集めて、何に使っているかだけ説明します。
          </p>

          <section>
            <h2 className="mb-2 text-base font-bold text-white/80">アカウント登録</h2>
            <p>
              レビューやコメントの投稿にはアカウント登録が必要です。
              メールアドレス（またはGoogleアカウント連携）で登録でき、AWS Cognitoで安全に管理しています。
              メールアドレスは認証目的でのみ使用し、広告やスパムメールには使いません。
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white/80">お問い合わせフォーム</h2>
            <p>
              Contact ページから送信された内容（お名前、メールアドレス、メッセージ）は、
              返信とやり取りのためにDynamoDBに保存しています。
              送信元のIPアドレスもスパム対策目的で一時的に記録しています。
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white/80">アクセス情報</h2>
            <p>
              各アプリページの閲覧数とダウンロード数をカウントしています。
              個人を特定できる情報は含まれません。Google Analytics等の外部トラッキングツールは使っていません。
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white/80">Cookie</h2>
            <p>
              ログインセッションの維持にCookieを使用しています。
              広告やトラッキング目的のCookieは一切使っていません。
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white/80">第三者への提供</h2>
            <p>
              収集した情報を第三者に販売・提供することはありません。
              法令に基づく開示請求があった場合を除きます。
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white/80">お問い合わせ</h2>
            <p>
              プライバシーに関するご質問は{' '}
              <a href="/contact" className="text-white/70 underline underline-offset-2 transition-colors hover:text-white">
                Contact
              </a>
              {' '}ページからどうぞ。
            </p>
          </section>

          <p className="text-xs text-white/25">
            最終更新: 2026年4月21日
          </p>
        </div>
      </motion.div>
    </div>
  );
}
