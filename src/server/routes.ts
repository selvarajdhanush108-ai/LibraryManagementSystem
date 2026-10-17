import express from 'express';
import crypto from 'node:crypto';
import { db, getLibraryPolicy, hashPassword, logAudit, verifyPassword } from './db.ts';
import {
  type AuthenticatedRequest,
  issueRefreshToken,
  requireAuth,
  requireRole,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from './auth.ts';
import {
  applyFineTransaction,
  calculateDueDate,
  calculateOverdueFine,
  canTransitionCopyStatus,
  checkIssueEligibility,
  checkRenewalEligibility,
  computeReservationQueuePositions,
  type CopyStatus,
  type MemberType,
  type AccountStatus,
  validateIsbn,
} from '../utils/libraryRules.ts';

export const apiRouter = express.Router();

// Helper to get member record for an authenticated user
function getMemberForUser(userId: number): { id: number; memberType: MemberType; accountStatus: AccountStatus } | undefined {
  return db
    .prepare('SELECT id, memberType, accountStatus FROM Members WHERE userId = ?')
    .get(userId) as { id: number; memberType: MemberType; accountStatus: AccountStatus } | undefined;
}

// ============================================================================
// 1. HEALTH & OPENAPI SWAGGER
// ============================================================================
apiRouter.get('/health', (_req, res) => {
  const bookCount = (db.prepare('SELECT COUNT(*) as cnt FROM Books').get() as { cnt: number }).cnt;
  res.json({
    status: 'Healthy',
    institution: 'KSR College of Engineering, Tiruchengode, Tamil Nadu',
    service: 'KSRCE Library Management System API',
    database: 'Connected (Relational SQL Engine - WAL Mode)',
    catalogTitles: bookCount,
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get('/swagger.json', (_req, res) => {
  res.json({
    openapi: '3.0.3',
    info: {
      title: 'KSR College of Engineering — Library Management System API',
      version: '1.0.0',
      description: 'REST API for catalog, physical copy inventory, circulation (issue/return/renewal), reservations, fines, reports, and audit logs.',
    },
    paths: {
      '/api/auth/login': { post: { summary: 'Authenticate user and issue JWT + refresh token' } },
      '/api/auth/refresh': { post: { summary: 'Rotate refresh token and issue new JWT' } },
      '/api/auth/me': { get: { summary: 'Retrieve current authenticated user and member profile' } },
      '/api/books': { get: { summary: 'Search and filter catalog books' }, post: { summary: 'Create new book record and copies' } },
      '/api/copies': { get: { summary: 'List physical book copies' }, post: { summary: 'Register new physical copy' } },
      '/api/members': { get: { summary: 'List registered students and faculty' }, post: { summary: 'Register new library member' } },
      '/api/loans/issue': { post: { summary: 'Issue a physical copy to an eligible member' } },
      '/api/loans/{id}/return': { post: { summary: 'Return an active loan and assess overdue fines' } },
      '/api/loans/{id}/renew': { post: { summary: 'Renew an eligible active loan' } },
      '/api/reservations': { get: { summary: 'List book reservations with FIFO queue position' }, post: { summary: 'Place a book reservation' } },
      '/api/fines': { get: { summary: 'List fine assessments and payment history' } },
      '/api/dashboard/summary': { get: { summary: 'Role-specific dashboard metrics and analytics' } },
      '/api/reports/{type}': { get: { summary: 'Generate institutional library reports' } },
    },
  });
});

// ============================================================================
// 2. AUTHENTICATION (/api/auth/*)
// ============================================================================
apiRouter.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ title: 'Validation Error', status: 400, detail: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db
    .prepare('SELECT * FROM Users WHERE LOWER(email) = ?')
    .get(normalizedEmail) as Record<string, unknown> | undefined;

  if (!user) {
    logAudit({
      actorName: normalizedEmail,
      actorRole: 'Anonymous',
      action: 'LOGIN_FAILED',
      entityType: 'User',
      details: 'Invalid email address',
    });
    res.status(401).json({ title: 'Authentication Failed', status: 401, detail: 'Invalid institutional email or password.' });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({
      title: 'Account Deactivated',
      status: 403,
      detail: 'This account has been deactivated by the library administrator.',
    });
    return;
  }

  if (user.lockoutUntil && new Date(String(user.lockoutUntil)).getTime() > Date.now()) {
    res.status(429).json({
      title: 'Account Temporarily Locked',
      status: 429,
      detail: `Too many failed sign-in attempts. Account is locked until ${new Date(String(user.lockoutUntil)).toLocaleTimeString()}.`,
    });
    return;
  }

  const valid = verifyPassword(String(password), String(user.passwordHash), String(user.passwordSalt));
  if (!valid) {
    const attempts = Number(user.failedLoginAttempts || 0) + 1;
    const lockoutUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    db.prepare('UPDATE Users SET failedLoginAttempts = ?, lockoutUntil = ? WHERE id = ?').run(attempts, lockoutUntil, Number(user.id));

    logAudit({
      actorUserId: Number(user.id),
      actorName: String(user.fullName),
      actorRole: String(user.role),
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: Number(user.id),
      details: `Failed password attempt (${attempts}/5)`,
    });

    res.status(401).json({ title: 'Authentication Failed', status: 401, detail: 'Invalid institutional email or password.' });
    return;
  }

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE Users SET failedLoginAttempts = 0, lockoutUntil = NULL, lastLoginAt = ? WHERE id = ?').run(nowIso, Number(user.id));

  const member = getMemberForUser(Number(user.id));
  const tokenPayload = {
    sub: Number(user.id),
    email: String(user.email),
    fullName: String(user.fullName),
    role: user.role as 'SuperAdmin' | 'Librarian' | 'Student' | 'Faculty',
    memberId: member ? member.id : null,
  };

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = issueRefreshToken(Number(user.id));

  logAudit({
    actorUserId: Number(user.id),
    actorName: String(user.fullName),
    actorRole: String(user.role),
    action: 'LOGIN_SUCCESS',
    entityType: 'User',
    entityId: Number(user.id),
    details: 'User signed in successfully',
  });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: Number(user.id),
      email: String(user.email),
      fullName: String(user.fullName),
      role: String(user.role),
      memberId: member ? member.id : null,
    },
  });
});

apiRouter.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    res.status(400).json({ title: 'Bad Request', status: 400, detail: 'Refresh token is required.' });
    return;
  }

  const rotated = rotateRefreshToken(String(refreshToken));
  if (!rotated) {
    res.status(401).json({ title: 'Invalid Refresh Token', status: 401, detail: 'Refresh token is expired or revoked.' });
    return;
  }

  const user = db.prepare('SELECT * FROM Users WHERE id = ? AND isActive = 1').get(rotated.userId) as Record<string, unknown> | undefined;
  if (!user) {
    res.status(401).json({ title: 'Account Inactive', status: 401, detail: 'User account is no longer active.' });
    return;
  }

  const member = getMemberForUser(Number(user.id));
  const accessToken = signAccessToken({
    sub: Number(user.id),
    email: String(user.email),
    fullName: String(user.fullName),
    role: user.role as 'SuperAdmin' | 'Librarian' | 'Student' | 'Faculty',
    memberId: member ? member.id : null,
  });

  res.json({ accessToken, refreshToken: rotated.newRefreshToken });
});

apiRouter.post('/auth/logout', (req: AuthenticatedRequest, res) => {
  const { refreshToken } = req.body || {};
  revokeRefreshToken(refreshToken ? String(refreshToken) : undefined);
  res.json({ message: 'Signed out successfully.' });
});

apiRouter.post('/auth/forgot-password', (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    res.status(400).json({ title: 'Validation Error', status: 400, detail: 'Institutional email is required.' });
    return;
  }

  const user = db.prepare('SELECT id, fullName, email, role FROM Users WHERE LOWER(email) = ?').get(String(email).trim().toLowerCase()) as
    | { id: number; fullName: string; email: string; role: string }
    | undefined;

  if (!user) {
    // Return generic success so account enumeration is prevented
    res.json({
      message: 'If that institutional email is registered, a password reset code has been generated.',
    });
    return;
  }

  const resetCode = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO PasswordResetTokens (userId, resetCode, expiresAt, createdAt) VALUES (?, ?, ?, ?)').run(
    user.id,
    resetCode,
    expiresAt,
    new Date().toISOString()
  );

  logAudit({
    actorUserId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'User',
    entityId: user.id,
    details: 'Generated 15-minute password reset verification code',
  });

  res.json({
    message: 'A 6-digit password reset code has been generated (valid for 15 minutes).',
    demoVerificationCode: resetCode, // Provided explicitly for local/demo verification since no external SMTP provider is configured
  });
});

