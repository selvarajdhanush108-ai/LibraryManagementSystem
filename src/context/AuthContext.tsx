import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  apiRequest,
  clearAuthSession,
  getStoredToken,
  getStoredUser,
  setAuthSession,
  StoredUser,
} from '../services/api';

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface AuthContextValue {
  user: StoredUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<StoredUser>;
  logout: () => Promise<void>;
  showToast: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    apiRequest<{ user: StoredUser }>('/auth/me')
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        clearAuthSession();
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = async (email: string, password: string): Promise<StoredUser> => {
    const data = await apiRequest<{
      accessToken: string;
      refreshToken: string;
      user: StoredUser;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthSession(data.accessToken, data.refreshToken, data.user);
    setUser(data.user);
    showToast('success', 'Signed in successfully', `Welcome back, ${data.user.fullName}`);
    return data.user;
  };

  const logout = async (): Promise<void> => {
    try {
      await apiRequest('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // Ignore network errors on logout
    }
    clearAuthSession();
    setUser(null);
    showToast('info', 'Signed out', 'Your KSRCE Library session has ended.');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, showToast }}>
      {children}
      {/* Accessible Toast Region */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0 no-print"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg transition-all flex items-start justify-between gap-3 ${
              t.type === 'error'
                ? 'bg-red-950 border-red-800 text-white'
                : t.type === 'success'
                ? 'bg-[#0C1D36] border-blue-800 text-white'
                : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <div>
              <p className="text-sm font-semibold">{t.title}</p>
              {t.message && <p className="text-xs text-slate-300 mt-0.5">{t.message}</p>}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-xs text-slate-300 hover:text-white px-2 py-0.5 font-sans font-bold"
            >
              Close
            </button>
          </div>
        ))}
      </div>
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
