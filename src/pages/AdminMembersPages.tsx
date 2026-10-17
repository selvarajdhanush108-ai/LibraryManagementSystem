import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  UserPlus,
  Upload,
  Download,
  ArrowLeft,
  Edit3,
} from 'lucide-react';
import { apiRequest, exportToCsv } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SemanticStatus } from '../components/AppLayout';

export const AdminMembersListPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [memberType, setMemberType] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [accountStatus, setAccountStatus] = useState('');

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);

  // Register Form state
  const [regNo, setRegNo] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [newType, setNewType] = useState<'Student' | 'Faculty'>('Student');
  const [newDeptId, setNewDeptId] = useState('');
  const [newYear, setNewYear] = useState('3');

  // CSV Import state
  const [csvText, setCsvText] = useState(
    `registrationNumber,fullName,email,memberType,departmentCode,yearOfStudy,phone\n73152313099,Karthik Raja M.,student.cs99@ksrce.ac.in,Student,CSE,3,+91 94432 88990\nKSRCE-FAC-MECH-22,Dr. S. Venkatesan,faculty.mech22@ksrce.ac.in,Faculty,MECH,,+91 98427 44556`
  );
  const [csvReport, setCsvReport] = useState<any[] | null>(null);

  const { data: deptData } = useQuery({ queryKey: ['departments'], queryFn: () => apiRequest('/departments') });
  const { data: membersData, isLoading } = useQuery({
    queryKey: ['members', search, memberType, departmentId, accountStatus],
    queryFn: () => {
      const qs = new URLSearchParams({ search, memberType, departmentId, accountStatus });
      return apiRequest(`/members?${qs.toString()}`);
    },
  });

  const registerMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest('/members', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (res) => {
      showToast('success', 'Member Registered', `${res.memberCode} created.`);
      setShowRegisterModal(false);
      setRegNo('');
      setFullName('');
      setEmail('');
      setPhone('');
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (err: Error) => showToast('error', 'Registration Failed', err.message),
  });

  const csvImportMut = useMutation({
    mutationFn: () =>
      apiRequest('/members/import-csv', {
        method: 'POST',
        body: JSON.stringify({ csvText }),
      }),
    onSuccess: (res) => {
      setCsvReport(res.report || []);
      showToast('success', 'CSV Processed', `Imported ${res.importedCount} of ${res.totalProcessed} records.`);
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (err: Error) => showToast('error', 'Import Error', err.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest(`/members/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ accountStatus: status }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Account Updated', res.message);
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (err: Error) => showToast('error', 'Error', err.message),
  });

  const items = membersData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Academic Patron Directory</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Student & Faculty Member Management</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportToCsv('ksrce_library_members.csv', items)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCsvReport(null);
              setShowCsvModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-md"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Bulk CSV Import</span>
          </button>
          <button
            type="button"
            onClick={() => setShowRegisterModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register Member</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search members"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Anna Univ Reg No. (7315...), Staff ID, Name, or Email..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md"
          />
        </div>
        <div className="sm:col-span-2">
          <select
            aria-label="Filter by Member Type"
            value={memberType}
            onChange={(e) => setMemberType(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="">All Patron Types</option>
            <option value="Student">Students</option>
            <option value="Faculty">Faculty Members</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <select
            aria-label="Filter by Department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="">All Departments</option>
            {(deptData?.departments || []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <select
            aria-label="Filter by Account Status"
            value={accountStatus}
            onChange={(e) => setAccountStatus(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Register Member Modal */}
      {showRegisterModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              registerMut.mutate({
                registrationNumber: regNo,
                fullName,
                email,
                phone,
                memberType: newType,
                departmentId: Number(newDeptId),
                yearOfStudy: newType === 'Student' ? Number(newYear) : null,
              });
            }}
            className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900">Register New Library Member</h2>
            <p className="text-xs text-slate-500">
              Synthetic demonstration records are used by default. Creates both a Member record and Portal Sign-In credentials.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Member Type *</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as 'Student' | 'Faculty')}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="Student">Student (14d / 3 books)</option>
                  <option value="Faculty">Faculty Member (28d / 5 books)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {newType === 'Student' ? 'Registration Number *' : 'Faculty Employee ID *'}
                </label>
                <input
                  type="text"
                  required
                  value={regNo}
                  onChange={(e) => setRegNo(e.target.value)}
                  placeholder={newType === 'Student' ? '73152313055' : 'KSRCE-FAC-CSE-19'}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g., Gowtham S."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Institutional Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@ksrce.ac.in"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 94432 00000"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Department *</label>
                <select
                  required
                  value={newDeptId}
                  onChange={(e) => setNewDeptId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="">Select Department...</option>
                  {(deptData?.departments || []).map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {newType === 'Student' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Year of Study</label>
                  <select
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                  >
                    <option value="1">I Year</option>
                    <option value="2">II Year</option>
                    <option value="3">III Year</option>
                    <option value="4">IV Year</option>
                  </select>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={registerMut.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
              >
                {registerMut.isPending ? 'Registering...' : 'Register Member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSV Bulk Import Modal with Validation Report */}
      {showCsvModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900">Bulk CSV Member Import & Validation</h2>
            <p className="text-xs text-slate-600">
              Format: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">registrationNumber,fullName,email,memberType,departmentCode,yearOfStudy,phone</code>
            </p>

            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full p-3 text-xs font-mono border border-slate-300 rounded-md"
            />

            {csvReport && (
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 border-b border-slate-200">
                  Validation & Import Report ({csvReport.length} rows)
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-500">
                      <th className="py-1.5 px-3">Row</th>
                      <th className="py-1.5 px-3">Reg. No.</th>
                      <th className="py-1.5 px-3">Status</th>
                      <th className="py-1.5 px-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {csvReport.map((r, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 px-3 font-mono tabular-nums">{r.row}</td>
                        <td className="py-1.5 px-3 font-mono">{r.registrationNumber}</td>
                        <td className="py-1.5 px-3">
                          <SemanticStatus status={r.status} />
                        </td>
                        <td className="py-1.5 px-3 text-slate-600">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md"
              >
                Close
              </button>
              <button
                type="button"
                disabled={csvImportMut.isPending}
                onClick={() => csvImportMut.mutate()}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
              >
                {csvImportMut.isPending ? 'Validating & Importing...' : 'Run Import & Validate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Member Code / Reg ID</th>
                <th className="py-3 px-4">Name & Contact</th>
                <th className="py-3 px-4">Type & Department</th>
                <th className="py-3 px-4 text-right">Active Loans</th>
                <th className="py-3 px-4 text-right">Unpaid Fines</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading member directory...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No members match your search criteria.
                  </td>
                </tr>
              ) : (
                items.map((m: any) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      <div className="font-bold text-blue-900">{m.registrationNumber}</div>
                      <div className="text-[11px] text-slate-500">{m.memberCode}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <Link to={`/admin/members/${m.id}`} className="font-semibold text-slate-900 hover:text-blue-800 block">
                        {m.fullName}
                      </Link>
                      <div className="text-[11px] text-slate-500">{m.email}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-800">
                        {m.memberType} · {m.departmentCode}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {m.yearOfStudy ? `Year ${m.yearOfStudy}` : 'Faculty Staff'}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">
                      {m.activeLoanCount}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      <span className={Number(m.outstandingFineBalance) > 0 ? 'font-bold text-red-700' : 'text-slate-600'}>
                        ₹{Number(m.outstandingFineBalance).toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <SemanticStatus status={m.accountStatus} />
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <Link
                        to={`/admin/members/${m.id}`}
                        className="px-2.5 py-1 text-xs font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 rounded"
                      >
                        Profile
                      </Link>
                      <select
                        aria-label={`Account status for ${m.fullName}`}
                        value={m.accountStatus}
                        onChange={(e) => statusMut.mutate({ id: m.id, status: e.target.value })}
                        className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                      >
                        <option value="Active">Active</option>
                        <option value="Suspended">Suspended</option>
                        <option value="Inactive">Inactive</option>
                      </select>
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

export const AdminMemberDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const { data: member, isLoading } = useQuery({
    queryKey: ['member-detail', id],
    queryFn: () => apiRequest(`/members/${id}`),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      apiRequest(`/members/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ fullName: editName, phone: editPhone }),
      }),
    onSuccess: () => {
      showToast('success', 'Profile Saved', 'Member record updated.');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['member-detail', id] });
    },
    onError: (err: Error) => showToast('error', 'Error', err.message),
  });

  if (isLoading || !member) {
    return <div className="p-6 text-sm text-slate-500">Loading member record...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <Link to="/admin/members" className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Member Directory</span>
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-bold text-slate-900">{member.fullName}</h1>
            <SemanticStatus status={member.accountStatus} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            {member.registrationNumber} · {member.memberCode} · {member.memberType} ({member.departmentName})
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditName(member.fullName);
            setEditPhone(member.phone || '');
            setEditing((e) => !e);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>{editing ? 'Cancel' : 'Edit Member'}</span>
        </button>
      </div>

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMut.mutate();
          }}
          className="bg-white border border-blue-200 rounded-lg p-4 flex flex-wrap gap-4 items-end"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-[#0C1D36] text-white text-xs font-semibold rounded-md"
          >
            Save Changes
          </button>
        </form>
      )}

      {/* Member Loans & History */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Borrowing & Circulation History ({member.loans?.length || 0})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Loan No.</th>
                <th className="py-2.5 px-4">Book Title</th>
                <th className="py-2.5 px-4">Accession No.</th>
                <th className="py-2.5 px-4">Issued</th>
                <th className="py-2.5 px-4">Due Date</th>
                <th className="py-2.5 px-4">Returned</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {(member.loans || []).map((l: any) => (
                <tr key={l.id}>
                  <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 tabular-nums">{l.loanNumber}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{l.bookTitle}</td>
                  <td className="py-2.5 px-4 font-mono text-blue-900 tabular-nums">{l.accessionNumber}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums">{String(l.issuedAt).split('T')[0]}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-800 tabular-nums">{l.dueDate}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums">
                    {l.returnedAt ? String(l.returnedAt).split('T')[0] : '—'}
                  </td>
                  <td className="py-2.5 px-4">
                    <SemanticStatus status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member Fine Assessments */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Fine Assessments ({member.fines?.length || 0})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Loan No.</th>
                <th className="py-2.5 px-4">Book Title</th>
                <th className="py-2.5 px-4 text-right">Overdue Days</th>
                <th className="py-2.5 px-4 text-right">Assessed</th>
                <th className="py-2.5 px-4 text-right">Paid / Waived</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {(member.fines || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    No overdue fine assessments for this member.
                  </td>
                </tr>
              ) : (
                (member.fines || []).map((f: any) => (
                  <tr key={f.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{f.loanNumber}</td>
                    <td className="py-2.5 px-4 font-medium">{f.bookTitle}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{f.overdueDays}d</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">₹{Number(f.assessedAmount).toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      ₹{Number(f.paidAmount).toFixed(2)} / ₹{Number(f.waivedAmount).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4">
                      <SemanticStatus status={f.status} />
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
