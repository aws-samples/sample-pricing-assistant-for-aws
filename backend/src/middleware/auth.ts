import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { authConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface AuthenticatedUser {
  sub: string;
  email?: string | undefined;
  username?: string | undefined;
  groups: string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

const jwks = authConfig.enabled && authConfig.userPoolId
  ? createRemoteJWKSet(
      new URL(`https://cognito-idp.${authConfig.region}.amazonaws.com/${authConfig.userPoolId}/.well-known/jwks.json`),
    )
  : null;

const issuer = authConfig.userPoolId
  ? `https://cognito-idp.${authConfig.region}.amazonaws.com/${authConfig.userPoolId}`
  : '';

async function verifyToken(token: string): Promise<JWTPayload> {
  if (!jwks) throw new Error('Auth not configured');
  const { payload } = await jwtVerify(token, jwks, { issuer });
  // Cognito access tokens have token_use=access; ID tokens have token_use=id.
  // Accept either — both carry sub and (for users in groups) cognito:groups.
  // Access tokens additionally carry client_id; verify it matches our app client.
  if (payload.token_use === 'access' && payload.client_id !== authConfig.clientId) {
    throw new Error('Token client_id mismatch');
  }
  if (payload.token_use === 'id' && payload.aud !== authConfig.clientId) {
    throw new Error('Token aud mismatch');
  }
  return payload;
}

function payloadToUser(payload: JWTPayload): AuthenticatedUser {
  const groups = Array.isArray(payload['cognito:groups'])
    ? (payload['cognito:groups'] as string[])
    : [];
  return {
    sub: payload.sub as string,
    email: payload.email as string | undefined,
    username: (payload['cognito:username'] || payload.username) as string | undefined,
    groups,
  };
}

/**
 * Require a valid Cognito JWT. When AUTH_ENABLED=false, this is a no-op
 * pass-through — preserving the open-access sample-code behavior.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!authConfig.enabled) {
    next();
    return;
  }

  const header = req.header('authorization') || req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = await verifyToken(token);
    req.user = payloadToUser(payload);
    next();
  } catch (err) {
    logger.warn('JWT verification failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Require the authenticated user to be in the Admins group. Composes after
 * requireAuth. When AUTH_ENABLED=false, every caller is treated as an admin
 * — matches existing open-access behavior.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!authConfig.enabled) {
    next();
    return;
  }
  if (!req.user || !req.user.groups.includes(authConfig.adminGroup)) {
    res.status(403).json({ error: 'Admin privileges required' });
    return;
  }
  next();
}

/**
 * Verify a token from a WebSocket upgrade request. Returns the user on
 * success or null when AUTH_ENABLED=false (open-access mode). Throws on
 * invalid/expired tokens when auth is enabled.
 */
export async function verifyWebSocketToken(token: string | null): Promise<AuthenticatedUser | null> {
  if (!authConfig.enabled) return null;
  if (!token) throw new Error('Missing token');
  const payload = await verifyToken(token);
  return payloadToUser(payload);
}