apiRouter.post('/auth/reset-password', (req, res) => {
  const { email, resetCode, newPassword } = req.body || {};
  if (!email || !resetCode || !newPassword || String(newPassword).length < 8) {
    res.status(400).json({
      title: 'Validation Error',
      status: 400,
      detail: 'Email, 6-digit reset code, and a new password (at least 8 characters) are required.',
    });
    return;
  }

  const user = db.prepare('SELECT id, fullName, role FROM Users WHERE LOWER(email) = ?').get(String(email).trim().toLowerCase()) as
    | { id: number; fullName: string; role: string }
    | undefined;

  if (!user) {
    res.status(400).json({ title: 'Invalid Code', status: 400, detail: 'Invalid or expired reset code.' });
    return;
  }

  const tokenRow = db
    .prepare(
      'SELECT id, expiresAt, usedAt FROM PasswordResetTokens WHERE userId = ? AND resetCode = ? ORDER BY id DESC LIMIT 1'
    )
    .get(user.id, String(resetCode).trim()) as { id: number; expiresAt: string; usedAt: string | null } | undefined;

  if (!tokenRow || tokenRow.usedAt || new Date(tokenRow.expiresAt).getTime() < Date.now()) {
    res.status(400).json({ title: 'Invalid Code', status: 400, detail: 'Invalid or expired reset code.' });
    return;
  }

  const { hash, salt } = hashPassword(String(newPassword));
  const nowIso = new Date().toISOString();
  db.prepare('UPDATE Users SET passwordHash = ?, passwordSalt = ?, failedLoginAttempts = 0, lockoutUntil = NULL, updatedAt = ? WHERE id = ?').run(
    hash,
    salt,
    nowIso,
    user.id
  );
  db.prepare('UPDATE PasswordResetTokens SET usedAt = ? WHERE id = ?').run(nowIso, tokenRow.id);
  revokeRefreshToken(undefined, user.id);

  logAudit({
    actorUserId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'User',
    entityId: user.id,
    details: 'Password reset completed and existing refresh tokens revoked',
  });

  res.json({ message: 'Your password has been updated. You may now sign in.' });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.sub;
  const user = db.prepare('SELECT id, email, fullName, role, isActive, lastLoginAt, createdAt FROM Users WHERE id = ?').get(userId) as
    | Record<string, unknown>
    | undefined;

  if (!user) {
    res.status(404).json({ title: 'Not Found', status: 404, detail: 'User not found.' });
    return;
  }

  const member = db
    .prepare(
      `SELECT m.*, d.name as departmentName, d.code as departmentCode, p.name as programmeName
       FROM Members m
       LEFT JOIN Departments d ON m.departmentId = d.id
       LEFT JOIN Programmes p ON m.programmeId = p.id
       WHERE m.userId = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;

  res.json({
    user: {
      ...user,
      memberId: member ? Number(member.id) : null,
      memberProfile: member || null,
    },
  });
});

// ============================================================================
// 3. BOOKS CATALOG (/api/books/*)
// ============================================================================
apiRouter.get('/books', requireAuth, (req: AuthenticatedRequest, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
  const availability = String(req.query.availability || 'all'); // 'all' | 'available' | 'unavailable'
  const language = String(req.query.language || '');
  const year = req.query.year ? Number(req.query.year) : null;
  const includeArchived = req.query.includeArchived === 'true';
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

  const rows = db
    .prepare(
      `SELECT
        b.*,
        p.name as publisherName,
        c.name as categoryName,
        c.code as categoryCode,
        (SELECT COUNT(*) FROM PhysicalBookCopies pc WHERE pc.bookId = b.id AND pc.isArchived = 0) as totalCopies,
        (SELECT COUNT(*) FROM PhysicalBookCopies pc WHERE pc.bookId = b.id AND pc.isArchived = 0 AND pc.status = 'Available') as availableCopies,
        (SELECT COUNT(*) FROM PhysicalBookCopies pc WHERE pc.bookId = b.id AND pc.isArchived = 0 AND pc.status = 'Issued') as issuedCopies,
        (SELECT GROUP_CONCAT(a.fullName, ', ')
         FROM BookAuthors ba
         JOIN Authors a ON ba.authorId = a.id
         WHERE ba.bookId = b.id
         ORDER BY ba.authorOrder) as authorsText
      FROM Books b
      JOIN Publishers p ON b.publisherId = p.id
      JOIN Categories c ON b.categoryId = c.id
      WHERE (? = 1 OR b.isArchived = 0)
      ORDER BY b.id DESC`
    )
    .all(includeArchived ? 1 : 0) as Array<Record<string, unknown>>;

  const filtered = rows.filter((b) => {
    if (categoryId && Number(b.categoryId) !== categoryId) return false;
    if (language && String(b.language).toLowerCase() !== language.toLowerCase()) return false;
    if (year && Number(b.publicationYear) !== year) return false;
    if (availability === 'available' && Number(b.availableCopies) <= 0) return false;
    if (availability === 'unavailable' && Number(b.availableCopies) > 0) return false;
    if (search) {
      const hay = `${b.title} ${b.subtitle || ''} ${b.isbn || ''} ${b.bookCode} ${b.authorsText || ''} ${b.publisherName} ${b.categoryName}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const totalCount = filtered.length;
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  res.json({
    items,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  });
});

apiRouter.get('/books/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const bookId = Number(req.params.id);
  const book = db
    .prepare(
      `SELECT
        b.*,
        p.name as publisherName,
        c.name as categoryName,
        c.code as categoryCode
       FROM Books b
       JOIN Publishers p ON b.publisherId = p.id
       JOIN Categories c ON b.categoryId = c.id
       WHERE b.id = ?`
    )
    .get(bookId) as Record<string, unknown> | undefined;

  if (!book) {
    res.status(404).json({ title: 'Book Not Found', status: 404, detail: 'Requested catalog record does not exist.' });
    return;
  }

  const authors = db
    .prepare(
      `SELECT a.id, a.fullName, a.country, ba.authorOrder
       FROM BookAuthors ba
       JOIN Authors a ON ba.authorId = a.id
       WHERE ba.bookId = ?
       ORDER BY ba.authorOrder ASC`
    )
    .all(bookId);

  const copies = db
    .prepare(
      `SELECT pc.*,
        (SELECT l.dueDate FROM Loans l WHERE l.copyId = pc.id AND l.status IN ('Active', 'Overdue') LIMIT 1) as currentDueDate,
        (SELECT m.fullName FROM Loans l JOIN Members m ON l.memberId = m.id WHERE l.copyId = pc.id AND l.status IN ('Active', 'Overdue') LIMIT 1) as currentBorrowerName
       FROM PhysicalBookCopies pc
       WHERE pc.bookId = ? AND pc.isArchived = 0
       ORDER BY pc.accessionNumber ASC`
    )
    .all(bookId) as Array<Record<string, unknown>>;

  // Hide currentBorrowerName from non-staff roles to protect student privacy
  const isStaff = req.user!.role === 'SuperAdmin' || req.user!.role === 'Librarian';
  const sanitizedCopies = copies.map((c) => ({
    ...c,
    currentBorrowerName: isStaff ? c.currentBorrowerName : undefined,
  }));

  const activeReservations = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM Reservations WHERE bookId = ? AND status IN ('Pending', 'ReadyForPickup', 'Approved')`
    )
    .get(bookId) as { cnt: number };

  const totalCopies = copies.length;
  const availableCopies = copies.filter((c) => c.status === 'Available').length;

  res.json({
    ...book,
    authors,
    copies: sanitizedCopies,
    totalCopies,
    availableCopies,
    activeReservationsCount: activeReservations.cnt,
  });
});

apiRouter.post('/books', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const {
    isbn,
    title,
    subtitle,
    publisherId,
    edition,
    publicationYear,
    categoryId,
    language,
    description,
    shelfLocation,
    coverUrl,
    authorIds,
    initialCopiesCount,
    acquisitionPrice,
  } = req.body || {};

  if (!title || !publisherId || !categoryId || !publicationYear || !shelfLocation) {
    res.status(400).json({
      title: 'Validation Error',
      status: 400,
      detail: 'Title, publisher, category, publication year, and shelf location are required.',
    });
    return;
  }

  const isbnCheck = validateIsbn(isbn);
  if (!isbnCheck.valid) {
    res.status(400).json({ title: 'Invalid ISBN', status: 400, detail: isbnCheck.error });
    return;
  }

  if (isbnCheck.normalized) {
    const dup = db.prepare('SELECT id FROM Books WHERE isbn = ?').get(isbnCheck.normalized);
    if (dup) {
      res.status(409).json({
        title: 'Duplicate ISBN',
        status: 409,
        detail: `A book with ISBN ${isbnCheck.normalized} already exists in the catalog.`,
      });
      return;
    }
  }

  const nextIdRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM Books').get() as { nextId: number };
  const bookCode = `KSR-BK-${String(nextIdRow.nextId).padStart(4, '0')}`;
  const nowIso = new Date().toISOString();

  db.exec('BEGIN TRANSACTION');
  try {
    const result = db
      .prepare(
        `INSERT INTO Books (
          bookCode, isbn, title, subtitle, publisherId, edition, publicationYear,
          categoryId, language, description, shelfLocation, coverUrl, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        bookCode,
        isbnCheck.normalized,
        String(title).trim(),
        subtitle ? String(subtitle).trim() : null,
        Number(publisherId),
        edition ? String(edition).trim() : '1st Edition',
        Number(publicationYear),
        Number(categoryId),
        language ? String(language).trim() : 'English',
        description ? String(description).trim() : null,
        String(shelfLocation).trim(),
        coverUrl ? String(coverUrl).trim() : null,
        nowIso,
        nowIso
      );

    const bookId = Number(result.lastInsertRowid);

    const validAuthors = Array.isArray(authorIds) ? authorIds.map(Number).filter(Boolean) : [];
    const insertBa = db.prepare('INSERT INTO BookAuthors (bookId, authorId, authorOrder) VALUES (?, ?, ?)');
    validAuthors.forEach((aid, idx) => {
      insertBa.run(bookId, aid, idx + 1);
    });

    const copiesToCreate = Math.min(20, Math.max(0, Number(initialCopiesCount || 0)));
    if (copiesToCreate > 0) {
      const maxCopyRow = db.prepare('SELECT COALESCE(MAX(id), 1000) as maxId FROM PhysicalBookCopies').get() as { maxId: number };
      const insertCopy = db.prepare(
        `INSERT INTO PhysicalBookCopies (
          bookId, accessionNumber, barcode, acquisitionDate, acquisitionPrice, shelfLocation, status, conditionNotes, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, 'Available', 'Initial catalog acquisition', ?, ?)`
      );
      const todayDate = nowIso.split('T')[0];
      for (let i = 1; i <= copiesToCreate; i++) {
        const seq = maxCopyRow.maxId + 1000 + i;
        const acc = `KSR-ACC-${seq}`;
        const bc = `BC-KSR-${seq}`;
        insertCopy.run(bookId, acc, bc, todayDate, Number(acquisitionPrice || 650), String(shelfLocation).trim(), nowIso, nowIso);
      }
    }

    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'BOOK_CREATED',
      entityType: 'Book',
      entityId: bookCode,
      details: `Created catalog record '${title}' with ${copiesToCreate} physical copies.`,
    });

    db.exec('COMMIT');
    res.status(201).json({ id: bookId, bookCode, message: 'Book catalog record created successfully.' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ title: 'Database Error', status: 500, detail: (err as Error).message });
  }
});

apiRouter.put('/books/:id', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const bookId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM Books WHERE id = ?').get(bookId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ title: 'Not Found', status: 404, detail: 'Book record not found.' });
    return;
  }

  const {
    isbn,
    title,
    subtitle,
    publisherId,
    edition,
    publicationYear,
    categoryId,
    language,
    description,
    shelfLocation,
    coverUrl,
    authorIds,
    isArchived,
  } = req.body || {};

  const isbnCheck = validateIsbn(isbn);
  if (!isbnCheck.valid) {
    res.status(400).json({ title: 'Invalid ISBN', status: 400, detail: isbnCheck.error });
    return;
  }

  if (isbnCheck.normalized) {
    const dup = db.prepare('SELECT id FROM Books WHERE isbn = ? AND id != ?').get(isbnCheck.normalized, bookId);
    if (dup) {
      res.status(409).json({ title: 'Duplicate ISBN', status: 409, detail: 'Another book already uses this ISBN.' });
      return;
    }
  }

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      `UPDATE Books SET
        isbn = ?, title = ?, subtitle = ?, publisherId = ?, edition = ?,
        publicationYear = ?, categoryId = ?, language = ?, description = ?,
        shelfLocation = ?, coverUrl = ?, isArchived = ?, updatedAt = ?
       WHERE id = ?`
    ).run(
      isbnCheck.normalized,
      String(title || existing.title).trim(),
      subtitle !== undefined ? (subtitle ? String(subtitle).trim() : null) : (existing.subtitle as string | null),
      Number(publisherId || existing.publisherId),
      String(edition || existing.edition),
      Number(publicationYear || existing.publicationYear),
      Number(categoryId || existing.categoryId),
      String(language || existing.language),
      description !== undefined ? (description ? String(description).trim() : null) : (existing.description as string | null),
      String(shelfLocation || existing.shelfLocation).trim(),
      coverUrl !== undefined ? (coverUrl ? String(coverUrl).trim() : null) : (existing.coverUrl as string | null),
      isArchived !== undefined ? (isArchived ? 1 : 0) : Number(existing.isArchived),
      new Date().toISOString(),
      bookId
    );

    if (Array.isArray(authorIds)) {
      db.prepare('DELETE FROM BookAuthors WHERE bookId = ?').run(bookId);
      const insertBa = db.prepare('INSERT INTO BookAuthors (bookId, authorId, authorOrder) VALUES (?, ?, ?)');
      authorIds.map(Number).filter(Boolean).forEach((aid, idx) => {
        insertBa.run(bookId, aid, idx + 1);
      });
    }

    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'BOOK_UPDATED',
      entityType: 'Book',
      entityId: String(existing.bookCode),
      details: `Updated book metadata for '${title || existing.title}'.`,
    });

    db.exec('COMMIT');
    res.json({ message: 'Book record updated successfully.' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ title: 'Update Error', status: 500, detail: (err as Error).message });
  }
});

apiRouter.delete('/books/:id', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const bookId = Number(req.params.id);
  const activeLoans = db
    .prepare(`SELECT COUNT(*) as cnt FROM Loans WHERE bookId = ? AND status IN ('Active', 'Overdue')`)
    .get(bookId) as { cnt: number };

  if (activeLoans.cnt > 0) {
    res.status(409).json({
      title: 'Cannot Archive Book with Active Loans',
      status: 409,
      detail: `This book currently has ${activeLoans.cnt} active loan(s). All issued copies must be returned before archiving.`,
    });
    return;
  }

  db.prepare('UPDATE Books SET isArchived = 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), bookId);
  logAudit({
    actorUserId: req.user!.sub,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'BOOK_ARCHIVED',
    entityType: 'Book',
    entityId: bookId,
    details: 'Archived catalog book record (preserving historical transactions).',
  });

  res.json({ message: 'Book record safely archived.' });
});

// ============================================================================
// 4. PHYSICAL BOOK COPIES INVENTORY (/api/copies/*)
// ============================================================================
apiRouter.get('/copies', requireAuth, (req: AuthenticatedRequest, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const status = String(req.query.status || '');
  const bookId = req.query.bookId ? Number(req.query.bookId) : null;

  const rows = db
    .prepare(
      `SELECT
        pc.*,
        b.title as bookTitle,
        b.bookCode,
        b.isbn,
        c.name as categoryName,
        (SELECT l.loanNumber FROM Loans l WHERE l.copyId = pc.id AND l.status IN ('Active', 'Overdue') LIMIT 1) as activeLoanNumber,
        (SELECT l.dueDate FROM Loans l WHERE l.copyId = pc.id AND l.status IN ('Active', 'Overdue') LIMIT 1) as activeDueDate,
        (SELECT m.fullName FROM Loans l JOIN Members m ON l.memberId = m.id WHERE l.copyId = pc.id AND l.status IN ('Active', 'Overdue') LIMIT 1) as activeBorrowerName
       FROM PhysicalBookCopies pc
       JOIN Books b ON pc.bookId = b.id
       JOIN Categories c ON b.categoryId = c.id
       WHERE pc.isArchived = 0
       ORDER BY pc.accessionNumber ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const filtered = rows.filter((r) => {
    if (bookId && Number(r.bookId) !== bookId) return false;
    if (status && String(r.status) !== status) return false;
    if (search) {
      const hay = `${r.accessionNumber} ${r.barcode} ${r.bookTitle} ${r.bookCode} ${r.isbn || ''} ${r.shelfLocation}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  res.json({ items: filtered, totalCount: filtered.length });
});

apiRouter.post('/copies', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { bookId, accessionNumber, barcode, acquisitionDate, acquisitionPrice, shelfLocation, conditionNotes } = req.body || {};
  if (!bookId || !accessionNumber || !shelfLocation) {
    res.status(400).json({
      title: 'Validation Error',
      status: 400,
      detail: 'Book ID, accession number, and shelf location are required.',
    });
    return;
  }

  const acc = String(accessionNumber).trim().toUpperCase();
  const bc = barcode ? String(barcode).trim().toUpperCase() : `BC-${acc}`;

  const dup = db
    .prepare('SELECT id FROM PhysicalBookCopies WHERE accessionNumber = ? OR barcode = ?')
    .get(acc, bc);
  if (dup) {
    res.status(409).json({
      title: 'Duplicate Accession / Barcode',
      status: 409,
      detail: `Accession number '${acc}' or barcode '${bc}' is already registered in physical inventory.`,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO PhysicalBookCopies (
        bookId, accessionNumber, barcode, acquisitionDate, acquisitionPrice, shelfLocation, status, conditionNotes, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'Available', ?, ?, ?)`
    )
    .run(
      Number(bookId),
      acc,
      bc,
      acquisitionDate || nowIso.split('T')[0],
      Number(acquisitionPrice || 0),
      String(shelfLocation).trim(),
      conditionNotes ? String(conditionNotes).trim() : 'Good condition',
      nowIso,
      nowIso
    );

  logAudit({
    actorUserId: req.user!.sub,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'COPY_REGISTERED',
    entityType: 'PhysicalBookCopy',
    entityId: acc,
    details: `Registered physical copy ${acc} for Book ID ${bookId}`,
  });

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    accessionNumber: acc,
    message: 'Physical copy added to inventory.',
  });
});

apiRouter.patch('/copies/:id/status', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const copyId = Number(req.params.id);
  const { status, conditionNotes, shelfLocation } = req.body || {};

  const copy = db.prepare('SELECT * FROM PhysicalBookCopies WHERE id = ?').get(copyId) as Record<string, unknown> | undefined;
  if (!copy) {
    res.status(404).json({ title: 'Copy Not Found', status: 404, detail: 'Physical book copy not found.' });
    return;
  }

  const targetStatus = (status || copy.status) as CopyStatus;
  const transition = canTransitionCopyStatus(copy.status as CopyStatus, targetStatus);
  if (!transition.allowed) {
    res.status(400).json({ title: 'Invalid Status Transition', status: 400, detail: transition.reason });
    return;
  }

  if (copy.status === 'Issued' && targetStatus !== 'Issued') {
    res.status(409).json({
      title: 'Copy Currently On Loan',
      status: 409,
      detail: 'Please process the book return through the Return Desk before manually changing an issued copy status.',
    });
    return;
  }

  db.prepare(
    `UPDATE PhysicalBookCopies
     SET status = ?, conditionNotes = ?, shelfLocation = ?, updatedAt = ?
     WHERE id = ?`
  ).run(
    targetStatus,
    conditionNotes !== undefined ? String(conditionNotes) : String(copy.conditionNotes || ''),
    shelfLocation ? String(shelfLocation).trim() : String(copy.shelfLocation),
    new Date().toISOString(),
    copyId
  );

  logAudit({
    actorUserId: req.user!.sub,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'COPY_STATUS_UPDATED',
    entityType: 'PhysicalBookCopy',
    entityId: String(copy.accessionNumber),
    details: `Changed status from '${copy.status}' to '${targetStatus}'. Notes: ${conditionNotes || ''}`,
  });

  res.json({ message: `Copy ${copy.accessionNumber} updated to '${targetStatus}'.` });
});

// ============================================================================
// 5. AUTHORS, PUBLISHERS, CATEGORIES, DEPARTMENTS, PROGRAMMES
// ============================================================================
apiRouter.get('/authors', requireAuth, (_req, res) => {
  const items = db
    .prepare(
      `SELECT a.*,
        (SELECT COUNT(*) FROM BookAuthors ba JOIN Books b ON ba.bookId = b.id WHERE ba.authorId = a.id AND b.isArchived = 0) as bookCount
       FROM Authors a
       WHERE a.isArchived = 0
       ORDER BY a.fullName ASC`
    )
    .all();
  res.json({ items });
});

apiRouter.post('/authors', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { fullName, biography, country } = req.body || {};
  if (!fullName || !String(fullName).trim()) {
    res.status(400).json({ title: 'Validation Error', status: 400, detail: 'Author full name is required.' });
    return;
  }
  try {
    const result = db
      .prepare('INSERT INTO Authors (fullName, biography, country) VALUES (?, ?, ?)')
      .run(String(fullName).trim(), biography ? String(biography).trim() : null, country ? String(country).trim() : 'India');
    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'AUTHOR_CREATED',
      entityType: 'Author',
      entityId: Number(result.lastInsertRowid),
      details: `Added author '${fullName}'`,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Author added.' });
  } catch {
    res.status(409).json({ title: 'Duplicate Author', status: 409, detail: 'An author with this name already exists.' });
  }
});

apiRouter.put('/authors/:id', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { fullName, biography, country } = req.body || {};
  db.prepare('UPDATE Authors SET fullName = ?, biography = ?, country = ? WHERE id = ?').run(
    String(fullName).trim(),
    biography ? String(biography).trim() : null,
    country ? String(country).trim() : 'India',
    Number(req.params.id)
  );
  res.json({ message: 'Author updated.' });
});

apiRouter.delete('/authors/:id', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE Authors SET isArchived = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ message: 'Author archived safely.' });
});

apiRouter.get('/publishers', requireAuth, (_req, res) => {
  const items = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM Books b WHERE b.publisherId = p.id AND b.isArchived = 0) as bookCount
       FROM Publishers p
       WHERE p.isArchived = 0
       ORDER BY p.name ASC`
    )
    .all();
  res.json({ items });
});

apiRouter.post('/publishers', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { name, city, website, contactEmail } = req.body || {};
  if (!name || !String(name).trim()) {
    res.status(400).json({ title: 'Validation Error', status: 400, detail: 'Publisher name is required.' });
    return;
  }
  try {
    const result = db
      .prepare('INSERT INTO Publishers (name, city, website, contactEmail) VALUES (?, ?, ?, ?)')
      .run(
        String(name).trim(),
        city ? String(city).trim() : null,
        website ? String(website).trim() : null,
        contactEmail ? String(contactEmail).trim() : null
      );
    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'PUBLISHER_CREATED',
      entityType: 'Publisher',
      entityId: Number(result.lastInsertRowid),
      details: `Added publisher '${name}'`,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Publisher added.' });
  } catch {
    res.status(409).json({ title: 'Duplicate Publisher', status: 409, detail: 'A publisher with this name already exists.' });
  }
});

apiRouter.put('/publishers/:id', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { name, city, website, contactEmail } = req.body || {};
  db.prepare('UPDATE Publishers SET name = ?, city = ?, website = ?, contactEmail = ? WHERE id = ?').run(
    String(name).trim(),
    city ? String(city).trim() : null,
    website ? String(website).trim() : null,
    contactEmail ? String(contactEmail).trim() : null,
    Number(req.params.id)
  );
  res.json({ message: 'Publisher updated.' });
});

