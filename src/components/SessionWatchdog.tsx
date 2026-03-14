import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_WINDOW_MS = 60 * 1000;

export const SessionWatchdog: React.FC = () => {
  const { signOut } = useAuth();
  const timeoutRef = useRef<number | null>(null);
  const warningTimeoutRef = useRef<number | null>(null);
  const [warningOpen, setWarningOpen] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.round(WARNING_WINDOW_MS / 1000));

  const resetTimers = useMemo(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) window.clearTimeout(warningTimeoutRef.current);

    const nextDeadline = Date.now() + WARNING_WINDOW_MS;

    warningTimeoutRef.current = window.setTimeout(() => {
      setDeadline(Date.now() + WARNING_WINDOW_MS);
      setWarningOpen(true);
    }, SESSION_TIMEOUT_MS - WARNING_WINDOW_MS);

    timeoutRef.current = window.setTimeout(() => {
      void signOut();
    }, SESSION_TIMEOUT_MS);

    setDeadline(nextDeadline);
  }, [signOut]);

  useEffect(() => {
    resetTimers();

    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const handleActivity = () => {
      setWarningOpen(false);
      resetTimers();
    };

    events.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) window.clearTimeout(warningTimeoutRef.current);
    };
  }, [resetTimers]);

  useEffect(() => {
    if (!warningOpen || !deadline) return undefined;

    const intervalId = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [deadline, warningOpen]);

  if (!warningOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => setWarningOpen(false)}>
      <div className="modal session-warning-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Tu sesión está por cerrarse</h3>
        <p className="muted">Detectamos inactividad. Si no haces nada, se cerrará la sesión automáticamente en {secondsLeft} segundo{secondsLeft === 1 ? '' : 's'}.</p>
        <div className="session-warning-actions">
          <button className="btn" onClick={() => { setWarningOpen(false); resetTimers(); }}>Seguir conectado</button>
          <button className="btn ghost" onClick={() => void signOut()}>Cerrar ahora</button>
        </div>
      </div>
    </div>
  );
};

export default SessionWatchdog;