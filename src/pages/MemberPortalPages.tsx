import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Clock,
  BookmarkCheck,
  IndianRupee,
  Search,
  RefreshCw,
  ArrowLeft,
  Bell,
  UserCheck,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SemanticStatus, KsrLogoImage } from '../components/AppLayout';

export const PortalDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['portal-dashboard'],
    queryFn: () => apiRequest('/dashboard/summary'),
  });

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-slate-500">Loading your library dashboard...</div>;
  }

  const activeLoans = data.activeLoans || [];
  const reservations = data.reservations || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">
            KSR College of Engineering · Member Self-Service Portal
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Welcome, {user?.fullName}
          </h1>
        </div>
        <Link
          to="/portal/catalog"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Search Library Catalog</span>
        </Link>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/portal/my-books" className="bg-white border border-slate-200 rounded-lg p-4 flex justify-between items-start">
          <div>
            <p className="text-xs text-slate-500 font-medium">Currently Borrowed</p>
            <p className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">{activeLoans.length}</p>
            <p className="text-xs text-slate-500 mt-1">
              Limit: {user?.role === 'Faculty' ? data.policy?.facultyLoanLimit || 5 : data.policy?.studentLoanLimit || 3} books
            </p>
          </div>
          <Clock className="w-5 h-5 text-blue-800" />
        </Link>

        <Link to="/portal/reservations" className="bg-white border border-slate-200 rounded-lg p-4 flex justify-between items-start">
          <div>
            <p className="text-xs text-slate-500 font-medium">Active Reservations</p>
            <p className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">{reservations.length}</p>
            <p className="text-xs text-slate-500 mt-1">Waiting queue holds</p>
          </div>
          <BookmarkCheck className="w-5 h-5 text-amber-700" />
        </Link>

        <Link to="/portal/fines" className="bg-white border border-slate-200 rounded-lg p-4 flex justify-between items-start">
          <div>
            <p className="text-xs text-slate-500 font-medium">Outstanding Fines</p>
            <p className="text-2xl font-bold font-mono text-red-700 mt-1 tabular-nums">
              ₹{Number(data.outstandingFines || 0).toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Rate: ₹{data.policy?.finePerDay || 2}/day</p>
          </div>
          <IndianRupee className="w-5 h-5 text-red-700" />
        </Link>

        <Link to="/portal/my-books" className="bg-white border border-slate-200 rounded-lg p-4 flex justify-between items-start">
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Books Borrowed</p>
            <p className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
              {data.totalBorrowedHistory || 0}
            </p>
            <p className="text-xs text-slate-500 mt-1">Cumulative circulation history</p>
          </div>
          <BookOpen className="w-5 h-5 text-emerald-700" />
        </Link>
      </div>

      {/* Active Loans & Upcoming Due Dates */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Currently Borrowed Books & Upcoming Due Dates</h2>
            <p className="text-xs text-slate-500">Renew eligible loans online before the due date</p>
          </div>
          <Link to="/portal/my-books" className="text-xs font-semibold text-blue-800 hover:underline">
            Manage Loans & History →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Loan No.</th>
                <th className="py-2.5 px-4">Book Title</th>
                <th className="py-2.5 px-4">Accession No.</th>
                <th className="py-2.5 px-4">Due Date</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {activeLoans.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    You have no active borrowed books right now.
                  </td>
                </tr>
              ) : (
                activeLoans.map((l: any) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900 tabular-nums">{l.loanNumber}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{l.bookTitle}</td>
                    <td className="py-2.5 px-4 font-mono text-blue-900 tabular-nums">{l.accessionNumber}</td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 tabular-nums">{l.dueDate}</td>
                    <td className="py-2.5 px-4">
                      <SemanticStatus status={l.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommended / Relevant Catalog Items */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Featured Engineering Reference Titles</h2>
          <Link to="/portal/catalog" className="text-xs font-semibold text-blue-800 hover:underline">
            Explore Full Catalog →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(data.recommendedBooks || []).map((bk: any) => (
            <Link
              key={bk.id}
              to={`/portal/catalog/${bk.id}`}
              className="border border-slate-200 hover:border-blue-800 rounded-md p-4 transition-colors flex flex-col justify-between"
            >
              <div>
                <p className="text-xs font-mono text-blue-900 font-semibold">{bk.bookCode}</p>
                <h3 className="text-sm font-bold text-slate-900 mt-1">{bk.title}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {bk.categoryName} · {bk.edition} ({bk.publicationYear})
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <SemanticStatus status={bk.availableCopies > 0 ? 'Available' : 'Issued'} />
                <span className="font-mono text-slate-600 tabular-nums">{bk.availableCopies} copies free</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export const PortalCatalogPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [availability, setAvailability] = useState('all');

  const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: () => apiRequest('/categories') });
  const { data: booksData, isLoading } = useQuery({
    queryKey: ['portal-books', search, categoryId, availability],
    queryFn: () => {
      const qs = new URLSearchParams({ search, categoryId, availability, pageSize: '30' });
      return apiRequest(`/books?${qs.toString()}`);
    },
  });

  const items = booksData?.items || [];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-900">OPAC Online Public Access Catalog</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Search KSRCE Library Catalog</h1>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search OPAC catalog"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by book title, author, ISBN, publisher, or subject..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md"
          />
        </div>
        <div className="md:col-span-4">
          <select
            aria-label="Filter by Subject Category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="">All Engineering Categories</option>
            {(catData?.items || []).map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <select
            aria-label="Filter by Copy Availability"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="all">All Titles</option>
            <option value="available">Available on Shelf</option>
            <option value="unavailable">Waiting List Titles</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-500">Searching OPAC catalog...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((bk: any) => (
            <div
              key={bk.id}
              className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between hover:border-blue-800/70 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono font-bold text-blue-900">{bk.bookCode}</span>
                  <span>{bk.categoryName}</span>
                </div>
                <Link to={`/portal/catalog/${bk.id}`} className="text-base font-bold text-slate-900 hover:text-blue-800 block mt-1.5">
                  {bk.title}
                </Link>
                <p className="text-xs text-slate-600 mt-1">
                  {bk.authorsText} · {bk.publisherName} ({bk.publicationYear})
                </p>
                <p className="text-xs text-slate-500 mt-2 line-clamp-2">{bk.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {bk.availableCopies} / {bk.totalCopies} available
                  </span>
                  <span className="block text-[11px] font-mono text-slate-500">{bk.shelfLocation}</span>
                </div>
                <Link
                  to={`/portal/catalog/${bk.id}`}
                  className="px-3 py-1.5 bg-[#0C1D36] hover:bg-blue-900 text-white font-semibold rounded"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const PortalBookDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const { data: book, isLoading } = useQuery({
    queryKey: ['portal-book-detail', id],
    queryFn: () => apiRequest(`/books/${id}`),
  });

  const reserveMut = useMutation({
    mutationFn: () =>
      apiRequest('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          bookId: Number(id),
          notes: 'Reserved via Student/Faculty Self-Service Portal',
        }),
      }),
    onSuccess: (res) => {
      showToast('success', 'Reservation Placed', res.message);
      queryClient.invalidateQueries({ queryKey: ['portal-book-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (err: Error) => showToast('error', 'Could Not Reserve', err.message),
  });

  if (isLoading || !book) {
    return <div className="p-6 text-sm text-slate-500">Loading book details...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link to="/portal/catalog" className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Catalog Search</span>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{book.title}</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {book.bookCode} · ISBN: {book.isbn || 'N/A'} · {book.categoryName} · {book.publisherName} ({book.publicationYear})
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <p className="text-sm text-slate-700 leading-relaxed">{book.description}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-xs">
          <div>
            <span className="text-slate-500 block">Authors</span>
            <span className="font-semibold text-slate-900">
              {(book.authors || []).map((a: any) => a.fullName).join(', ')}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Edition</span>
            <span className="font-semibold text-slate-900">{book.edition}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Rack Location</span>
            <span className="font-mono font-semibold text-blue-900">{book.shelfLocation}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Availability</span>
            <span className="font-mono font-bold text-emerald-700 tabular-nums">
              {book.availableCopies} of {book.totalCopies} available
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Active Waiting List Queue: <strong>{book.activeReservationsCount}</strong> member(s)
          </span>
          <button
            type="button"
            disabled={reserveMut.isPending}
            onClick={() => reserveMut.mutate()}
            className="px-4 py-2 bg-[#0C1D36] hover:bg-blue-900 text-white text-xs font-semibold rounded-md"
          >
            {reserveMut.isPending ? 'Placing Reservation...' : 'Reserve This Title'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Physical Copies & Rack Status</h2>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
              <th className="py-2.5 px-4">Accession No.</th>
              <th className="py-2.5 px-4">Rack / Shelf</th>
              <th className="py-2.5 px-4">Current Status</th>
              <th className="py-2.5 px-4">Expected Return</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(book.copies || []).map((c: any) => (
              <tr key={c.id}>
                <td className="py-2.5 px-4 font-mono font-bold text-blue-900">{c.accessionNumber}</td>
                <td className="py-2.5 px-4 font-mono text-slate-700">{c.shelfLocation}</td>
                <td className="py-2.5 px-4">
                  <SemanticStatus status={c.status} />
                </td>
                <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums">{c.currentDueDate || 'On Shelf'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PortalMyBooksPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const { data: loansData, isLoading } = useQuery({
    queryKey: ['portal-my-loans'],
    queryFn: () => apiRequest('/loans'),
  });

  const renewMut = useMutation({
    mutationFn: (loanId: number) => apiRequest(`/loans/${loanId}/renew`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: (res) => {
      showToast('success', 'Renewal Approved', res.message);
      queryClient.invalidateQueries({ queryKey: ['portal-my-loans'] });
    },
    onError: (err: Error) => showToast('error', 'Renewal Declined', err.message),
  });

  const allLoans = loansData?.items || [];
  const activeLoans = allLoans.filter((l: any) => l.status !== 'Returned');
  const historyLoans = allLoans.filter((l: any) => l.status === 'Returned');

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Member Borrowing Ledger</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-0.5">My Borrowed Books & Renewal Requests</h1>
      </div>

      {/* Active Loans */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Current Active Loans ({activeLoans.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2.5 px-4">Loan No.</th>
                <th className="py-2.5 px-4">Book Title</th>
                <th className="py-2.5 px-4">Accession No.</th>
                <th className="py-2.5 px-4">Due Date</th>
                <th className="py-2.5 px-4 text-right">Renewals Used</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Self-Service Renewal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading your loans...
                  </td>
                </tr>
              ) : activeLoans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No active loans currently checked out.
                  </td>
                </tr>
              ) : (
                activeLoans.map((l: any) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900 tabular-nums">{l.loanNumber}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{l.bookTitle}</td>
                    <td className="py-2.5 px-4 font-mono text-blue-900 tabular-nums">{l.accessionNumber}</td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 tabular-nums">{l.dueDate}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{l.renewalCount} / 2</td>
                    <td className="py-2.5 px-4">
                      <SemanticStatus status={l.status} />
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        disabled={renewMut.isPending}
                        onClick={() => renewMut.mutate(l.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#0C1D36] hover:bg-blue-900 text-white text-xs font-semibold rounded"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Renew Loan</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Borrowing History */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Past Returned Books ({historyLoans.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2.5 px-4">Loan No.</th>
                <th className="py-2.5 px-4">Book Title</th>
                <th className="py-2.5 px-4">Accession No.</th>
                <th className="py-2.5 px-4">Issued Date</th>
                <th className="py-2.5 px-4">Returned Date</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyLoans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    No historical returned loans yet.
                  </td>
                </tr>
              ) : (
                historyLoans.map((l: any) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{l.loanNumber}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{l.bookTitle}</td>
                    <td className="py-2.5 px-4 font-mono text-blue-900 tabular-nums">{l.accessionNumber}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums">{String(l.issuedAt).split('T')[0]}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums">{String(l.returnedAt).split('T')[0]}</td>
                    <td className="py-2.5 px-4">
                      <SemanticStatus status="Returned" />
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

export const PortalReservationsPage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const { data: resData, isLoading } = useQuery({
    queryKey: ['portal-reservations'],
    queryFn: () => apiRequest('/reservations'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => apiRequest(`/reservations/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      showToast('info', 'Reservation Cancelled', 'Your hold request has been cancelled.');
      queryClient.invalidateQueries({ queryKey: ['portal-reservations'] });
    },
  });

  const items = resData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Hold Queue</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">My Book Reservations</h1>
        </div>
        <Link
          to="/portal/catalog"
          className="px-4 py-2 bg-[#0C1D36] text-white text-xs font-semibold rounded-md hover:bg-blue-900"
        >
          Reserve Another Book
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
              <th className="py-3 px-4">Reservation No.</th>
              <th className="py-3 px-4">Book Title</th>
              <th className="py-3 px-4 text-right">Queue Position</th>
              <th className="py-3 px-4">Requested / Expires</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Loading reservations...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  You have no active or past reservations.
                </td>
              </tr>
            ) : (
              items.map((r: any) => (
                <tr key={r.id}>
                  <td className="py-2.5 px-4 font-mono font-bold text-slate-900 tabular-nums">{r.reservationNumber}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-900">{r.bookTitle}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-900 tabular-nums">
                    {r.computedQueuePosition > 0 ? `#${r.computedQueuePosition}` : '—'}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-600 tabular-nums">
                    {String(r.createdAt).split('T')[0]} → {r.expiresAt ? String(r.expiresAt).split('T')[0] : '—'}
                  </td>
                  <td className="py-2.5 px-4">
                    <SemanticStatus status={r.status} />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {['Pending', 'Approved', 'ReadyForPickup'].includes(r.status) && (
                      <button
                        type="button"
                        onClick={() => cancelMut.mutate(r.id)}
                        className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                      >
                        Cancel Hold
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PortalFinesPage: React.FC = () => {
  const { data: finesData, isLoading } = useQuery({
    queryKey: ['portal-fines'],
    queryFn: () => apiRequest('/fines'),
  });

  const assessments = finesData?.assessments || [];
  const payments = finesData?.payments || [];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Account Financial Standing</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-0.5">My Overdue Fines & Payment History</h1>
        <p className="text-xs text-slate-500 mt-1">
          Fines are settled at the Central Library Circulation Counter. Official receipts appear below immediately upon recording.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Fine Assessments ({assessments.length})</h2>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
              <th className="py-2.5 px-4">Loan No.</th>
              <th className="py-2.5 px-4">Book Title</th>
              <th className="py-2.5 px-4 text-right">Overdue Days</th>
              <th className="py-2.5 px-4 text-right">Assessed</th>
              <th className="py-2.5 px-4 text-right">Paid / Waived</th>
              <th className="py-2.5 px-4 text-right">Remaining Due</th>
              <th className="py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500">
                  Loading fine records...
                </td>
              </tr>
            ) : assessments.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No overdue fines on your account.
                </td>
              </tr>
            ) : (
              assessments.map((fa: any) => (
                <tr key={fa.id}>
                  <td className="py-2.5 px-4 font-mono tabular-nums">{fa.loanNumber}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{fa.bookTitle}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{fa.overdueDays}d</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">₹{Number(fa.assessedAmount).toFixed(2)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    ₹{Number(fa.paidAmount).toFixed(2)} / ₹{Number(fa.waivedAmount).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-red-700 tabular-nums">
                    ₹{Number(fa.remainingBalance).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4">
                    <SemanticStatus status={fa.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Payment Receipts ({payments.length})</h2>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
              <th className="py-2.5 px-4">Receipt No.</th>
              <th className="py-2.5 px-4">Book Title</th>
              <th className="py-2.5 px-4">Payment Mode</th>
              <th className="py-2.5 px-4 text-right">Amount Paid</th>
              <th className="py-2.5 px-4">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  No payment receipts recorded yet.
                </td>
              </tr>
            ) : (
              payments.map((p: any) => (
                <tr key={p.id}>
                  <td className="py-2.5 px-4 font-mono font-bold text-blue-900 tabular-nums">{p.receiptNumber}</td>
                  <td className="py-2.5 px-4 font-medium">{p.bookTitle}</td>
                  <td className="py-2.5 px-4">{p.paymentMethod}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                    ₹{Number(p.amount).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-500 tabular-nums">{String(p.paidAt).split('T')[0]}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PortalNotificationsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: notifData, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest('/notifications'),
  });

  const markAllMut = useMutation({
    mutationFn: () => apiRequest('/notifications/read-all', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = notifData?.items || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Alerts & Reminders</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Library Notification Center</h1>
        </div>
        <button
          type="button"
          onClick={() => markAllMut.mutate()}
          className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
        >
          Mark All as Read
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading notifications...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No notifications in your inbox.</div>
        ) : (
          items.map((n: any) => (
            <div key={n.id} className={`p-4 flex items-start justify-between gap-4 ${n.isRead ? 'opacity-75' : 'bg-blue-50/30'}`}>
              <div className="flex items-start gap-3">
                <Bell className="w-4 h-4 text-blue-800 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-900">{n.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                  <p className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
                    {new Date(n.createdAt).toLocaleString()} · {n.notificationType}
                  </p>
                </div>
              </div>
              {!n.isRead && (
                <span className="text-[11px] font-semibold text-blue-800">Unread</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const PortalProfilePage: React.FC = () => {
  const { showToast } = useAuth();
  const queryClient = useQueryClient();

  const { data: meData, isLoading } = useQuery({
    queryKey: ['auth-me-profile'],
    queryFn: () => apiRequest('/auth/me'),
  });

  const profile = meData?.user?.memberProfile;
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile]);

  const updateMut = useMutation({
    mutationFn: () =>
      apiRequest(`/members/${profile.id}`, {
        method: 'PUT',
        body: JSON.stringify({ phone }),
      }),
    onSuccess: () => {
      showToast('success', 'Profile Updated', 'Contact number updated.');
      queryClient.invalidateQueries({ queryKey: ['auth-me-profile'] });
    },
    onError: (err: Error) => showToast('error', 'Update Failed', err.message),
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading profile...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-900">Institutional Library Card</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Member Profile & Credentials</h1>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-[#0C1D36] text-amber-400 flex items-center justify-center font-bold shrink-0">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{meData?.user?.fullName}</h2>
              <p className="text-xs text-slate-500">
                {meData?.user?.role} · {meData?.user?.email}
              </p>
            </div>
          </div>
          <KsrLogoImage className="h-11 w-auto object-contain shrink-0" />
        </div>

        {profile ? (
          <>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <dt className="text-slate-500">Member Code</dt>
                <dd className="font-mono font-bold text-blue-900 mt-0.5">{profile.memberCode}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Registration / Employee ID</dt>
                <dd className="font-mono font-bold text-slate-900 mt-0.5">{profile.registrationNumber}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Academic Department</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">
                  {profile.departmentName} ({profile.departmentCode})
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Programme / Year</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">
                  {profile.programmeName || 'Faculty Staff'} {profile.yearOfStudy ? `· Year ${profile.yearOfStudy}` : ''}
                </dd>
              </div>
            </dl>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMut.mutate();
              }}
              className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-end gap-3"
            >
              <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Permitted Self-Service Field: Contact Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
              <button
                type="submit"
                disabled={updateMut.isPending}
                className="px-4 py-2 bg-[#0C1D36] hover:bg-blue-900 text-white text-xs font-semibold rounded-md whitespace-nowrap"
              >
                Update Contact Phone
              </button>
            </form>
          </>
        ) : (
          <p className="text-xs text-slate-600">
            You are signed in with an Administrative Staff account ({meData?.user?.role}).
          </p>
        )}
      </div>
    </div>
  );
};
