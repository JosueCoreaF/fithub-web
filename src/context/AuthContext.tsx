import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export type UserRole = 'admin' | 'super_admin';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: UserRole;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, password: string, role: UserRole) => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateProfile: (payload: {
    email: string;
    fullName: string;
    phone?: string;
    role: UserRole;
    preferences?: Record<string, boolean>;
  }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const normalizeAuthError = (error: unknown, action: 'signup' | 'signin' | 'magic_link' | 'reset' | 'password' | 'profile') => {
  if (!(error instanceof Error)) {
    return new Error('No fue posible completar la solicitud de autenticacion.');
  }

  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  const message = error.message.toLowerCase();

  if (status === 429 || message.includes('too many requests')) {
    if (action === 'signup') {
      return new Error('Supabase bloqueo temporalmente los registros por demasiados intentos seguidos. Espera unos minutos y vuelve a intentar, o revisa Authentication > Rate Limits en Supabase.');
    }

    if (action === 'magic_link' || action === 'reset') {
      return new Error('Supabase bloqueo temporalmente el envio por demasiadas solicitudes. Espera unos minutos antes de pedir otro correo.');
    }

    return new Error('Supabase bloqueo temporalmente el acceso por demasiados intentos. Espera unos minutos y vuelve a intentar.');
  }

  return error;
};

const resolveRole = (user: User | null): UserRole => {
  if (!user) return 'admin';

  const role = user.app_metadata?.role ?? user.user_metadata?.role;

  if (role === 'super_admin' || user.email?.endsWith('@fithub.superadmin')) {
    return 'super_admin';
  }

  if (role === 'admin' || user.email?.endsWith('@fithub.admin')) {
    return 'admin';
  }

  return 'admin';
};

const isAdminRole = (role: UserRole) => role === 'admin' || role === 'super_admin';

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        setSession(null);
      } else {
        setSession(data.session ?? null);
      }

      setLoading(false);
    };

    void bootstrap();

    const { data } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const role = resolveRole(session?.user ?? null);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    role,
    isAdmin: isAdminRole(role),
    isSuperAdmin: role === 'super_admin',
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw normalizeAuthError(error, 'signin');
    },
    signUp: async (fullName, email, password, roleValue) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: roleValue,
            portal: 'fithub-admin',
          },
        },
      });

      if (error) throw normalizeAuthError(error, 'signup');
    },
    sendMagicLink: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw normalizeAuthError(error, 'magic_link');
    },
    requestPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=recovery`,
      });

      if (error) throw normalizeAuthError(error, 'reset');
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw normalizeAuthError(error, 'password');
    },
    updateProfile: async ({ email, fullName, phone, role: nextRole, preferences }) => {
      const safeRole = role === 'super_admin'
        ? nextRole
        : ((session?.user.app_metadata?.role ?? session?.user.user_metadata?.role ?? role) as UserRole);

      const metadata = {
        ...(session?.user.user_metadata ?? {}),
        full_name: fullName,
        phone: phone ?? '',
        role: safeRole,
        ...(preferences ?? {}),
      };

      const updates: Parameters<typeof supabase.auth.updateUser>[0] = {
        data: metadata,
      };

      if (email && email !== session?.user.email) {
        updates.email = email;
      }

      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw normalizeAuthError(error, 'profile');
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  }), [loading, role, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }

  return context;
}