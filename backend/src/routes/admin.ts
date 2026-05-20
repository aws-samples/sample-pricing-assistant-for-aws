import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminResetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  ListUsersCommand,
  AdminListGroupsForUserCommand,
  DescribeUserPoolCommand,
  SetUserPoolMfaConfigCommand,
  type UserType,
  type AttributeType,
  type GroupType,
} from '@aws-sdk/client-cognito-identity-provider';
import { authConfig } from '../config/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
const cognito = new CognitoIdentityProviderClient({ region: authConfig.region });

// Block every route in this module unless auth is enabled. Without auth,
// "admin" is meaningless — these endpoints would be wide-open user management.
router.use((_req, res, next) => {
  if (!authConfig.enabled) {
    res.status(404).json({ error: 'Admin API disabled (AUTH_ENABLED=false)' });
    return;
  }
  next();
});

router.use(requireAuth, requireAdmin);

/** GET /api/admin/users — list users in the pool. */
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const out = await cognito.send(
      new ListUsersCommand({ UserPoolId: authConfig.userPoolId, Limit: 60 }),
    );
    const users = (out.Users || []).map((u: UserType) => ({
      username: u.Username,
      enabled: u.Enabled,
      status: u.UserStatus,
      created: u.UserCreateDate,
      attributes: Object.fromEntries(
        (u.Attributes || []).map((a: AttributeType) => [a.Name, a.Value]),
      ),
    }));
    res.json({ users });
  } catch (err) {
    logger.error('admin list users failed', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * Generate a random temporary password that satisfies the user pool's
 * password policy (12+ chars, upper/lower/digit/symbol). When the pool has
 * AllowedFirstAuthFactors set (which happens when WEB_AUTHN is added to
 * SignInPolicy), AdminCreateUser no longer auto-generates a temp password
 * and rejects the call with "User is required to have a password" — so we
 * generate one ourselves. Cognito's invite email template substitutes
 * {####} with this value.
 */
function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_=+';
  const all = upper + lower + digits + symbols;

  // Uniform integer in [0, max). Rejection-sampling avoids the modulo bias
  // CodeQL js/biased-cryptographic-random correctly flags when 256 isn't
  // an exact multiple of `max` (e.g. 256 % 24 = 16, weighting values 0-15
  // by ~1.06x). For a temp password the bias is operationally negligible,
  // but doing it right keeps the security panel clean.
  const uniformInt = (max: number): number => {
    if (max <= 0 || max > 256) {
      throw new Error('uniformInt range must be 1..256');
    }
    const limit = 256 - (256 % max); // largest multiple of max <= 256
    while (true) {
      const byte = crypto.randomBytes(1)[0]!;
      if (byte < limit) return byte % max;
    }
  };
  const pick = (alphabet: string): string => alphabet[uniformInt(alphabet.length)]!;
  // Guarantee one of each required class plus 12 more from the full set.
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 0; i < 12; i++) chars.push(pick(all));
  // Shuffle so the required-class chars aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = uniformInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

/** POST /api/admin/users { email, name?, isAdmin? } — invite a user. */
router.post('/users', async (req: Request, res: Response) => {
  const { email, name, isAdmin } = req.body as { email?: string; name?: string; isAdmin?: boolean };
  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'email is required' });
    return;
  }
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (trimmedName.length > 64) {
    res.status(400).json({ error: 'name too long (max 64 chars)' });
    return;
  }
  try {
    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ];
    if (trimmedName) {
      userAttributes.push({ Name: 'name', Value: trimmedName });
    }
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: authConfig.userPoolId,
        Username: email,
        UserAttributes: userAttributes,
        DesiredDeliveryMediums: ['EMAIL'],
        TemporaryPassword: generateTemporaryPassword(),
      }),
    );
    if (isAdmin) {
      await cognito.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: authConfig.userPoolId,
          Username: email,
          GroupName: authConfig.adminGroup,
        }),
      );
    }
    res.status(201).json({ email, name: trimmedName || undefined, isAdmin: !!isAdmin });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('admin create user failed', { email, error: message });
    res.status(500).json({ error: message });
  }
});

