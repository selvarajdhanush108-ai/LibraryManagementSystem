import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  RotateCcw,
  BookmarkCheck,
  IndianRupee,
  BarChart3,
  ShieldCheck,
  Settings,
  Layers,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Library,
  FileSpreadsheet,
  UserCheck,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';

export const KSRCE_LOGO_URL = '/ksrce-logo.png';
export const KSRCE_EMBLEM_URL = '/ksrce-emblem.png';
export const KSRCE_LOGO_FALLBACK = 'https://www.ksrei.org/uploads/topics/17453152099102.png';

export const KsrLogoImage: React.FC<{ className?: string; alt?: string }> = ({
  className = 'h-10 w-auto object-contain',
  alt = 'K.S.R. College of Engineering Logo',
}) => (
  <img
    src={KSRCE_LOGO_URL}
    alt={alt}
    onError={(e) => {
      const target = e.currentTarget;
      if (target.src !== KSRCE_LOGO_FALLBACK) {
        target.src = KSRCE_LOGO_FALLBACK;
      }
    }}
    className={className}
  />
);

export const KsrLogoBadge: React.FC<{ compact?: boolean; lightText?: boolean }> = ({
  compact = false,
  lightText = true,
}) => {
  if (compact) {
    return (
      <div
        className="w-10 h-10 rounded-lg bg-white border border-amber-400/60 flex items-center justify-center p-1 shrink-0 shadow-xs select-none"
        title="K.S.R. College of Engineering — Library Management System"
      >
        <img
          src={KSRCE_EMBLEM_URL}
          alt="KSRCE Emblem"
          className="h-8 w-8 object-contain"
        />
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col select-none">
      <div
        className={
          lightText
            ? 'bg-white rounded-md px-2.5 py-1.5 shadow-xs border border-amber-400/50 inline-flex items-center w-fit'
            : 'inline-flex items-center w-fit'
        }
      >
        <KsrLogoImage className={lightText ? 'h-9 w-auto object-contain' : 'h-11 w-auto object-contain'} />
      </div>
      <span
        className={`text-[10px] font-semibold uppercase tracking-wider mt-1.5 leading-none ${
          lightText ? 'text-amber-400' : 'text-blue-900'
        }`}
      >
        Central Library &amp; LMS
      </span>
    </div>
  );
};

export const SemanticStatus: React.FC<{ status: string }> = ({ status }) => {
  const norm = status.toLowerCase();
  const displayLabel = status.replace(/([a-z])([A-Z])/g, '$1 $2');
  if (norm === 'available' || norm === 'active' || norm === 'paid' || norm === 'fulfilled' || norm === 'imported') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{displayLabel}</span>
      </span>
    );
  }
  if (
    norm === 'issued' ||
    norm === 'pending' ||
    norm === 'readyforpickup' ||
    norm === 'approved' ||
    norm === 'partiallypaid' ||
    norm === 'undermaintenance'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{displayLabel}</span>
      </span>
    );
  }
  if (
    norm === 'overdue' ||
    norm === 'unpaid' ||
    norm === 'damaged' ||
    norm === 'lost' ||
    norm === 'suspended' ||
    norm === 'error' ||
    norm === 'rejected'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{displayLabel}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
      <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{displayLabel}</span>
    </span>
  );
};

export interface ReceiptData {
  receiptTitle: string;
  referenceNumber: string;
  timestamp: string;
  memberName: string;
  registrationNumber: string;
  bookTitle?: string;
  accessionNumber?: string;
  dueDate?: string;
  amountLabel?: string;
  amountValue?: string;
  processedBy?: string;
  notes?: string;
}

