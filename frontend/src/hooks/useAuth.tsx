import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Amplify } from 'aws-amplify';
import {
  signIn as amplifySignIn,
  confirmSignIn as amplifyConfirmSignIn,
  signOut as amplifySignOut,
  fetchAuthSession,
  associateWebAuthnCredential,
  listWebAuthnCredentials,
  deleteWebAuthnCredential,
  type AuthWebAuthnCredential,
} from 'aws-amplify/auth';

export type Passkey = AuthWebAuthnCredential;

export interface RuntimeAuthConfig {
  enabled: boolean;
  userPoolId: string | null;
  clientId: string | null;
  region: string | null;
}

export interface AuthUser {
  username: string;
  email?: string;
  name?: string;
  groups: string[];
  isAdmin: boolean;
}

type AuthChallenge =
  | { type: 'NEW_PASSWORD_REQUIRED' }
  | { type: 'SOFTWARE_TOKEN_MFA' }
  | { type: 'MFA_SETUP'; secretCode: string };

interface AuthContextValue {
  config: RuntimeAuthConfig | null;
  configLoading: boolean;
  user: AuthUser | null;
  pending: AuthChallenge | null;
  signIn: (email: string, password: string) => Promise<void>;
  completeNewPassword: (newPassword: string) => Promise<void>;
  submitMfaCode: (code: string) => Promise<void>;
  completeMfaSetup: (code: string) => Promise<void>;
  signInWithPasskey: (email: string) => Promise<void>;
  registerPasskey: () => Promise<void>;
  listPasskeys: () => Promise<Passkey[]>;
  deletePasskey: (credentialId: string) => Promise<void>;
  signOut: () => void;
  getAccessToken: () => string | null;
  getIdToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ADMIN_GROUP = 'Admins';

// Amplify session tokens are async — cache the latest pair so authFetch /
// buildWebSocketUrl can return them synchronously without re-awaiting on
// every request. fetchAuthSession() refreshes them for us when expired.
let cachedAccessToken: string | null = null;
let cachedIdToken: string | null = null;

async function refreshTokens(): Promise<void> {
  try {
    const session = await fetchAuthSession();
    cachedAccessToken = session.tokens?.accessToken?.toString() ?? null;
    cachedIdToken = session.tokens?.idToken?.toString() ?? null;
  } catch {
    cachedAccessToken = null;
    cachedIdToken = null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const [, payload] = token.split('.');
    if (!payload) return {};
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

function userFromIdToken(idToken: string): AuthUser {
  const payload = decodeJwtPayload(idToken);
  const groups = (payload['cognito:groups'] as string[] | undefined) || [];
  return {
    username:
      (payload['cognito:username'] as string) ||
      (payload.email as string) ||
      'user',
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    groups,
    isAdmin: groups.includes(ADMIN_GROUP),
  };
}

function configureAmplify(cfg: RuntimeAuthConfig): boolean {
  if (!cfg.enabled || !cfg.userPoolId || !cfg.clientId) return false;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: cfg.userPoolId,
        userPoolClientId: cfg.clientId,
      },
    },
  });
  return true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<RuntimeAuthConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pending, setPending] = useState<AuthChallenge | null>(null);

  // Fetch runtime config on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const auth: RuntimeAuthConfig = data?.auth || {
          enabled: false,
          userPoolId: null,
          clientId: null,
          region: null,
        };
        setConfig(auth);
      })
      .catch(() => {
        if (!cancelled) setConfig({ enabled: false, userPoolId: null, clientId: null, region: null });
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Configure Amplify and try to restore session from storage when config arrives
  useEffect(() => {
    if (!config) return;
    const ready = configureAmplify(config);
    if (!ready) {
      cachedAccessToken = null;
      cachedIdToken = null;
      setUser(null);
      return;
    }
    // Hydrate any persisted session into our user state
    void (async () => {
      await refreshTokens();
      if (cachedIdToken) setUser(userFromIdToken(cachedIdToken));
    })();
  }, [config]);

  const finalizeSignedIn = useCallback(async () => {
    await refreshTokens();
    if (cachedIdToken) setUser(userFromIdToken(cachedIdToken));
    setPending(null);
  }, []);

  const handleNextStep = useCallback(async (step: { signInStep: string; totpSetupDetails?: { sharedSecret?: string } }) => {
    switch (step.signInStep) {
      case 'DONE':
        await finalizeSignedIn();
        return;
      case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
        setPending({ type: 'NEW_PASSWORD_REQUIRED' });
        return;
      case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
        setPending({ type: 'SOFTWARE_TOKEN_MFA' });
        return;
      case 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP': {
        const secret = step.totpSetupDetails?.sharedSecret ?? '';
        setPending({ type: 'MFA_SETUP', secretCode: secret });
        return;
      }
      default:
        throw new Error(`Unsupported sign-in step: ${step.signInStep}`);
    }
  }, [finalizeSignedIn]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await amplifySignIn({ username: email, password });
    if (result.isSignedIn) {
      await finalizeSignedIn();
      return;
    }
    await handleNextStep(result.nextStep);
  }, [finalizeSignedIn, handleNextStep]);

  const completeNewPassword = useCallback(async (newPassword: string) => {
    const result = await amplifyConfirmSignIn({ challengeResponse: newPassword });
    if (result.isSignedIn) {
      await finalizeSignedIn();
      return;
    }
    await handleNextStep(result.nextStep);
  }, [finalizeSignedIn, handleNextStep]);

  const submitMfaCode = useCallback(async (code: string) => {
    const result = await amplifyConfirmSignIn({ challengeResponse: code });
    if (result.isSignedIn) {
      await finalizeSignedIn();
      return;
    }
    await handleNextStep(result.nextStep);
  }, [finalizeSignedIn, handleNextStep]);

  const completeMfaSetup = useCallback(async (code: string) => {
    const result = await amplifyConfirmSignIn({ challengeResponse: code });
    if (result.isSignedIn) {
      await finalizeSignedIn();
      return;
    }
    await handleNextStep(result.nextStep);
  }, [finalizeSignedIn, handleNextStep]);

  const signInWithPasskey = useCallback(async (email: string) => {
    if (typeof window === 'undefined' || !('credentials' in navigator)) {
      throw new Error('Passkeys are not supported in this browser');
    }
    if (!email) {
      throw new Error('Enter your email above first, then click "Sign in with passkey"');
    }
    const result = await amplifySignIn({
      username: email,
      options: {
        authFlowType: 'USER_AUTH',
        preferredChallenge: 'WEB_AUTHN',
      },
    });
    if (result.isSignedIn) {
      await finalizeSignedIn();
      return;
    }
    await handleNextStep(result.nextStep);
  }, [finalizeSignedIn, handleNextStep]);

  const registerPasskey = useCallback(async () => {
    if (typeof window === 'undefined' || !('credentials' in navigator)) {
      throw new Error('Passkeys are not supported in this browser');
    }
    // Amplify v6 wraps the entire WebAuthn ceremony: it calls
    // StartWebAuthnRegistration, drives navigator.credentials.create()
    // (Touch ID / Windows Hello / YubiKey), and posts back via
    // CompleteWebAuthnRegistration. Browser is the relying-party
    // (origin must match what's configured on the User Pool).
    // Calling this multiple times registers additional credentials —
    // Cognito stores each as a separate WebAuthn credential, so a user
    // can have a platform passkey (Touch ID) AND a security key
    // (YubiKey) AND a Windows Hello account, all on the same Cognito user.
    await associateWebAuthnCredential();
  }, []);

  const listPasskeys = useCallback(async (): Promise<Passkey[]> => {
    const result = await listWebAuthnCredentials();
    return result.credentials ?? [];
  }, []);

  const deletePasskey = useCallback(async (credentialId: string) => {
    await deleteWebAuthnCredential({ credentialId });
  }, []);

  const signOut = useCallback(() => {
    void amplifySignOut().catch(() => {
      // ignore — signing out shouldn't block UI even if the call fails
    });
    cachedAccessToken = null;
    cachedIdToken = null;
    setUser(null);
    setPending(null);
  }, []);

  const getAccessToken = useCallback((): string | null => {
    // Kick off a refresh in the background so the cache stays warm.
    // We return the current cached value synchronously for callers that
    // need it inline (authFetch headers, WebSocket query string).
    void refreshTokens();
    return cachedAccessToken;
  }, []);

  const getIdToken = useCallback((): string | null => {
    void refreshTokens();
    return cachedIdToken;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    config,
    configLoading,
    user,
    pending,
    signIn,
    completeNewPassword,
    submitMfaCode,
    completeMfaSetup,
    signInWithPasskey,
    registerPasskey,
    listPasskeys,
    deletePasskey,
    signOut,
    getAccessToken,
    getIdToken,
  }), [
    config,
    configLoading,
    user,
    pending,
    signIn,
    completeNewPassword,
    submitMfaCode,
    completeMfaSetup,
    signInWithPasskey,
    registerPasskey,
    listPasskeys,
    deletePasskey,
    signOut,
    getAccessToken,
    getIdToken,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Helper for fetch calls that need to include the bearer token. */
export function authFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  // Refresh token cache eagerly; Amplify will rotate expiring tokens.
  void refreshTokens();
  const headers = new Headers(init.headers || {});
  if (cachedAccessToken) headers.set('Authorization', `Bearer ${cachedAccessToken}`);
  return fetch(input, { ...init, headers });
}

/** Build a WebSocket URL with the access token in the query string when auth is enabled. */
export function buildWebSocketUrl(base: string): string {
  void refreshTokens();
  if (!cachedAccessToken) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(cachedAccessToken)}`;
}
