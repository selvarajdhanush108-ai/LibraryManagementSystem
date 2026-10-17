import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/AppLayout';
import {
  LoginPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  AccessDeniedPage,
} from './pages/AuthPages';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import {
  AdminBooksListPage,
  AdminBookNewPage,
  AdminBookDetailPage,
} from './pages/AdminBooksPages';
import {
  AdminInventoryPage,
  AdminCatalogMetadataPage,
} from './pages/AdminInventoryAndMetaPages';
import {
  AdminMembersListPage,
  AdminMemberDetailPage,
} from './pages/AdminMembersPages';
import {
  AdminIssueDeskPage,
  AdminReturnDeskPage,
  AdminLoansListPage,
  AdminReservationsPage,
} from './pages/AdminCirculationPages';
import {
  AdminFinesPage,
  AdminReportsPage,
  AdminAuditLogsPage,
  AdminSettingsPage,
} from './pages/AdminFinesReportsSettingsPages';
import {
  PortalDashboardPage,
  PortalCatalogPage,
  PortalBookDetailPage,
  PortalMyBooksPage,
  PortalReservationsPage,
  PortalFinesPage,
  PortalNotificationsPage,
  PortalProfilePage,
} from './pages/MemberPortalPages';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute: React.FC<{
  allowedRoles?: Array<'SuperAdmin' | 'Librarian' | 'Student' | 'Faculty'>;
  children: React.ReactNode;
}> = ({ allowedRoles, children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-xs font-medium text-slate-600">
        Verifying KSRCE Library session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <AppLayout>
        <AccessDeniedPage />
      </AppLayout>
    );
  }

  return <AppLayout>{children}</AppLayout>;
};

const RootRedirect: React.FC = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'SuperAdmin' || user.role === 'Librarian') {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <Navigate to="/portal/dashboard" replace />;
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Authentication Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/access-denied"
              element={
                <ProtectedRoute>
                  <AccessDeniedPage />
                </ProtectedRoute>
              }
            />

            {/* Administration & Circulation Routes */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/books"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminBooksListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/books/new"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminBookNewPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/books/:id"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminBookDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/inventory"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminInventoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/authors"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminCatalogMetadataPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/categories"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminCatalogMetadataPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/publishers"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminCatalogMetadataPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/members"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminMembersListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/members/:id"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminMemberDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/issue"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminIssueDeskPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/circulation/issue"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminIssueDeskPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/returns"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminReturnDeskPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/circulation/returns"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminReturnDeskPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/loans"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminLoansListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reservations"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminReservationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/fines"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminFinesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit-logs"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin', 'Librarian']}>
                  <AdminAuditLogsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute allowedRoles={['SuperAdmin']}>
                  <AdminSettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Student & Faculty Member Self-Service Portal Routes */}
            <Route
              path="/portal/dashboard"
              element={
                <ProtectedRoute>
                  <PortalDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portal/catalog"
              element={
                <ProtectedRoute>
                  <PortalCatalogPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portal/catalog/:id"
              element={
                <ProtectedRoute>
                  <PortalBookDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portal/my-books"
              element={
                <ProtectedRoute>
                  <PortalMyBooksPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portal/reservations"
              element={
                <ProtectedRoute>
                  <PortalReservationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portal/fines"
              element={
                <ProtectedRoute>
                  <PortalFinesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portal/notifications"
              element={
                <ProtectedRoute>
                  <PortalNotificationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portal/profile"
              element={
                <ProtectedRoute>
                  <PortalProfilePage />
                </ProtectedRoute>
              }
            />

            {/* Catch-all & Default Route */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
