import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { getGoogleLoginUrl, forgotPassword, confirmForgotPassword } from '@/lib/auth';

type Mode = 'login' | 'signup' | 'confirm' | 'forgot' | 'reset';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const EyeOpen = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);

const EyeClosed = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp, confirmSignUp } = useAuth();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('login');
      setError('');
      setPassword('');
      setCode('');
      setShowPassword(false);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signUp(email, password);
      setMode('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await confirmSignUp(email, code);
      await signIn(email, password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setMode('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await confirmForgotPassword(email, code, password);
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-colors focus:border-white/30';
  const btnClass =
    'w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100';

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
    >
      {showPassword ? <EyeOpen /> : <EyeClosed />}
    </button>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative z-10 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0a0a0f] p-8"
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 30, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.2 }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-white/20 transition-colors hover:text-white/50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <h2 className="mb-6 text-center text-2xl font-black tracking-tight text-white">
              {mode === 'login' && 'Login'}
              {mode === 'signup' && 'Sign Up'}
              {mode === 'confirm' && 'Verify Email'}
              {mode === 'forgot' && 'Forgot Password'}
              {mode === 'reset' && 'Reset Password'}
            </h2>

            {/* Error */}
            <div className={`mb-4 rounded-lg border px-4 py-2.5 text-xs transition-opacity ${
              error
                ? 'border-red-500/20 bg-red-500/10 text-red-400 opacity-100'
                : 'border-transparent opacity-0'
            }`}>
              {error || '\u00A0'}
            </div>

            {/* ═══ LOGIN ═══ */}
            {mode === 'login' && (
              <>
                {/* Google first */}
                <a
                  href={getGoogleLoginUrl()}
                  className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-transform hover:scale-[1.02]"
                >
                  <GoogleIcon />
                  Continue with Google
                </a>

                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs text-white/20">or</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <form onSubmit={handleLogin} className="space-y-3">
                  <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required />
                    {passwordToggle}
                  </div>
                  <button type="submit" disabled={submitting} className={`${btnClass} !bg-white/10 !text-white hover:!bg-white/20`}>
                    {submitting ? 'Logging in...' : 'Login with Email'}
                  </button>
                </form>

                <div className="mt-4 flex items-center justify-between">
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-xs text-white/25 hover:text-white/50">
                    Forgot password?
                  </button>
                  <button type="button" onClick={() => { setMode('signup'); setError(''); }} className="text-xs text-white/40 hover:text-white/60">
                    Create account
                  </button>
                </div>
              </>
            )}

            {/* ═══ SIGNUP ═══ */}
            {mode === 'signup' && (
              <>
                <a
                  href={getGoogleLoginUrl()}
                  className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-transform hover:scale-[1.02]"
                >
                  <GoogleIcon />
                  Continue with Google
                </a>

                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs text-white/20">or</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <form onSubmit={handleSignUp} className="space-y-3">
                  <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} placeholder="Password (8+ chars, upper, lower, number)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required minLength={8} />
                    {passwordToggle}
                  </div>
                  <button type="submit" disabled={submitting} className={`${btnClass} !bg-white/10 !text-white hover:!bg-white/20`}>
                    {submitting ? 'Creating...' : 'Create Account with Email'}
                  </button>
                </form>

                <p className="mt-4 text-center text-xs text-white/25">
                  Already have an account?{' '}
                  <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-white/50 underline hover:text-white/70">Login</button>
                </p>
              </>
            )}

            {/* ═══ CONFIRM ═══ */}
            {mode === 'confirm' && (
              <form onSubmit={handleConfirm} className="space-y-4">
                <p className="text-center text-sm text-white/40">
                  Verification code sent to <span className="text-white/60">{email}</span>
                </p>
                <input type="text" placeholder="Verification code" value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} required />
                <button type="submit" disabled={submitting} className={btnClass}>
                  {submitting ? 'Verifying...' : 'Verify'}
                </button>
              </form>
            )}

            {/* ═══ FORGOT ═══ */}
            {mode === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-center text-sm text-white/40">登録したメールアドレスを入力してください</p>
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
                <button type="submit" disabled={submitting} className={btnClass}>
                  {submitting ? 'Sending...' : 'Send Reset Code'}
                </button>
                <p className="text-center">
                  <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-xs text-white/30 hover:text-white/50">Back to Login</button>
                </p>
              </form>
            )}

            {/* ═══ RESET ═══ */}
            {mode === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <p className="text-center text-sm text-white/40">
                  Reset code sent to <span className="text-white/60">{email}</span>
                </p>
                <input type="text" placeholder="Reset code" value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} required />
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required minLength={8} />
                  {passwordToggle}
                </div>
                <button type="submit" disabled={submitting} className={btnClass}>
                  {submitting ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
