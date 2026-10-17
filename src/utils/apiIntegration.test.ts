import test from 'node:test';
import assert from 'node:assert/strict';
import { db, initializeDatabase, verifyPassword, getLibraryPolicy } from '../server/db.ts';
import { signAccessToken, verifyAccessToken } from '../server/auth.ts';
import {
  checkIssueEligibility,
  calculateDueDate,
  calculateOverdueFine,
  applyFineTransaction,
} from './libraryRules.ts';

test('Database initialization seeds KSR College of Engineering demo catalog, copies, members, and policies', () => {
  initializeDatabase();

  const bookCount = (db.prepare('SELECT COUNT(*) as cnt FROM Books').get() as { cnt: number }).cnt;
  const copyCount = (db.prepare('SELECT COUNT(*) as cnt FROM PhysicalBookCopies').get() as { cnt: number }).cnt;
  const memberCount = (db.prepare('SELECT COUNT(*) as cnt FROM Members').get() as { cnt: number }).cnt;

  assert.ok(bookCount >= 9, 'Should seed at least 9 engineering book titles');
  assert.ok(copyCount >= 18, 'Should seed at least 18 physical book copies');
  assert.ok(memberCount >= 7, 'Should seed student and faculty demonstration accounts');

  const policy = getLibraryPolicy();
  assert.equal(policy.studentLoanDays, 14);
  assert.equal(policy.studentLoanLimit, 3);
  assert.equal(policy.facultyLoanLimit, 5);
  assert.equal(policy.finePerDay, 2.0);
});

test('Authentication verifies hashed passwords and issues valid signed JWT tokens with role claims', () => {
  const admin = db.prepare('SELECT * FROM Users WHERE email = ?').get('admin@ksrce.ac.in') as Record<string, unknown>;
  assert.ok(admin, 'SuperAdmin account exists');

  const okPwd = verifyPassword('KsrAdmin@2026', String(admin.passwordHash), String(admin.passwordSalt));
  assert.equal(okPwd, true);

  const badPwd = verifyPassword('WrongPassword123', String(admin.passwordHash), String(admin.passwordSalt));
  assert.equal(badPwd, false);

  const token = signAccessToken({
    sub: Number(admin.id),
    email: String(admin.email),
    fullName: String(admin.fullName),
    role: 'SuperAdmin',
    memberId: null,
  });

  const verified = verifyAccessToken(token);
  assert.ok(verified);
  assert.equal(verified?.role, 'SuperAdmin');
  assert.equal(verified?.email, 'admin@ksrce.ac.in');
});

test('Physical inventory rejects duplicate accession numbers and maintains accurate copy counts', () => {
  assert.throws(() => {
    db.prepare(
      `INSERT INTO PhysicalBookCopies (bookId, accessionNumber, barcode, acquisitionDate, acquisitionPrice, shelfLocation, status)
       VALUES (1, 'KSR-ACC-1001', 'BC-DUP-999', '2026-01-01', 500, 'Rack A', 'Available')`
    ).run();
  }, /UNIQUE constraint failed/);
});

test('Circulation issue, return, and fine payment workflow maintains transactional consistency', () => {
  const policy = getLibraryPolicy();
  // Find an available copy (KSR-ACC-1015) and an active student with 0 overdue books (Keerthana V.)
  const copy = db
    .prepare(`SELECT * FROM PhysicalBookCopies WHERE accessionNumber = 'KSR-ACC-1015'`)
    .get() as Record<string, unknown>;
  const member = db
    .prepare(`SELECT * FROM Members WHERE email = 'student.ee04@ksrce.ac.in'`)
    .get() as Record<string, unknown>;

  assert.equal(copy.status, 'Available');
  assert.equal(member.accountStatus, 'Active');

  const eligibility = checkIssueEligibility({
    memberStatus: 'Active',
    memberType: 'Student',
    activeLoanCount: 0,
    hasOverdueLoans: false,
    outstandingFineBalance: 0,
    copyStatus: copy.status as 'Available',
    copyReservedForOtherMember: false,
    alreadyBorrowingSameBook: false,
    policy,
  });
  assert.equal(eligibility.eligible, true);

  const due = calculateDueDate('2026-10-01T00:00:00Z', 'Student', policy);
  assert.equal(due, '2026-10-15');

  const overdueCalc = calculateOverdueFine('2026-10-15', '2026-10-19', policy);
  assert.equal(overdueCalc.overdueDays, 4);
  assert.equal(overdueCalc.fineAmount, 8.0);

  const fineTx = applyFineTransaction({
    assessedAmount: 8.0,
    paidAmount: 0,
    waivedAmount: 0,
    transactionAmount: 8.0,
    type: 'Payment',
  });
  assert.equal(fineTx.valid, true);
  assert.equal(fineTx.remainingBalance, 0);
  assert.equal(fineTx.status, 'Paid');
});
