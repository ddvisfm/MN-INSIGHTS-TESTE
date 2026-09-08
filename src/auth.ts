import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ValidationError } from './db.js';

export interface AdminUser {
  id: number;
  name: string;
  role: 'INTERNAL';
}

export interface AdminSession {
  user: AdminUser;
  csrfToken: string;
  expiresAt: string;
}

interface UserRow {
  id: number;
  name: string;
  email: string | null;
  password_hash: string;
  password_salt: string;
  role: 'INTERNAL';
}

interface SessionRow {
  user_id: number;
  name: string;
  role: 'INTERNAL';
  csrf_token: string;
  expires_at: string;
}

const SESSION_HOURS = 12;

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function passwordDigest(password: string, saltHex: string): string {
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
  return scryptSync(password, salt, 64).toString('hex');
}

function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 12 || password.length > 160) {
    throw new ValidationError('A senha precisa ter entre 12 e 160 caracteres.', { password: 'Use pelo menos 12 caracteres.' });
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ValidationError('Use uma senha mais forte.', { password: 'Inclua pelo menos uma letra e um número.' });
  }
  return password;
}

function validateEmail(email: unknown): string {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (normalized.length < 5 || normalized.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ValidationError('Informe um e-mail administrativo válido.', { email: 'Digite um e-mail válido.' });
  }
  return normalized;
}

export function hasAdminUser(db: DatabaseSync): boolean {
  const result = db.prepare("SELECT COUNT(*) AS count FROM admin_users WHERE role = 'INTERNAL'").get() as { count: number } | undefined;
  return Number(result?.count ?? 0) > 0;
}

export function createInitialAdmin(db: DatabaseSync, input: { name?: unknown; email?: unknown; password?: unknown }): AdminUser {
  if (hasAdminUser(db)) throw new ValidationError('O usuário interno inicial já foi configurado.');
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
  if (name.length < 2) throw new ValidationError('Informe o nome do usuário interno.', { name: 'Informe pelo menos 2 caracteres.' });
  const email = validateEmail(input.email);
  const password = validatePassword(input.password);
  const salt = randomBytes(18).toString('hex');
  const digest = passwordDigest(password, salt);
  const result = db.prepare(`
    INSERT INTO admin_users (name, email, password_hash, password_salt, role, created_at)
    VALUES (?, ?, ?, ?, 'INTERNAL', ?)
  `).run(name, email, digest, salt, new Date().toISOString());
  return { id: Number(result.lastInsertRowid), name, role: 'INTERNAL' };
}

export function authenticateAdmin(db: DatabaseSync, emailInput: unknown, passwordInput: unknown): AdminUser | null {
  if (typeof passwordInput !== 'string' || passwordInput.length > 160) return null;
  let email: string;
  try { email = validateEmail(emailInput); } catch { return null; }
  const user = db.prepare(`
    SELECT id, name, email, password_hash, password_salt, role
    FROM admin_users WHERE role = 'INTERNAL' ORDER BY id LIMIT 1
  `).get() as UserRow | undefined;
  if (!user || (user.email !== null && user.email !== email)) return null;
  const actual = passwordDigest(passwordInput, user.password_salt);
  const expectedBytes = new TextEncoder().encode(user.password_hash);
  const actualBytes = new TextEncoder().encode(actual);
  if (expectedBytes.byteLength !== actualBytes.byteLength || !timingSafeEqual(expectedBytes, actualBytes)) return null;
  if (user.email === null) db.prepare('UPDATE admin_users SET email = ? WHERE id = ? AND email IS NULL').run(email, user.id);
  return { id: user.id, name: user.name, role: user.role };
}

export function createAdminSession(db: DatabaseSync, user: AdminUser): { token: string; session: AdminSession } {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO admin_sessions (user_id, token_hash, csrf_token, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user.id, hashSessionToken(token), csrfToken, now.toISOString(), expires.toISOString(), now.toISOString());
  return { token, session: { user, csrfToken, expiresAt: expires.toISOString() } };
}

export function getAdminSession(db: DatabaseSync, token: string | null): AdminSession | null {
  if (!token || token.length < 20 || token.length > 200) return null;
  const now = new Date().toISOString();
  const item = db.prepare(`
    SELECT s.user_id, u.name, u.role, s.csrf_token, s.expires_at
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.role = 'INTERNAL'
  `).get(hashSessionToken(token), now) as SessionRow | undefined;
  if (!item) return null;
  db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?').run(new Date().toISOString(), hashSessionToken(token));
  return {
    user: { id: item.user_id, name: item.name, role: item.role },
    csrfToken: item.csrf_token,
    expiresAt: item.expires_at
  };
}

export function revokeAdminSession(db: DatabaseSync, token: string | null): void {
  if (!token) return;
  db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hashSessionToken(token));
}

export function cleanupExpiredSessions(db: DatabaseSync): void {
  db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(new Date().toISOString());
}