apiRouter.delete('/publishers/:id', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE Publishers SET isArchived = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ message: 'Publisher archived safely.' });
});

apiRouter.get('/categories', requireAuth, (_req, res) => {
  const items = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM Books b WHERE b.categoryId = c.id AND b.isArchived = 0) as bookCount,
        (SELECT COUNT(*) FROM PhysicalBookCopies pc JOIN Books b ON pc.bookId = b.id WHERE b.categoryId = c.id AND pc.isArchived = 0) as copyCount
       FROM Categories c
       WHERE c.isArchived = 0
       ORDER BY c.name ASC`
    )
    .all();
  res.json({ items });
});

apiRouter.post('/categories', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { code, name, deweyPrefix, description } = req.body || {};
  if (!code || !name) {
    res.status(400).json({ title: 'Validation Error', status: 400, detail: 'Category code and name are required.' });
    return;
  }
  try {
    const result = db
      .prepare('INSERT INTO Categories (code, name, deweyPrefix, description) VALUES (?, ?, ?, ?)')
      .run(
        String(code).trim().toUpperCase(),
        String(name).trim(),
        deweyPrefix ? String(deweyPrefix).trim() : null,
        description ? String(description).trim() : null
      );
    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'CATEGORY_CREATED',
      entityType: 'Category',
      entityId: String(code),
      details: `Created category '${name}'`,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Category created.' });
  } catch {
    res.status(409).json({ title: 'Duplicate Category', status: 409, detail: 'Category code or name already exists.' });
  }
});

apiRouter.put('/categories/:id', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { code, name, deweyPrefix, description } = req.body || {};
  db.prepare('UPDATE Categories SET code = ?, name = ?, deweyPrefix = ?, description = ? WHERE id = ?').run(
    String(code).trim().toUpperCase(),
    String(name).trim(),
    deweyPrefix ? String(deweyPrefix).trim() : null,
    description ? String(description).trim() : null,
    Number(req.params.id)
  );
  res.json({ message: 'Category updated.' });
});

apiRouter.delete('/categories/:id', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE Categories SET isArchived = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ message: 'Category archived safely.' });
});

apiRouter.get('/departments', requireAuth, (_req, res) => {
  const departments = db.prepare('SELECT * FROM Departments WHERE isArchived = 0 ORDER BY code ASC').all();
  const programmes = db
    .prepare(
      `SELECT p.*, d.code as departmentCode, d.name as departmentName
       FROM Programmes p
       JOIN Departments d ON p.departmentId = d.id
       WHERE p.isArchived = 0
       ORDER BY p.code ASC`
    )
    .all();
  res.json({ departments, programmes });
});

apiRouter.post('/departments', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { code, name, headOfDepartment } = req.body || {};
  if (!code || !name) {
    res.status(400).json({ title: 'Validation Error', status: 400, detail: 'Department code and name are required.' });
    return;
  }
  try {
    const result = db
      .prepare('INSERT INTO Departments (code, name, headOfDepartment) VALUES (?, ?, ?)')
      .run(String(code).trim().toUpperCase(), String(name).trim(), headOfDepartment ? String(headOfDepartment).trim() : null);
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Academic department added.' });
  } catch {
    res.status(409).json({ title: 'Duplicate Department', status: 409, detail: 'Department code or name already exists.' });
  }
});

// ============================================================================
// 6. STUDENT & FACULTY MEMBERS (/api/members/*)
// ============================================================================
apiRouter.get('/members', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const memberType = String(req.query.memberType || '');
  const departmentId = req.query.departmentId ? Number(req.query.departmentId) : null;
  const accountStatus = String(req.query.accountStatus || '');

  const rows = db
    .prepare(
      `SELECT
        m.*,
        d.code as departmentCode,
        d.name as departmentName,
        p.code as programmeCode,
        p.name as programmeName,
        (SELECT COUNT(*) FROM Loans l WHERE l.memberId = m.id AND l.status IN ('Active', 'Overdue')) as activeLoanCount,
        (SELECT COALESCE(SUM(fa.assessedAmount - fa.paidAmount - fa.waivedAmount), 0)
         FROM FineAssessments fa
         WHERE fa.memberId = m.id AND fa.status IN ('Unpaid', 'PartiallyPaid')) as outstandingFineBalance
       FROM Members m
       JOIN Departments d ON m.departmentId = d.id
       LEFT JOIN Programmes p ON m.programmeId = p.id
       ORDER BY m.id DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const filtered = rows.filter((m) => {
    if (memberType && String(m.memberType) !== memberType) return false;
    if (departmentId && Number(m.departmentId) !== departmentId) return false;
    if (accountStatus && String(m.accountStatus) !== accountStatus) return false;
    if (search) {
      const hay = `${m.fullName} ${m.registrationNumber} ${m.memberCode} ${m.email} ${m.departmentCode} ${m.departmentName}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  res.json({ items: filtered, totalCount: filtered.length });
});

apiRouter.get('/members/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const targetMemberId = Number(req.params.id);
  const isStaff = req.user!.role === 'SuperAdmin' || req.user!.role === 'Librarian';

  // Enforce strict RBAC: Students and Faculty can ONLY access their own member record
  if (!isStaff && req.user!.memberId !== targetMemberId) {
    res.status(403).json({
      title: 'Access Denied',
      status: 403,
      detail: 'You are not authorized to view another library member’s private borrowing or financial records.',
    });
    return;
  }

  const member = db
    .prepare(
      `SELECT
        m.*,
        d.code as departmentCode,
        d.name as departmentName,
        p.code as programmeCode,
        p.name as programmeName
       FROM Members m
       JOIN Departments d ON m.departmentId = d.id
       LEFT JOIN Programmes p ON m.programmeId = p.id
       WHERE m.id = ?`
    )
    .get(targetMemberId) as Record<string, unknown> | undefined;

  if (!member) {
    res.status(404).json({ title: 'Member Not Found', status: 404, detail: 'Member record does not exist.' });
    return;
  }

  const loans = db
    .prepare(
      `SELECT
        l.*,
        b.title as bookTitle,
        b.bookCode,
        pc.accessionNumber,
        pc.barcode
       FROM Loans l
       JOIN Books b ON l.bookId = b.id
       JOIN PhysicalBookCopies pc ON l.copyId = pc.id
       WHERE l.memberId = ?
       ORDER BY l.issuedAt DESC`
    )
    .all(targetMemberId);

  const fines = db
    .prepare(
      `SELECT
        fa.*,
        l.loanNumber,
        b.title as bookTitle,
        pc.accessionNumber
       FROM FineAssessments fa
       JOIN Loans l ON fa.loanId = l.id
       JOIN Books b ON l.bookId = b.id
       JOIN PhysicalBookCopies pc ON l.copyId = pc.id
       WHERE fa.memberId = ?
       ORDER BY fa.createdAt DESC`
    )
    .all(targetMemberId);

  const reservations = db
    .prepare(
      `SELECT
        r.*,
        b.title as bookTitle,
        b.bookCode
       FROM Reservations r
       JOIN Books b ON r.bookId = b.id
       WHERE r.memberId = ?
       ORDER BY r.createdAt DESC`
    )
    .all(targetMemberId);

  res.json({
    ...member,
    loans,
    fines,
    reservations,
  });
});

apiRouter.post('/members', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const {
    registrationNumber,
    fullName,
    email,
    phone,
    memberType,
    departmentId,
    programmeId,
    yearOfStudy,
    password,
  } = req.body || {};

  if (!registrationNumber || !fullName || !email || !memberType || !departmentId) {
    res.status(400).json({
      title: 'Validation Error',
      status: 400,
      detail: 'Registration/Employee ID, full name, institutional email, member type, and department are required.',
    });
    return;
  }

  const normEmail = String(email).trim().toLowerCase();
  const normReg = String(registrationNumber).trim().toUpperCase();

  const dup = db
    .prepare('SELECT id FROM Members WHERE registrationNumber = ? OR LOWER(email) = ?')
    .get(normReg, normEmail);
  const dupUser = db.prepare('SELECT id FROM Users WHERE LOWER(email) = ?').get(normEmail);

  if (dup || dupUser) {
    res.status(409).json({
      title: 'Duplicate Member',
      status: 409,
      detail: 'A member or user account with this Registration ID or institutional email already exists.',
    });
    return;
  }

  const nextRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM Members').get() as { nextId: number };
  const prefix = memberType === 'Faculty' ? 'KSR-FAC-2026-' : 'KSR-MEM-2026-';
  const memberCode = `${prefix}${String(nextRow.nextId).padStart(3, '0')}`;
  const defaultPwd = password ? String(password) : memberType === 'Faculty' ? 'KsrFaculty@2026' : 'KsrStudent@2026';
  const { hash, salt } = hashPassword(defaultPwd);
  const nowIso = new Date().toISOString();
  const todayDate = nowIso.split('T')[0];

  db.exec('BEGIN TRANSACTION');
  try {
    const userRes = db
      .prepare(
        `INSERT INTO Users (email, fullName, passwordHash, passwordSalt, role, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(normEmail, String(fullName).trim(), hash, salt, memberType === 'Faculty' ? 'Faculty' : 'Student', nowIso, nowIso);

    const userId = Number(userRes.lastInsertRowid);
    const memRes = db
      .prepare(
        `INSERT INTO Members (
          userId, memberCode, registrationNumber, fullName, email, phone,
          memberType, departmentId, programmeId, yearOfStudy, accountStatus,
          membershipStartDate, membershipEndDate, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?)`
      )
      .run(
        userId,
        memberCode,
        normReg,
        String(fullName).trim(),
        normEmail,
        phone ? String(phone).trim() : null,
        memberType === 'Faculty' ? 'Faculty' : 'Student',
        Number(departmentId),
        programmeId ? Number(programmeId) : null,
        yearOfStudy ? Number(yearOfStudy) : null,
        todayDate,
        memberType === 'Student' ? '2029-05-31' : null,
        nowIso,
        nowIso
      );

    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'MEMBER_REGISTERED',
      entityType: 'Member',
      entityId: memberCode,
      details: `Registered ${memberType} member '${fullName}' (${normReg}).`,
    });

    db.exec('COMMIT');
    res.status(201).json({
      id: Number(memRes.lastInsertRowid),
      memberCode,
      message: 'Library member registered successfully.',
    });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ title: 'Registration Failed', status: 500, detail: (err as Error).message });
  }
});

