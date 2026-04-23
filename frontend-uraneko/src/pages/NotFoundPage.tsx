import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="text-center">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="mt-2 text-neutral-400">ページが見つかりません。</p>
      <Link to="/" className="mt-4 inline-block text-sm underline">
        トップへ戻る
      </Link>
    </div>
  );
}
