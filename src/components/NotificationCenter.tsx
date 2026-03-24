import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildDashboardData } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useHotelData } from '../context/HotelDataContext';

type NotificationTone = 'info' | 'success' | 'warning' | 'danger';

type AppNotification = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  tone: NotificationTone;
  path?: string;
  actionLabel?: string;
};

const READ_KEY_PREFIX = 'fithub-notifications-read';
const HIDDEN_KEY_PREFIX = 'fithub-notifications-hidden';
const MAX_STORED_NOTIFICATION_IDS = 200;

const BellIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4a4 4 0 0 0-4 4v1.2c0 1.37-.46 2.7-1.3 3.78L5.5 14.5a1 1 0 0 0 .78 1.64h11.44a1 1 0 0 0 .78-1.64l-1.2-1.52A6.06 6.06 0 0 1 16 9.2V8a4 4 0 0 0-4-4zm0 16a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 20z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const parseStoredIds = (storageKey: string) => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [] as string[];
  }
};

const persistIds = (storageKey: string, values: string[]) => {
  const uniqueValues = Array.from(new Set(values));
  const trimmedValues = uniqueValues.slice(-MAX_STORED_NOTIFICATION_IDS);
  window.localStorage.setItem(storageKey, JSON.stringify(trimmedValues));
};

