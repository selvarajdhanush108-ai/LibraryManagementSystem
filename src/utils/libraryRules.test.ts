import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateIsbn,
  canTransitionCopyStatus,
  checkIssueEligibility,
  calculateDueDate,
  calculateOverdueFine,
  checkRenewalEligibility,
  applyFineTransaction,
  computeReservationQueuePositions,
  DEFAULT_LIBRARY_POLICY,
} from './libraryRules.ts';

test('ISBN validation accepts valid ISBN-10, ISBN-13, and empty ISBNs, and rejects malformed ones', () => {
  // Empty ISBN allowed
  assert.deepEqual(validateIsbn(''), { valid: true, normalized: null });
  assert.deepEqual(validateIsbn(null), { valid: true, normalized: null });

  // Valid ISBN-13 (Introduction to Algorithms 4th Ed: 978-0-262-04630-5)
  const valid13 = validateIsbn('978-0-262-04630-5');
  assert.equal(valid13.valid, true);
  assert.equal(valid13.normalized, '9780262046305');

  // Invalid ISBN-13 check digit
  const invalid13 = validateIsbn('978-0-262-04630-6');
  assert.equal(invalid13.valid, false);

  // Valid ISBN-10 (0-306-40615-2)
  const valid10 = validateIsbn('0-306-40615-2');
  assert.equal(valid10.valid, true);
  assert.equal(valid10.normalized, '0306406152');

  // Invalid length
  const shortIsbn = validateIsbn('12345');
  assert.equal(shortIsbn.valid, false);
});

test('Physical copy state transitions prevent double-issuing and invalid transitions', () => {
  assert.equal(canTransitionCopyStatus('Available', 'Issued').allowed, true);
  assert.equal(canTransitionCopyStatus('Issued', 'Issued').allowed, false);
  assert.equal(canTransitionCopyStatus('Issued', 'Available').allowed, true);
  assert.equal(canTransitionCopyStatus('Damaged', 'Issued').allowed, false);
  assert.equal(canTransitionCopyStatus('Damaged', 'UnderMaintenance').allowed, true);
  assert.equal(canTransitionCopyStatus('UnderMaintenance', 'Available').allowed, true);
});

test('Borrowing eligibility enforces account status, role loan limits, overdue blocks, and copy availability', () => {
  const validCase = checkIssueEligibility({
    memberStatus: 'Active',
    memberType: 'Student',
    activeLoanCount: 2,
    hasOverdueLoans: false,
    outstandingFineBalance: 0,
    copyStatus: 'Available',
    copyReservedForOtherMember: false,
    alreadyBorrowingSameBook: false,
  });
  assert.equal(validCase.eligible, true);
  assert.equal(validCase.errors.length, 0);

  // Student limit reached (3/3)
  const limitCase = checkIssueEligibility({
    memberStatus: 'Active',
    memberType: 'Student',
    activeLoanCount: 3,
    hasOverdueLoans: false,
    outstandingFineBalance: 0,
    copyStatus: 'Available',
    copyReservedForOtherMember: false,
    alreadyBorrowingSameBook: false,
  });
  assert.equal(limitCase.eligible, false);
  assert.ok(limitCase.errors.some((e) => e.includes('borrowing limit reached')));

  // Faculty allowed up to 5
  const facultyCase = checkIssueEligibility({
    memberStatus: 'Active',
    memberType: 'Faculty',
    activeLoanCount: 3,
    hasOverdueLoans: false,
    outstandingFineBalance: 0,
    copyStatus: 'Available',
    copyReservedForOtherMember: false,
    alreadyBorrowingSameBook: false,
  });
  assert.equal(facultyCase.eligible, true);

  // Unavailable copy rejected
  const unavailableCase = checkIssueEligibility({
    memberStatus: 'Active',
    memberType: 'Student',
    activeLoanCount: 0,
    hasOverdueLoans: false,
    outstandingFineBalance: 0,
    copyStatus: 'Issued',
    copyReservedForOtherMember: false,
    alreadyBorrowingSameBook: false,
  });
  assert.equal(unavailableCase.eligible, false);
});

