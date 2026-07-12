/**
 * 読み込み中の表示。コールド・アーカイブ調に合わせ、走査線(scan-track)+
 * 点滅ドットで「記録を読み出している」印象の動きを出す。
 */
export default function Loading({
  label = '読み込み中',
  pad = '60px 0',
}: {
  label?: string;
  pad?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        padding: pad,
      }}
    >
      <div className="scan-track" style={{ width: 200 }} />
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 3,
          color: 'var(--muted)',
        }}
      >
        {label}
        <span className="load-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
