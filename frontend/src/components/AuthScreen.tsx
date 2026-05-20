import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Loader2, KeyRound, Fingerprint, ShieldCheck, ArrowLeft } from 'lucide-react';

type View = 'login' | 'newPassword' | 'mfaChallenge' | 'mfaSetup';

export default function AuthScreen() {
  const { theme } = useTheme();
  const auth = useAuth();
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dark = theme === 'dark';
  const card = dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const text = dark ? 'text-gray-100' : 'text-gray-900';
  const subtle = dark ? 'text-gray-400' : 'text-gray-600';
  const inputCls = `w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500 ${
    dark ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
  }`;
  const primaryBtn =
    'w-full rounded-md bg-orange-500 hover:bg-orange-600 text-white font-medium py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';
  const secondaryBtn =
    `w-full rounded-md border py-2.5 font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
      dark ? 'border-gray-700 hover:bg-gray-800 text-gray-100' : 'border-gray-300 hover:bg-gray-50 text-gray-900'
    }`;

  // Drive the view from the pending-challenge state coming out of useAuth.
  React.useEffect(() => {
    if (!auth.pending) return;
    if (auth.pending.type === 'NEW_PASSWORD_REQUIRED') setView('newPassword');
    else if (auth.pending.type === 'SOFTWARE_TOKEN_MFA') setView('mfaChallenge');
    else if (auth.pending.type === 'MFA_SETUP') setView('mfaSetup');
  }, [auth.pending]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await auth.completeNewPassword(newPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set new password');
    } finally {
      setBusy(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.submitMfaCode(mfaCode.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid MFA code');
    } finally {
      setBusy(false);
    }
  };

  const handleMfaSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.completeMfaSetup(mfaCode.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify code');
    } finally {
      setBusy(false);
    }
  };

  const handlePasskey = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email above first, then click "Sign in with passkey"');
      return;
    }
    setBusy(true);
    try {
      await auth.signInWithPasskey(email.trim().toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 ${dark ? 'bg-dark-bg' : 'bg-light-bg'}`}>
      <div className={`w-full max-w-md rounded-lg border shadow-lg p-8 ${card}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-md flex items-center justify-center ${dark ? 'bg-orange-500/20' : 'bg-orange-100'}`}>
            <KeyRound className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className={`text-xl font-semibold ${text}`}>AWS Pricing Assistant</h1>
            <p className={`text-sm ${subtle}`}>
              {view === 'login' && 'Sign in to continue'}
              {view === 'newPassword' && 'Set a new password to continue'}
              {view === 'mfaChallenge' && 'Enter your authenticator code'}
              {view === 'mfaSetup' && 'Set up multi-factor authentication'}
            </p>
          </div>
        </div>

        {error && (
          <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            dark ? 'bg-red-950/30 border-red-900 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {error}
          </div>
        )}

        {view === 'login' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${text}`}>Email</label>
              <input
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${text}`}>Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Sign in
            </button>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${dark ? 'border-gray-800' : 'border-gray-200'}`}></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className={`px-2 ${dark ? 'bg-gray-900' : 'bg-white'} ${subtle}`}>or</span>
              </div>
            </div>
            <button type="button" onClick={handlePasskey} disabled={busy} className={secondaryBtn}>
              <Fingerprint className="w-4 h-4" />
              Sign in with passkey
            </button>
            <p className={`text-xs text-center mt-4 ${subtle}`}>
              Account managed by your administrator. Contact them to request access.
            </p>
          </form>
        )}

        {view === 'newPassword' && (
          <form onSubmit={handleNewPassword} className="space-y-4">
            <p className={`text-sm ${subtle}`}>Choose a new password to replace the temporary one.</p>
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${text}`}>New password</label>
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputCls}
                required
                minLength={12}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${text}`}>Confirm password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputCls}
                required
                minLength={12}
              />
            </div>
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Continue
            </button>
            <p className={`text-xs ${subtle}`}>
              At least 12 characters with uppercase, lowercase, number, and symbol.
            </p>
          </form>
        )}

        {view === 'mfaChallenge' && (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <p className={`text-sm ${subtle}`}>Enter the 6-digit code from your authenticator app.</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              className={`${inputCls} text-center text-lg tracking-widest`}
              placeholder="000000"
              maxLength={6}
              required
            />
            <button type="submit" disabled={busy || mfaCode.length !== 6} className={primaryBtn}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Verify
            </button>
          </form>
        )}

        {view === 'mfaSetup' && auth.pending?.type === 'MFA_SETUP' && (
          <form onSubmit={handleMfaSetup} className="space-y-4">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
              <p className={`text-sm ${subtle}`}>
                Scan this code with an authenticator app (1Password, Google Authenticator, Authy), then enter the
                6-digit code it shows.
              </p>
            </div>
            <div className={`rounded-md border p-3 font-mono text-xs break-all ${dark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              {auth.pending.secretCode}
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              className={`${inputCls} text-center text-lg tracking-widest`}
              placeholder="000000"
              maxLength={6}
              required
            />
            <button type="submit" disabled={busy || mfaCode.length !== 6} className={primaryBtn}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Verify and finish
            </button>
          </form>
        )}

        {view !== 'login' && (
          <button
            type="button"
            onClick={() => {
              setView('login');
              setError(null);
              setMfaCode('');
              setNewPassword('');
              setConfirmPassword('');
              auth.signOut();
            }}
            className={`mt-4 text-sm flex items-center gap-1 ${subtle} hover:underline`}
          >
            <ArrowLeft className="w-3 h-3" />
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
