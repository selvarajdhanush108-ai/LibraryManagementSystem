import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Archive, Download } from 'lucide-react';
import { apiRequest, exportToCsv } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SemanticStatus } from '../components/AppLayout';

export const AdminInventoryPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNewCopyModal, setShowNewCopyModal] = useState(false);

  const [bookId, setBookId] = useState('');
  const [accessionNumber, setAccessionNumber] = useState('');
  const [shelfLocation, setShelfLocation] = useState('Rack A-01 / Shelf 1');
  const [acquisitionPrice, setAcquisitionPrice] = useState('750');
  const [conditionNotes, setConditionNotes] = useState('Good condition');

  const { data: copiesData, isLoading } = useQuery({
    queryKey: ['copies', search, statusFilter],
    queryFn: () => {
      const qs = new URLSearchParams({ search, status: statusFilter });
      return apiRequest(`/copies?${qs.toString()}`);
    },
  });

  const { data: booksData } = useQuery({
    queryKey: ['books-all-select'],
    queryFn: () => apiRequest('/books?pageSize=100'),
  });

  const addCopyMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest('/copies', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (res) => {
      showToast('success', 'Copy Accessioned', res.message);
      setShowNewCopyModal(false);
      setAccessionNumber('');
      queryClient.invalidateQueries({ queryKey: ['copies'] });
    },
    onError: (err: Error) => showToast('error', 'Failed to Add Copy', err.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes?: string }) =>
      apiRequest(`/copies/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, conditionNotes: notes }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Inventory Updated', res.message);
      queryClient.invalidateQueries({ queryKey: ['copies'] });
    },
    onError: (err: Error) => showToast('error', 'Transition Blocked', err.message),
  });

  const items = copiesData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Accession & Barcode Ledger</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Physical Book Inventory</h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportToCsv('ksrce_physical_inventory.csv', items)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNewCopyModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Physical Copy</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search physical copies"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accession number (KSR-ACC-...), barcode, book title, or shelf..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {['', 'Available', 'Issued', 'Reserved', 'Damaged', 'UnderMaintenance', 'Lost'].map((st) => (
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
              {st || 'All Copies'}
            </button>
          ))}
        </div>
      </div>

      {/* New Physical Copy Modal */}
      {showNewCopyModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addCopyMut.mutate({
                bookId: Number(bookId),
                accessionNumber,
                shelfLocation,
                acquisitionPrice: Number(acquisitionPrice),
                conditionNotes,
              });
            }}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900">Register New Physical Copy</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Catalog Title *</label>
              <select
                required
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
              >
                <option value="">Select Book Title...</option>
                {(booksData?.items || []).map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.bookCode} — {b.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unique Accession Number *</label>
              <input
                type="text"
                required
                value={accessionNumber}
                onChange={(e) => setAccessionNumber(e.target.value)}
                placeholder="e.g., KSR-ACC-1030"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Shelf Location *</label>
                <input
                  type="text"
                  required
                  value={shelfLocation}
                  onChange={(e) => setShelfLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Price (₹)</label>
                <input
                  type="number"
                  value={acquisitionPrice}
                  onChange={(e) => setAcquisitionPrice(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Condition Notes</label>
              <input
                type="text"
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewCopyModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addCopyMut.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
              >
                Save Copy
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inventory Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Accession / Barcode</th>
                <th className="py-3 px-4">Book Title</th>
                <th className="py-3 px-4">Rack Location</th>
                <th className="py-3 px-4 text-right">Price</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Circulation / Condition Note</th>
                <th className="py-3 px-4 text-right">Inventory Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading physical inventory...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No physical copies match your filter criteria.
                  </td>
                </tr>
              ) : (
                items.map((cp: any) => (
                  <tr key={cp.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      <div className="font-bold text-blue-900">{cp.accessionNumber}</div>
                      <div className="text-[11px] text-slate-500">{cp.barcode}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <Link to={`/admin/books/${cp.bookId}`} className="font-semibold text-slate-900 hover:text-blue-800 block">
                        {cp.bookTitle}
                      </Link>
                      <div className="text-[11px] text-slate-500">{cp.bookCode} · {cp.categoryName}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">{cp.shelfLocation}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">₹{Number(cp.acquisitionPrice).toFixed(0)}</td>
                    <td className="py-2.5 px-4">
                      <SemanticStatus status={cp.status} />
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {cp.activeLoanNumber
                        ? `Loan ${cp.activeLoanNumber} · ${cp.activeBorrowerName} (Due ${cp.activeDueDate})`
                        : cp.conditionNotes || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {cp.status !== 'Issued' ? (
                        <select
                          aria-label={`Set status for ${cp.accessionNumber}`}
                          value={cp.status}
                          onChange={(e) =>
                            statusMut.mutate({
                              id: cp.id,
                              status: e.target.value,
                              notes: `Marked ${e.target.value} via Inventory Console`,
                            })
                          }
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                        >
                          <option value="Available">Available</option>
                          <option value="Reserved">Reserved</option>
                          <option value="Damaged">Damaged</option>
                          <option value="UnderMaintenance">UnderMaintenance</option>
                          <option value="Lost">Lost</option>
                        </select>
                      ) : (
                        <Link to="/admin/returns" className="text-xs font-semibold text-blue-800 hover:underline">
                          Process Return →
                        </Link>
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

export const AdminCatalogMetadataPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const activeTab: 'categories' | 'authors' | 'publishers' | 'departments' = location.pathname.includes('authors')
    ? 'authors'
    : location.pathname.includes('publishers')
    ? 'publishers'
    : 'categories';

  const [tab, setTab] = useState<'categories' | 'authors' | 'publishers' | 'departments'>(activeTab);

  // Form states
  const [catCode, setCatCode] = useState('');
  const [catName, setCatName] = useState('');
  const [catDewey, setCatDewey] = useState('');
  const [catDesc, setCatDesc] = useState('');

  const [authName, setAuthName] = useState('');
  const [authBio, setAuthBio] = useState('');
  const [authCountry, setAuthCountry] = useState('India');

  const [pubName, setPubName] = useState('');
  const [pubCity, setPubCity] = useState('');
  const [pubEmail, setPubEmail] = useState('');

  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptHod, setDeptHod] = useState('');

  const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: () => apiRequest('/categories') });
  const { data: authData } = useQuery({ queryKey: ['authors'], queryFn: () => apiRequest('/authors') });
  const { data: pubData } = useQuery({ queryKey: ['publishers'], queryFn: () => apiRequest('/publishers') });
  const { data: deptData } = useQuery({ queryKey: ['departments'], queryFn: () => apiRequest('/departments') });

  const createCatMut = useMutation({
    mutationFn: () =>
      apiRequest('/categories', {
        method: 'POST',
        body: JSON.stringify({ code: catCode, name: catName, deweyPrefix: catDewey, description: catDesc }),
      }),
    onSuccess: () => {
      showToast('success', 'Category Added', `${catName} added.`);
      setCatCode('');
      setCatName('');
      setCatDewey('');
      setCatDesc('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: Error) => showToast('error', 'Failed', err.message),
  });

  const createAuthMut = useMutation({
    mutationFn: () =>
      apiRequest('/authors', {
        method: 'POST',
        body: JSON.stringify({ fullName: authName, biography: authBio, country: authCountry }),
      }),
    onSuccess: () => {
      showToast('success', 'Author Added', `${authName} added.`);
      setAuthName('');
      setAuthBio('');
      queryClient.invalidateQueries({ queryKey: ['authors'] });
    },
    onError: (err: Error) => showToast('error', 'Failed', err.message),
  });

  const createPubMut = useMutation({
    mutationFn: () =>
      apiRequest('/publishers', {
        method: 'POST',
        body: JSON.stringify({ name: pubName, city: pubCity, contactEmail: pubEmail }),
      }),
    onSuccess: () => {
      showToast('success', 'Publisher Added', `${pubName} added.`);
      setPubName('');
      setPubCity('');
      setPubEmail('');
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
    },
    onError: (err: Error) => showToast('error', 'Failed', err.message),
  });

  const createDeptMut = useMutation({
    mutationFn: () =>
      apiRequest('/departments', {
        method: 'POST',
        body: JSON.stringify({ code: deptCode, name: deptName, headOfDepartment: deptHod }),
      }),
    onSuccess: () => {
      showToast('success', 'Department Added', `${deptName} added.`);
      setDeptCode('');
      setDeptName('');
      setDeptHod('');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err: Error) => showToast('error', 'Failed', err.message),
  });

  const archiveItem = async (endpoint: string, id: number, keyToInvalidate: string) => {
    try {
      await apiRequest(`/${endpoint}/${id}`, { method: 'DELETE' });
      showToast('success', 'Archived', 'Record safely archived.');
      queryClient.invalidateQueries({ queryKey: [keyToInvalidate] });
    } catch (err) {
      showToast('error', 'Error', (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Taxonomy & Academic Master Data</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Categories, Authors, Publishers & Departments
          </h1>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-md">
          {(
            [
              { id: 'categories', label: 'Categories', path: '/admin/categories' },
              { id: 'authors', label: 'Authors', path: '/admin/authors' },
              { id: 'publishers', label: 'Publishers', path: '/admin/publishers' },
              { id: 'departments', label: 'Departments', path: '/admin/categories' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                if (t.id !== 'departments') navigate(t.path);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                tab === t.id ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createCatMut.mutate();
            }}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4 h-fit"
          >
            <h2 className="text-base font-bold text-slate-900">Add Subject Category</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category Code *</label>
              <input
                type="text"
                required
                value={catCode}
                onChange={(e) => setCatCode(e.target.value)}
                placeholder="e.g., CAT-AI"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category Name *</label>
              <input
                type="text"
                required
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g., Machine Learning & Robotics"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Dewey Decimal Range</label>
              <input
                type="text"
                value={catDewey}
                onChange={(e) => setCatDewey(e.target.value)}
                placeholder="e.g., 006.3"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={createCatMut.isPending}
              className="w-full py-2 bg-[#0C1D36] text-white text-xs font-semibold rounded-md hover:bg-blue-900"
            >
              Create Category
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Code / DDC</th>
                  <th className="py-3 px-4">Category Name & Scope</th>
                  <th className="py-3 px-4 text-right">Titles / Copies</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {(catData?.items || []).map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      <div className="font-bold text-blue-900">{c.code}</div>
                      <div className="text-[11px] text-slate-500">DDC {c.deweyPrefix || '—'}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{c.name}</div>
                      <div className="text-[11px] text-slate-500">{c.description}</div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {c.bookCount} titles · {c.copyCount} copies
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        aria-label={`Archive category ${c.name}`}
                        onClick={() => archiveItem('categories', c.id, 'categories')}
                        className="p-1.5 text-slate-500 hover:text-red-700 rounded"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'authors' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createAuthMut.mutate();
            }}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4 h-fit"
          >
            <h2 className="text-base font-bold text-slate-900">Add Author Record</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
                placeholder="e.g., Dr. A. P. J. Abdul Kalam"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
              <input
                type="text"
                value={authCountry}
                onChange={(e) => setAuthCountry(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Affiliation / Notes</label>
              <textarea
                rows={2}
                value={authBio}
                onChange={(e) => setAuthBio(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={createAuthMut.isPending}
              className="w-full py-2 bg-[#0C1D36] text-white text-xs font-semibold rounded-md hover:bg-blue-900"
            >
              Add Author
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Author Name</th>
                  <th className="py-3 px-4">Country</th>
                  <th className="py-3 px-4">Affiliation / Biography</th>
                  <th className="py-3 px-4 text-right">Catalog Titles</th>
                  <th className="py-3 px-4 text-right">Archive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {(authData?.items || []).map((a: any) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{a.fullName}</td>
                    <td className="py-2.5 px-4 text-slate-600">{a.country}</td>
                    <td className="py-2.5 px-4 text-slate-500">{a.biography || '—'}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{a.bookCount}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        aria-label={`Archive author ${a.fullName}`}
                        onClick={() => archiveItem('authors', a.id, 'authors')}
                        className="p-1.5 text-slate-500 hover:text-red-700 rounded"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'publishers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createPubMut.mutate();
            }}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4 h-fit"
          >
            <h2 className="text-base font-bold text-slate-900">Add Publisher</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Publisher Name *</label>
              <input
                type="text"
                required
                value={pubName}
                onChange={(e) => setPubName(e.target.value)}
                placeholder="e.g., Springer Nature India"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
              <input
                type="text"
                value={pubCity}
                onChange={(e) => setPubCity(e.target.value)}
                placeholder="e.g., Chennai / New Delhi"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Email</label>
              <input
                type="email"
                value={pubEmail}
                onChange={(e) => setPubEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={createPubMut.isPending}
              className="w-full py-2 bg-[#0C1D36] text-white text-xs font-semibold rounded-md hover:bg-blue-900"
            >
              Add Publisher
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Publisher Name</th>
                  <th className="py-3 px-4">City</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4 text-right">Titles</th>
                  <th className="py-3 px-4 text-right">Archive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {(pubData?.items || []).map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{p.name}</td>
                    <td className="py-2.5 px-4 text-slate-600">{p.city || '—'}</td>
                    <td className="py-2.5 px-4 text-slate-500">{p.contactEmail || p.website || '—'}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{p.bookCount}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        aria-label={`Archive publisher ${p.name}`}
                        onClick={() => archiveItem('publishers', p.id, 'publishers')}
                        className="p-1.5 text-slate-500 hover:text-red-700 rounded"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'departments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createDeptMut.mutate();
            }}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4 h-fit"
          >
            <h2 className="text-base font-bold text-slate-900">Add Academic Department</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department Code *</label>
              <input
                type="text"
                required
                value={deptCode}
                onChange={(e) => setDeptCode(e.target.value)}
                placeholder="e.g., IT"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department Name *</label>
              <input
                type="text"
                required
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="e.g., Information Technology"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Head of Department</label>
              <input
                type="text"
                value={deptHod}
                onChange={(e) => setDeptHod(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={createDeptMut.isPending}
              className="w-full py-2 bg-[#0C1D36] text-white text-xs font-semibold rounded-md hover:bg-blue-900"
            >
              Add Department
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Academic Department Name</th>
                  <th className="py-3 px-4">Head of Department</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {(deptData?.departments || []).map((d: any) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-blue-900">{d.code}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{d.name}</td>
                    <td className="py-2.5 px-4 text-slate-600">{d.headOfDepartment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
