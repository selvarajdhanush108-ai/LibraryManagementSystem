import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  BookOpen,
  Layers,
  CheckCircle2,
  ArrowLeftRight,
  Users,
  AlertTriangle,
  BookmarkCheck,
  IndianRupee,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { SemanticStatus } from '../components/AppLayout';

export const AdminDashboardPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'semester' | 'all'>('30d');

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-summary', dateRange],
    queryFn: () => apiRequest('/dashboard/summary'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-24 bg-white border border-slate-200 rounded-lg p-4 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data?.kpis) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
        Failed to load dashboard summary: {(error as Error)?.message || 'Unknown error'}
      </div>
    );
  }

  const { kpis, categoryDistribution, popularBooks, recentTransactions, circulationTrends } = data;

  const statItems = [
    { label: 'Catalog Titles', value: kpis.totalTitles, sub: 'Unique bibliographic records', icon: BookOpen, to: '/admin/books' },
    { label: 'Physical Copies', value: kpis.totalCopies, sub: 'Total barcoded holdings', icon: Layers, to: '/admin/inventory' },
    { label: 'Available Copies', value: kpis.availableCopies, sub: 'Ready on library racks', icon: CheckCircle2, to: '/admin/inventory' },
    { label: 'Currently Issued', value: kpis.issuedCopies, sub: 'Active member loans', icon: ArrowLeftRight, to: '/admin/loans' },
    { label: 'Active Members', value: kpis.registeredMembers, sub: 'Students & faculty', icon: Users, to: '/admin/members' },
    { label: 'Overdue Loans', value: kpis.overdueLoansCount, sub: 'Past due date', icon: AlertTriangle, to: '/admin/loans' },
    { label: 'Pending Reservations', value: kpis.pendingReservations, sub: 'Waiting list queue', icon: BookmarkCheck, to: '/admin/reservations' },
    {
      label: 'Outstanding Fines',
      value: `₹${Number(kpis.outstandingFines || 0).toFixed(2)}`,
      sub: `Collected: ₹${Number(kpis.totalCollectedFines || 0).toFixed(2)}`,
      icon: IndianRupee,
      to: '/admin/fines',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-900">
            KSR College of Engineering · Central Library Administration
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Library Operations & Circulation Overview
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Interactive Analytics Date Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-md">
            {(
              [
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: 'semester', label: 'Semester' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDateRange(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  dateRange === opt.id ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Link
            to="/admin/books/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Book</span>
          </Link>
          <Link
            to="/admin/returns"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-md transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Return Desk</span>
          </Link>
        </div>
      </div>

      {/* 8-Card KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to}
              className="bg-white border border-slate-200 hover:border-blue-800/60 rounded-lg p-4 transition-colors flex items-start justify-between gap-3"
            >
              <div>
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">{item.value}</p>
                <p className="text-xs text-slate-500 mt-1">{item.sub}</p>
              </div>
              <div className="p-2 rounded-md bg-slate-100 text-[#0C1D36]">
                <Icon className="w-4 h-4" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Inventory by Category Bar Chart */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Inventory Distribution by Department Category</h2>
              <p className="text-xs text-slate-500">Available vs. currently issued physical copies across engineering disciplines</p>
            </div>
            <Link to="/admin/reports" className="text-xs font-semibold text-blue-800 hover:underline">
              Full Inventory Report →
            </Link>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryDistribution || []} margin={{ top: 10, right: 15, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="availableCopies" name="Available Copies" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="issuedCopies" name="Issued Copies" fill="#d97706" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly/Monthly Issue & Return Trends */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Circulation Issue & Return Activity</h2>
              <p className="text-xs text-slate-500">Completed desk transactions across periods</p>
            </div>
            <Link to="/admin/loans" className="text-xs font-semibold text-blue-800 hover:underline">
              View Register →
            </Link>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={circulationTrends || []} margin={{ top: 10, right: 15, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="issued" name="Books Issued" fill="#0C1D36" radius={[3, 3, 0, 0]} />
                <Bar dataKey="returned" name="Books Returned" fill="#16a34a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Tables: Recent Transactions & Popular Books */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Circulation Transactions</h2>
              <p className="text-xs text-slate-500">Latest book issues and returns recorded at KSRCE Central Library</p>
            </div>
            <Link to="/admin/loans" className="text-xs font-semibold text-blue-800 hover:underline">
              All Loans →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-4">Loan No.</th>
                  <th className="py-2.5 px-4">Member</th>
                  <th className="py-2.5 px-4">Book & Copy</th>
                  <th className="py-2.5 px-4">Due Date</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {(recentTransactions || []).map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-900 tabular-nums">{tx.loanNumber}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{tx.memberName}</div>
                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">{tx.registrationNumber}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900 truncate max-w-[200px]">{tx.bookTitle}</div>
                      <div className="font-mono text-[11px] text-blue-800 tabular-nums">{tx.accessionNumber}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700 tabular-nums">{tx.dueDate}</td>
                    <td className="py-2.5 px-4">
                      <SemanticStatus status={tx.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Most Borrowed Reference Titles</h2>
              <p className="text-xs text-slate-500">High-demand engineering textbooks</p>
            </div>
            <Link to="/admin/books" className="text-xs font-semibold text-blue-800 hover:underline">
              Catalog →
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {(popularBooks || []).map((bk: any) => (
              <div key={bk.id} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50">
                <div className="min-w-0">
                  <Link to={`/admin/books/${bk.id}`} className="text-xs font-semibold text-slate-900 hover:text-blue-800 truncate block">
                    {bk.title}
                  </Link>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {bk.bookCode} · {bk.categoryName} · {bk.availableCopies} available
                  </p>
                </div>
                <div className="text-right font-mono text-xs font-bold text-[#0C1D36] tabular-nums shrink-0">
                  {bk.borrowCount} loans
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
