export type CopyStatus =
  | 'Available'
  | 'Issued'
  | 'Reserved'
  | 'Lost'
  | 'Damaged'
  | 'UnderMaintenance';

export type UserRole = 'SuperAdmin' | 'Librarian' | 'Student' | 'Faculty';

export type MemberType = 'Student' | 'Faculty';

export type AccountStatus = 'Active' | 'Inactive' | 'Suspended';

export interface LibraryPolicyConfig {
  studentLoanDays: number;
  facultyLoanDays: number;
  studentLoanLimit: number;
  facultyLoanLimit: number;
  finePerDay: number;
  maxRenewals: number;
  renewalExtensionDays: number;
  allowOverdueRenewal: boolean;
  blockIssueOnOverdue: boolean;
  maxUnpaidFineLimit: number;
  reservationExpiryHours: number;
  excludeSundaysInFine: boolean;
}

export const DEFAULT_LIBRARY_POLICY: LibraryPolicyConfig = {
  studentLoanDays: 14,
  facultyLoanDays: 28,
  studentLoanLimit: 3,
  facultyLoanLimit: 5,
  finePerDay: 2.0,
  maxRenewals: 2,
  renewalExtensionDays: 14,
  allowOverdueRenewal: false,
  blockIssueOnOverdue: true,
  maxUnpaidFineLimit: 100.0,
  reservationExpiryHours: 48,
  excludeSundaysInFine: false,
};

/**
 * Validates ISBN-10 or ISBN-13 when supplied.
 * Empty/null ISBN is permitted because older monographs or journals may only have accession numbers.
 */
export function validateIsbn(rawIsbn?: string | null): { valid: boolean; normalized: string | null; error?: string } {
  if (!rawIsbn || rawIsbn.trim() === '') {
    return { valid: true, normalized: null };
  }

  const cleaned = rawIsbn.replace(/[-\s]/g, '').toUpperCase();

  if (cleaned.length === 10) {
    if (!/^\d{9}[\dX]$/.test(cleaned)) {
      return { valid: false, normalized: null, error: 'ISBN-10 must contain 9 digits followed by a digit or X.' };
    }
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += (10 - i) * parseInt(cleaned[i], 10);
    }
    sum += cleaned[9] === 'X' ? 10 : parseInt(cleaned[9], 10);
    if (sum % 11 !== 0) {
      return { valid: false, normalized: null, error: 'Invalid ISBN-10 check digit.' };
    }
    return { valid: true, normalized: cleaned };
  }

  if (cleaned.length === 13) {
    if (!/^(978|979)\d{10}$/.test(cleaned)) {
      return { valid: false, normalized: null, error: 'ISBN-13 must be 13 digits starting with 978 or 979.' };
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(cleaned[i], 10);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    if (checkDigit !== parseInt(cleaned[12], 10)) {
      return { valid: false, normalized: null, error: 'Invalid ISBN-13 check digit.' };
    }
    return { valid: true, normalized: cleaned };
  }

  return {
    valid: false,
    normalized: null,
    error: 'ISBN must be a valid 10-digit (ISBN-10) or 13-digit (ISBN-13) identifier.',
  };
}

/**
 * Enforces valid physical copy state transitions.
 */
export function canTransitionCopyStatus(fromStatus: CopyStatus, toStatus: CopyStatus): { allowed: boolean; reason?: string } {
  if (fromStatus === toStatus) {
    if (fromStatus === 'Issued') {
      return { allowed: false, reason: 'This physical copy is already issued to an active borrower.' };
    }
    return { allowed: true };
  }

  const validTransitions: Record<CopyStatus, CopyStatus[]> = {
    Available: ['Issued', 'Reserved', 'Damaged', 'Lost', 'UnderMaintenance'],
    Issued: ['Available', 'Reserved', 'Damaged', 'Lost'],
    Reserved: ['Issued', 'Available', 'Damaged', 'Lost', 'UnderMaintenance'],
    Damaged: ['UnderMaintenance', 'Available', 'Lost'],
    UnderMaintenance: ['Available', 'Damaged', 'Lost'],
    Lost: ['Available'], // Found/replaced copy recovery
  };

  const allowedList = validTransitions[fromStatus] || [];
  if (!allowedList.includes(toStatus)) {
    return {
      allowed: false,
      reason: `Invalid inventory state transition from '${fromStatus}' to '${toStatus}'.`,
    };
  }
  return { allowed: true };
}

/**
 * Checks whether a member and copy are eligible for a book issue transaction.
 */
