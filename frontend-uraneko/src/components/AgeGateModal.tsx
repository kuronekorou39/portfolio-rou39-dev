import { useAgeGate } from '../contexts/AgeGateContext';

export default function AgeGateModal() {
  const { confirmed, confirm, deny } = useAgeGate();
  if (confirmed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-lg border border-white/10 bg-neutral-900 p-6 text-center">
        <h2 className="mb-4 text-xl font-bold">年齢確認</h2>
        <p className="mb-6 text-sm text-neutral-300">
          このサイトはアダルトコンテンツを含みます。<br />
          閲覧には 18 歳以上であることが必要です。
        </p>
        <p className="mb-6 text-xs text-neutral-500">
          あなたは 18 歳以上ですか?
        </p>
        <div className="flex gap-3">
          <button
            onClick={deny}
            className="flex-1 rounded-md border border-white/10 bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
          >
            いいえ(退出)
          </button>
          <button
            onClick={confirm}
            className="flex-1 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            はい、18 歳以上です
          </button>
        </div>
      </div>
    </div>
  );
}
