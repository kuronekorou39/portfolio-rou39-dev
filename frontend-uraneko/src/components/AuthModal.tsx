import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  beginGoogleLogin,
  signIn,
  signUp,
  confirmSignUp,
  resendConfirmationCode,
  forgotPassword,
  confirmForgotPassword,
} from '../lib/auth';

type Mode = 'login' | 'signup' | 'confirm' | 'forgot' | 'reset';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const label: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 2,
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 6,
};
const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--color-deep)',
  border: '1px solid rgba(168,166,158,0.3)',
  color: 'var(--color-fg)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  padding: '10px 12px',
  outline: 'none',
  borderRadius: 0,
};
const linkBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 1,
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
};

export default function AuthModal({
  isOpen,
  onClose,
  googleReturnTo,
}: {
  isOpen: boolean;
  onClose: () => void;
  googleReturnTo?: string;
}) {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode !== 'confirm' && mode !== 'reset') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose, mode]);

  if (!isOpen) return null;

  const wrap = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await fn();
    } catch (e2) {
      setErr(e2 instanceof Error ? friendly(e2.message) : 'エラーが発生しました');
    } finally {
      setBusy(false);
    }
  };

  const doLogin = wrap(async () => {
    await signIn(email, password);
    await refresh();
    onClose();
  });
  const doSignup = wrap(async () => {
    await signUp(email, password);
    setMode('confirm');
  });
  const doConfirm = wrap(async () => {
    await confirmSignUp(email, code);
    await signIn(email, password);
    await refresh();
    onClose();
  });
  const doForgot = wrap(async () => {
    await forgotPassword(email);
    setMode('reset');
  });
  const doReset = wrap(async () => {
    await confirmForgotPassword(email, code, password);
    setMode('login');
    setCode('');
  });

  const title =
    mode === 'login'
      ? 'ログイン'
      : mode === 'signup'
      ? '新規登録'
      : mode === 'confirm'
      ? 'メール確認'
      : mode === 'forgot'
      ? 'パスワード再設定'
      : '新しいパスワード';

  const GoogleBtn = () => (
    <button
      type="button"
      onClick={() => void beginGoogleLogin(googleReturnTo)}
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: '#fff',
        color: '#3c4043',
        border: 'none',
        padding: '11px 14px',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        borderRadius: 0,
      }}
    >
      <GoogleIcon /> Google で続ける
    </button>
  );

  const Divider = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
      <div style={{ height: 1, flex: 1, background: 'rgba(168,166,158,0.2)' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--dim)' }}>または</span>
      <div style={{ height: 1, flex: 1, background: 'rgba(168,166,158,0.2)' }} />
    </div>
  );

  const submitBtn = (text: string) => (
    <button
      type="submit"
      disabled={busy}
      style={{
        width: '100%',
        background: 'var(--color-gold-bright)',
        color: 'var(--color-deep)',
        border: 'none',
        padding: '11px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        letterSpacing: 2,
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.5 : 1,
        borderRadius: 0,
      }}
    >
      {busy ? '処理中…' : text}
    </button>
  );

  return createPortal(
    <div
      className="lb-backdrop"
      onClick={mode === 'confirm' || mode === 'reset' ? undefined : onClose}
    >
      <div
        className="anim-soft"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(400px, 94vw)',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'var(--color-panel)',
          border: '1px solid rgba(168,166,158,0.4)',
          padding: '30px 28px',
        }}
      >
        <button
          onClick={onClose}
          aria-label="閉じる"
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            background: 'transparent',
            border: 'none',
            color: 'var(--dim)',
            fontSize: 18,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>

        <div
          style={{
            fontFamily: 'var(--font-serif-jp)',
            fontSize: 22,
            fontWeight: 300,
            letterSpacing: 4,
            color: 'var(--color-fg)',
            marginBottom: 6,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 2,
            color: 'var(--dim)',
            marginBottom: 22,
          }}
        >
          uraneko の購入・受け取りにはログインが必要です
        </div>

        {err && (
          <div
            style={{
              border: '1px solid rgba(168,67,63,0.5)',
              background: 'rgba(168,67,63,0.12)',
              color: 'var(--color-accent)',
              fontFamily: 'var(--font-serif-jp)',
              fontSize: 12,
              padding: '8px 12px',
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            {err}
          </div>
        )}

        {mode === 'login' && (
          <>
            <GoogleBtn />
            <Divider />
            <form onSubmit={doLogin}>
              <label style={label}>メールアドレス</label>
              <input
                style={input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label style={{ ...label, marginTop: 14 }}>パスワード</label>
              <input
                style={input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div style={{ marginTop: 18 }}>{submitBtn('メールでログイン')}</div>
            </form>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button type="button" style={linkBtn} onClick={() => { setMode('forgot'); setErr(''); }}>
                パスワードを忘れた
              </button>
              <button type="button" style={linkBtn} onClick={() => { setMode('signup'); setErr(''); }}>
                新規登録
              </button>
            </div>
          </>
        )}

        {mode === 'signup' && (
          <>
            <GoogleBtn />
            <Divider />
            <form onSubmit={doSignup}>
              <label style={label}>メールアドレス</label>
              <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <label style={{ ...label, marginTop: 14 }}>パスワード(8文字以上・大小英字・数字)</label>
              <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <div style={{ marginTop: 18 }}>{submitBtn('メールで登録')}</div>
            </form>
            <p style={{ marginTop: 16, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
              アカウントをお持ちですか?{' '}
              <button type="button" style={linkBtn} onClick={() => { setMode('login'); setErr(''); }}>
                ログイン
              </button>
            </p>
          </>
        )}

        {mode === 'confirm' && (
          <form onSubmit={doConfirm}>
            <p style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.8, marginTop: 0 }}>
              <span style={{ color: 'var(--color-fg)' }}>{email}</span> に確認コードを送りました。
              メールに記載の6桁コードを入力してください(迷惑メールもご確認ください)。
            </p>
            <label style={label}>確認コード</label>
            <input style={input} type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
            <div style={{ marginTop: 18 }}>{submitBtn('確認して登録完了')}</div>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button
                type="button"
                style={linkBtn}
                onClick={() => { setErr(''); resendConfirmationCode(email).catch(() => {}); }}
              >
                コードを再送する
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={doForgot}>
            <p style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12, color: 'var(--muted)', marginTop: 0 }}>
              登録済みのメールアドレスに再設定コードを送ります。
            </p>
            <label style={label}>メールアドレス</label>
            <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <div style={{ marginTop: 18 }}>{submitBtn('再設定コードを送る')}</div>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" style={linkBtn} onClick={() => { setMode('login'); setErr(''); }}>
                ログインに戻る
              </button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={doReset}>
            <p style={{ fontFamily: 'var(--font-serif-jp)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.8, marginTop: 0 }}>
              <span style={{ color: 'var(--color-fg)' }}>{email}</span> にコードを送りました。
            </p>
            <label style={label}>確認コード</label>
            <input style={input} type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
            <label style={{ ...label, marginTop: 14 }}>新しいパスワード(8文字以上・大小英字・数字)</label>
            <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <div style={{ marginTop: 18 }}>{submitBtn('パスワードを再設定')}</div>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" style={linkBtn} onClick={() => { setMode('login'); setErr(''); setCode(''); }}>
                ログインに戻る
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Cognito のエラーメッセージを日本語に寄せる(主要どころだけ)
function friendly(msg: string): string {
  if (/UsernameExistsException|already exists/i.test(msg)) return 'このメールアドレスは登録済みです。ログインしてください。';
  if (/NotAuthorizedException|Incorrect username or password/i.test(msg)) return 'メールアドレスかパスワードが違います。';
  if (/UserNotConfirmedException/i.test(msg)) return 'メール確認が未完了です。登録時のコードで確認してください。';
  if (/CodeMismatchException|Invalid.*code/i.test(msg)) return '確認コードが違います。';
  if (/ExpiredCodeException/i.test(msg)) return 'コードの有効期限が切れています。再送してください。';
  if (/InvalidPasswordException|password/i.test(msg)) return 'パスワードは8文字以上で、大文字・小文字・数字を含めてください。';
  if (/UserNotFoundException/i.test(msg)) return 'アカウントが見つかりません。';
  if (/LimitExceededException|Attempt limit/i.test(msg)) return '試行回数が多すぎます。しばらくおいて再試行してください。';
  return msg;
}