export function checkIssueEligibility(params: {
  memberStatus: AccountStatus;
  memberType: MemberType;
  activeLoanCount: number;
  hasOverdueLoans: boolean;
  outstandingFineBalance: number;
  copyStatus: CopyStatus;
  copyReservedForOtherMember: boolean;
  alreadyBorrowingSameBook: boolean;
  policy?: LibraryPolicyConfig;
}): { eligible: boolean; errors: string[] } {
  const policy = params.policy ?? DEFAULT_LIBRARY_POLICY;
  const errors: string[] = [];

  if (params.memberStatus !== 'Active') {
    errors.push(`Member account status is '${params.memberStatus}'. Only active members may borrow books.`);
  }

  const maxLoans = params.memberType === 'Faculty' ? policy.facultyLoanLimit : policy.studentLoanLimit;
  if (params.activeLoanCount >= maxLoans) {
    errors.push(
      `${params.memberType} borrowing limit reached (${params.activeLoanCount}/${maxLoans} active loans).`
    );
  }

  if (policy.blockIssueOnOverdue && params.hasOverdueLoans) {
    errors.push('Member has one or more overdue books that must be returned or renewed first.');
  }

  if (params.outstandingFineBalance > policy.maxUnpaidFineLimit) {
    errors.push(
      `Member's unpaid fine balance (₹${params.outstandingFineBalance.toFixed(2)}) exceeds the policy threshold (₹${policy.maxUnpaidFineLimit.toFixed(2)}).`
    );
  }

  if (params.alreadyBorrowingSameBook) {
    errors.push('Member already holds an active loan for another copy of this same title.');
  }

  if (params.copyReservedForOtherMember) {
    errors.push('This copy is allocated to another member in the reservation queue.');
  } else if (params.copyStatus !== 'Available' && params.copyStatus !== 'Reserved') {
    errors.push(`Physical copy status is '${params.copyStatus}' and cannot be issued.`);
  }

  return {
    eligible: errors.length === 0,
    errors,
  };
}

/**
 * Calculates the UTC YYYY-MM-DD due date for a new loan or renewal.
 */
export function calculateDueDate(
  baseDateIso: string,
  memberType: MemberType,
  policy: LibraryPolicyConfig = DEFAULT_LIBRARY_POLICY,
  isRenewal = false
): string {
  const base = new Date(baseDateIso);
  const daysToAdd = isRenewal
    ? policy.renewalExtensionDays
    : memberType === 'Faculty'
    ? policy.facultyLoanDays
    : policy.studentLoanDays;

  const due = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  due.setUTCDate(due.getUTCDate() + daysToAdd);
  return due.toISOString().split('T')[0];
}

/**
 * Calculates overdue days and fine amount according to the explicit institutional policy:
 * - The due date itself is chargeable only after 23:59:59 UTC of that calendar date.
 * - Overdue days = full calendar days elapsed after dueDate up to comparisonDate.
 */
export function calculateOverdueFine(
  dueDateStr: string,
  comparisonDateStr: string,
  policy: LibraryPolicyConfig = DEFAULT_LIBRARY_POLICY
): { overdueDays: number; fineAmount: number } {
  const d1 = new Date(dueDateStr.includes('T') ? dueDateStr : `${dueDateStr}T00:00:00.000Z`);
  const d2 = new Date(comparisonDateStr.includes('T') ? comparisonDateStr : `${comparisonDateStr}T00:00:00.000Z`);

  const utc1 = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate());
  const utc2 = Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());

  if (utc2 <= utc1) {
    return { overdueDays: 0, fineAmount: 0 };
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  let totalDays = Math.floor((utc2 - utc1) / msPerDay);

  if (policy.excludeSundaysInFine) {
    let chargeableDays = 0;
    const cursor = new Date(utc1);
    for (let i = 0; i < totalDays; i++) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (cursor.getUTCDay() !== 0) {
        chargeableDays++;
      }
    }
    totalDays = chargeableDays;
  }

  const fineAmount = Math.round(totalDays * policy.finePerDay * 100) / 100;
  return { overdueDays: totalDays, fineAmount };
}

/**
 * Validates whether an active loan can be renewed.
 */