/** DELETE /api/admin/users/:username */
router.delete('/users/:username', async (req: Request, res: Response) => {
  const username = req.params.username;
  if (!username) {
    res.status(400).json({ error: 'username is required' });
    return;
  }
  // A self-delete would lock the operator out; refuse.
  if (req.user && req.user.username === username) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }
  try {
    await cognito.send(
      new AdminDeleteUserCommand({ UserPoolId: authConfig.userPoolId, Username: username }),
    );
    res.json({ deleted: username });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * PATCH /api/admin/users/:username
 * Body: { name?: string }
 * Updates a user's name attribute. Empty string clears it via
 * AdminDeleteUserAttributes; any other value is set via
 * AdminUpdateUserAttributes. Pure-server-side reflection of the
 * Cognito user attribute — the client never edits the email or
 * pool-managed fields here.
 */
router.patch('/users/:username', async (req: Request, res: Response) => {
  const username = req.params.username;
  if (!username) {
    res.status(400).json({ error: 'username is required' });
    return;
  }
  const { name } = req.body as { name?: string };
  if (typeof name !== 'string') {
    res.status(400).json({ error: 'name (string) is required' });
    return;
  }
  const trimmed = name.trim();
  if (trimmed.length > 64) {
    res.status(400).json({ error: 'name too long (max 64 chars)' });
    return;
  }
  try {
    if (trimmed) {
      await cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: authConfig.userPoolId,
          Username: username,
          UserAttributes: [{ Name: 'name', Value: trimmed }],
        }),
      );
    } else {
      // Clearing — remove the attribute entirely so listing UIs fall
      // back to the email-only display.
      await cognito.send(
        new AdminDeleteUserAttributesCommand({
          UserPoolId: authConfig.userPoolId,
          Username: username,
          UserAttributeNames: ['name'],
        }),
      );
    }
    res.json({ username, name: trimmed || undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/** POST /api/admin/users/:username/reset-password */
router.post('/users/:username/reset-password', async (req: Request, res: Response) => {
  const username = req.params.username;
  if (!username) {
    res.status(400).json({ error: 'username is required' });
    return;
  }
  try {
    await cognito.send(
      new AdminResetUserPasswordCommand({ UserPoolId: authConfig.userPoolId, Username: username }),
    );
    res.json({ reset: username });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/** POST /api/admin/users/:username/sign-out — revoke all refresh tokens */
router.post('/users/:username/sign-out', async (req: Request, res: Response) => {
  const username = req.params.username;
  if (!username) {
    res.status(400).json({ error: 'username is required' });
    return;
  }
  try {
    await cognito.send(
      new AdminUserGlobalSignOutCommand({ UserPoolId: authConfig.userPoolId, Username: username }),
    );
    res.json({ signedOut: username });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/** POST /api/admin/users/:username/admin { add: true|false } */
router.post('/users/:username/admin', async (req: Request, res: Response) => {
  const username = req.params.username;
  if (!username) {
    res.status(400).json({ error: 'username is required' });
    return;
  }
  const { add } = req.body as { add?: boolean };
  try {
    const cmd = add
      ? new AdminAddUserToGroupCommand({
          UserPoolId: authConfig.userPoolId,
          Username: username,
          GroupName: authConfig.adminGroup,
        })
      : new AdminRemoveUserFromGroupCommand({
          UserPoolId: authConfig.userPoolId,
          Username: username,
          GroupName: authConfig.adminGroup,
        });
    await cognito.send(cmd);
    res.json({ username, isAdmin: !!add });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/** GET /api/admin/users/:username/groups */
router.get('/users/:username/groups', async (req: Request, res: Response) => {
  const username = req.params.username;
  if (!username) {
    res.status(400).json({ error: 'username is required' });
    return;
  }
  try {
    const out = await cognito.send(
      new AdminListGroupsForUserCommand({ UserPoolId: authConfig.userPoolId, Username: username }),
    );
    res.json({ groups: (out.Groups || []).map((g: GroupType) => g.GroupName) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/** GET /api/admin/mfa — read current pool-wide MFA configuration. */
router.get('/mfa', async (_req: Request, res: Response) => {
  try {
    const out = await cognito.send(
      new DescribeUserPoolCommand({ UserPoolId: authConfig.userPoolId }),
    );
    res.json({
      mfaConfiguration: out.UserPool?.MfaConfiguration || 'OFF',
      enabledMfas: out.UserPool?.MfaConfiguration === 'OFF' ? [] : ['SOFTWARE_TOKEN_MFA'],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/** PUT /api/admin/mfa { mfaConfiguration: 'OFF' | 'OPTIONAL' | 'ON' } */
router.put('/mfa', async (req: Request, res: Response) => {
  const { mfaConfiguration } = req.body as { mfaConfiguration?: string };
  if (!mfaConfiguration || !['OFF', 'OPTIONAL', 'ON'].includes(mfaConfiguration)) {
    res.status(400).json({ error: 'mfaConfiguration must be OFF, OPTIONAL, or ON' });
    return;
  }
  try {
    await cognito.send(
      new SetUserPoolMfaConfigCommand({
        UserPoolId: authConfig.userPoolId,
        MfaConfiguration: mfaConfiguration as 'OFF' | 'OPTIONAL' | 'ON',
        SoftwareTokenMfaConfiguration: { Enabled: mfaConfiguration !== 'OFF' },
      }),
    );
    logger.info('Pool-wide MFA config updated', {
      mfaConfiguration,
      by: req.user?.username,
    });
    res.json({ mfaConfiguration });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