test('Due date and overdue fine calculations follow configured KSR Library policy', () => {
  const studentDue = calculateDueDate('2026-10-01T10:00:00Z', 'Student', DEFAULT_LIBRARY_POLICY);
  assert.equal(studentDue, '2026-10-15');

  const facultyDue = calculateDueDate('2026-10-01T10:00:00Z', 'Faculty', DEFAULT_LIBRARY_POLICY);
  assert.equal(facultyDue, '2026-10-29');

  // Returning on due date = 0 overdue days, ₹0 fine
  const onTime = calculateOverdueFine('2026-10-15', '2026-10-15', DEFAULT_LIBRARY_POLICY);
  assert.deepEqual(onTime, { overdueDays: 0, fineAmount: 0 });

  // Returning 5 days late at ₹2/day = ₹10 fine
  const fiveDaysLate = calculateOverdueFine('2026-10-10', '2026-10-15', DEFAULT_LIBRARY_POLICY);
  assert.deepEqual(fiveDaysLate, { overdueDays: 5, fineAmount: 10 });
});

test('Renewal eligibility enforces renewal limits, reservation conflicts, and overdue rules', () => {
  // Eligible first renewal
  const okRenewal = checkRenewalEligibility({
    loanStatus: 'Active',
    renewalCount: 1,
    dueDate: '2026-10-20',
    currentDate: '2026-10-17',
    hasOtherMemberReservation: false,
    memberStatus: 'Active',
  });
  assert.equal(okRenewal.eligible, true);

  // Blocked by max renewals (2)
  const maxReached = checkRenewalEligibility({
    loanStatus: 'Active',
    renewalCount: 2,
    dueDate: '2026-10-20',
    currentDate: '2026-10-17',
    hasOtherMemberReservation: false,
    memberStatus: 'Active',
  });
  assert.equal(maxReached.eligible, false);

  // Blocked by another member's reservation
  const reservedConflict = checkRenewalEligibility({
    loanStatus: 'Active',
    renewalCount: 0,
    dueDate: '2026-10-20',
    currentDate: '2026-10-17',
    hasOtherMemberReservation: true,
    memberStatus: 'Active',
  });
  assert.equal(reservedConflict.eligible, false);

  // Blocked when already returned
  const returnedLoan = checkRenewalEligibility({
    loanStatus: 'Returned',
    renewalCount: 0,
    dueDate: '2026-10-20',
    currentDate: '2026-10-17',
    hasOtherMemberReservation: false,
    memberStatus: 'Active',
  });
  assert.equal(returnedLoan.eligible, false);
});

test('Fine payment and waiver allocations update balances accurately and prevent overpayment', () => {
  // Partial payment of ₹10 on ₹24 fine
  const partial = applyFineTransaction({
    assessedAmount: 24,
    paidAmount: 0,
    waivedAmount: 0,
    transactionAmount: 10,
    type: 'Payment',
  });
  assert.equal(partial.valid, true);
  assert.equal(partial.newPaidAmount, 10);
  assert.equal(partial.remainingBalance, 14);
  assert.equal(partial.status, 'PartiallyPaid');

  // Settling remaining ₹14 via authorized waiver
  const settled = applyFineTransaction({
    assessedAmount: 24,
    paidAmount: 10,
    waivedAmount: 0,
    transactionAmount: 14,
    type: 'Waiver',
  });
  assert.equal(settled.valid, true);
  assert.equal(settled.remainingBalance, 0);
  assert.equal(settled.status, 'Paid');

  // Overpayment rejected
  const overpay = applyFineTransaction({
    assessedAmount: 24,
    paidAmount: 20,
    waivedAmount: 0,
    transactionAmount: 10,
    type: 'Payment',
  });
  assert.equal(overpay.valid, false);
});

test('Reservation queue positions are deterministic FIFO per book', () => {
  const queue = computeReservationQueuePositions([
    { id: 102, bookId: 1, status: 'Pending', createdAt: '2026-10-15T12:00:00Z' },
    { id: 101, bookId: 1, status: 'Pending', createdAt: '2026-10-14T09:00:00Z' },
    { id: 103, bookId: 1, status: 'Cancelled', createdAt: '2026-10-13T08:00:00Z' },
  ]);
  const r101 = queue.find((r) => r.id === 101)!;
  const r102 = queue.find((r) => r.id === 102)!;
  const r103 = queue.find((r) => r.id === 103)!;
  assert.equal(r101.computedQueuePosition, 1);
  assert.equal(r102.computedQueuePosition, 2);
  assert.equal(r103.computedQueuePosition, 0);
});