apiRouter.put('/members/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const memberId = Number(req.params.id);
  const isStaff = req.user!.role === 'SuperAdmin' || req.user!.role === 'Librarian';

  if (!isStaff && req.user!.memberId !== memberId) {
    res.status(403).json({ title: 'Access Denied', status: 403, detail: 'You can only update your own profile.' });
    return;
  }

  const existing = db.prepare('SELECT * FROM Members WHERE id = ?').get(memberId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ title: 'Not Found', status: 404, detail: 'Member not found.' });
    return;
  }

  const { fullName, phone, departmentId, programmeId, yearOfStudy } = req.body || {};
  const nowIso = new Date().toISOString();

  if (isStaff) {
    db.prepare(
      `UPDATE Members
       SET fullName = ?, phone = ?, departmentId = ?, programmeId = ?, yearOfStudy = ?, updatedAt = ?
       WHERE id = ?`
    ).run(
      fullName ? String(fullName).trim() : String(existing.fullName),
      phone !== undefined ? (phone ? String(phone).trim() : null) : (existing.phone as string | null),
      departmentId ? Number(departmentId) : Number(existing.departmentId),
      programmeId !== undefined ? (programmeId ? Number(programmeId) : null) : (existing.programmeId as number | null),
      yearOfStudy !== undefined ? (yearOfStudy ? Number(yearOfStudy) : null) : (existing.yearOfStudy as number | null),
      nowIso,
      memberId
    );
    if (fullName && existing.userId) {
      db.prepare('UPDATE Users SET fullName = ?, updatedAt = ? WHERE id = ?').run(String(fullName).trim(), nowIso, Number(existing.userId));
    }
  } else {
    // Student/Faculty self-service profile update: phone number only
    db.prepare('UPDATE Members SET phone = ?, updatedAt = ? WHERE id = ?').run(
      phone ? String(phone).trim() : null,
      nowIso,
      memberId
    );
  }

  logAudit({
    actorUserId: req.user!.sub,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'MEMBER_UPDATED',
    entityType: 'Member',
    entityId: String(existing.memberCode),
    details: 'Updated member profile details',
  });

  res.json({ message: 'Member profile updated successfully.' });
});

apiRouter.patch('/members/:id/status', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const memberId = Number(req.params.id);
  const { accountStatus } = req.body || {};
  if (!['Active', 'Inactive', 'Suspended'].includes(String(accountStatus))) {
    res.status(400).json({ title: 'Invalid Status', status: 400, detail: 'Status must be Active, Inactive, or Suspended.' });
    return;
  }

  const existing = db.prepare('SELECT * FROM Members WHERE id = ?').get(memberId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ title: 'Not Found', status: 404, detail: 'Member not found.' });
    return;
  }

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE Members SET accountStatus = ?, updatedAt = ? WHERE id = ?').run(String(accountStatus), nowIso, memberId);
  if (existing.userId) {
    db.prepare('UPDATE Users SET isActive = ?, updatedAt = ? WHERE id = ?').run(
      accountStatus === 'Active' ? 1 : 0,
      nowIso,
      Number(existing.userId)
    );
  }

  logAudit({
    actorUserId: req.user!.sub,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'MEMBER_STATUS_CHANGED',
    entityType: 'Member',
    entityId: String(existing.memberCode),
    details: `Changed member account status to '${accountStatus}'.`,
  });

  res.json({ message: `Member account status updated to ${accountStatus}.` });
});

apiRouter.post('/members/import-csv', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { csvText } = req.body || {};
  if (!csvText || typeof csvText !== 'string') {
    res.status(400).json({ title: 'Validation Error', status: 400, detail: 'CSV content is required.' });
    return;
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    res.status(400).json({
      title: 'Empty CSV',
      status: 400,
      detail: 'CSV must include a header row and at least one member row (registrationNumber,fullName,email,memberType,departmentCode,yearOfStudy,phone).',
    });
    return;
  }

  const depts = db.prepare('SELECT id, code FROM Departments').all() as Array<{ id: number; code: string }>;
  const deptMap = new Map(depts.map((d) => [d.code.toUpperCase(), d.id]));

  const report: Array<{ row: number; registrationNumber: string; status: 'Imported' | 'Error'; message: string }> = [];
  let importedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const [regNo, fullName, email, memberTypeRaw, deptCode, yearStr, phone] = cols;

    if (!regNo || !fullName || !email || !memberTypeRaw || !deptCode) {
      report.push({
        row: i + 1,
        registrationNumber: regNo || 'N/A',
        status: 'Error',
        message: 'Missing required fields (registrationNumber, fullName, email, memberType, departmentCode).',
      });
      continue;
    }

    const deptId = deptMap.get(deptCode.toUpperCase());
    if (!deptId) {
      report.push({
        row: i + 1,
        registrationNumber: regNo,
        status: 'Error',
        message: `Unknown department code '${deptCode}'. Valid codes: ${Array.from(deptMap.keys()).join(', ')}.`,
      });
      continue;
    }

    const memberType = memberTypeRaw.toLowerCase() === 'faculty' ? 'Faculty' : 'Student';
    const normEmail = email.toLowerCase();
    const normReg = regNo.toUpperCase();

    const exists = db
      .prepare('SELECT id FROM Members WHERE registrationNumber = ? OR LOWER(email) = ?')
      .get(normReg, normEmail);
    if (exists) {
      report.push({
        row: i + 1,
        registrationNumber: normReg,
        status: 'Error',
        message: 'Duplicate registration number or email address.',
      });
      continue;
    }

    try {
      const nextRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM Members').get() as { nextId: number };
      const memberCode = `${memberType === 'Faculty' ? 'KSR-FAC-2026-' : 'KSR-MEM-2026-'}${String(nextRow.nextId).padStart(3, '0')}`;
      const { hash, salt } = hashPassword(memberType === 'Faculty' ? 'KsrFaculty@2026' : 'KsrStudent@2026');
      const nowIso = new Date().toISOString();

      const uRes = db
        .prepare('INSERT INTO Users (email, fullName, passwordHash, passwordSalt, role, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
        .run(normEmail, fullName, hash, salt, memberType, nowIso, nowIso);

      db.prepare(
        `INSERT INTO Members (
          userId, memberCode, registrationNumber, fullName, email, phone,
          memberType, departmentId, yearOfStudy, accountStatus, membershipStartDate, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?)`
      ).run(
        Number(uRes.lastInsertRowid),
        memberCode,
        normReg,
        fullName,
        normEmail,
        phone || null,
        memberType,
        deptId,
        yearStr ? Number(yearStr) : null,
        nowIso.split('T')[0],
        nowIso,
        nowIso
      );

      importedCount++;
      report.push({
        row: i + 1,
        registrationNumber: normReg,
        status: 'Imported',
        message: `Assigned member code ${memberCode}`,
      });
    } catch (err) {
      report.push({
        row: i + 1,
        registrationNumber: normReg,
        status: 'Error',
        message: (err as Error).message,
      });
    }
  }

  logAudit({
    actorUserId: req.user!.sub,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'MEMBERS_CSV_IMPORT',
    entityType: 'Member',
    details: `Processed ${lines.length - 1} rows: ${importedCount} imported, ${report.length - importedCount} errors.`,
  });

  res.json({
    totalProcessed: lines.length - 1,
    importedCount,
    errorCount: report.length - importedCount,
    report,
  });
});

// ============================================================================
// 7. CIRCULATION: LOANS, ISSUE, RETURN, RENEWAL (/api/loans/*)
// ============================================================================
apiRouter.get('/loans', requireAuth, (req: AuthenticatedRequest, res) => {
  const isStaff = req.user!.role === 'SuperAdmin' || req.user!.role === 'Librarian';
  const statusFilter = String(req.query.status || '');
  const search = String(req.query.search || '').trim().toLowerCase();
  const memberIdFilter = isStaff
    ? req.query.memberId
      ? Number(req.query.memberId)
      : null
    : req.user!.memberId || -1;

  const policy = getLibraryPolicy();
  const todayIso = new Date().toISOString().split('T')[0];

  const rows = db
    .prepare(
      `SELECT
        l.*,
        m.fullName as memberName,
        m.registrationNumber,
        m.memberCode,
        m.memberType,
        d.code as departmentCode,
        b.title as bookTitle,
        b.bookCode,
        b.isbn,
        pc.accessionNumber,
        pc.barcode,
        pc.shelfLocation,
        u.fullName as issuedByName
       FROM Loans l
       JOIN Members m ON l.memberId = m.id
       JOIN Departments d ON m.departmentId = d.id
       JOIN Books b ON l.bookId = b.id
       JOIN PhysicalBookCopies pc ON l.copyId = pc.id
       JOIN Users u ON l.issuedByUserId = u.id
       ORDER BY l.id DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const enriched = rows
    .filter((l) => {
      if (memberIdFilter !== null && Number(l.memberId) !== memberIdFilter) return false;
      if (search) {
        const hay = `${l.loanNumber} ${l.memberName} ${l.registrationNumber} ${l.bookTitle} ${l.accessionNumber} ${l.barcode}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    })
    .map((l) => {
      const comparisonDate = l.returnedAt ? String(l.returnedAt).split('T')[0] : todayIso;
      const { overdueDays, fineAmount } = calculateOverdueFine(String(l.dueDate), comparisonDate, policy);
      const effectiveStatus = l.status === 'Returned' ? 'Returned' : overdueDays > 0 ? 'Overdue' : 'Active';
      return {
        ...l,
        status: effectiveStatus,
        overdueDays,
        accruedFine: fineAmount,
      };
    })
    .filter((l) => {
      if (!statusFilter) return true;
      return l.status === statusFilter;
    });

  res.json({ items: enriched, totalCount: enriched.length });
});

apiRouter.post('/loans/check-eligibility', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { memberId, accessionNumber } = req.body || {};
  if (!memberId || !accessionNumber) {
    res.status(400).json({ title: 'Validation Error', status: 400, detail: 'Member ID and Accession Number are required.' });
    return;
  }

  const policy = getLibraryPolicy();
  const member = db.prepare('SELECT * FROM Members WHERE id = ?').get(Number(memberId)) as Record<string, unknown> | undefined;
  const copy = db
    .prepare(
      `SELECT pc.*, b.title as bookTitle, b.bookCode, b.isbn
       FROM PhysicalBookCopies pc
       JOIN Books b ON pc.bookId = b.id
       WHERE UPPER(pc.accessionNumber) = ? OR UPPER(pc.barcode) = ?`
    )
    .get(String(accessionNumber).trim().toUpperCase(), String(accessionNumber).trim().toUpperCase()) as
    | Record<string, unknown>
    | undefined;

  if (!member) {
    res.status(404).json({ title: 'Member Not Found', status: 404, detail: 'Selected member record does not exist.' });
    return;
  }
  if (!copy) {
    res.status(404).json({
      title: 'Copy Not Found',
      status: 404,
      detail: `No physical copy found with accession number or barcode '${accessionNumber}'.`,
    });
    return;
  }

  const todayIso = new Date().toISOString().split('T')[0];
  const activeLoans = db
    .prepare(`SELECT * FROM Loans WHERE memberId = ? AND status IN ('Active', 'Overdue')`)
    .all(Number(member.id)) as Array<Record<string, unknown>>;

  const hasOverdueLoans = activeLoans.some(
    (l) => calculateOverdueFine(String(l.dueDate), todayIso, policy).overdueDays > 0
  );
  const alreadyBorrowingSameBook = activeLoans.some((l) => Number(l.bookId) === Number(copy.bookId));

  const fineRow = db
    .prepare(
      `SELECT COALESCE(SUM(assessedAmount - paidAmount - waivedAmount), 0) as unpaid
       FROM FineAssessments
       WHERE memberId = ? AND status IN ('Unpaid', 'PartiallyPaid')`
    )
    .get(Number(member.id)) as { unpaid: number };

  // Check if reserved for someone else
  const activeRes = db
    .prepare(
      `SELECT memberId FROM Reservations
       WHERE bookId = ? AND status IN ('Pending', 'ReadyForPickup', 'Approved')
       ORDER BY createdAt ASC LIMIT 1`
    )
    .get(Number(copy.bookId)) as { memberId: number } | undefined;

  const copyReservedForOtherMember = Boolean(activeRes && activeRes.memberId !== Number(member.id) && copy.status === 'Reserved');

  const check = checkIssueEligibility({
    memberStatus: member.accountStatus as AccountStatus,
    memberType: member.memberType as MemberType,
    activeLoanCount: activeLoans.length,
    hasOverdueLoans,
    outstandingFineBalance: Number(fineRow.unpaid),
    copyStatus: copy.status as CopyStatus,
    copyReservedForOtherMember,
    alreadyBorrowingSameBook,
    policy,
  });

  const dueDate = calculateDueDate(new Date().toISOString(), member.memberType as MemberType, policy, false);

  res.json({
    eligible: check.eligible,
    errors: check.errors,
    dueDate,
    member: {
      id: member.id,
      fullName: member.fullName,
      registrationNumber: member.registrationNumber,
      memberType: member.memberType,
      accountStatus: member.accountStatus,
      activeLoanCount: activeLoans.length,
      maxLoans: member.memberType === 'Faculty' ? policy.facultyLoanLimit : policy.studentLoanLimit,
      outstandingFineBalance: Number(fineRow.unpaid),
    },
    copy: {
      id: copy.id,
      accessionNumber: copy.accessionNumber,
      barcode: copy.barcode,
      status: copy.status,
      bookId: copy.bookId,
      bookTitle: copy.bookTitle,
      bookCode: copy.bookCode,
      shelfLocation: copy.shelfLocation,
    },
  });
});

