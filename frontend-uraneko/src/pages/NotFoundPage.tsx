import { Link } from 'react-router-dom';
import Ornament from '../components/bar/Ornament';
import SectionLabel from '../components/bar/SectionLabel';
import BarButton from '../components/bar/BarButton';

export default function NotFoundPage() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0' }}>
      <SectionLabel style={{ marginBottom: 24 }}>— 404 · NOT FOUND</SectionLabel>
      <h1
        style={{
          fontFamily: 'var(--font-serif-jp)',
          fontSize: 'clamp(44px, 15vw, 72px)',
          fontWeight: 200,
          letterSpacing: 10,
          color: 'var(--color-gold)',
          margin: 0,
        }}
      >
        該当なし
      </h1>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: 3,
          color: 'var(--muted)',
          marginTop: 8,
        }}
      >
        nothing here.
      </div>
      <Ornament style={{ margin: '36px auto', maxWidth: 280 }} />
      <Link to="/" style={{ textDecoration: 'none' }}>
        <BarButton variant="outline">← INDEX に戻る</BarButton>
      </Link>
    </div>
  );
}
