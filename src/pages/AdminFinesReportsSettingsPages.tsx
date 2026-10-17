import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IndianRupee,
  Printer,
  Download,
  ShieldCheck,
  Search,
  UserPlus,
  Save,
} from 'lucide-react';
import { apiRequest, exportToCsv } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { KsrLogoBadge, ReceiptData, ReceiptModal, SemanticStatus } from '../components/AppLayout';

export const AdminFinesPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'assessments' | 'payments' | 'waivers'>('assessments');
  const [selectedFine, setSelectedFine] = useState<any | null>(null);
  const [modalMode, setModalMode] = useState<'payment' | 'waiver' | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash Counter');
  const [notesOrReason, setNotesOrReason] = useState('');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const { data: finesData, isLoading } = useQuery({
    queryKey: ['fines'],
    queryFn: () => apiRequest('/fines'),
  });

  const paymentMut = useMutation({
    mutationFn: () =>
      apiRequest(`/fines/${selectedFine.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amountInput),
          paymentMethod,
          notes: notesOrReason,
        }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Payment Recorded', res.message);
      setReceipt({
        receiptTitle: 'Official Fine Payment Receipt',
        referenceNumber: res.receiptNumber,
        timestamp: new Date().toISOString(),
        memberName: selectedFine.memberName,
        registrationNumber: selectedFine.registrationNumber,
        bookTitle: selectedFine.bookTitle,
        accessionNumber: selectedFine.accessionNumber,
        amountLabel: `Fine Paid (${paymentMethod})`,
        amountValue: `₹${Number(amountInput).toFixed(2)} (Remaining: ₹${Number(res.remainingBalance).toFixed(2)})`,
        notes: notesOrReason || 'Manual payment collected at Central Library Counter',
      });
      setModalMode(null);
      setSelectedFine(null);
      queryClient.invalidateQueries({ queryKey: ['fines'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err: Error) => showToast('error', 'Payment Error', err.message),
  });

  const waiverMut = useMutation({
    mutationFn: () =>
      apiRequest(`/fines/${selectedFine.id}/waivers`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amountInput),
          reason: notesOrReason,
        }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Fine Waiver Authorized', res.message);
      setModalMode(null);
      setSelectedFine(null);
      queryClient.invalidateQueries({ queryKey: ['fines'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err: Error) => showToast('error', 'Waiver Error', err.message),
  });

  const assessments = finesData?.assessments || [];
  const payments = finesData?.payments || [];
  const waivers = finesData?.waivers || [];

  return (
    <div className="space-y-6">
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Financial & Overdue Ledger</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Fine Assessments, Payments & Waivers</h1>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-md">
          {(
            [
              { id: 'assessments', label: `Assessments (${assessments.length})` },
              { id: 'payments', label: `Payment Receipts (${payments.length})` },
              { id: 'waivers', label: `Waivers (${waivers.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                tab === t.id ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Payment / Waiver Modal */}
      {modalMode && selectedFine && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (modalMode === 'payment') paymentMut.mutate();
              else waiverMut.mutate();
            }}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900">
              {modalMode === 'payment' ? 'Record Manual Fine Payment' : 'Authorize Official Fine Waiver'}
            </h2>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Member:</span>
                <span className="font-semibold text-slate-900">
                  {selectedFine.memberName} ({selectedFine.registrationNumber})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Loan / Book:</span>
                <span className="font-mono text-slate-800">{selectedFine.loanNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Remaining Unpaid Balance:</span>
                <span className="font-mono font-bold text-red-700 tabular-nums">
                  ₹{Number(selectedFine.remainingBalance).toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {modalMode === 'payment' ? 'Payment Amount (₹) *' : 'Waiver Amount (₹) *'}
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max={Number(selectedFine.remainingBalance)}
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md tabular-nums"
              />
            </div>

            {modalMode === 'payment' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Collection Mode</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="Cash Counter">Cash Counter</option>
                  <option value="UPI / College Fee Counter">UPI / College Fee Counter</option>
                  <option value="Demand Draft / Challan">Demand Draft / Challan</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {modalMode === 'payment' ? 'Receipt Remarks (Optional)' : 'Mandatory Waiver Justification *'}
              </label>
              <input
                type="text"
                required={modalMode === 'waiver'}
                value={notesOrReason}
                onChange={(e) => setNotesOrReason(e.target.value)}
                placeholder={
                  modalMode === 'payment'
                    ? 'Paid at Central Library Desk'
                    : 'e.g., Approved by Principal / Medical Leave'
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalMode(null);
                  setSelectedFine(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={paymentMut.isPending || waiverMut.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
              >
                {modalMode === 'payment' ? 'Record Payment & Print Receipt' : 'Confirm Authorized Waiver'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'assessments' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-3">Loan No.</th>
                  <th className="py-3 px-3">Member</th>
                  <th className="py-3 px-3">Book & Copy</th>
                  <th className="py-3 px-3 text-right">Overdue</th>
                  <th className="py-3 px-3 text-right">Assessed</th>
                  <th className="py-3 px-3 text-right">Paid / Waived</th>
                  <th className="py-3 px-3 text-right">Remaining</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Loading fine assessments...
                    </td>
                  </tr>
                ) : (
                  assessments.map((fa: any) => (
                    <tr key={fa.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">{fa.loanNumber}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{fa.memberName}</div>
                        <div className="font-mono text-[11px] text-slate-500 tabular-nums">{fa.registrationNumber}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{fa.bookTitle}</div>
                        <div className="font-mono text-[11px] text-blue-900 tabular-nums">{fa.accessionNumber}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">{fa.overdueDays}d</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                        ₹{Number(fa.assessedAmount).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        ₹{Number(fa.paidAmount).toFixed(2)} / ₹{Number(fa.waivedAmount).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-red-700 tabular-nums whitespace-nowrap">
                        ₹{Number(fa.remainingBalance).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <SemanticStatus status={fa.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                        {Number(fa.remainingBalance) > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFine(fa);
                                setAmountInput(String(fa.remainingBalance));
                                setNotesOrReason('');
                                setModalMode('payment');
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded"
                            >
                              Collect
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFine(fa);
                                setAmountInput(String(fa.remainingBalance));
                                setNotesOrReason('');
                                setModalMode('waiver');
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded"
                            >
                              Waive
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
      )}

      {tab === 'payments' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Receipt No.</th>
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-4">Loan / Book</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4 text-right">Amount Paid</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {payments.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono font-bold text-blue-900 tabular-nums">{p.receiptNumber}</td>
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-slate-900">{p.memberName}</div>
                    <div className="font-mono text-[11px] text-slate-500 tabular-nums">{p.registrationNumber}</div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900">{p.bookTitle}</div>
                    <div className="font-mono text-[11px] text-slate-500">{p.loanNumber}</div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-700">{p.paymentMethod}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                    ₹{Number(p.amount).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{p.recordedByName}</td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setReceipt({
                          receiptTitle: 'Official Fine Payment Receipt',
                          referenceNumber: p.receiptNumber,
                          timestamp: p.paidAt,
                          memberName: p.memberName,
                          registrationNumber: p.registrationNumber,
                          bookTitle: p.bookTitle,
                          amountLabel: `Fine Paid (${p.paymentMethod})`,
                          amountValue: `₹${Number(p.amount).toFixed(2)}`,
                          notes: p.notes,
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 rounded"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'waivers' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-4">Loan / Book</th>
                <th className="py-3 px-4 text-right">Waived Amount</th>
                <th className="py-3 px-4">Justification Reason</th>
                <th className="py-3 px-4">Authorized By</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {waivers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No fine waivers recorded yet.
                  </td>
                </tr>
              ) : (
                waivers.map((w: any) => (
                  <tr key={w.id}>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {w.memberName} ({w.registrationNumber})
                    </td>
                    <td className="py-2.5 px-4">{w.bookTitle}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-800 tabular-nums">
                      ₹{Number(w.amount).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{w.reason}</td>
                    <td className="py-2.5 px-4 text-slate-600">{w.authorizedByName}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-500 tabular-nums">
                      {String(w.waivedAt).split('T')[0]}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const AdminReportsPage: React.FC = () => {
  const [reportType, setReportType] = useState<
    'inventory' | 'circulation' | 'overdue' | 'fines' | 'member-borrowing' | 'damaged-lost'
  >('inventory');

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['reports', reportType],
    queryFn: () => apiRequest(`/reports/${reportType}`),
  });

  const rows: Array<Record<string, any>> = reportData?.rows || [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 no-print">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Institutional Reporting Suite</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Library Reports & Export Center</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportToCsv(`ksrce_report_${reportType}.csv`, rows)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="flex flex-wrap gap-1.5 no-print">
        {(
          [
            { id: 'inventory', label: 'Complete Physical Inventory' },
            { id: 'circulation', label: 'Monthly Circulation Register' },
            { id: 'overdue', label: 'Overdue Loans Report' },
            { id: 'fines', label: 'Fine Collection & Balances' },
            { id: 'member-borrowing', label: 'Member Borrowing Summary' },
            { id: 'damaged-lost', label: 'Damaged & Lost Copies' },
          ] as const
        ).map((rt) => (
          <button
            key={rt.id}
            type="button"
            onClick={() => setReportType(rt.id)}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors ${
              reportType === rt.id
                ? 'bg-[#0C1D36] text-white font-semibold'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {rt.label}
          </button>
        ))}
      </div>

      {/* Printable Report Sheet */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden p-6">
        <div className="border-b border-slate-200 pb-4 mb-4 flex items-center justify-between">
          <KsrLogoBadge lightText={false} />
          <div className="text-right">
            <h2 className="text-sm font-bold uppercase text-slate-900">
              Official Library Report: {reportType.replace('-', ' ')}
            </h2>
            <p className="text-xs font-mono text-slate-500 tabular-nums">
              Generated: {new Date().toLocaleString()} · Total Records: {rows.length}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {columns.map((col) => (
                  <th key={col} className="py-2.5 px-3">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={Math.max(1, columns.length)} className="py-8 text-center text-slate-500">
                    Generating institutional report...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, columns.length)} className="py-8 text-center text-slate-500">
                    No records found for this report.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {columns.map((col) => (
                      <td key={col} className="py-2 px-3 font-mono text-[11px] text-slate-800 tabular-nums">
                        {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
                      </td>
                    ))}
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

export const AdminAuditLogsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');

  const { data: logsData, isLoading } = useQuery({
    queryKey: ['audit-logs', search, entityType],
    queryFn: () => {
      const qs = new URLSearchParams({ search, entityType });
      return apiRequest(`/audit-logs?${qs.toString()}`);
    },
  });

  const items = logsData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Security & Compliance</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Administrative & Circulation Audit Trail</h1>
        </div>
        <button
          type="button"
          onClick={() => exportToCsv('ksrce_audit_logs.csv', items)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Audit Trail</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search audit logs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor name, action, entity ID, or change details..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md"
          />
        </div>
        <select
          aria-label="Filter by Entity Type"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
        >
          <option value="">All Entity Types</option>
          <option value="Loan">Loan</option>
          <option value="Book">Book</option>
          <option value="PhysicalBookCopy">PhysicalBookCopy</option>
          <option value="Member">Member</option>
          <option value="FinePayment">FinePayment</option>
          <option value="FineWaiver">FineWaiver</option>
          <option value="LibraryPolicy">LibraryPolicy</option>
          <option value="User">User</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Timestamp (UTC)</th>
                <th className="py-3 px-4">Actor & Role</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Loading audit logs...
                  </td>
                </tr>
              ) : (
                items.map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{log.actorName}</div>
                      <div className="text-[11px] text-slate-500">{log.actorRole}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-blue-900">{log.action}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">
                      {log.entityType} {log.entityId ? `(${log.entityId})` : ''}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{log.details}</td>
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

export const AdminSettingsPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const { data: policyData } = useQuery({
    queryKey: ['policy'],
    queryFn: () => apiRequest('/settings/policy'),
  });

  const { data: staffData } = useQuery({
    queryKey: ['staff-users'],
    queryFn: () => apiRequest('/settings/staff'),
  });

  const [form, setForm] = useState({
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
  });

  useEffect(() => {
    if (policyData?.policy) {
      setForm(policyData.policy);
    }
  }, [policyData]);

  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<'Librarian' | 'SuperAdmin'>('Librarian');
  const [staffPassword, setStaffPassword] = useState('');

  const savePolicyMut = useMutation({
    mutationFn: () =>
      apiRequest('/settings/policy', {
        method: 'PUT',
        body: JSON.stringify(form),
      }),
    onSuccess: (res) => {
      showToast('success', 'Policy Saved', res.message);
      queryClient.invalidateQueries({ queryKey: ['policy'] });
    },
    onError: (err: Error) => showToast('error', 'Failed', err.message),
  });

  const addStaffMut = useMutation({
    mutationFn: () =>
      apiRequest('/settings/staff', {
        method: 'POST',
        body: JSON.stringify({
          fullName: staffName,
          email: staffEmail,
          role: staffRole,
          password: staffPassword,
        }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Staff Account Created', res.message);
      setStaffName('');
      setStaffEmail('');
      setStaffPassword('');
      queryClient.invalidateQueries({ queryKey: ['staff-users'] });
    },
    onError: (err: Error) => showToast('error', 'Error', err.message),
  });

  const toggleStaffStatusMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest(`/settings/staff/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      showToast('success', 'Status Updated', 'Staff account status updated.');
      queryClient.invalidateQueries({ queryKey: ['staff-users'] });
    },
    onError: (err: Error) => showToast('error', 'Error', err.message),
  });

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Super Administrator Configuration</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
          Institutional Circulation Policies & Staff Provisioning
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Circulation & Fine Rules */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            savePolicyMut.mutate();
          }}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Borrowing & Fine Calculation Policy</h2>
              <p className="text-xs text-slate-500">
                Changes take effect immediately across Issue, Return, Renewal, and Fine modules.
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-blue-900" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Student Loan Period (Days)</label>
              <input
                type="number"
                value={form.studentLoanDays}
                onChange={(e) => setForm({ ...form, studentLoanDays: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Faculty Loan Period (Days)</label>
              <input
                type="number"
                value={form.facultyLoanDays}
                onChange={(e) => setForm({ ...form, facultyLoanDays: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Student Borrowing Limit (Books)</label>
              <input
                type="number"
                value={form.studentLoanLimit}
                onChange={(e) => setForm({ ...form, studentLoanLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Faculty Borrowing Limit (Books)</label>
              <input
                type="number"
                value={form.facultyLoanLimit}
                onChange={(e) => setForm({ ...form, facultyLoanLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Overdue Fine Rate (₹ per Day)</label>
              <input
                type="number"
                step="0.5"
                value={form.finePerDay}
                onChange={(e) => setForm({ ...form, finePerDay: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Maximum Renewals per Loan</label>
              <input
                type="number"
                value={form.maxRenewals}
                onChange={(e) => setForm({ ...form, maxRenewals: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Renewal Extension Duration (Days)</label>
              <input
                type="number"
                value={form.renewalExtensionDays}
                onChange={(e) => setForm({ ...form, renewalExtensionDays: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Unpaid Fine Threshold (₹)</label>
              <input
                type="number"
                value={form.maxUnpaidFineLimit}
                onChange={(e) => setForm({ ...form, maxUnpaidFineLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.blockIssueOnOverdue}
                onChange={(e) => setForm({ ...form, blockIssueOnOverdue: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span>Block new book issues if member holds any unreturned overdue book</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowOverdueRenewal}
                onChange={(e) => setForm({ ...form, allowOverdueRenewal: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span>Allow self-service renewal of already overdue books</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.excludeSundaysInFine}
                onChange={(e) => setForm({ ...form, excludeSundaysInFine: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span>Exclude Sundays when calculating overdue chargeable days</span>
            </label>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={savePolicyMut.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0C1D36] hover:bg-blue-900 text-white text-xs font-semibold rounded-md"
            >
              <Save className="w-4 h-4" />
              <span>Save Institutional Policy</span>
            </button>
          </div>
        </form>

        {/* Right: Staff Account Provisioning */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addStaffMut.mutate();
            }}
            className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-900" />
              <h2 className="text-base font-bold text-slate-900">Provision Librarian / Admin Account</h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name & Designation *</label>
              <input
                type="text"
                required
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="e.g., K.loganathan (Librarian)"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Institutional Email *</label>
              <input
                type="email"
                required
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="staff.library@ksrce.ac.in"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role *</label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="Librarian">Librarian</option>
                  <option value="SuperAdmin">SuperAdmin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Password *</label>
                <input
                  type="password"
                  required
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  placeholder="Min 8 chars"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={addStaffMut.isPending}
              className="w-full py-2 bg-[#0C1D36] hover:bg-blue-900 text-white text-xs font-semibold rounded-md"
            >
              Provision Staff Account
            </button>
          </form>

          {/* Existing Staff List */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Authorized Library Staff</h3>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {(staffData?.items || []).map((st: any) => (
                <div key={st.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{st.fullName}</p>
                    <p className="text-[11px] text-slate-500">
                      {st.role} · {st.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleStaffStatusMut.mutate({ id: st.id, isActive: !st.isActive })}
                    className={`px-2.5 py-1 rounded text-xs font-medium ${
                      st.isActive
                        ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-red-50 text-red-800 hover:bg-red-100'
                    }`}
                  >
                    {st.isActive ? 'Active' : 'Deactivated'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