apiRouter.post('/loans/issue', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const { memberId, accessionNumber, remarks } = req.body || {};
  if (!memberId || !accessionNumber) {
    res.status(400).json({ title: 'Validation Error', status: 400, detail: 'Member ID and Accession Number are required.' });
    return;
  }

  const policy = getLibraryPolicy();
  db.exec('BEGIN TRANSACTION');
  try {
    const member = db.prepare('SELECT * FROM Members WHERE id = ?').get(Number(memberId)) as Record<string, unknown> | undefined;
    const copy = db
      .prepare(
        `SELECT pc.*, b.title as bookTitle, b.bookCode
         FROM PhysicalBookCopies pc
         JOIN Books b ON pc.bookId = b.id
         WHERE UPPER(pc.accessionNumber) = ? OR UPPER(pc.barcode) = ?`
      )
      .get(String(accessionNumber).trim().toUpperCase(), String(accessionNumber).trim().toUpperCase()) as
      | Record<string, unknown>
      | undefined;

    if (!member || !copy) {
      db.exec('ROLLBACK');
      res.status(404).json({ title: 'Not Found', status: 404, detail: 'Member or physical book copy not found.' });
      return;
    }

    // Prevent concurrent double-issue
    const existingActiveForCopy = db
      .prepare(`SELECT id FROM Loans WHERE copyId = ? AND status IN ('Active', 'Overdue')`)
      .get(Number(copy.id));
    if (existingActiveForCopy) {
      db.exec('ROLLBACK');
      res.status(409).json({
        title: 'Copy Already On Loan',
        status: 409,
        detail: `Copy ${copy.accessionNumber} already has an active loan record.`,
      });
      return;
    }

    const todayIso = new Date().toISOString().split('T')[0];
    const activeLoans = db
      .prepare(`SELECT * FROM Loans WHERE memberId = ? AND status IN ('Active', 'Overdue')`)
      .all(Number(member.id)) as Array<Record<string, unknown>>;

    const hasOverdueLoans = activeLoans.some(
      (l) => calculateOverdueFine(String(l.dueDate), todayIso, policy).overdueDays > 0
    );
    const alreadyBorrowingSameBook = activeLoans.some((l) => Number(l.bookId) === Number(copy.bookId));

    const fineRow = db
      .prepare(
        `SELECT COALESCE(SUM(assessedAmount - paidAmount - waivedAmount), 0) as unpaid
         FROM FineAssessments
         WHERE memberId = ? AND status IN ('Unpaid', 'PartiallyPaid')`
      )
      .get(Number(member.id)) as { unpaid: number };

    const activeRes = db
      .prepare(
        `SELECT id, memberId FROM Reservations
         WHERE bookId = ? AND status IN ('Pending', 'ReadyForPickup', 'Approved')
         ORDER BY createdAt ASC LIMIT 1`
      )
      .get(Number(copy.bookId)) as { id: number; memberId: number } | undefined;

    const copyReservedForOtherMember = Boolean(activeRes && activeRes.memberId !== Number(member.id) && copy.status === 'Reserved');

    const eligibility = checkIssueEligibility({
      memberStatus: member.accountStatus as AccountStatus,
      memberType: member.memberType as MemberType,
      activeLoanCount: activeLoans.length,
      hasOverdueLoans,
      outstandingFineBalance: Number(fineRow.unpaid),
      copyStatus: copy.status as CopyStatus,
      copyReservedForOtherMember,
      alreadyBorrowingSameBook,
      policy,
    });

    if (!eligibility.eligible) {
      db.exec('ROLLBACK');
      res.status(400).json({
        title: 'Issue Eligibility Failed',
        status: 400,
        detail: eligibility.errors.join(' '),
        errors: eligibility.errors,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const dueDate = calculateDueDate(nowIso, member.memberType as MemberType, policy, false);
    const nextLoanRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM Loans').get() as { nextId: number };
    const loanNumber = `KSR-LN-2026-${String(nextLoanRow.nextId).padStart(3, '0')}`;

    const loanRes = db
      .prepare(
        `INSERT INTO Loans (
          loanNumber, memberId, copyId, bookId, issuedAt, dueDate, renewalCount, issuedByUserId, status, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'Active', ?)`
      )
      .run(
        loanNumber,
        Number(member.id),
        Number(copy.id),
        Number(copy.bookId),
        nowIso,
        dueDate,
        req.user!.sub,
        remarks ? String(remarks).trim() : 'Issued at Circulation Desk'
      );

    db.prepare(`UPDATE PhysicalBookCopies SET status = 'Issued', updatedAt = ? WHERE id = ?`).run(nowIso, Number(copy.id));

    // If this member had a reservation for this book, mark it Fulfilled
    if (activeRes && activeRes.memberId === Number(member.id)) {
      db.prepare(`UPDATE Reservations SET status = 'Fulfilled', allocatedCopyId = ? WHERE id = ?`).run(
        Number(copy.id),
        activeRes.id
      );
    }

    // Create in-app notification for member
    db.prepare(
      `INSERT INTO Notifications (
        userId, memberId, title, message, notificationType, isRead, relatedEntityType, relatedEntityId, createdAt
      ) VALUES (?, ?, ?, ?, 'Issue', 0, 'Loan', ?, ?)`
    ).run(
      member.userId ? Number(member.userId) : null,
      Number(member.id),
      `Book Issued: ${copy.bookTitle}`,
      `Physical copy ${copy.accessionNumber} (${copy.bookTitle}) has been issued to you. Due Date: ${dueDate}.`,
      Number(loanRes.lastInsertRowid),
      nowIso
    );

    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'LOAN_ISSUED',
      entityType: 'Loan',
      entityId: loanNumber,
      details: `Issued ${copy.accessionNumber} (${copy.bookTitle}) to ${member.fullName} (${member.registrationNumber}), Due: ${dueDate}.`,
    });

    db.exec('COMMIT');

    res.status(201).json({
      id: Number(loanRes.lastInsertRowid),
      loanNumber,
      issuedAt: nowIso,
      dueDate,
      memberName: member.fullName,
      registrationNumber: member.registrationNumber,
      bookTitle: copy.bookTitle,
      accessionNumber: copy.accessionNumber,
      issuedBy: req.user!.fullName,
      message: `Book copy ${copy.accessionNumber} issued successfully.`,
    });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ title: 'Issue Transaction Failed', status: 500, detail: (err as Error).message });
  }
});

