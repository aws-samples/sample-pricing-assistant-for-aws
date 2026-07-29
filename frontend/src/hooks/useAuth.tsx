import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Amplify } from 'aws-amplify';
import {
  signIn as amplifySignIn,
  confirmSignIn as amplifyConfirmSignIn,
  signOut as amplifySignOut,
  associateWebAuthnCredential,
  listWebAuthnCredentials,
  deleteWebAuthnCredential,
} from 'aws-amplify/auth';
import {
  AuthContext,
  refreshTokens,
  tokenCache,
  userFromIdToken,
  type AuthChallenge,
  type AuthContextValue,
  type AuthUser,
  type Passkey,
  type RuntimeAuthConfig,
} from './authContext';

// The context object, the useAuth hook, the authFetch / buildWebSocketUrl
// helpers, the shared token cache, and all auth types live in ./authContext so
// that this file only exports a component — required for React Fast Refresh.
// Import those from './hooks/authContext', not from here.
//
// The token cache in particular MUST stay colocated with authFetch /
// buildWebSocketUrl: duplicating it here would give this module its own copy
// and silently break bearer-token propagation.

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
      tokenCache.accessToken = null;
      tokenCache.idToken = null;
      setUser(null);
      return;
    }
    // Hydrate any persisted session into our user state
    void (async () => {
      await refreshTokens();
      if (tokenCache.idToken) setUser(userFromIdToken(tokenCache.idToken));
    })();
  }, [config]);

  const finalizeSignedIn = useCallback(async () => {
    await refreshTokens();
    if (tokenCache.idToken) setUser(userFromIdToken(tokenCache.idToken));
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
    tokenCache.accessToken = null;
    tokenCache.idToken = null;
    setUser(null);
    setPending(null);
  }, []);

  const getAccessToken = useCallback((): string | null => {
    // Kick off a refresh in the background so the cache stays warm.
    // We return the current cached value synchronously for callers that
    // need it inline (authFetch headers, WebSocket query string).
    void refreshTokens();
    return tokenCache.accessToken;
  }, []);

  const getIdToken = useCallback((): string | null => {
    void refreshTokens();
    return tokenCache.idToken;
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
