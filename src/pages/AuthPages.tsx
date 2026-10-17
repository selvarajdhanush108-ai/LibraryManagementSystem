import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldAlert, KeyRound, Lock, Mail, ArrowRight, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import { KsrLogoBadge, KsrLogoImage } from '../components/AppLayout';

const DEMO_ACCOUNTS = [
  {
    roleLabel: 'Super Administrator',
    name: 'Dr. R. Karthikeyan',
    email: 'admin@ksrce.ac.in',
    password: 'KsrAdmin@2026',
    desc: 'Full system settings, policy rules, reports, staff & audit logs',
  },
  {
    roleLabel: 'Senior Librarian',
    name: 'S. Meenakshi Sundaram',
    email: 'librarian@ksrce.ac.in',
    password: 'KsrLibrary@2026',
    desc: 'Issue/Return circulation desk, catalog, physical copies & fines',
  },
  {
    roleLabel: 'Student (III Year B.E. CSE)',
    name: 'Aravind Kumar S.',
    email: 'student.cs01@ksrce.ac.in',
    password: 'KsrStudent@2026',
    desc: 'Self-service catalog search, loans, renewals, reservations & fines',
  },
  {
    roleLabel: 'Faculty Member (CSE)',
    name: 'Dr. P. Balasubramani',
    email: 'faculty.cse@ksrce.ac.in',
    password: 'KsrFaculty@2026',
    desc: 'Faculty portal with 5-book borrowing limit & 28-day loan period',
  },
];

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('librarian@ksrce.ac.in');
  const [password, setPassword] = useState('KsrLibrary@2026');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your institutional email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      if (user.role === 'SuperAdmin' || user.role === 'Librarian') {
        navigate('/admin/dashboard');
      } else {
        navigate('/portal/dashboard');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDemoSignIn = async (acct: typeof DEMO_ACCOUNTS[number]) => {
    setEmail(acct.email);
    setPassword(acct.password);
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(acct.email, acct.password);
      if (user.role === 'SuperAdmin' || user.role === 'Librarian') {
        navigate('/admin/dashboard');
      } else {
        navigate('/portal/dashboard');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Institutional Header */}
      <header className="bg-[#0C1D36] text-white border-b border-amber-500/30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <KsrLogoBadge lightText />
          <div className="text-xs text-slate-300">
            <span>Central Library & Information Center · Tiruchengode, Tamil Nadu</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Institutional Sign-In Form */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-6 sm:p-8 flex flex-col justify-between shadow-xs">
            <div>
              <div className="pb-4 mb-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <KsrLogoImage className="h-12 sm:h-14 w-auto object-contain" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded">
                  Central Library
                </span>
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-900">
                Institutional Portal Access
              </p>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">
                Sign in to Library Management System
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Use your KSR College of Engineering credentials to access circulation, catalog, or member services.
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs font-medium text-red-800"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                <div>
                  <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Institutional Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@ksrce.ac.in"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">
                      Password *
                    </label>
                    <Link to="/forgot-password" className="text-xs font-medium text-blue-800 hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
                    <input
                      id="login-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-[#0C1D36] hover:bg-blue-900 disabled:opacity-50 text-white text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <span>{submitting ? 'Authenticating...' : 'Sign In to Library Portal'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
              <p>
                Administrative accounts are provisioned exclusively by the Chief Library Administrator. Public self-registration is disabled for security.
              </p>
            </div>
          </div>

          {/* Right Column: Demonstration Role Switcher */}
          <div className="lg:col-span-6 bg-[#0C1D36] text-white border border-slate-800 rounded-lg p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Synthetic Demonstration Accounts
              </p>
              <h2 className="text-xl font-bold text-white mt-1">
                One-Click Role Verification
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                Select any seeded KSRCE account below to sign in against the real backend authentication service and test role-based access control:
              </p>

              <div className="mt-5 space-y-3">
                {DEMO_ACCOUNTS.map((acct) => (
                  <div
                    key={acct.email}
                    onClick={() => !submitting && handleQuickDemoSignIn(acct)}
                    className="p-3.5 rounded-md bg-slate-900/90 border border-slate-800 hover:border-amber-500/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className="font-bold text-amber-400">{acct.roleLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-200 font-medium">{acct.name}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{acct.desc}</p>
                      <p className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
                        {acct.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickDemoSignIn(acct);
                      }}
                      className="px-3.5 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Use Account</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <span>Standard Policy: 14d (Student) · 28d (Faculty)</span>
              <span className="font-mono tabular-nums">Overdue Fine: ₹2.00/day</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResultMsg(null);
    if (!email.trim()) {
      setError('Please enter your registered institutional email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ message: string; demoVerificationCode?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setResultMsg(res.message);
      if (res.demoVerificationCode) {
        setDemoCode(res.demoVerificationCode);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-6 sm:p-8 shadow-xs">
        <KsrLogoBadge lightText={false} />
        <h1 className="text-xl font-bold text-slate-900 mt-5">Forgot Institutional Password</h1>
        <p className="text-xs text-slate-600 mt-1">
          Enter your `@ksrce.ac.in` email address to generate a 15-minute password reset verification code.
        </p>

        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
        )}

        {resultMsg && (
          <div className="mt-4 p-3.5 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-2">
            <p className="font-medium">{resultMsg}</p>
            {demoCode && (
              <p className="font-mono text-sm font-bold text-blue-900 tabular-nums">
                Verification Code (Demo Environment): {demoCode}
              </p>
            )}
            <div>
              <Link
                to={`/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(demoCode || '')}`}
                className="inline-flex items-center gap-1.5 font-semibold text-blue-800 hover:underline mt-1"
              >
                <span>Proceed to Reset Password</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={handleRequestCode} className="mt-5 space-y-4">
          <div>
            <label htmlFor="fp-email" className="block text-xs font-semibold text-slate-700 mb-1">
              Institutional Email *
            </label>
            <input
              id="fp-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student.cs01@ksrce.ac.in"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#0C1D36] hover:bg-blue-900 text-white text-xs font-semibold rounded-md transition-colors"
          >
            {loading ? 'Generating Code...' : 'Generate Reset Code'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between text-xs">
          <Link to="/login" className="text-slate-600 hover:text-slate-900 font-medium">
            ← Back to Sign In
          </Link>
          <Link to="/reset-password" className="text-blue-800 hover:underline font-medium">
            Have a reset code?
          </Link>
        </div>
      </div>
    </div>
  );
};

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);

  const [email, setEmail] = useState(params.get('email') || '');
  const [resetCode, setResetCode] = useState(params.get('code') || '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !resetCode || newPassword.length < 8) {
      setError('Please provide your email, 6-digit verification code, and a password of at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, resetCode, newPassword }),
      });
      setSuccess(res.message);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-6 sm:p-8 shadow-xs">
        <KsrLogoBadge lightText={false} />
        <div className="flex items-center gap-2 mt-5">
          <KeyRound className="w-5 h-5 text-blue-800" />
          <h1 className="text-xl font-bold text-slate-900">Set New Password</h1>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">{error}</div>
        )}
        {success && (
          <div className="mt-4 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            {success} Redirecting to login...
          </div>
        )}

        <form onSubmit={handleReset} className="mt-4 space-y-4">
          <div>
            <label htmlFor="rp-email" className="block text-xs font-semibold text-slate-700 mb-1">
              Institutional Email *
            </label>
            <input
              id="rp-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="rp-code" className="block text-xs font-semibold text-slate-700 mb-1">
              6-Digit Reset Verification Code *
            </label>
            <input
              id="rp-code"
              type="text"
              required
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="rp-pwd" className="block text-xs font-semibold text-slate-700 mb-1">
              New Password (minimum 8 characters) *
            </label>
            <input
              id="rp-pwd"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#0C1D36] hover:bg-blue-900 text-white text-xs font-semibold rounded-md"
          >
            {loading ? 'Updating Password...' : 'Confirm New Password'}
          </button>
        </form>

        <div className="mt-4 pt-3 border-t border-slate-100 text-xs">
          <Link to="/login" className="text-slate-600 hover:text-slate-900 font-medium">
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export const AccessDeniedPage: React.FC = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <ShieldAlert className="w-12 h-12 text-red-700 mb-3" />
      <h1 className="text-2xl font-bold text-slate-900">Access Restricted</h1>
      <p className="text-sm text-slate-600 max-w-md mt-1">
        Your current role ({user?.role || 'Guest'}) does not have authorization to access this administrative module.
      </p>
      <Link
        to={user?.role === 'SuperAdmin' || user?.role === 'Librarian' ? '/admin/dashboard' : '/portal/dashboard'}
        className="mt-5 px-4 py-2 bg-[#0C1D36] text-white text-xs font-semibold rounded-md hover:bg-blue-900"
      >
        Return to Authorized Dashboard
      </Link>
    </div>
  );
};