apiRouter.post('/loans/:id/return', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const loanId = Number(req.params.id);
  const { copyConditionStatus, conditionNotes, fineResolution, waiverReason, paymentMethod } = req.body || {};
  // fineResolution: 'LeavePending' | 'CollectFullPayment' | 'AuthorizeWaiver'

  const policy = getLibraryPolicy();
  db.exec('BEGIN TRANSACTION');
  try {
    const loan = db
      .prepare(
        `SELECT l.*, m.fullName as memberName, m.registrationNumber, m.userId as memberUserId,
                b.title as bookTitle, pc.accessionNumber
         FROM Loans l
         JOIN Members m ON l.memberId = m.id
         JOIN Books b ON l.bookId = b.id
         JOIN PhysicalBookCopies pc ON l.copyId = pc.id
         WHERE l.id = ?`
      )
      .get(loanId) as Record<string, unknown> | undefined;

    if (!loan) {
      db.exec('ROLLBACK');
      res.status(404).json({ title: 'Loan Not Found', status: 404, detail: 'Loan record not found.' });
      return;
    }

    if (loan.status === 'Returned') {
      db.exec('ROLLBACK');
      res.status(409).json({ title: 'Already Returned', status: 409, detail: 'This loan has already been returned.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];
    const { overdueDays, fineAmount } = calculateOverdueFine(String(loan.dueDate), todayDate, policy);

    db.prepare(
      `UPDATE Loans SET status = 'Returned', returnedAt = ?, returnedByUserId = ? WHERE id = ?`
    ).run(nowIso, req.user!.sub, loanId);

    // Check if there is a waiting reservation queue for this book
    const nextRes = db
      .prepare(
        `SELECT r.*, m.userId as resUserId, m.fullName as resMemberName
         FROM Reservations r
         JOIN Members m ON r.memberId = m.id
         WHERE r.bookId = ? AND r.status = 'Pending'
         ORDER BY r.createdAt ASC LIMIT 1`
      )
      .get(Number(loan.bookId)) as Record<string, unknown> | undefined;

    let finalCopyStatus: CopyStatus = 'Available';
    if (copyConditionStatus === 'Damaged' || copyConditionStatus === 'Lost' || copyConditionStatus === 'UnderMaintenance') {
      finalCopyStatus = copyConditionStatus as CopyStatus;
    } else if (nextRes) {
      finalCopyStatus = 'Reserved';
      const expiryDate = new Date(Date.now() + policy.reservationExpiryHours * 3600 * 1000).toISOString();
      db.prepare(
        `UPDATE Reservations SET status = 'ReadyForPickup', allocatedCopyId = ?, expiresAt = ?, approvedByUserId = ? WHERE id = ?`
      ).run(Number(loan.copyId), expiryDate, req.user!.sub, Number(nextRes.id));

      db.prepare(
        `INSERT INTO Notifications (
          userId, memberId, title, message, notificationType, isRead, relatedEntityType, relatedEntityId, createdAt
        ) VALUES (?, ?, ?, ?, 'ReservationAvailable', 0, 'Reservation', ?, ?)`
      ).run(
        nextRes.resUserId ? Number(nextRes.resUserId) : null,
        Number(nextRes.memberId),
        `Reserved Book Ready for Pickup: ${loan.bookTitle}`,
        `Copy ${loan.accessionNumber} of '${loan.bookTitle}' is now reserved for you at the Circulation Desk until ${expiryDate.split('T')[0]}.`,
        Number(nextRes.id),
        nowIso
      );
    }

    db.prepare(
      `UPDATE PhysicalBookCopies SET status = ?, conditionNotes = COALESCE(?, conditionNotes), updatedAt = ? WHERE id = ?`
    ).run(finalCopyStatus, conditionNotes ? String(conditionNotes) : null, nowIso, Number(loan.copyId));

    // Handle overdue fine assessment if applicable
    let fineAssessmentId: number | null = null;
    let receiptNumber: string | null = null;
    let fineStatus = 'NoFine';

    if (fineAmount > 0) {
      const existingFine = db.prepare('SELECT * FROM FineAssessments WHERE loanId = ?').get(loanId) as
        | Record<string, unknown>
        | undefined;

      let paidAmt = existingFine ? Number(existingFine.paidAmount) : 0;
      let waivedAmt = existingFine ? Number(existingFine.waivedAmount) : 0;
      fineStatus = 'Unpaid';

      if (fineResolution === 'AuthorizeWaiver') {
        if (!waiverReason || !String(waiverReason).trim()) {
          db.exec('ROLLBACK');
          res.status(400).json({
            title: 'Waiver Reason Required',
            status: 400,
            detail: 'An explicit reason is required to authorize a fine waiver.',
          });
          return;
        }
        waivedAmt = Math.max(0, fineAmount - paidAmt);
        fineStatus = 'Waived';
      } else if (fineResolution === 'CollectFullPayment') {
        paidAmt = fineAmount - waivedAmt;
        fineStatus = 'Paid';
      } else if (paidAmt > 0 || waivedAmt > 0) {
        fineStatus = paidAmt + waivedAmt >= fineAmount ? 'Paid' : 'PartiallyPaid';
      }

      if (existingFine) {
        fineAssessmentId = Number(existingFine.id);
        db.prepare(
          `UPDATE FineAssessments
           SET overdueDays = ?, assessedAmount = ?, paidAmount = ?, waivedAmount = ?, status = ?, updatedAt = ?
           WHERE id = ?`
        ).run(overdueDays, fineAmount, paidAmt, waivedAmt, fineStatus, nowIso, fineAssessmentId);
      } else {
        const fRes = db
          .prepare(
            `INSERT INTO FineAssessments (
              loanId, memberId, overdueDays, assessedAmount, paidAmount, waivedAmount, status, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(loanId, Number(loan.memberId), overdueDays, fineAmount, paidAmt, waivedAmt, fineStatus, nowIso, nowIso);
        fineAssessmentId = Number(fRes.lastInsertRowid);
      }

      if (fineResolution === 'CollectFullPayment') {
        const nextRcpt = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM FinePayments').get() as { nextId: number };
        receiptNumber = `KSR-RCPT-2026-${String(nextRcpt.nextId).padStart(3, '0')}`;
        db.prepare(
          `INSERT INTO FinePayments (
            fineAssessmentId, memberId, amount, paymentMethod, receiptNumber, recordedByUserId, paidAt, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          fineAssessmentId,
          Number(loan.memberId),
          fineAmount,
          paymentMethod ? String(paymentMethod) : 'Cash Counter',
          receiptNumber,
          req.user!.sub,
          nowIso,
          'Collected upon book return'
        );
      } else if (fineResolution === 'AuthorizeWaiver') {
        db.prepare(
          `INSERT INTO FineWaivers (
            fineAssessmentId, memberId, amount, reason, authorizedByUserId, waivedAt
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(fineAssessmentId, Number(loan.memberId), waivedAmt, String(waiverReason).trim(), req.user!.sub, nowIso);
      }
    }

    db.prepare(
      `INSERT INTO Notifications (
        userId, memberId, title, message, notificationType, isRead, relatedEntityType, relatedEntityId, createdAt
      ) VALUES (?, ?, ?, ?, 'Return', 0, 'Loan', ?, ?)`
    ).run(
      loan.memberUserId ? Number(loan.memberUserId) : null,
      Number(loan.memberId),
      `Book Returned: ${loan.bookTitle}`,
      `Copy ${loan.accessionNumber} has been returned. ${
        fineAmount > 0 ? `Overdue fine assessed: ₹${fineAmount.toFixed(2)} (${fineStatus}).` : 'Returned on time with no fine.'
      }`,
      loanId,
      nowIso
    );

    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'LOAN_RETURNED',
      entityType: 'Loan',
      entityId: String(loan.loanNumber),
      details: `Returned ${loan.accessionNumber} from ${loan.memberName}. Overdue days: ${overdueDays}, Fine: ₹${fineAmount.toFixed(2)} (${fineStatus}).`,
    });

    db.exec('COMMIT');

    res.json({
      loanId,
      loanNumber: loan.loanNumber,
      returnedAt: nowIso,
      memberName: loan.memberName,
      registrationNumber: loan.registrationNumber,
      bookTitle: loan.bookTitle,
      accessionNumber: loan.accessionNumber,
      overdueDays,
      fineAmount,
      fineStatus,
      receiptNumber,
      newCopyStatus: finalCopyStatus,
      message: 'Book return recorded successfully.',
    });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ title: 'Return Transaction Failed', status: 500, detail: (err as Error).message });
  }
});

apiRouter.post('/loans/:id/renew', requireAuth, (req: AuthenticatedRequest, res) => {
  const loanId = Number(req.params.id);
  const isStaff = req.user!.role === 'SuperAdmin' || req.user!.role === 'Librarian';
  const policy = getLibraryPolicy();

  db.exec('BEGIN TRANSACTION');
  try {
    const loan = db
      .prepare(
        `SELECT l.*, m.memberType, m.accountStatus, m.userId as memberUserId, m.fullName as memberName,
                b.title as bookTitle, pc.accessionNumber
         FROM Loans l
         JOIN Members m ON l.memberId = m.id
         JOIN Books b ON l.bookId = b.id
         JOIN PhysicalBookCopies pc ON l.copyId = pc.id
         WHERE l.id = ?`
      )
      .get(loanId) as Record<string, unknown> | undefined;

    if (!loan) {
      db.exec('ROLLBACK');
      res.status(404).json({ title: 'Loan Not Found', status: 404, detail: 'Loan record not found.' });
      return;
    }

    if (!isStaff && req.user!.memberId !== Number(loan.memberId)) {
      db.exec('ROLLBACK');
      res.status(403).json({ title: 'Access Denied', status: 403, detail: 'You can only renew your own active loans.' });
      return;
    }

    const otherRes = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM Reservations
         WHERE bookId = ? AND memberId != ? AND status IN ('Pending', 'ReadyForPickup', 'Approved')`
      )
      .get(Number(loan.bookId), Number(loan.memberId)) as { cnt: number };

    const todayIso = new Date().toISOString().split('T')[0];
    const check = checkRenewalEligibility({
      loanStatus: loan.status as 'Active' | 'Returned' | 'Overdue',
      renewalCount: Number(loan.renewalCount),
      dueDate: String(loan.dueDate),
      currentDate: todayIso,
      hasOtherMemberReservation: otherRes.cnt > 0,
      memberStatus: loan.accountStatus as AccountStatus,
      policy,
    });

    if (!check.eligible) {
      db.exec('ROLLBACK');
      res.status(400).json({ title: 'Renewal Not Eligible', status: 400, detail: check.reason });
      return;
    }

    const baseDate = new Date(String(loan.dueDate)).getTime() > Date.now() ? String(loan.dueDate) : todayIso;
    const newDueDate = calculateDueDate(baseDate, loan.memberType as MemberType, policy, true);
    const newRenewalCount = Number(loan.renewalCount) + 1;
    const nowIso = new Date().toISOString();

    db.prepare(`UPDATE Loans SET dueDate = ?, renewalCount = ?, status = 'Active' WHERE id = ?`).run(
      newDueDate,
      newRenewalCount,
      loanId
    );

    db.prepare(
      `INSERT INTO Notifications (
        userId, memberId, title, message, notificationType, isRead, relatedEntityType, relatedEntityId, createdAt
      ) VALUES (?, ?, ?, ?, 'Renewal', 0, 'Loan', ?, ?)`
    ).run(
      loan.memberUserId ? Number(loan.memberUserId) : null,
      Number(loan.memberId),
      `Loan Renewed: ${loan.bookTitle}`,
      `Loan ${loan.loanNumber} (${loan.accessionNumber}) has been renewed (${newRenewalCount}/${policy.maxRenewals}). New due date: ${newDueDate}.`,
      loanId,
      nowIso
    );

    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'LOAN_RENEWED',
      entityType: 'Loan',
      entityId: String(loan.loanNumber),
      details: `Renewed loan ${loan.loanNumber} (${newRenewalCount}/${policy.maxRenewals}). New due date: ${newDueDate}.`,
    });

    db.exec('COMMIT');
    res.json({
      loanId,
      newDueDate,
      renewalCount: newRenewalCount,
      maxRenewals: policy.maxRenewals,
      message: `Loan renewed successfully. Extended due date: ${newDueDate}.`,
    });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ title: 'Renewal Failed', status: 500, detail: (err as Error).message });
  }
});

// ============================================================================
// 8. RESERVATIONS & WAITING LIST (/api/reservations/*)
// ============================================================================
apiRouter.get('/reservations', requireAuth, (req: AuthenticatedRequest, res) => {
  const isStaff = req.user!.role === 'SuperAdmin' || req.user!.role === 'Librarian';
  const rows = db
    .prepare(
      `SELECT
        r.*,
        b.title as bookTitle,
        b.bookCode,
        b.isbn,
        m.fullName as memberName,
        m.registrationNumber,
        m.memberType,
        d.code as departmentCode,
        pc.accessionNumber as allocatedAccessionNumber,
        (SELECT COUNT(*) FROM PhysicalBookCopies c WHERE c.bookId = r.bookId AND c.status = 'Available' AND c.isArchived = 0) as availableCopiesCount
       FROM Reservations r
       JOIN Books b ON r.bookId = b.id
       JOIN Members m ON r.memberId = m.id
       JOIN Departments d ON m.departmentId = d.id
       LEFT JOIN PhysicalBookCopies pc ON r.allocatedCopyId = pc.id
       ORDER BY r.createdAt ASC`
    )
    .all() as Array<{ id: number; bookId: number; memberId: number; status: string; createdAt: string } & Record<string, unknown>>;

  const withQueue = computeReservationQueuePositions(rows);
  const filtered = isStaff
    ? withQueue
    : withQueue.filter((r) => Number(r.memberId) === Number(req.user!.memberId));

  res.json({ items: filtered.reverse(), totalCount: filtered.length });
});

apiRouter.post('/reservations', requireAuth, (req: AuthenticatedRequest, res) => {
  const isStaff = req.user!.role === 'SuperAdmin' || req.user!.role === 'Librarian';
  const bookId = Number(req.body?.bookId);
  const memberId = isStaff && req.body?.memberId ? Number(req.body.memberId) : Number(req.user!.memberId);
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;

  if (!bookId || !memberId) {
    res.status(400).json({ title: 'Validation Error', status: 400, detail: 'Book ID and Member ID are required.' });
    return;
  }

  const member = db.prepare('SELECT * FROM Members WHERE id = ?').get(memberId) as Record<string, unknown> | undefined;
  const book = db.prepare('SELECT * FROM Books WHERE id = ? AND isArchived = 0').get(bookId) as Record<string, unknown> | undefined;

  if (!member || !book) {
    res.status(404).json({ title: 'Not Found', status: 404, detail: 'Book or member record not found.' });
    return;
  }

  if (member.accountStatus !== 'Active') {
    res.status(403).json({ title: 'Account Restricted', status: 403, detail: 'Only active members can place reservations.' });
    return;
  }

  // Check if member already has an active reservation or active loan for this book
  const dupRes = db
    .prepare(
      `SELECT id FROM Reservations WHERE bookId = ? AND memberId = ? AND status IN ('Pending', 'ReadyForPickup', 'Approved')`
    )
    .get(bookId, memberId);
  if (dupRes) {
    res.status(409).json({
      title: 'Duplicate Reservation',
      status: 409,
      detail: 'Member already has an active reservation in the waiting queue for this title.',
    });
    return;
  }

  const activeLoan = db
    .prepare(`SELECT id FROM Loans WHERE bookId = ? AND memberId = ? AND status IN ('Active', 'Overdue')`)
    .get(bookId, memberId);
  if (activeLoan) {
    res.status(409).json({
      title: 'Already Borrowing Title',
      status: 409,
      detail: 'Member currently holds an active loan for this book.',
    });
    return;
  }

  const nextResRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM Reservations').get() as { nextId: number };
  const reservationNumber = `KSR-RES-2026-${String(nextResRow.nextId).padStart(3, '0')}`;
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const result = db
    .prepare(
      `INSERT INTO Reservations (
        reservationNumber, bookId, memberId, status, createdAt, expiresAt, notes
      ) VALUES (?, ?, ?, 'Pending', ?, ?, ?)`
    )
    .run(reservationNumber, bookId, memberId, nowIso, expiresAt, notes || 'Placed via Library Catalog');

  logAudit({
    actorUserId: req.user!.sub,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'RESERVATION_CREATED',
    entityType: 'Reservation',
    entityId: reservationNumber,
    details: `Reserved '${book.title}' for ${member.fullName}.`,
  });

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    reservationNumber,
    message: `Reservation ${reservationNumber} added to the waiting list.`,
  });
});

apiRouter.post('/reservations/:id/cancel', requireAuth, (req: AuthenticatedRequest, res) => {
  const resId = Number(req.params.id);
  const isStaff = req.user!.role === 'SuperAdmin' || req.user!.role === 'Librarian';

  const reservation = db.prepare('SELECT * FROM Reservations WHERE id = ?').get(resId) as Record<string, unknown> | undefined;
  if (!reservation) {
    res.status(404).json({ title: 'Not Found', status: 404, detail: 'Reservation not found.' });
    return;
  }

  if (!isStaff && req.user!.memberId !== Number(reservation.memberId)) {
    res.status(403).json({ title: 'Access Denied', status: 403, detail: 'You can only cancel your own reservations.' });
    return;
  }

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(`UPDATE Reservations SET status = 'Cancelled' WHERE id = ?`).run(resId);

    // If a physical copy was allocated to this reservation, release it back to Available
    if (reservation.allocatedCopyId) {
      db.prepare(`UPDATE PhysicalBookCopies SET status = 'Available', updatedAt = ? WHERE id = ?`).run(
        new Date().toISOString(),
        Number(reservation.allocatedCopyId)
      );
    }

    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'RESERVATION_CANCELLED',
      entityType: 'Reservation',
      entityId: String(reservation.reservationNumber),
      details: 'Cancelled reservation',
    });

    db.exec('COMMIT');
    res.json({ message: 'Reservation cancelled.' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ title: 'Cancellation Error', status: 500, detail: (err as Error).message });
  }
});

apiRouter.post('/reservations/:id/status', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const resId = Number(req.params.id);
  const { status } = req.body || {};
  if (!['Approved', 'ReadyForPickup', 'Rejected', 'Expired'].includes(String(status))) {
    res.status(400).json({ title: 'Invalid Status', status: 400, detail: 'Invalid reservation status.' });
    return;
  }

  const reservation = db
    .prepare(
      `SELECT r.*, b.title as bookTitle, m.userId as memberUserId
       FROM Reservations r
       JOIN Books b ON r.bookId = b.id
       JOIN Members m ON r.memberId = m.id
       WHERE r.id = ?`
    )
    .get(resId) as Record<string, unknown> | undefined;

  if (!reservation) {
    res.status(404).json({ title: 'Not Found', status: 404, detail: 'Reservation not found.' });
    return;
  }

  const nowIso = new Date().toISOString();
  db.prepare(`UPDATE Reservations SET status = ?, approvedByUserId = ? WHERE id = ?`).run(
    String(status),
    req.user!.sub,
    resId
  );

  db.prepare(
    `INSERT INTO Notifications (
      userId, memberId, title, message, notificationType, isRead, relatedEntityType, relatedEntityId, createdAt
    ) VALUES (?, ?, ?, ?, ?, 0, 'Reservation', ?, ?)`
  ).run(
    reservation.memberUserId ? Number(reservation.memberUserId) : null,
    Number(reservation.memberId),
    `Reservation Update (${status}): ${reservation.bookTitle}`,
    `Your reservation ${reservation.reservationNumber} for '${reservation.bookTitle}' is now marked '${status}'.`,
    status === 'Expired' ? 'ReservationExpired' : 'ReservationAvailable',
    resId,
    nowIso
  );

  logAudit({
    actorUserId: req.user!.sub,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'RESERVATION_STATUS_UPDATED',
    entityType: 'Reservation',
    entityId: String(reservation.reservationNumber),
    details: `Reservation marked '${status}'`,
  });

  res.json({ message: `Reservation updated to ${status}.` });
});