export const ReceiptModal: React.FC<{
  receipt: ReceiptData | null;
  onClose: () => void;
}> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 shadow-xl">
        <div className="border-b border-slate-200 pb-4 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <KsrLogoImage className="h-11 w-auto object-contain" />
            <h2 id="receipt-dialog-title" className="text-sm font-bold text-slate-900">
              Central Library — {receipt.receiptTitle}
            </h2>
            <p className="text-[11px] text-slate-500">Tiruchengode - 637 215, Namakkal Dist., Tamil Nadu</p>
          </div>
          <div className="text-right font-mono text-xs text-slate-600 tabular-nums shrink-0">
            <p className="font-semibold text-slate-900">{receipt.referenceNumber}</p>
            <p>{new Date(receipt.timestamp).toLocaleString()}</p>
          </div>
        </div>

        <dl className="divide-y divide-slate-100 text-sm my-4">
          <div className="py-2 flex justify-between gap-4">
            <dt className="text-slate-500">Member Name</dt>
            <dd className="font-medium text-slate-900 text-right">{receipt.memberName}</dd>
          </div>
          <div className="py-2 flex justify-between gap-4">
            <dt className="text-slate-500">Registration / Staff ID</dt>
            <dd className="font-mono text-slate-900 tabular-nums">{receipt.registrationNumber}</dd>
          </div>
          {receipt.bookTitle && (
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-slate-500">Book Title</dt>
              <dd className="font-medium text-slate-900 text-right">{receipt.bookTitle}</dd>
            </div>
          )}
          {receipt.accessionNumber && (
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-slate-500">Physical Accession No.</dt>
              <dd className="font-mono font-semibold text-blue-900 tabular-nums">{receipt.accessionNumber}</dd>
            </div>
          )}
          {receipt.dueDate && (
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-slate-500">Due Date</dt>
              <dd className="font-mono font-semibold text-amber-800 tabular-nums">{receipt.dueDate}</dd>
            </div>
          )}
          {receipt.amountValue && (
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-slate-500">{receipt.amountLabel || 'Amount'}</dt>
              <dd className="font-mono font-bold text-slate-900 tabular-nums">{receipt.amountValue}</dd>
            </div>
          )}
          {receipt.notes && (
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-slate-500">Remarks</dt>
              <dd className="text-slate-700 text-right">{receipt.notes}</dd>
            </div>
          )}
        </dl>

        <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-xs text-slate-500">
          <span> Official Library Transaction Slip</span>
          <span>Authorized Signatory / Circulation Desk</span>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Receipt</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Array<'SuperAdmin' | 'Librarian' | 'Student' | 'Faculty'>;
}

const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Issue Book', to: '/admin/issue', icon: ArrowLeftRight, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Return Book', to: '/admin/returns', icon: RotateCcw, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Active Loans & Renewals', to: '/admin/loans', icon: Clock, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Book Catalog', to: '/admin/books', icon: BookOpen, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Physical Inventory', to: '/admin/inventory', icon: Layers, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Authors, Categories & Pubs', to: '/admin/categories', icon: Library, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Students & Faculty', to: '/admin/members', icon: Users, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Reservations Queue', to: '/admin/reservations', icon: BookmarkCheck, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Fines & Receipts', to: '/admin/fines', icon: IndianRupee, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Reports & Analytics', to: '/admin/reports', icon: BarChart3, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Audit Logs', to: '/admin/audit-logs', icon: ShieldCheck, roles: ['SuperAdmin', 'Librarian'] },
  { label: 'Policies & Settings', to: '/admin/settings', icon: Settings, roles: ['SuperAdmin'] },
];

