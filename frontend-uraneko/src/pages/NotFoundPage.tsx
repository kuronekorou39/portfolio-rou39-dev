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
        迷い子
      </h1>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 14,
          letterSpacing: 3,
          color: 'var(--muted)',
          marginTop: 8,
        }}
      >
        A page that is not here.
      </div>
      <Ornament mark="✦" style={{ margin: '36px auto', maxWidth: 280 }} />
      <Link to="/" style={{ textDecoration: 'none' }}>
        <BarButton variant="outline">← 入口へ戻る</BarButton>
      </Link>
    </div>
  );
}
