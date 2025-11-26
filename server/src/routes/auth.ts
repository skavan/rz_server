/**
 * Authentication Routes
 */
import { Router } from 'express';
import { db } from '../db/index.js';
import { users, userHomeAccess, eq, sql } from '@postgress/shared';
import { generateToken, getTokenExpiryMs, hashPassword, comparePassword, verifyTokenIgnoreExpiration } from '../auth/index.js';

const router = Router();

/**
 * POST /api/auth/login
 * User login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const emailNorm = String(email || '').trim().toLowerCase();

    if (!emailNorm || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email (case-insensitive exact match)
    const userResults = await db
      .select()
      .from(users)
      .where(sql`lower(${(users as any).email}) = ${emailNorm}` as any)
      .limit(1);

    if (userResults.length === 0) {
      console.warn('[auth] login: user not found for email', emailNorm);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const raw = userResults[0];
    // Normalize to camelCase boundary object
    const user = {
      id: raw.id,
      email: (raw as any).email,
      role: (raw as any).role,
      firstName: (raw as any).first_name ?? (raw as any).firstName,
      lastName: (raw as any).last_name ?? (raw as any).lastName,
      passwordHash: (raw as any).password_hash ?? (raw as any).passwordHash,
      isActive: (raw as any).is_active ?? (raw as any).isActive,
    } as const;

    // Check password strictly against normalized camelCase field
    if (!user.passwordHash) {
      console.warn('[auth] login: user missing password hash', { id: user.id, email: user.email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const isValid = await comparePassword(password, user.passwordHash as string);
    if (!isValid) {
      console.warn('[auth] login: bad password for', emailNorm);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 🏠 Query user's allowed homes from user_home_access table
    const homeAccess = await db
      .select({ homeId: userHomeAccess.homeId })
      .from(userHomeAccess)
      .where(eq(userHomeAccess.userId, user.id));
    
    const allowedHomeIds = homeAccess.map((row: any) => row.homeId);
    const defaultHomeId = allowedHomeIds.length > 0 ? allowedHomeIds[0] : null;
    
    console.log('[auth] 🔍 User home access:', {
      userId: user.id,
      allowedHomeIds,
      defaultHomeId,
      homeAccessCount: homeAccess.length
    });

    const effectiveRole = (user.role as string | null) ?? 'user';

    // Generate token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: effectiveRole
    });

    const tokenExpiresAtMs = getTokenExpiryMs(token);
    const responseData = {
      token,
      tokenExpiresAtMs,
      tokenTtlSeconds: tokenExpiresAtMs ? Math.max(0, Math.floor((tokenExpiresAtMs - Date.now()) / 1000)) : null,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName ?? ''}${user.lastName ? ' ' + user.lastName : ''}`,
        role: effectiveRole,
        roles: effectiveRole ? [effectiveRole] : [],
        customerId: raw.customer_id ?? (raw as any).customerId ?? null,  // ✅ Get from raw DB result
        allowedHomeIds,           // ✅ Added
        defaultHomeId,            // ✅ Added
        sessionVersion: raw.session_version ?? 0
      }
    };

    // 🔍 DEBUG: Log what we're sending back
    console.log('[auth] 🔍 Login successful for:', user.email);
    console.log('[auth] 🔍 Response data:', JSON.stringify(responseData, null, 2));
    console.log('[auth] 🔍 User object keys:', Object.keys(responseData.user));

    res.json(responseData);

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/register
 * User registration
 */
router.post('/register', async (req, res) => {
  try {
  const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user exists
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
  const passwordHash = await hashPassword(password);

    // Create user
    const newUsers = await db
      .insert(users)
      .values({
    email,
    first_name: (name || 'User').toString(),
    password_hash: passwordHash,
    role: 'user',
    is_active: true
      })
      .returning();

    const newUser = newUsers[0];

    // Generate token
    const newRole = ((newUser as any).role as string) || 'user';
    const token = generateToken({
      id: newUser.id,
      email: (newUser as any).email,
      role: newRole
    });

    const tokenExpiresAtMs = getTokenExpiryMs(token);
    res.status(201).json({
      token,
      tokenExpiresAtMs,
      tokenTtlSeconds: tokenExpiresAtMs ? Math.max(0, Math.floor((tokenExpiresAtMs - Date.now()) / 1000)) : null,
      user: {
        id: newUser.id,
        email: (newUser as any).email,
        name: (newUser as any).first_name,
        role: newRole,
        roles: newRole ? [newRole] : []
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

/**
 * POST /api/auth/refresh
 * Exchange an about-to-expire or just-expired token for a new token.
 * Requires Authorization: Bearer <token>. We validate signature ignoring expiration,
 * and optionally enforce a small grace period after exp.
 */
router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.substring('Bearer '.length)
      : null;
    if (!token) {
      return res.status(400).json({ error: 'Authorization bearer token required' });
    }
    const decoded = verifyTokenIgnoreExpiration(token);
    if (!decoded || !decoded.id || !decoded.email) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  // Configurable grace period: allow refresh within REFRESH_GRACE_SECONDS (default 12h) after exp
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = typeof decoded.exp === 'number' ? decoded.exp : 0;
  const graceSec = Number(process.env.REFRESH_GRACE_SECONDS ?? (12 * 60 * 60));
  const withinGrace = expSec === 0 || (nowSec - expSec) <= graceSec;
    if (!withinGrace) {
      return res.status(403).json({ error: 'Token expired beyond grace period' });
    }

    const newToken = generateToken({ id: Number(decoded.id), email: String(decoded.email), role: decoded.role });
    const tokenExpiresAtMs = getTokenExpiryMs(newToken);
    return res.json({
      token: newToken,
      tokenExpiresAtMs,
      tokenTtlSeconds: tokenExpiresAtMs ? Math.max(0, Math.floor((tokenExpiresAtMs - Date.now()) / 1000)) : null,
    });
  } catch (err) {
    console.error('[auth] refresh error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