const startOfDayKey = (dateLike: string | Date) => new Date(dateLike).toISOString().slice(0, 10);

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { user, isSuperAdmin } = useAuth();
  const { data } = useHotelData();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const notificationsEnabled = Boolean(user?.user_metadata?.notificationsEnabled ?? true);
  const weeklyDigest = Boolean(user?.user_metadata?.weeklyDigest ?? false);
  const maintenanceMode = Boolean(user?.user_metadata?.maintenanceMode ?? false);
  const auditLog = Boolean(user?.user_metadata?.auditLog ?? true);

  const storageIdentity = user?.id ?? user?.email ?? 'anonymous';
  const readStorageKey = `${READ_KEY_PREFIX}:${storageIdentity}`;
  const hiddenStorageKey = `${HIDDEN_KEY_PREFIX}:${storageIdentity}`;

  const notifications = useMemo<AppNotification[]>(() => {
    if (!data) return [];

    const dashboard = buildDashboardData(data);
    const generated: AppNotification[] = [];
    const nowIso = new Date().toISOString();

    if (dashboard.pagosPendientes > 0) {
      generated.push({
        id: `admin-pending-payments-${dashboard.pagosPendientes}`,
        title: 'Hay reservas pendientes de cobro',
        detail: `${dashboard.pagosPendientes} reserva${dashboard.pagosPendientes === 1 ? '' : 's'} aún tienen saldo pendiente y requieren seguimiento.`,
        createdAt: nowIso,
        tone: 'warning',
        path: '/pagos',
        actionLabel: 'Abrir cobros',
      });
    }

    if (dashboard.habitacionesLlenas > 0) {
      generated.push({
        id: `admin-full-rooms-${dashboard.habitacionesLlenas}`,
        title: 'Hay habitaciones sin disponibilidad',
        detail: `${dashboard.habitacionesLlenas} unidad${dashboard.habitacionesLlenas === 1 ? '' : 'es'} ya alcanzaron su capacidad operativa.`,
        createdAt: nowIso,
        tone: 'danger',
        path: '/habitaciones',
        actionLabel: 'Ver inventario',
      });
    }

    if (dashboard.nuevosHuespedes > 0) {
      generated.push({
        id: `admin-new-guests-${dashboard.nuevosHuespedes}`,
        title: 'Se registraron nuevos huéspedes',
        detail: `${dashboard.nuevosHuespedes} huésped${dashboard.nuevosHuespedes === 1 ? '' : 'es'} se incorporaron en los últimos 30 días.`,
        createdAt: nowIso,
        tone: 'success',
        path: '/huespedes',
        actionLabel: 'Ver huéspedes',
      });
    }

    if (dashboard.recentActivity[0]) {
      generated.push({
        id: `admin-activity-${dashboard.recentActivity[0]}`,
        title: 'Actividad reciente detectada',
        detail: dashboard.recentActivity[0],
        createdAt: nowIso,
        tone: 'info',
        path: '/reservas',
        actionLabel: 'Abrir reservas',
      });
    }

    if (maintenanceMode) {
      generated.push({
        id: 'admin-maintenance-mode',
        title: 'Modo mantenimiento habilitado',
        detail: 'Se recomienda limitar cambios sensibles hasta finalizar la revisión operativa.',
        createdAt: nowIso,
        tone: 'info',
        path: '/perfil',
        actionLabel: 'Ver ajustes',
      });
    }

    if (weeklyDigest) {
      generated.push({
        id: `admin-digest-${startOfDayKey(new Date())}`,
        title: 'Resumen ejecutivo disponible',
        detail: `${dashboard.reservasHoy} reservas hoy, ${dashboard.huespedes} huéspedes registrados y retención actual del ${dashboard.retentionPercent}%.`,
        createdAt: nowIso,
        tone: 'info',
        path: '/',
        actionLabel: 'Ir al panel',
      });
    }

    if (isSuperAdmin && auditLog) {
      generated.push({
        id: 'super-admin-audit',
        title: 'Auditoría ampliada activa',
        detail: 'Los cambios críticos de accesos y perfiles elevados quedan marcados para seguimiento interno.',
        createdAt: nowIso,
        tone: 'success',
        path: '/accesos',
        actionLabel: 'Ver accesos',
      });
    }

    return generated.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [auditLog, data, isSuperAdmin, maintenanceMode, weeklyDigest]);

  useEffect(() => {
    setReadIds(parseStoredIds(readStorageKey));
    setHiddenIds(parseStoredIds(hiddenStorageKey));
  }, [hiddenStorageKey, readStorageKey]);

  useEffect(() => {
    persistIds(readStorageKey, readIds);
  }, [readIds, readStorageKey]);

  useEffect(() => {
    persistIds(hiddenStorageKey, hiddenIds);
  }, [hiddenIds, hiddenStorageKey]);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      if (!panelRef.current || panelRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const visibleNotifications = notifications.filter((item) => !hiddenIds.includes(item.id));
  const unreadCount = notificationsEnabled
    ? visibleNotifications.filter((item) => !readIds.includes(item.id)).length
    : 0;

  const markAsRead = (id: string) => {
    setReadIds((current) => (current.includes(id) ? current : [...current, id]));
  };

  const dismissNotification = (id: string) => {
    setHiddenIds((current) => (current.includes(id) ? current : [...current, id]));
    setReadIds((current) => (current.includes(id) ? current : [...current, id]));
  };

  const handleAction = (notification: AppNotification) => {
    markAsRead(notification.id);
    setOpen(false);
    if (notification.path) {
      navigate(notification.path);
    }
  };

  return (
    <div className="notification-center" ref={panelRef}>
      <button
        type="button"
        className={`notification-trigger ${open ? 'active' : ''} ${!notificationsEnabled ? 'paused' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label="Abrir notificaciones"
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 && <span className="notification-badge">{Math.min(unreadCount, 9)}{unreadCount > 9 ? '+' : ''}</span>}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-head">
            <div>
              <strong>Notificaciones</strong>
              <span>{notificationsEnabled ? `${unreadCount} sin leer` : 'Avisos pausados desde tu perfil'}</span>
            </div>
            {notificationsEnabled && visibleNotifications.length > 0 ? (
              <button type="button" className="notification-text-button" onClick={() => setReadIds(visibleNotifications.map((item) => item.id))}>
                Marcar todo
              </button>
            ) : (
              <button type="button" className="notification-text-button" onClick={() => { setOpen(false); navigate('/perfil'); }}>
                Ir a perfil
              </button>
            )}
          </div>

          {!notificationsEnabled ? (
            <div className="notification-empty-state">
              <strong>Las notificaciones directas están desactivadas.</strong>
              <p>Puedes reactivarlas desde tu perfil para volver a recibir avisos de reservas, pagos y operación.</p>
            </div>
          ) : loading ? (
            <div className="notification-empty-state">
              <strong>Cargando avisos...</strong>
              <p>Estamos calculando el estado más reciente de tus reservas y la operación.</p>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="notification-empty-state">
              <strong>No tienes alertas activas.</strong>
              <p>Cuando ocurra algo relevante en tu flujo aparecerá aquí.</p>
            </div>
          ) : (
            <div className="notification-list">
              {visibleNotifications.map((notification) => {
                const isRead = readIds.includes(notification.id);

                return (
                  <article key={notification.id} className={`notification-item ${notification.tone} ${isRead ? 'is-read' : 'is-unread'}`}>
                    <div className="notification-item-main">
                      <div className="notification-item-head">
                        <strong>{notification.title}</strong>
                        {!isRead && <span className="notification-dot" aria-hidden="true" />}
                      </div>
                      <p>{notification.detail}</p>
                      <span>{formatNotificationTime(notification.createdAt)}</span>
                    </div>
                    <div className="notification-item-actions">
                      {!isRead && (
                        <button type="button" className="notification-text-button" onClick={() => markAsRead(notification.id)}>
                          Leída
                        </button>
                      )}
                      {notification.path && notification.actionLabel && (
                        <button type="button" className="notification-text-button" onClick={() => handleAction(notification)}>
                          {notification.actionLabel}
                        </button>
                      )}
                      <button type="button" className="notification-text-button danger" onClick={() => dismissNotification(notification.id)}>
                        Ocultar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;