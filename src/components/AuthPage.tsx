import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '../context/AuthContext';
import { consumeAccessInvitation, ensureClientProfile, validateAccessInvitation, type InvitationValidation } from '../lib/api';

type AuthMode = 'login' | 'register' | 'forgot' | 'recovery';

export const AuthPage: React.FC = () => {
  const location = useLocation();
  const { session, loading, signIn, signUp, sendMagicLink, requestPasswordReset, updatePassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [role, setRole] = useState<UserRole>('client');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchMode = useMemo(() => new URLSearchParams(location.search).get('mode'), [location.search]);
  const inviteToken = useMemo(() => new URLSearchParams(location.search).get('invite'), [location.search]);
  const isRecoveryLink = searchMode === 'recovery' || location.hash.includes('type=recovery');
  const [invitation, setInvitation] = useState<InvitationValidation | null>(null);
  const [checkingInvitation, setCheckingInvitation] = useState(false);
  const isInvitationRegister = mode === 'register' && Boolean(inviteToken) && invitation?.status === 'pending';

  useEffect(() => {
    if (isRecoveryLink) {
      setMode('recovery');
      setError(null);
      setMessage('Define una nueva contraseña para completar la recuperación.');
    }
  }, [isRecoveryLink]);

  useEffect(() => {
    if (!inviteToken) {
      setInvitation(null);
      return;
    }

    let active = true;

    const loadInvitation = async () => {
      setCheckingInvitation(true);
      try {
        const nextInvitation = await validateAccessInvitation(inviteToken);
        if (!active) return;

        setInvitation(nextInvitation);

        if (!nextInvitation) {
          setError('La invitación no existe o ya no está disponible.');
          return;
        }

        if (nextInvitation.status !== 'pending') {
          setError('La invitación ya no está activa. Solicita una nueva al super admin.');
          return;
        }

        setMode('register');
        setEmail(nextInvitation.email);
        setFullName(nextInvitation.fullName ?? '');
        setRole(nextInvitation.role);
        setMessage(`Invitación activa para ${nextInvitation.email}. Completa tu registro para activar el acceso ${nextInvitation.role}.`);
        setError(null);
      } catch (invitationError) {
        if (!active) return;
        setError(invitationError instanceof Error ? invitationError.message : 'No se pudo validar la invitación.');
      } finally {
        if (active) {
          setCheckingInvitation(false);
        }
      }
    };

    void loadInvitation();

    return () => {
      active = false;
    };
  }, [inviteToken]);

  if (!loading && session && mode !== 'recovery') {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else if (mode === 'register') {
        const signupRole = isInvitationRegister ? invitation?.role ?? 'trainer' : 'client';
        await signUp(fullName, email, password, signupRole);

        if (inviteToken && isInvitationRegister) {
          await consumeAccessInvitation(inviteToken, email, fullName);
          setMessage('Cuenta invitada creada. Revisa tu correo para confirmar el acceso y luego inicia sesión.');
        } else {
          await ensureClientProfile({ nombre: fullName, correo: email, fechaNacimiento: birthDate });
          setMessage('Cuenta de cliente creada. Revisa tu correo para confirmar el acceso y luego inicia sesión.');
        }
      } else if (mode === 'forgot') {
        await requestPasswordReset(email);
        setMessage('Te enviamos un enlace para restablecer tu contraseña.');
      } else {
        if (password.length < 8) {
          throw new Error('La nueva contraseña debe tener al menos 8 caracteres.');
        }

        if (password !== confirmPassword) {
          throw new Error('Las contraseñas no coinciden.');
        }

        await updatePassword(password);
        setMessage('Contraseña actualizada. Ya puedes iniciar sesión con la nueva clave.');
        setMode('login');
        setConfirmPassword('');
        setPassword('');
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'No fue posible completar la autenticación.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError('Escribe tu correo antes de solicitar el enlace mágico.');
      setMessage(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await sendMagicLink(email);
      setMessage('Te enviamos un enlace mágico de acceso a tu correo.');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'No fue posible enviar el enlace mágico.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-gradient" aria-hidden="true" />
      <div className="auth-noise" aria-hidden="true" />

      <main className="auth-layout">
        <section className="auth-copy-card">
          <span className="auth-kicker">Portal FitHub</span>
          <h1>Acceso unificado para clientes, entrenadores, admins y super admins.</h1>
          <p>
            Inicia sesión, crea tu cuenta de cliente, acepta una invitación segura o recupera tu contraseña desde un solo acceso.
          </p>

          <div className="auth-feature-list">
            <article className="auth-feature-item">
              <strong>Inicio seguro</strong>
              <span>Correo y contraseña para sesiones persistentes del panel.</span>
            </article>
            <article className="auth-feature-item">
              <strong>Registro de clientes</strong>
              <span>El alta pública crea cuentas de cliente; entrenadores, admins y super admins se activan mediante invitación segura.</span>
            </article>
            <article className="auth-feature-item">
              <strong>Enlace mágico</strong>
              <span>Opción de acceso inmediato sin escribir contraseña en ese momento.</span>
            </article>
            <article className="auth-feature-item">
              <strong>Recuperación simple</strong>
              <span>Restablece tu contraseña desde un enlace enviado directamente a tu correo.</span>
            </article>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-panel-head">
            <div>
              <span className="auth-kicker">FitHub Admin</span>
              <h2>{mode === 'login' ? 'Iniciar sesión' : mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Olvidé mi contraseña' : 'Nueva contraseña'}</h2>
            </div>

            <div className="auth-tabs" role="tablist" aria-label="Modo de autenticación">
              <button type="button" className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(null); setMessage(null); }}>
                Login
              </button>
              <button type="button" className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(null); setMessage(null); }}>
                Register
              </button>
              <button type="button" className={`auth-tab ${mode === 'forgot' || mode === 'recovery' ? 'active' : ''}`} onClick={() => { setMode('forgot'); setError(null); setMessage(null); }}>
                Reset
              </button>
            </div>
          </div>

          <form key={mode} className="auth-form auth-form-stage" onSubmit={handleSubmit}>
            {checkingInvitation && <div className="auth-feedback success">Validando invitación...</div>}

            {mode === 'register' && (
              <>
                <label className="auth-field">
                  <span>Nombre completo</span>
                  <input
                    className="input"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Mariana Rivera"
                    required
                  />
                </label>

                {isInvitationRegister ? (
                  <div className="auth-field">
                    <span>Rol asignado por invitación</span>
                    <div className="auth-feedback success">{role === 'super_admin' ? 'Super admin' : role === 'admin' ? 'Admin' : role === 'trainer' ? 'Entrenador' : 'Cliente'}</div>
                  </div>
                ) : (
                  <>
                    <div className="auth-field">
                      <span>Rol inicial</span>
                      <div className="auth-feedback success">Cliente</div>
                    </div>
                    <label className="auth-field">
                      <span>Fecha de nacimiento</span>
                      <input
                        className="input"
                        type="date"
                        value={birthDate}
                        onChange={(event) => setBirthDate(event.target.value)}
                        required
                      />
                    </label>
                  </>
                )}
              </>
            )}

            <label className="auth-field">
              <span>Correo</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@fithub.admin"
                required={mode !== 'recovery'}
                disabled={mode === 'recovery' || isInvitationRegister}
              />
            </label>

            <label className="auth-field">
              <span>{mode === 'recovery' ? 'Nueva contraseña' : 'Contraseña'}</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required={mode !== 'forgot'}
              />
            </label>

            {mode === 'recovery' && (
              <label className="auth-field">
                <span>Confirmar contraseña</span>
                <input
                  className="input"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>
            )}

            {(error || message) && (
              <div className={`auth-feedback ${error ? 'error' : 'success'}`}>
                {error ?? message}
              </div>
            )}

            <div className="auth-actions">
              <button className="btn auth-submit" type="submit" disabled={submitting}>
                {submitting ? 'Procesando...' : mode === 'login' ? 'Entrar al panel' : mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar enlace de recuperación' : 'Actualizar contraseña'}
              </button>
              {mode === 'login' && (
                <>
                  <button className="btn ghost auth-magic" type="button" onClick={handleMagicLink} disabled={submitting}>
                    Enviar enlace mágico
                  </button>
                  <button className="auth-text-link" type="button" onClick={() => { setMode('forgot'); setError(null); setMessage(null); }} disabled={submitting}>
                    Olvidé mi contraseña
                  </button>
                </>
              )}
              {mode === 'forgot' && (
                <button className="auth-text-link" type="button" onClick={() => { setMode('login'); setError(null); setMessage(null); }} disabled={submitting}>
                  Volver al login
                </button>
              )}
              {mode === 'recovery' && (
                <button className="auth-text-link" type="button" onClick={() => { setMode('login'); setError(null); setMessage(null); }} disabled={submitting}>
                  Ir al login
                </button>
              )}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
};

export default AuthPage;