export function checkRenewalEligibility(params: {
  loanStatus: 'Active' | 'Returned' | 'Overdue';
  renewalCount: number;
  dueDate: string;
  currentDate: string;
  hasOtherMemberReservation: boolean;
  memberStatus: AccountStatus;
  policy?: LibraryPolicyConfig;
}): { eligible: boolean; reason?: string } {
  const policy = params.policy ?? DEFAULT_LIBRARY_POLICY;

  if (params.loanStatus === 'Returned') {
    return { eligible: false, reason: 'A returned loan cannot be renewed.' };
  }

  if (params.memberStatus !== 'Active') {
    return { eligible: false, reason: 'Inactive or suspended members cannot renew loans.' };
  }

  if (params.renewalCount >= policy.maxRenewals) {
    return {
      eligible: false,
      reason: `Renewal limit reached (${params.renewalCount}/${policy.maxRenewals} renewals used).`,
    };
  }

  if (params.hasOtherMemberReservation) {
    return {
      eligible: false,
      reason: 'Renewal blocked because another member is waiting in the reservation queue for this title.',
    };
  }

  const { overdueDays } = calculateOverdueFine(params.dueDate, params.currentDate, policy);
  if (overdueDays > 0 && !policy.allowOverdueRenewal) {
    return {
      eligible: false,
      reason: `Overdue loans (${overdueDays} days past due) cannot be renewed under current library policy. Please return the book at the circulation desk.`,
    };
  }

  return { eligible: true };
}

/**
 * Validates and computes updated fine balances after a payment or waiver.
 */
export function applyFineTransaction(params: {
  assessedAmount: number;
  paidAmount: number;
  waivedAmount: number;
  transactionAmount: number;
  type: 'Payment' | 'Waiver';
}): {
  valid: boolean;
  error?: string;
  newPaidAmount: number;
  newWaivedAmount: number;
  remainingBalance: number;
  status: 'Unpaid' | 'PartiallyPaid' | 'Paid' | 'Waived';
} {
  const currentRemaining = Math.round((params.assessedAmount - params.paidAmount - params.waivedAmount) * 100) / 100;

  if (params.transactionAmount <= 0) {
    return {
      valid: false,
      error: `${params.type} amount must be greater than ₹0.00.`,
      newPaidAmount: params.paidAmount,
      newWaivedAmount: params.waivedAmount,
      remainingBalance: currentRemaining,
      status: 'Unpaid',
    };
  }

  if (params.transactionAmount > currentRemaining + 0.001) {
    return {
      valid: false,
      error: `${params.type} amount (₹${params.transactionAmount.toFixed(2)}) exceeds the remaining outstanding fine balance (₹${currentRemaining.toFixed(2)}).`,
      newPaidAmount: params.paidAmount,
      newWaivedAmount: params.waivedAmount,
      remainingBalance: currentRemaining,
      status: 'Unpaid',
    };
  }

  const newPaid =
    params.type === 'Payment'
      ? Math.round((params.paidAmount + params.transactionAmount) * 100) / 100
      : params.paidAmount;
  const newWaived =
    params.type === 'Waiver'
      ? Math.round((params.waivedAmount + params.transactionAmount) * 100) / 100
      : params.waivedAmount;

  const remaining = Math.max(0, Math.round((params.assessedAmount - newPaid - newWaived) * 100) / 100);

  let status: 'Unpaid' | 'PartiallyPaid' | 'Paid' | 'Waived' = 'Unpaid';
  if (remaining === 0) {
    status = newWaived >= params.assessedAmount ? 'Waived' : 'Paid';
  } else if (newPaid > 0 || newWaived > 0) {
    status = 'PartiallyPaid';
  }

  return {
    valid: true,
    newPaidAmount: newPaid,
    newWaivedAmount: newWaived,
    remainingBalance: remaining,
    status,
  };
}

/**
 * Orders reservations deterministically by creation timestamp (FIFO) and assigns 1-based queue positions.
 */
export function computeReservationQueuePositions<
  T extends { id: number | string; bookId: number; status: string; createdAt: string }
>(reservations: T[]): Array<T & { computedQueuePosition: number }> {
  const activeStatuses = new Set(['Pending', 'ReadyForPickup', 'Approved']);
  const byBook = new Map<number, T[]>();

  for (const r of reservations) {
    if (!activeStatuses.has(r.status)) continue;
    const list = byBook.get(r.bookId) || [];
    list.push(r);
    byBook.set(r.bookId, list);
  }

  const positionMap = new Map<number | string, number>();
  for (const [, list] of byBook.entries()) {
    list.sort((a, b) => {
      const tDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (tDiff !== 0) return tDiff;
      return String(a.id).localeCompare(String(b.id));
    });
    list.forEach((item, index) => {
      positionMap.set(item.id, index + 1);
    });
  }

  return reservations.map((r) => ({
    ...r,
    computedQueuePosition: positionMap.get(r.id) ?? 0,
  }));
}