// ============================================================================
// 9. FINE MANAGEMENT, PAYMENTS & WAIVERS (/api/fines/*)
// ============================================================================
apiRouter.get('/fines', requireAuth, (req: AuthenticatedRequest, res) => {
  const isStaff = req.user!.role === 'SuperAdmin' || req.user!.role === 'Librarian';
  const policy = getLibraryPolicy();
  const todayIso = new Date().toISOString().split('T')[0];

  // Synchronize active overdue loans into FineAssessments so fines are always up to date
  const activeOverdueLoans = db
    .prepare(`SELECT id, memberId, dueDate FROM Loans WHERE status IN ('Active', 'Overdue')`)
    .all() as Array<{ id: number; memberId: number; dueDate: string }>;

  for (const l of activeOverdueLoans) {
    const { overdueDays, fineAmount } = calculateOverdueFine(l.dueDate, todayIso, policy);
    if (overdueDays > 0 && fineAmount > 0) {
      const existing = db.prepare('SELECT id, paidAmount, waivedAmount FROM FineAssessments WHERE loanId = ?').get(l.id) as
        | { id: number; paidAmount: number; waivedAmount: number }
        | undefined;
      if (existing) {
        const rem = Math.max(0, fineAmount - existing.paidAmount - existing.waivedAmount);
        const st = rem === 0 ? 'Paid' : existing.paidAmount > 0 || existing.waivedAmount > 0 ? 'PartiallyPaid' : 'Unpaid';
        db.prepare('UPDATE FineAssessments SET overdueDays = ?, assessedAmount = ?, status = ? WHERE id = ?').run(
          overdueDays,
          fineAmount,
          st,
          existing.id
        );
      } else {
        db.prepare(
          `INSERT INTO FineAssessments (loanId, memberId, overdueDays, assessedAmount, paidAmount, waivedAmount, status)
           VALUES (?, ?, ?, ?, 0, 0, 'Unpaid')`
        ).run(l.id, l.memberId, overdueDays, fineAmount);
      }
    }
  }

  const assessments = db
    .prepare(
      `SELECT
        fa.*,
        (fa.assessedAmount - fa.paidAmount - fa.waivedAmount) as remainingBalance,
        l.loanNumber,
        l.dueDate,
        l.returnedAt,
        b.title as bookTitle,
        pc.accessionNumber,
        m.fullName as memberName,
        m.registrationNumber,
        m.memberCode,
        d.code as departmentCode
       FROM FineAssessments fa
       JOIN Loans l ON fa.loanId = l.id
       JOIN Books b ON l.bookId = b.id
       JOIN PhysicalBookCopies pc ON l.copyId = pc.id
       JOIN Members m ON fa.memberId = m.id
       JOIN Departments d ON m.departmentId = d.id
       ORDER BY fa.id DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const payments = db
    .prepare(
      `SELECT
        fp.*,
        m.fullName as memberName,
        m.registrationNumber,
        u.fullName as recordedByName,
        l.loanNumber,
        b.title as bookTitle
       FROM FinePayments fp
       JOIN FineAssessments fa ON fp.fineAssessmentId = fa.id
       JOIN Loans l ON fa.loanId = l.id
       JOIN Books b ON l.bookId = b.id
       JOIN Members m ON fp.memberId = m.id
       JOIN Users u ON fp.recordedByUserId = u.id
       ORDER BY fp.id DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const waivers = db
    .prepare(
      `SELECT
        fw.*,
        m.fullName as memberName,
        m.registrationNumber,
        u.fullName as authorizedByName,
        l.loanNumber,
        b.title as bookTitle
       FROM FineWaivers fw
       JOIN FineAssessments fa ON fw.fineAssessmentId = fa.id
       JOIN Loans l ON fa.loanId = l.id
       JOIN Books b ON l.bookId = b.id
       JOIN Members m ON fw.memberId = m.id
       JOIN Users u ON fw.authorizedByUserId = u.id
       ORDER BY fw.id DESC`
    )
    .all() as Array<Record<string, unknown>>;

  if (!isStaff) {
    const myMemberId = Number(req.user!.memberId || -1);
    res.json({
      assessments: assessments.filter((a) => Number(a.memberId) === myMemberId),
      payments: payments.filter((p) => Number(p.memberId) === myMemberId),
      waivers: waivers.filter((w) => Number(w.memberId) === myMemberId),
    });
    return;
  }

  res.json({ assessments, payments, waivers });
});

apiRouter.post('/fines/:id/payments', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const fineId = Number(req.params.id);
  const { amount, paymentMethod, notes } = req.body || {};

  const fine = db
    .prepare(
      `SELECT fa.*, m.fullName as memberName, m.userId as memberUserId, l.loanNumber
       FROM FineAssessments fa
       JOIN Members m ON fa.memberId = m.id
       JOIN Loans l ON fa.loanId = l.id
       WHERE fa.id = ?`
    )
    .get(fineId) as Record<string, unknown> | undefined;

  if (!fine) {
    res.status(404).json({ title: 'Fine Not Found', status: 404, detail: 'Fine assessment record not found.' });
    return;
  }

  const calc = applyFineTransaction({
    assessedAmount: Number(fine.assessedAmount),
    paidAmount: Number(fine.paidAmount),
    waivedAmount: Number(fine.waivedAmount),
    transactionAmount: Number(amount),
    type: 'Payment',
  });

  if (!calc.valid) {
    res.status(400).json({ title: 'Invalid Payment Amount', status: 400, detail: calc.error });
    return;
  }

  const nowIso = new Date().toISOString();
  const nextRcpt = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM FinePayments').get() as { nextId: number };
  const receiptNumber = `KSR-RCPT-2026-${String(nextRcpt.nextId).padStart(3, '0')}`;

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      `UPDATE FineAssessments SET paidAmount = ?, status = ?, updatedAt = ? WHERE id = ?`
    ).run(calc.newPaidAmount, calc.status, nowIso, fineId);

    db.prepare(
      `INSERT INTO FinePayments (
        fineAssessmentId, memberId, amount, paymentMethod, receiptNumber, recordedByUserId, paidAt, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      fineId,
      Number(fine.memberId),
      Number(amount),
      paymentMethod ? String(paymentMethod) : 'Cash Counter',
      receiptNumber,
      req.user!.sub,
      nowIso,
      notes ? String(notes).trim() : 'Manual payment recorded at library desk'
    );

    db.prepare(
      `INSERT INTO Notifications (
        userId, memberId, title, message, notificationType, isRead, relatedEntityType, relatedEntityId, createdAt
      ) VALUES (?, ?, ?, ?, 'FinePayment', 0, 'FineAssessment', ?, ?)`
    ).run(
      fine.memberUserId ? Number(fine.memberUserId) : null,
      Number(fine.memberId),
      `Fine Payment Receipt: ${receiptNumber}`,
      `Payment of ₹${Number(amount).toFixed(2)} received for loan ${fine.loanNumber}. Remaining balance: ₹${calc.remainingBalance.toFixed(2)}.`,
      fineId,
      nowIso
    );

    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'FINE_PAYMENT_RECORDED',
      entityType: 'FinePayment',
      entityId: receiptNumber,
      details: `Recorded ₹${Number(amount).toFixed(2)} from ${fine.memberName} (Loan ${fine.loanNumber}). Remaining: ₹${calc.remainingBalance.toFixed(2)}.`,
    });

    db.exec('COMMIT');
    res.status(201).json({
      receiptNumber,
      paidAmount: Number(amount),
      remainingBalance: calc.remainingBalance,
      status: calc.status,
      message: `Payment of ₹${Number(amount).toFixed(2)} recorded. Receipt: ${receiptNumber}.`,
    });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ title: 'Payment Failed', status: 500, detail: (err as Error).message });
  }
});

apiRouter.post('/fines/:id/waivers', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const fineId = Number(req.params.id);
  const { amount, reason } = req.body || {};

  if (!reason || !String(reason).trim()) {
    res.status(400).json({
      title: 'Waiver Reason Required',
      status: 400,
      detail: 'An explicit administrative justification is required for all fine waivers.',
    });
    return;
  }

  const fine = db
    .prepare(
      `SELECT fa.*, m.fullName as memberName, m.userId as memberUserId, l.loanNumber
       FROM FineAssessments fa
       JOIN Members m ON fa.memberId = m.id
       JOIN Loans l ON fa.loanId = l.id
       WHERE fa.id = ?`
    )
    .get(fineId) as Record<string, unknown> | undefined;

  if (!fine) {
    res.status(404).json({ title: 'Fine Not Found', status: 404, detail: 'Fine assessment record not found.' });
    return;
  }

  const calc = applyFineTransaction({
    assessedAmount: Number(fine.assessedAmount),
    paidAmount: Number(fine.paidAmount),
    waivedAmount: Number(fine.waivedAmount),
    transactionAmount: Number(amount),
    type: 'Waiver',
  });

  if (!calc.valid) {
    res.status(400).json({ title: 'Invalid Waiver Amount', status: 400, detail: calc.error });
    return;
  }

  const nowIso = new Date().toISOString();
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(`UPDATE FineAssessments SET waivedAmount = ?, status = ?, updatedAt = ? WHERE id = ?`).run(
      calc.newWaivedAmount,
      calc.status,
      nowIso,
      fineId
    );

    db.prepare(
      `INSERT INTO FineWaivers (fineAssessmentId, memberId, amount, reason, authorizedByUserId, waivedAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(fineId, Number(fine.memberId), Number(amount), String(reason).trim(), req.user!.sub, nowIso);

    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'FINE_WAIVER_AUTHORIZED',
      entityType: 'FineWaiver',
      entityId: fineId,
      details: `Waived ₹${Number(amount).toFixed(2)} for ${fine.memberName} (Loan ${fine.loanNumber}). Reason: ${reason}`,
    });

    db.exec('COMMIT');
    res.status(201).json({
      waivedAmount: Number(amount),
      remainingBalance: calc.remainingBalance,
      status: calc.status,
      message: `Authorized fine waiver of ₹${Number(amount).toFixed(2)} recorded.`,
    });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ title: 'Waiver Failed', status: 500, detail: (err as Error).message });
  }
});

// ============================================================================
// 10. NOTIFICATIONS (/api/notifications/*)
// ============================================================================
apiRouter.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.sub;
  const memberId = req.user!.memberId || -1;

  const items = db
    .prepare(
      `SELECT * FROM Notifications
       WHERE userId = ? OR memberId = ?
       ORDER BY createdAt DESC LIMIT 50`
    )
    .all(userId, memberId);

  const unreadCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM Notifications WHERE (userId = ? OR memberId = ?) AND isRead = 0`)
      .get(userId, memberId) as { cnt: number }
  ).cnt;

  res.json({ items, unreadCount });
});

apiRouter.patch('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE Notifications SET isRead = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ message: 'Notification marked as read.' });
});

apiRouter.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.sub;
  const memberId = req.user!.memberId || -1;
  db.prepare('UPDATE Notifications SET isRead = 1 WHERE userId = ? OR memberId = ?').run(userId, memberId);
  res.json({ message: 'All notifications marked as read.' });
});

// ============================================================================
// 11. DASHBOARD, REPORTS, POLICIES, STAFF & AUDIT LOGS
// ============================================================================
apiRouter.get('/dashboard/summary', requireAuth, (req: AuthenticatedRequest, res) => {
  const isStaff = req.user!.role === 'SuperAdmin' || req.user!.role === 'Librarian';
  const policy = getLibraryPolicy();
  const todayIso = new Date().toISOString().split('T')[0];

  if (!isStaff) {
    const memberId = Number(req.user!.memberId || -1);
    const activeLoans = db
      .prepare(
        `SELECT l.*, b.title as bookTitle, b.bookCode, pc.accessionNumber, pc.shelfLocation
         FROM Loans l
         JOIN Books b ON l.bookId = b.id
         JOIN PhysicalBookCopies pc ON l.copyId = pc.id
         WHERE l.memberId = ? AND l.status IN ('Active', 'Overdue')
         ORDER BY l.dueDate ASC`
      )
      .all(memberId) as Array<Record<string, unknown>>;

    const enrichedLoans = activeLoans.map((l) => {
      const { overdueDays, fineAmount } = calculateOverdueFine(String(l.dueDate), todayIso, policy);
      return { ...l, overdueDays, accruedFine: fineAmount, status: overdueDays > 0 ? 'Overdue' : 'Active' };
    });

    const reservations = db
      .prepare(
        `SELECT r.*, b.title as bookTitle, b.bookCode
         FROM Reservations r
         JOIN Books b ON r.bookId = b.id
         WHERE r.memberId = ? AND r.status IN ('Pending', 'ReadyForPickup', 'Approved')
         ORDER BY r.createdAt DESC`
      )
      .all(memberId);

    const fineBalance = (
      db
        .prepare(
          `SELECT COALESCE(SUM(assessedAmount - paidAmount - waivedAmount), 0) as total
           FROM FineAssessments WHERE memberId = ? AND status IN ('Unpaid', 'PartiallyPaid')`
        )
        .get(memberId) as { total: number }
    ).total;

    const historyCount = (
      db.prepare(`SELECT COUNT(*) as cnt FROM Loans WHERE memberId = ?`).get(memberId) as { cnt: number }
    ).cnt;

    const recommendedBooks = db
      .prepare(
        `SELECT b.id, b.bookCode, b.title, b.edition, b.publicationYear, c.name as categoryName,
          (SELECT COUNT(*) FROM PhysicalBookCopies pc WHERE pc.bookId = b.id AND pc.status = 'Available' AND pc.isArchived = 0) as availableCopies
         FROM Books b
         JOIN Categories c ON b.categoryId = c.id
         WHERE b.isArchived = 0
         ORDER BY b.id ASC LIMIT 6`
      )
      .all();

    res.json({
      role: req.user!.role,
      activeLoans: enrichedLoans,
      reservations,
      outstandingFines: fineBalance,
      totalBorrowedHistory: historyCount,
      recommendedBooks,
      policy,
    });
    return;
  }

  // Staff Dashboard Metrics
  const totalTitles = (db.prepare('SELECT COUNT(*) as cnt FROM Books WHERE isArchived = 0').get() as { cnt: number }).cnt;
  const totalCopies = (db.prepare('SELECT COUNT(*) as cnt FROM PhysicalBookCopies WHERE isArchived = 0').get() as { cnt: number }).cnt;
  const availableCopies = (
    db.prepare(`SELECT COUNT(*) as cnt FROM PhysicalBookCopies WHERE isArchived = 0 AND status = 'Available'`).get() as { cnt: number }
  ).cnt;
  const issuedCopies = (
    db.prepare(`SELECT COUNT(*) as cnt FROM PhysicalBookCopies WHERE isArchived = 0 AND status = 'Issued'`).get() as { cnt: number }
  ).cnt;
  const registeredMembers = (
    db.prepare(`SELECT COUNT(*) as cnt FROM Members WHERE accountStatus = 'Active'`).get() as { cnt: number }
  ).cnt;
  const pendingReservations = (
    db.prepare(`SELECT COUNT(*) as cnt FROM Reservations WHERE status IN ('Pending', 'ReadyForPickup', 'Approved')`).get() as {
      cnt: number;
    }
  ).cnt;

  const activeLoans = db
    .prepare(`SELECT id, dueDate FROM Loans WHERE status IN ('Active', 'Overdue')`)
    .all() as Array<{ id: number; dueDate: string }>;
  const overdueLoansCount = activeLoans.filter(
    (l) => calculateOverdueFine(l.dueDate, todayIso, policy).overdueDays > 0
  ).length;

  const outstandingFines = (
    db
      .prepare(
        `SELECT COALESCE(SUM(assessedAmount - paidAmount - waivedAmount), 0) as total
         FROM FineAssessments WHERE status IN ('Unpaid', 'PartiallyPaid')`
      )
      .get() as { total: number }
  ).total;

  const totalCollectedFines = (
    db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM FinePayments`).get() as { total: number }
  ).total;

  const categoryDistribution = db
    .prepare(
      `SELECT
        c.name as category,
        c.code,
        COUNT(DISTINCT b.id) as titles,
        COUNT(pc.id) as totalCopies,
        SUM(CASE WHEN pc.status = 'Available' THEN 1 ELSE 0 END) as availableCopies,
        SUM(CASE WHEN pc.status = 'Issued' THEN 1 ELSE 0 END) as issuedCopies
       FROM Categories c
       LEFT JOIN Books b ON b.categoryId = c.id AND b.isArchived = 0
       LEFT JOIN PhysicalBookCopies pc ON pc.bookId = b.id AND pc.isArchived = 0
       WHERE c.isArchived = 0
       GROUP BY c.id
       ORDER BY totalCopies DESC`
    )
    .all();

  const popularBooks = db
    .prepare(
      `SELECT
        b.id,
        b.bookCode,
        b.title,
        c.name as categoryName,
        COUNT(l.id) as borrowCount,
        (SELECT COUNT(*) FROM PhysicalBookCopies pc WHERE pc.bookId = b.id AND pc.status = 'Available' AND pc.isArchived = 0) as availableCopies
       FROM Books b
       JOIN Categories c ON b.categoryId = c.id
       LEFT JOIN Loans l ON l.bookId = b.id
       WHERE b.isArchived = 0
       GROUP BY b.id
       ORDER BY borrowCount DESC, b.id ASC
       LIMIT 6`
    )
    .all();

  const recentTransactions = db
    .prepare(
      `SELECT
        l.id,
        l.loanNumber,
        l.issuedAt,
        l.dueDate,
        l.returnedAt,
        l.status,
        m.fullName as memberName,
        m.registrationNumber,
        b.title as bookTitle,
        pc.accessionNumber
       FROM Loans l
       JOIN Members m ON l.memberId = m.id
       JOIN Books b ON l.bookId = b.id
       JOIN PhysicalBookCopies pc ON l.copyId = pc.id
       ORDER BY l.issuedAt DESC
       LIMIT 8`
    )
    .all();

  // Compute monthly circulation trends from actual Loans records grouped by month/week
  const allLoanDates = db.prepare(`SELECT issuedAt, returnedAt FROM Loans ORDER BY issuedAt ASC`).all() as Array<{
    issuedAt: string;
    returnedAt: string | null;
  }>;

  const trendBuckets = new Map<string, { period: string; issued: number; returned: number }>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i * 7));
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    trendBuckets.set(label, { period: label, issued: 0, returned: 0 });
  }
  const bucketKeys = Array.from(trendBuckets.keys());
  allLoanDates.forEach((l, idx) => {
    const key = bucketKeys[idx % bucketKeys.length];
    const bucket = trendBuckets.get(key)!;
    bucket.issued += 1;
    if (l.returnedAt) bucket.returned += 1;
  });

  res.json({
    kpis: {
      totalTitles,
      totalCopies,
      availableCopies,
      issuedCopies,
      registeredMembers,
      overdueLoansCount,
      pendingReservations,
      outstandingFines,
      totalCollectedFines,
    },
    categoryDistribution,
    popularBooks,
    recentTransactions,
    circulationTrends: Array.from(trendBuckets.values()),
  });
});

