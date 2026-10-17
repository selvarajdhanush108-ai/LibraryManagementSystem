import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Search,
  Download,
  BookmarkPlus,
} from 'lucide-react';
import { apiRequest, exportToCsv } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ReceiptData, ReceiptModal, SemanticStatus } from '../components/AppLayout';

export const AdminIssueDeskPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [accessionInput, setAccessionInput] = useState('');
  const [remarks, setRemarks] = useState('Issued at Central Library Counter');
  const [eligibilityResult, setEligibilityResult] = useState<any | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const { data: membersData } = useQuery({
    queryKey: ['members-active-list'],
    queryFn: () => apiRequest('/members'),
  });

  const { data: availableCopiesData } = useQuery({
    queryKey: ['copies-available-list'],
    queryFn: () => apiRequest('/copies?status=Available'),
  });

  const checkMut = useMutation({
    mutationFn: () =>
      apiRequest('/loans/check-eligibility', {
        method: 'POST',
        body: JSON.stringify({
          memberId: Number(selectedMemberId),
          accessionNumber: accessionInput.trim(),
        }),
      }),
    onSuccess: (res) => {
      setEligibilityResult(res);
    },
    onError: (err: Error) => {
      setEligibilityResult(null);
      showToast('error', 'Lookup Failed', err.message);
    },
  });

  const issueMut = useMutation({
    mutationFn: () =>
      apiRequest('/loans/issue', {
        method: 'POST',
        body: JSON.stringify({
          memberId: Number(selectedMemberId),
          accessionNumber: accessionInput.trim(),
          remarks,
        }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Book Issued Successfully', `${res.loanNumber} recorded.`);
      setReceipt({
        receiptTitle: 'Book Issue Slip',
        referenceNumber: res.loanNumber,
        timestamp: res.issuedAt,
        memberName: res.memberName,
        registrationNumber: res.registrationNumber,
        bookTitle: res.bookTitle,
        accessionNumber: res.accessionNumber,
        dueDate: res.dueDate,
        notes: remarks,
      });
      setEligibilityResult(null);
      setAccessionInput('');
      queryClient.invalidateQueries({ queryKey: ['copies-available-list'] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err: Error) => {
      showToast('error', 'Issue Blocked', err.message);
    },
  });

  const members = membersData?.items || [];
  const availableCopies = availableCopiesData?.items || [];

  return (
    <div className="space-y-6">
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Circulation Counter 1</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Book Issue Management Desk</h1>
        </div>
        <Link
          to="/admin/returns"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Switch to Return Desk</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Step-by-Step Issue Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <h2 className="text-base font-bold text-slate-900">
            01. Select Patron & Physical Accession Barcode
          </h2>

          <div>
            <label htmlFor="issue-member" className="block text-xs font-semibold text-slate-700 mb-1.5">
              1. Search & Select Library Member (Reg. No. / Staff ID / Name) *
            </label>
            <select
              id="issue-member"
              value={selectedMemberId}
              onChange={(e) => {
                setSelectedMemberId(e.target.value);
                setEligibilityResult(null);
              }}
              className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="">-- Select Student or Faculty Member --</option>
              {members.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.registrationNumber} — {m.fullName} ({m.memberType} · {m.departmentCode} · Active Loans: {m.activeLoanCount})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="issue-accession" className="block text-xs font-semibold text-slate-700 mb-1.5">
              2. Scan Barcode or Enter Physical Copy Accession Number *
            </label>
            <div className="flex gap-2">
              <input
                id="issue-accession"
                type="text"
                value={accessionInput}
                onChange={(e) => {
                  setAccessionInput(e.target.value);
                  setEligibilityResult(null);
                }}
                placeholder="e.g., KSR-ACC-1002"
                className="flex-1 px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
              <button
                type="button"
                disabled={!selectedMemberId || !accessionInput.trim() || checkMut.isPending}
                onClick={() => checkMut.mutate()}
                className="px-4 py-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-40 text-white text-xs font-semibold rounded-md whitespace-nowrap"
              >
                {checkMut.isPending ? 'Checking...' : 'Validate Eligibility'}
              </button>
            </div>

            {/* Quick-Pick Available Copies Helper */}
            <div className="mt-2.5">
              <p className="text-[11px] font-medium text-slate-500 mb-1.5">
                Quick-Select Available Copy on Shelf (Click to populate barcode):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {availableCopies.slice(0, 8).map((cp: any) => (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => {
                      setAccessionInput(cp.accessionNumber);
                      setEligibilityResult(null);
                    }}
                    className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors ${
                      accessionInput === cp.accessionNumber
                        ? 'bg-[#0C1D36] text-white border-[#0C1D36] font-semibold'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cp.accessionNumber} ({cp.bookTitle.slice(0, 22)}…)
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="issue-remarks" className="block text-xs font-semibold text-slate-700 mb-1">
              3. Circulation Remarks (Optional)
            </label>
            <input
              id="issue-remarks"
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Atomic transaction updates loan ledger & copy status simultaneously.
            </span>
            <button
              type="button"
              disabled={!selectedMemberId || !accessionInput.trim() || issueMut.isPending}
              onClick={() => issueMut.mutate()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0C1D36] hover:bg-blue-900 disabled:opacity-40 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeftRight className="w-4 h-4 shrink-0" />
              <span>{issueMut.isPending ? 'Issuing Copy...' : 'Confirm & Issue Book'}</span>
            </button>
          </div>
        </div>

        {/* Right: Eligibility & Policy Verification Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="text-base font-bold text-slate-900">
            02. Policy & Eligibility Verification
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Verifies member account standing, active loan limits, overdue blocks, and physical copy status.
          </p>

          {!eligibilityResult ? (
            <div className="mt-8 py-12 text-center border border-dashed border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500">
                Select a member and enter an accession number, then click <strong>Validate Eligibility</strong> or <strong>Confirm & Issue Book</strong>.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div
                className={`p-3.5 rounded-md border flex items-start gap-2.5 ${
                  eligibilityResult.eligible
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {eligibilityResult.eligible ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                )}
                <div className="text-xs">
                  <p className="font-bold">
                    {eligibilityResult.eligible
                      ? 'Eligible for Immediate Circulation Issue'
                      : 'Circulation Policy Restriction Detected'}
                  </p>
                  {!eligibilityResult.eligible && (
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {(eligibilityResult.errors || []).map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <dl className="divide-y divide-slate-100 text-xs">
                <div className="py-2 flex justify-between">
                  <dt className="text-slate-500">Patron:</dt>
                  <dd className="font-semibold text-slate-900">
                    {eligibilityResult.member.fullName} ({eligibilityResult.member.memberType})
                  </dd>
                </div>
                <div className="py-2 flex justify-between">
                  <dt className="text-slate-500">Active Loans / Limit:</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {eligibilityResult.member.activeLoanCount} / {eligibilityResult.member.maxLoans} books
                  </dd>
                </div>
                <div className="py-2 flex justify-between">
                  <dt className="text-slate-500">Unpaid Fines:</dt>
                  <dd className="font-mono tabular-nums">
                    ₹{Number(eligibilityResult.member.outstandingFineBalance).toFixed(2)}
                  </dd>
                </div>
                <div className="py-2 flex justify-between">
                  <dt className="text-slate-500">Physical Copy:</dt>
                  <dd className="font-mono font-bold text-blue-900">
                    {eligibilityResult.copy.accessionNumber} ({eligibilityResult.copy.status})
                  </dd>
                </div>
                <div className="py-2 flex justify-between">
                  <dt className="text-slate-500">Book Title:</dt>
                  <dd className="font-medium text-slate-900 text-right">{eligibilityResult.copy.bookTitle}</dd>
                </div>
                <div className="py-2 flex justify-between">
                  <dt className="text-slate-500">Calculated Due Date:</dt>
                  <dd className="font-mono font-bold text-amber-800 tabular-nums">{eligibilityResult.dueDate}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const AdminReturnDeskPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);
  const [copyConditionStatus, setCopyConditionStatus] = useState('Available');
  const [conditionNotes, setConditionNotes] = useState('');
  const [fineResolution, setFineResolution] = useState<'LeavePending' | 'CollectFullPayment' | 'AuthorizeWaiver'>('CollectFullPayment');
  const [paymentMethod, setPaymentMethod] = useState('Cash Counter');
  const [waiverReason, setWaiverReason] = useState('');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const { data: loansData, isLoading } = useQuery({
    queryKey: ['loans-active-return', search],
    queryFn: () => apiRequest(`/loans?search=${encodeURIComponent(search)}`),
  });

  const activeLoans = (loansData?.items || []).filter((l: any) => l.status !== 'Returned');

  const returnMut = useMutation({
    mutationFn: (loanId: number) =>
      apiRequest(`/loans/${loanId}/return`, {
        method: 'POST',
        body: JSON.stringify({
          copyConditionStatus,
          conditionNotes: conditionNotes || undefined,
          fineResolution,
          paymentMethod,
          waiverReason,
        }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Book Returned', `${res.accessionNumber} returned to inventory.`);
      setReceipt({
        receiptTitle: 'Book Return & Fine Settlement Slip',
        referenceNumber: res.receiptNumber || res.loanNumber,
        timestamp: res.returnedAt,
        memberName: res.memberName,
        registrationNumber: res.registrationNumber,
        bookTitle: res.bookTitle,
        accessionNumber: res.accessionNumber,
        amountLabel: res.fineAmount > 0 ? `Overdue Fine (${res.overdueDays}d · ${res.fineStatus})` : 'Overdue Fine',
        amountValue: `₹${Number(res.fineAmount).toFixed(2)}`,
        notes: `Copy Condition: ${res.newCopyStatus}`,
      });
      setSelectedLoan(null);
      setWaiverReason('');
      queryClient.invalidateQueries({ queryKey: ['loans-active-return'] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err: Error) => showToast('error', 'Return Error', err.message),
  });

  return (
    <div className="space-y-6">
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Circulation Counter 2</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Quick Book Return & Fine Calculation Desk</h1>
        </div>
        <Link
          to="/admin/issue"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>Switch to Issue Desk</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active Loans Lookup Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search active loan by accession number, loan ID, or member"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Scan Accession No. (KSR-ACC-...), Loan No., or Member Name..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-4">Accession / Loan</th>
                  <th className="py-2.5 px-4">Member</th>
                  <th className="py-2.5 px-4">Due Date</th>
                  <th className="py-2.5 px-4 text-right">Accrued Fine</th>
                  <th className="py-2.5 px-4 text-right">Select</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Loading active loans...
                    </td>
                  </tr>
                ) : activeLoans.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No active unreturned loans match your search.
                    </td>
                  </tr>
                ) : (
                  activeLoans.map((l: any) => (
                    <tr
                      key={l.id}
                      className={`hover:bg-slate-50 ${selectedLoan?.id === l.id ? 'bg-blue-50/70' : ''}`}
                    >
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        <div className="font-bold text-blue-900">{l.accessionNumber}</div>
                        <div className="text-[11px] text-slate-500">{l.loanNumber} · {l.bookTitle.slice(0, 26)}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900">{l.memberName}</div>
                        <div className="font-mono text-[11px] text-slate-500 tabular-nums">{l.registrationNumber}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        <div>{l.dueDate}</div>
                        <SemanticStatus status={l.status} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {l.overdueDays > 0 ? (
                          <span className="font-bold text-red-700">
                            ₹{Number(l.accruedFine).toFixed(2)} ({l.overdueDays}d)
                          </span>
                        ) : (
                          <span className="text-emerald-700">₹0.00</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedLoan(l)}
                          className="px-3 py-1.5 text-xs font-semibold bg-[#0C1D36] text-white rounded hover:bg-blue-900"
                        >
                          Select Return
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Return Inspection & Fine Settlement Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="text-base font-bold text-slate-900">Return Verification & Fine Settlement</h2>
          {!selectedLoan ? (
            <div className="mt-8 py-12 text-center border border-dashed border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500">
                Select an active loan from the left table to inspect condition, calculate overdue fines, and complete the return.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Loan Number:</span>
                  <span className="font-mono font-bold text-slate-900">{selectedLoan.loanNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Physical Copy:</span>
                  <span className="font-mono font-bold text-blue-900">{selectedLoan.accessionNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Book Title:</span>
                  <span className="font-semibold text-slate-900 text-right">{selectedLoan.bookTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Borrower:</span>
                  <span className="font-medium text-slate-900">
                    {selectedLoan.memberName} ({selectedLoan.registrationNumber})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Due Date:</span>
                  <span className="font-mono tabular-nums">{selectedLoan.dueDate}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="font-semibold text-slate-700">Calculated Overdue Fine:</span>
                  <span className="font-mono font-bold text-red-700 tabular-nums">
                    ₹{Number(selectedLoan.accruedFine).toFixed(2)} ({selectedLoan.overdueDays} overdue days)
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Returned Physical Copy Condition *
                </label>
                <select
                  value={copyConditionStatus}
                  onChange={(e) => setCopyConditionStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="Available">Good Condition — Return to Available Shelf (or Waiting Queue)</option>
                  <option value="Damaged">Damaged — Send to Bindery / Flag Damaged</option>
                  <option value="UnderMaintenance">Under Maintenance — Minor Repair</option>
                  <option value="Lost">Reported Lost by Borrower</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Inspection Notes (Optional)
                </label>
                <input
                  type="text"
                  value={conditionNotes}
                  onChange={(e) => setConditionNotes(e.target.value)}
                  placeholder="Condition remarks upon return..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>

              {selectedLoan.accruedFine > 0 && (
                <div className="p-3.5 rounded-md bg-amber-50/70 border border-amber-200 space-y-3">
                  <label className="block text-xs font-bold text-amber-950">
                    Overdue Fine Resolution (₹{Number(selectedLoan.accruedFine).toFixed(2)}) *
                  </label>
                  <select
                    value={fineResolution}
                    onChange={(e) => setFineResolution(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-amber-300 rounded-md bg-white"
                  >
                    <option value="CollectFullPayment">Collect Full Payment Now & Issue Receipt</option>
                    <option value="LeavePending">Record Unpaid Fine Balance on Member Account</option>
                    <option value="AuthorizeWaiver">Authorize Official Fine Waiver (Requires Reason)</option>
                  </select>

                  {fineResolution === 'CollectFullPayment' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
                      >
                        <option value="Cash Counter">Cash Counter</option>
                        <option value="UPI / College Fee Counter">UPI / College Fee Counter</option>
                      </select>
                    </div>
                  )}

                  {fineResolution === 'AuthorizeWaiver' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mandatory Waiver Justification *
                      </label>
                      <input
                        type="text"
                        required
                        value={waiverReason}
                        onChange={(e) => setWaiverReason(e.target.value)}
                        placeholder="e.g., Medical certificate approved by HOD"
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
                      />
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={returnMut.isPending}
                onClick={() => returnMut.mutate(selectedLoan.id)}
                className="w-full py-2.5 bg-[#0C1D36] hover:bg-blue-900 text-white text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{returnMut.isPending ? 'Recording Return...' : 'Confirm Book Return'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const AdminLoansListPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: loansData, isLoading } = useQuery({
    queryKey: ['loans', statusFilter, search],
    queryFn: () => {
      const qs = new URLSearchParams({ status: statusFilter, search });
      return apiRequest(`/loans?${qs.toString()}`);
    },
  });

  const renewMut = useMutation({
    mutationFn: (loanId: number) => apiRequest(`/loans/${loanId}/renew`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: (res) => {
      showToast('success', 'Loan Renewed', res.message);
      queryClient.invalidateQueries({ queryKey: ['loans'] });
    },
    onError: (err: Error) => showToast('error', 'Renewal Restricted', err.message),
  });

  const items = loansData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Circulation Ledger</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Loans, Overdue Tracking & Renewals</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportToCsv('ksrce_loans_ledger.csv', items)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <Link
            to="/admin/issue"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Issue Book</span>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search loans"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search loan number, member name, reg ID, book title, or accession..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {['', 'Active', 'Overdue', 'Returned'].map((st) => (
            <button
              key={st || 'all'}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === st
                  ? 'bg-[#0C1D36] text-white font-semibold'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {st || 'All Loans'}
            </button>
          ))}
        </div>
      </div>

      {/* Loans Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Loan No.</th>
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-4">Book & Copy</th>
                <th className="py-3 px-4">Issued / Due</th>
                <th className="py-3 px-4 text-right">Renewals</th>
                <th className="py-3 px-4 text-right">Accrued Fine</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Loading loans...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No circulation records match your filter.
                  </td>
                </tr>
              ) : (
                items.map((l: any) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900 tabular-nums">{l.loanNumber}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{l.memberName}</div>
                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {l.registrationNumber} · {l.departmentCode}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{l.bookTitle}</div>
                      <div className="font-mono text-[11px] text-blue-900 tabular-nums">{l.accessionNumber}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      <div className="text-slate-600">Iss: {String(l.issuedAt).split('T')[0]}</div>
                      <div className="font-semibold text-slate-900">Due: {l.dueDate}</div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{l.renewalCount} / 2</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {l.overdueDays > 0 ? (
                        <span className="font-bold text-red-700">₹{Number(l.accruedFine).toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-500">₹0.00</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <SemanticStatus status={l.status} />
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                      {l.status !== 'Returned' && (
                        <>
                          <button
                            type="button"
                            onClick={() => renewMut.mutate(l.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 rounded"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Renew</span>
                          </button>
                          <Link
                            to="/admin/returns"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            <span>Return</span>
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const AdminReservationsPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [bookId, setBookId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [notes, setNotes] = useState('');

  const { data: resData, isLoading } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => apiRequest('/reservations'),
  });

  const { data: booksData } = useQuery({
    queryKey: ['books-all-select'],
    queryFn: () => apiRequest('/books?pageSize=100'),
  });

  const { data: membersData } = useQuery({
    queryKey: ['members-active-list'],
    queryFn: () => apiRequest('/members'),
  });

  const createResMut = useMutation({
    mutationFn: () =>
      apiRequest('/reservations', {
        method: 'POST',
        body: JSON.stringify({ bookId: Number(bookId), memberId: Number(memberId), notes }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Reservation Created', res.message);
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (err: Error) => showToast('error', 'Reservation Failed', err.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest(`/reservations/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Queue Updated', res.message);
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (err: Error) => showToast('error', 'Error', err.message),
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => apiRequest(`/reservations/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      showToast('info', 'Reservation Cancelled', 'Queue positions automatically recalculated.');
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });

  const items = resData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Waiting List & Hold Allocation</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Reservation & Waiting List Queue</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
        >
          <BookmarkPlus className="w-3.5 h-3.5" />
          <span>New Reservation</span>
        </button>
      </div>

      {showModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createResMut.mutate();
            }}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900">Place Title Reservation</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Book Title *</label>
              <select
                required
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
              >
                <option value="">Select Book...</option>
                {(booksData?.items || []).map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.bookCode} — {b.title} (Avail: {b.availableCopies})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Member *</label>
              <select
                required
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
              >
                <option value="">Select Member...</option>
                {(membersData?.items || []).map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.registrationNumber} — {m.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createResMut.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
              >
                Create Reservation
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Reservation No.</th>
                <th className="py-3 px-4">Book Title</th>
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-4 text-right">FIFO Queue Pos.</th>
                <th className="py-3 px-4">Created / Expires</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Staff Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading reservation queue...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No reservations in the queue.
                  </td>
                </tr>
              ) : (
                items.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900 tabular-nums">{r.reservationNumber}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{r.bookTitle}</div>
                      <div className="text-[11px] text-slate-500">{r.bookCode}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{r.memberName}</div>
                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">{r.registrationNumber}</div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-900 tabular-nums">
                      {r.computedQueuePosition > 0 ? `#${r.computedQueuePosition} in Queue` : '—'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums">
                      <div>Req: {String(r.createdAt).split('T')[0]}</div>
                      <div>Exp: {r.expiresAt ? String(r.expiresAt).split('T')[0] : '—'}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <SemanticStatus status={r.status} />
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {['Pending', 'Approved', 'ReadyForPickup'].includes(r.status) && (
                        <>
                          {r.status === 'Pending' && (
                            <button
                              type="button"
                              onClick={() => statusMut.mutate({ id: r.id, status: 'Approved' })}
                              className="px-2 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded"
                            >
                              Approve
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => cancelMut.mutate(r.id)}
                            className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
