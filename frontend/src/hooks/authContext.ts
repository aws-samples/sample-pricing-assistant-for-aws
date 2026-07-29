import { createContext, useContext } from 'react';
import { fetchAuthSession, type AuthWebAuthnCredential } from 'aws-amplify/auth';

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

export type AuthChallenge =
  | { type: 'NEW_PASSWORD_REQUIRED' }
  | { type: 'SOFTWARE_TOKEN_MFA' }
  | { type: 'MFA_SETUP'; secretCode: string };

export interface AuthContextValue {
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

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const ADMIN_GROUP = 'Admins';

// Amplify session tokens are async — cache the latest pair so authFetch /
// buildWebSocketUrl can return them synchronously without re-awaiting on
// every request. fetchAuthSession() refreshes them for us when expired.
//
// This cache MUST live in the same module as authFetch/buildWebSocketUrl and
// be the single source consumed by AuthProvider. Splitting them across modules
// would give each its own copy of these bindings and silently break auth.
export const tokenCache: { accessToken: string | null; idToken: string | null } = {
  accessToken: null,
  idToken: null,
};

export async function refreshTokens(): Promise<void> {
  try {
    const session = await fetchAuthSession();
    tokenCache.accessToken = session.tokens?.accessToken?.toString() ?? null;
    tokenCache.idToken = session.tokens?.idToken?.toString() ?? null;
  } catch {
    tokenCache.accessToken = null;
    tokenCache.idToken = null;
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

export function userFromIdToken(idToken: string): AuthUser {
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
  if (tokenCache.accessToken) headers.set('Authorization', `Bearer ${tokenCache.accessToken}`);
  return fetch(input, { ...init, headers });
}

/** Build a WebSocket URL with the access token in the query string when auth is enabled. */
export function buildWebSocketUrl(base: string): string {
  void refreshTokens();
  if (!tokenCache.accessToken) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(tokenCache.accessToken)}`;
}