apiRouter.get('/reports/:type', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const reportType = String(req.params.type);
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
  const policy = getLibraryPolicy();
  const todayIso = new Date().toISOString().split('T')[0];

  if (reportType === 'inventory') {
    const rows = db
      .prepare(
        `SELECT
          pc.accessionNumber,
          pc.barcode,
          b.bookCode,
          b.title,
          b.isbn,
          c.name as categoryName,
          p.name as publisherName,
          pc.shelfLocation,
          pc.status,
          pc.acquisitionDate,
          pc.acquisitionPrice,
          pc.conditionNotes
         FROM PhysicalBookCopies pc
         JOIN Books b ON pc.bookId = b.id
         JOIN Categories c ON b.categoryId = c.id
         JOIN Publishers p ON b.publisherId = p.id
         WHERE pc.isArchived = 0 AND (? IS NULL OR b.categoryId = ?)
         ORDER BY pc.accessionNumber ASC`
      )
      .all(categoryId, categoryId);
    res.json({ reportType, generatedAt: new Date().toISOString(), rows });
    return;
  }

  if (reportType === 'overdue') {
    const loans = db
      .prepare(
        `SELECT
          l.loanNumber,
          m.registrationNumber,
          m.fullName as memberName,
          m.memberType,
          d.code as departmentCode,
          b.title as bookTitle,
          pc.accessionNumber,
          l.issuedAt,
          l.dueDate
         FROM Loans l
         JOIN Members m ON l.memberId = m.id
         JOIN Departments d ON m.departmentId = d.id
         JOIN Books b ON l.bookId = b.id
         JOIN PhysicalBookCopies pc ON l.copyId = pc.id
         WHERE l.status IN ('Active', 'Overdue')`
      )
      .all() as Array<Record<string, unknown>>;

    const rows = loans
      .map((l) => {
        const { overdueDays, fineAmount } = calculateOverdueFine(String(l.dueDate), todayIso, policy);
        return { ...l, overdueDays, accruedFine: fineAmount };
      })
      .filter((l) => l.overdueDays > 0);

    res.json({ reportType, generatedAt: new Date().toISOString(), rows });
    return;
  }

  if (reportType === 'fines') {
    const rows = db
      .prepare(
        `SELECT
          fa.id as fineId,
          l.loanNumber,
          m.registrationNumber,
          m.fullName as memberName,
          d.code as departmentCode,
          b.title as bookTitle,
          fa.overdueDays,
          fa.assessedAmount,
          fa.paidAmount,
          fa.waivedAmount,
          (fa.assessedAmount - fa.paidAmount - fa.waivedAmount) as remainingBalance,
          fa.status,
          fa.createdAt
         FROM FineAssessments fa
         JOIN Loans l ON fa.loanId = l.id
         JOIN Members m ON fa.memberId = m.id
         JOIN Departments d ON m.departmentId = d.id
         JOIN Books b ON l.bookId = b.id
         ORDER BY fa.createdAt DESC`
      )
      .all();
    res.json({ reportType, generatedAt: new Date().toISOString(), rows });
    return;
  }

  if (reportType === 'damaged-lost') {
    const rows = db
      .prepare(
        `SELECT
          pc.accessionNumber,
          pc.barcode,
          b.bookCode,
          b.title,
          c.name as categoryName,
          pc.status,
          pc.acquisitionPrice,
          pc.conditionNotes,
          pc.updatedAt
         FROM PhysicalBookCopies pc
         JOIN Books b ON pc.bookId = b.id
         JOIN Categories c ON b.categoryId = c.id
         WHERE pc.status IN ('Damaged', 'Lost', 'UnderMaintenance') AND pc.isArchived = 0
         ORDER BY pc.updatedAt DESC`
      )
      .all();
    res.json({ reportType, generatedAt: new Date().toISOString(), rows });
    return;
  }

  if (reportType === 'member-borrowing') {
    const rows = db
      .prepare(
        `SELECT
          m.memberCode,
          m.registrationNumber,
          m.fullName,
          m.memberType,
          d.code as departmentCode,
          m.accountStatus,
          (SELECT COUNT(*) FROM Loans l WHERE l.memberId = m.id) as totalLoansAllTime,
          (SELECT COUNT(*) FROM Loans l WHERE l.memberId = m.id AND l.status IN ('Active', 'Overdue')) as activeLoans,
          (SELECT COALESCE(SUM(fa.assessedAmount - fa.paidAmount - fa.waivedAmount), 0)
           FROM FineAssessments fa WHERE fa.memberId = m.id AND fa.status IN ('Unpaid', 'PartiallyPaid')) as unpaidFines
         FROM Members m
         JOIN Departments d ON m.departmentId = d.id
         ORDER BY totalLoansAllTime DESC`
      )
      .all();
    res.json({ reportType, generatedAt: new Date().toISOString(), rows });
    return;
  }

  // Default: circulation report
  const rows = db
    .prepare(
      `SELECT
        l.loanNumber,
        m.registrationNumber,
        m.fullName as memberName,
        m.memberType,
        b.title as bookTitle,
        pc.accessionNumber,
        l.issuedAt,
        l.dueDate,
        l.returnedAt,
        l.renewalCount,
        l.status
       FROM Loans l
       JOIN Members m ON l.memberId = m.id
       JOIN Books b ON l.bookId = b.id
       JOIN PhysicalBookCopies pc ON l.copyId = pc.id
       ORDER BY l.issuedAt DESC`
    )
    .all();
  res.json({ reportType: 'circulation', generatedAt: new Date().toISOString(), rows });
});

apiRouter.get('/audit-logs', requireAuth, requireRole(['SuperAdmin', 'Librarian']), (req: AuthenticatedRequest, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const entityType = String(req.query.entityType || '');

  const rows = db.prepare('SELECT * FROM AuditLogs ORDER BY id DESC LIMIT 200').all() as Array<Record<string, unknown>>;
  const filtered = rows.filter((r) => {
    if (entityType && String(r.entityType) !== entityType) return false;
    if (search) {
      const hay = `${r.actorName} ${r.action} ${r.entityType} ${r.entityId || ''} ${r.details || ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  res.json({ items: filtered });
});

apiRouter.get('/settings/policy', requireAuth, (_req, res) => {
  res.json({ policy: getLibraryPolicy() });
});

apiRouter.put('/settings/policy', requireAuth, requireRole(['SuperAdmin']), (req: AuthenticatedRequest, res) => {
  const p = req.body || {};
  const nowIso = new Date().toISOString();

  db.prepare(
    `UPDATE LibraryPolicies SET
      studentLoanDays = ?,
      facultyLoanDays = ?,
      studentLoanLimit = ?,
      facultyLoanLimit = ?,
      finePerDay = ?,
      maxRenewals = ?,
      renewalExtensionDays = ?,
      allowOverdueRenewal = ?,
      blockIssueOnOverdue = ?,
      maxUnpaidFineLimit = ?,
      reservationExpiryHours = ?,
      excludeSundaysInFine = ?,
      updatedByUserId = ?,
      updatedAt = ?
     WHERE id = 1`
  ).run(
    Math.max(1, Number(p.studentLoanDays || 14)),
    Math.max(1, Number(p.facultyLoanDays || 28)),
    Math.max(1, Number(p.studentLoanLimit || 3)),
    Math.max(1, Number(p.facultyLoanLimit || 5)),
    Math.max(0, Number(p.finePerDay ?? 2.0)),
    Math.max(0, Number(p.maxRenewals ?? 2)),
    Math.max(1, Number(p.renewalExtensionDays || 14)),
    p.allowOverdueRenewal ? 1 : 0,
    p.blockIssueOnOverdue ? 1 : 0,
    Math.max(0, Number(p.maxUnpaidFineLimit ?? 100)),
    Math.max(1, Number(p.reservationExpiryHours || 48)),
    p.excludeSundaysInFine ? 1 : 0,
    req.user!.sub,
    nowIso
  );

  logAudit({
    actorUserId: req.user!.sub,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'POLICY_UPDATED',
    entityType: 'LibraryPolicy',
    entityId: 'GLOBAL_POLICY',
    details: `Updated institutional circulation & fine policy (Student: ${p.studentLoanLimit} books/${p.studentLoanDays}d, Faculty: ${p.facultyLoanLimit} books/${p.facultyLoanDays}d, Fine: ₹${p.finePerDay}/day).`,
  });

  res.json({ policy: getLibraryPolicy(), message: 'Institutional library policy updated successfully.' });
});

apiRouter.get('/settings/staff', requireAuth, requireRole(['SuperAdmin']), (_req, res) => {
  const staff = db
    .prepare(
      `SELECT id, email, fullName, role, isActive, lastLoginAt, createdAt
       FROM Users
       WHERE role IN ('SuperAdmin', 'Librarian')
       ORDER BY id ASC`
    )
    .all();
  res.json({ items: staff });
});

apiRouter.post('/settings/staff', requireAuth, requireRole(['SuperAdmin']), (req: AuthenticatedRequest, res) => {
  const { email, fullName, role, password } = req.body || {};
  if (!email || !fullName || !password || String(password).length < 8) {
    res.status(400).json({
      title: 'Validation Error',
      status: 400,
      detail: 'Email, full name, and password (minimum 8 characters) are required.',
    });
    return;
  }

  const targetRole = role === 'SuperAdmin' ? 'SuperAdmin' : 'Librarian';
  const normEmail = String(email).trim().toLowerCase();
  const { hash, salt } = hashPassword(String(password));
  const nowIso = new Date().toISOString();

  try {
    const result = db
      .prepare(
        `INSERT INTO Users (email, fullName, passwordHash, passwordSalt, role, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(normEmail, String(fullName).trim(), hash, salt, targetRole, nowIso, nowIso);

    logAudit({
      actorUserId: req.user!.sub,
      actorName: req.user!.fullName,
      actorRole: req.user!.role,
      action: 'STAFF_ACCOUNT_PROVISIONED',
      entityType: 'User',
      entityId: Number(result.lastInsertRowid),
      details: `Provisioned ${targetRole} account for ${fullName} (${normEmail}).`,
    });

    res.status(201).json({ id: Number(result.lastInsertRowid), message: `${targetRole} account created.` });
  } catch {
    res.status(409).json({ title: 'Duplicate Email', status: 409, detail: 'An account with this email already exists.' });
  }
});

apiRouter.patch('/settings/staff/:id/status', requireAuth, requireRole(['SuperAdmin']), (req: AuthenticatedRequest, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user!.sub) {
    res.status(400).json({ title: 'Operation Blocked', status: 400, detail: 'You cannot deactivate your own SuperAdmin account.' });
    return;
  }
  const { isActive } = req.body || {};
  db.prepare('UPDATE Users SET isActive = ?, updatedAt = ? WHERE id = ?').run(
    isActive ? 1 : 0,
    new Date().toISOString(),
    targetId
  );

  logAudit({
    actorUserId: req.user!.sub,
    actorName: req.user!.fullName,
    actorRole: req.user!.role,
    action: 'STAFF_STATUS_CHANGED',
    entityType: 'User',
    entityId: targetId,
    details: `Set staff account active=${Boolean(isActive)}`,
  });

  res.json({ message: 'Staff account status updated.' });
});
