import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';
import type { UserRole } from '../utils/libraryRules.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'ksrce-library-institutional-hmac-secret-2026-tamilnadu';

export interface AuthTokenPayload {
  sub: number; // userId
  email: string;
  fullName: string;
  role: UserRole;
  memberId?: number | null;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  let str = input.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

export function signAccessToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>, expiresInMinutes = 120): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: nowSec,
    exp: nowSec + expiresInMinutes * 60,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

export function verifyAccessToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(body)) as AuthTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function issueRefreshToken(userId: number, expiryDays = 7): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO RefreshTokens (userId, tokenHash, expiresAt, createdAt)
    VALUES (?, ?, ?, ?)
  `).run(userId, tokenHash, expiresAt, new Date().toISOString());

  return rawToken;
}

export function rotateRefreshToken(rawToken: string): { userId: number; newRefreshToken: string } | null {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const row = db.prepare(`
    SELECT id, userId, expiresAt, revokedAt
    FROM RefreshTokens
    WHERE tokenHash = ?
  `).get(tokenHash) as { id: number; userId: number; expiresAt: string; revokedAt: string | null } | undefined;

  if (!row || row.revokedAt || new Date(row.expiresAt).getTime() < Date.now()) {
    return null;
  }

  db.prepare(`UPDATE RefreshTokens SET revokedAt = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
  const newRefreshToken = issueRefreshToken(row.userId);
  return { userId: row.userId, newRefreshToken };
}

export function revokeRefreshToken(rawToken?: string, userId?: number): void {
  const nowIso = new Date().toISOString();
  if (rawToken) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    db.prepare(`UPDATE RefreshTokens SET revokedAt = ? WHERE tokenHash = ?`).run(nowIso, tokenHash);
  } else if (userId) {
    db.prepare(`UPDATE RefreshTokens SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL`).run(nowIso, userId);
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    res.status(401).json({
      title: 'Unauthorized',
      status: 401,
      detail: 'Authentication token is missing. Please sign in to KSRCE Library Management System.',
    });
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({
      title: 'Session Expired or Invalid',
      status: 401,
      detail: 'Your session has expired or the token is invalid. Please sign in again.',
    });
    return;
  }

  // Verify user is still active in DB
  const userRow = db.prepare('SELECT isActive, role FROM Users WHERE id = ?').get(payload.sub) as
    | { isActive: number; role: UserRole }
    | undefined;

  if (!userRow || !userRow.isActive) {
    res.status(403).json({
      title: 'Account Deactivated',
      status: 403,
      detail: 'Your institutional account has been deactivated. Please contact the Chief Librarian.',
    });
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        title: 'Access Denied',
        status: 403,
        detail: `Role '${req.user.role}' does not have permission to perform this operation. Required: ${allowedRoles.join(' or ')}.`,
      });
      return;
    }

    next();
  };
}
