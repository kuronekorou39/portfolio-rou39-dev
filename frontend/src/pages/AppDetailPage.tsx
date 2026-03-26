import { useParams, Link } from 'react-router-dom';

export default function AppDetailPage() {
  const { id } = useParams<{ id: string }>();

  // TODO: APIから取得に置き換え
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <Link
        to="/apps"
        className="mb-8 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:hover:text-gray-100"
      >
        ← Back to Apps
      </Link>

      <div className="mt-4">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">{id}</h1>
        <p className="mb-8 text-gray-500 dark:text-gray-400">
          プロダクト詳細ページ（API接続後にデータが表示されます）
        </p>

        {/* Description */}
        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-semibold">About</h2>
          <div className="rounded-xl border border-gray-200 p-6 dark:border-gray-800">
            <p className="text-gray-500">説明文がここに表示されます</p>
          </div>
        </section>

        {/* How to Use */}
        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-semibold">How to Use</h2>
          <div className="rounded-xl border border-gray-200 p-6 dark:border-gray-800">
            <p className="text-gray-500">使い方がここに表示されます</p>
          </div>
        </section>

        {/* Reviews */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold">Reviews</h2>
          <div className="rounded-xl border border-gray-200 p-6 dark:border-gray-800">
            <p className="text-gray-500">レビューがここに表示されます</p>
          </div>
        </section>
      </div>
    </div>
  );
}
