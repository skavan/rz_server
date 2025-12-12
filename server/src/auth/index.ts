/**
 * JWT Authentication Utilities
 */
import jwt, { type JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';

interface User {
  id: number;
  email: string;
  role?: string;
}

interface AuthRequest extends Request {
  user?: User;
}

// JWT Secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours default

function resolveAccessTokenTtlSeconds(): number {
  const raw = process.env.JWT_ACCESS_TOKEN_TTL_SECONDS;
  if (!raw) return DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn('[auth] JWT_ACCESS_TOKEN_TTL_SECONDS invalid, falling back to default');
    return DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  }
  return parsed;
}

const ACCESS_TOKEN_TTL_SECONDS = resolveAccessTokenTtlSeconds();

/**
 * Generate JWT token for user
 */
export function generateToken(
  user: User,
  options?: { expiresInSeconds?: number }
): string {
  const expiresInSeconds = options?.expiresInSeconds ?? ACCESS_TOKEN_TTL_SECONDS;
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: expiresInSeconds }
  );
}

export function getTokenExpiryMs(token: string): number | null {
  const decoded = jwt.decode(token) as JwtPayload | null;
  if (!decoded || typeof decoded.exp !== 'number') {
    return null;
  }
  return decoded.exp * 1000;
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): User | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as User;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Verify JWT token but ignore expiration, while still validating signature.
 * Useful for implementing a controlled refresh flow where an expired token
 * can still be used to request a new token within a grace period.
 */
export function verifyTokenIgnoreExpiration(token: string): (User & { iat?: number; exp?: number }) | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as any;
    return decoded as (User & { iat?: number; exp?: number });
  } catch (error) {
    return null;
  }
}

/**
 * Hash password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Express middleware to authenticate requests
 */
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    const user = verifyToken(token);
    if (user) {
      req.user = user;
    }
  }

  next();
}

/**
 * Middleware to require write access (non-viewer role).
 * Must be used after authenticateToken and after scope has been set on the request.
 * Checks (req as any).scope.homeAccessRole - if 'viewer', returns 403.
 */
export function requireWriteAccess(req: Request, res: Response, next: NextFunction) {
  const scope = (req as any).scope;
  if (scope?.homeAccessRole === 'viewer') {
    return res.status(403).json({ error: 'Read-only access. Write operations not permitted.' });
  }
  next();
}