const PORTAL_NAV_ITEMS: NavItem[] = [
  { label: 'Member Dashboard', to: '/portal/dashboard', icon: LayoutDashboard, roles: ['Student', 'Faculty', 'SuperAdmin', 'Librarian'] },
  { label: 'Search Catalog', to: '/portal/catalog', icon: BookOpen, roles: ['Student', 'Faculty', 'SuperAdmin', 'Librarian'] },
  { label: 'My Borrowed Books', to: '/portal/my-books', icon: FileSpreadsheet, roles: ['Student', 'Faculty', 'SuperAdmin', 'Librarian'] },
  { label: 'My Reservations', to: '/portal/reservations', icon: BookmarkCheck, roles: ['Student', 'Faculty', 'SuperAdmin', 'Librarian'] },
  { label: 'Fines & Dues', to: '/portal/fines', icon: IndianRupee, roles: ['Student', 'Faculty', 'SuperAdmin', 'Librarian'] },
  { label: 'Notifications', to: '/portal/notifications', icon: Bell, roles: ['Student', 'Faculty', 'SuperAdmin', 'Librarian'] },
  { label: 'My Profile', to: '/portal/profile', icon: UserCheck, roles: ['Student', 'Faculty', 'SuperAdmin', 'Librarian'] },
];

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const isStaff = user?.role === 'SuperAdmin' || user?.role === 'Librarian';
  const isPortalRoute = location.pathname.startsWith('/portal');
  const activeNavList = isStaff && !isPortalRoute ? ADMIN_NAV_ITEMS : PORTAL_NAV_ITEMS;
  const visibleNav = activeNavList.filter((item) => user && item.roles.includes(user.role));

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<{ items: Array<Record<string, any>>; unreadCount: number }>('/notifications'),
    enabled: Boolean(user),
  });

  const markAllReadMut = useMutation({
    mutationFn: () => apiRequest('/notifications/read-all', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Build Breadcrumbs
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const currentTitle =
    visibleNav.find((n) => location.pathname === n.to || location.pathname.startsWith(`${n.to}/`))?.label ||
    (pathSegments[pathSegments.length - 1] || 'Dashboard').replace(/-/g, ' ');

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Primary Institutional Navigation"
        className={`hidden lg:flex flex-col bg-[#0C1D36] text-white border-r border-slate-800 transition-all duration-150 shrink-0 no-print ${
          collapsed ? 'w-20' : 'w-72'
        }`}
      >
        <div className="py-3.5 px-4 flex items-center justify-between border-b border-slate-800/80 gap-2">
          <Link to={isStaff ? '/admin/dashboard' : '/portal/dashboard'} className="min-w-0">
            <KsrLogoBadge compact={collapsed} lightText />
          </Link>
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-700 text-white font-semibold shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Workspace Switcher for Staff + User Info Footer */}
        <div className="p-3 border-t border-slate-800/80 space-y-2">
          {isStaff && !collapsed && (
            <button
              type="button"
              onClick={() => navigate(isPortalRoute ? '/admin/dashboard' : '/portal/catalog')}
              className="w-full px-3 py-2 rounded-md text-xs font-medium bg-slate-900/90 hover:bg-slate-800 text-amber-400 border border-slate-700/80 flex items-center justify-between transition-colors"
            >
              <span>{isPortalRoute ? 'Return to Admin Console' : 'Preview Member Portal'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user?.fullName}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {user?.role} · {user?.email}
                </p>
              </div>
            )}
            <button
              type="button"
              aria-label="Sign out"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="p-2 rounded-md text-slate-300 hover:text-white hover:bg-red-900/50 transition-colors shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-full bg-[#0C1D36] text-white flex flex-col h-full z-10">
            <div className="py-3.5 px-4 flex items-center justify-between border-b border-slate-800">
              <KsrLogoBadge lightText />
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium ${
                      active ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on Left, Notification + Primary Action on Right */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link
              to={isStaff ? '/admin/dashboard' : '/portal/dashboard'}
              className="lg:hidden shrink-0 flex items-center gap-2"
              aria-label="KSRCE Home"
            >
              <img src={KSRCE_EMBLEM_URL} alt="KSRCE Emblem" className="h-8 w-8 object-contain" />
            </Link>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <img
                src={KSRCE_EMBLEM_URL}
                alt=""
                aria-hidden="true"
                className="h-6 w-6 object-contain hidden sm:inline-block shrink-0"
              />
              <span className="font-semibold text-[#0C1D36] hidden sm:inline">KSRCE Central Library</span>
              <span className="hidden sm:inline" aria-hidden="true">/</span>
              <span className="capitalize text-slate-600 hidden md:inline">{pathSegments[0] || 'Console'}</span>
              <span className="hidden md:inline" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 capitalize truncate">{currentTitle}</span>
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Notification Center Button */}
            <div className="relative">
              <button
                type="button"
                aria-label="Open notifications"
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {(notifData?.unreadCount ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 px-1.5 py-0.2 bg-amber-600 text-white text-[10px] font-mono font-bold rounded-full tabular-nums">
                    {notifData?.unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Library Notifications
                    </h3>
                    <button
                      type="button"
                      onClick={() => markAllReadMut.mutate()}
                      className="text-xs text-blue-700 hover:underline font-medium"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 my-2">
                    {(notifData?.items || []).length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-500">No notifications yet.</p>
                    ) : (
                      (notifData?.items || []).slice(0, 8).map((n) => (
                        <div key={n.id} className={`py-2.5 ${n.isRead ? 'opacity-70' : ''}`}>
                          <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-1 tabular-nums">
                            {new Date(n.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                    <Link
                      to="/portal/notifications"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs font-semibold text-blue-800 hover:underline"
                    >
                      View all notifications
                    </Link>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>

            {isStaff ? (
              <Link
                to="/admin/issue"
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Issue Book Desk
              </Link>
            ) : (
              <Link
                to="/portal/catalog"
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0C1D36] hover:bg-blue-900 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Browse Catalog
              </Link>
            )}

            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="px-3 py-2 text-xs font-medium text-slate-700 hover:text-red-700 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white px-6 py-3.5 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3">
            <KsrLogoImage className="h-7 w-auto object-contain shrink-0" />
            <span>
              K.S.R. College of Engineering (Autonomous) · K.S.R. Kalvi Nagar, Tiruchengode - 637 215, Tamil Nadu
            </span>
          </div>
          <span>Central Library Management System · Demonstration Environment</span>
        </footer>
      </div>
    </div>
  );
};
