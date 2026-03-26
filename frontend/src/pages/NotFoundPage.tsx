import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
      <h1 className="mb-4 text-6xl font-bold">404</h1>
      <p className="mb-8 text-gray-500 dark:text-gray-400">
        ページが見つかりませんでした
      </p>
      <Link
        to="/"
        className="rounded-full bg-gray-900 px-6 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-900"
      >
        Home
      </Link>
    </div>
  );
}
