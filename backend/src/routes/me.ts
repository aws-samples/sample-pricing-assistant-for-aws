import { Router, Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { authConfig, passkeyNicknamesConfig } from '../config/index.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: authConfig.region }),
);

// Caller's user-id from the JWT — sub is the Cognito user's stable identifier.
function userIdFromReq(req: Request): string | null {
  return req.user?.sub ?? null;
}

function nicknamesEnabled(): boolean {
  return authConfig.enabled && !!passkeyNicknamesConfig.tableName;
}

// All routes here require authentication. When auth is disabled at the app
// level, requireAuth treats every caller as anonymous, which won't have a
// stable userId — so the route is meaningless without auth.
router.use((_req, res, next) => {
  if (!authConfig.enabled) {
    res.status(404).json({ error: 'User API disabled (AUTH_ENABLED=false)' });
    return;
  }
  next();
});

router.use(requireAuth);

/**
 * GET /api/me/passkeys/nicknames
 * Returns { items: [{ credentialId, nickname, updatedAt }] } for the caller.
 */
router.get('/passkeys/nicknames', async (req: Request, res: Response) => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ error: 'No user identity' });
    return;
  }
  if (!nicknamesEnabled()) {
    // Table not yet deployed — return empty list so the UI can render gracefully.
    res.json({ items: [] });
    return;
  }
  try {
    const out = await ddb.send(
      new QueryCommand({
        TableName: passkeyNicknamesConfig.tableName,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
      }),
    );
    const items = (out.Items ?? []).map((it: Record<string, unknown>) => ({
      credentialId: it['credentialId'] as string,
      nickname: it['nickname'] as string,
      updatedAt: it['updatedAt'] as string | undefined,
    }));
    res.json({ items });
  } catch (err) {
    logger.error('Failed to list passkey nicknames', { err: (err as Error).message });
    res.status(500).json({ error: 'Failed to list passkey nicknames' });
  }
});

/**
 * PUT /api/me/passkeys/:credentialId/nickname
 * Body: { nickname: string }
 * Stores or replaces the nickname for one of the caller's passkeys.
 */
router.put('/passkeys/:credentialId/nickname', async (req: Request, res: Response) => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ error: 'No user identity' });
    return;
  }
  if (!nicknamesEnabled()) {
    res.status(503).json({ error: 'Passkey nicknames not configured' });
    return;
  }
  const credentialId = req.params['credentialId'];
  if (!credentialId) {
    res.status(400).json({ error: 'credentialId required' });
    return;
  }
  const nickname = (req.body?.nickname ?? '').toString().trim();
  if (!nickname) {
    res.status(400).json({ error: 'nickname required' });
    return;
  }
  if (nickname.length > 64) {
    res.status(400).json({ error: 'nickname too long (max 64 chars)' });
    return;
  }
  try {
    await ddb.send(
      new PutCommand({
        TableName: passkeyNicknamesConfig.tableName,
        Item: {
          userId,
          credentialId,
          nickname,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    res.json({ credentialId, nickname });
  } catch (err) {
    logger.error('Failed to set passkey nickname', { err: (err as Error).message });
    res.status(500).json({ error: 'Failed to set passkey nickname' });
  }
});

/**
 * DELETE /api/me/passkeys/:credentialId/nickname
 * Removes the stored nickname for the given credential. The credential
 * itself stays in Cognito — call deleteWebAuthnCredential from the client
 * separately. This is just for the friendly-name layer.
 */
router.delete('/passkeys/:credentialId/nickname', async (req: Request, res: Response) => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ error: 'No user identity' });
    return;
  }
  if (!nicknamesEnabled()) {
    res.status(503).json({ error: 'Passkey nicknames not configured' });
    return;
  }
  const credentialId = req.params['credentialId'];
  if (!credentialId) {
    res.status(400).json({ error: 'credentialId required' });
    return;
  }
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: passkeyNicknamesConfig.tableName,
        Key: { userId, credentialId },
      }),
    );
    res.status(204).end();
  } catch (err) {
    logger.error('Failed to delete passkey nickname', { err: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete passkey nickname' });
  }
});

export default router;
