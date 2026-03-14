import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildDashboardData } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useGymData } from '../context/GymDataContext';

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

const formatNotificationTime = (value: string) => new Date(value).toLocaleString('es-HN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const hoursUntil = (value: string) => (new Date(value).getTime() - Date.now()) / 3_600_000;

const daysUntil = (value: string) => (new Date(value).getTime() - Date.now()) / 86_400_000;

const startOfDayKey = (dateLike: string | Date) => new Date(dateLike).toISOString().slice(0, 10);

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { user, role, isClient, isTrainer, isSuperAdmin } = useAuth();
  const { data, loading } = useGymData();
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
    if (!data || !user?.email) return [];

    const dashboard = buildDashboardData(data);
    const generated: AppNotification[] = [];
    const nowIso = new Date().toISOString();

    if (isClient) {
      const person = data.personas.find((item) => item.correo?.toLowerCase() === user.email?.toLowerCase()) ?? null;
      const memberProfile = person ? data.miembrosView.find((item) => item.id === person.id_persona) ?? null : null;
      const reservations = person
        ? data.reservasView
          .filter((item) => item.clienteId === person.id_persona)
          .slice()
          .sort((left, right) => new Date(left.fecha).getTime() - new Date(right.fecha).getTime())
        : [];
      const upcomingReservation = reservations.find((item) => item.estado !== 'cancelada' && new Date(item.fecha).getTime() >= Date.now()) ?? null;
      const cancelledReservation = reservations
        .slice()
        .reverse()
        .find((item) => item.estado === 'cancelada' && daysUntil(item.fecha) >= -14);
      const latestPayment = memberProfile?.pagos
        .slice()
        .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime())[0] ?? null;

      if (upcomingReservation && hoursUntil(upcomingReservation.fecha) <= 24) {
        generated.push({
          id: `client-next-${upcomingReservation.id}`,
          title: 'Tu próxima reserva está cerca',
          detail: `${upcomingReservation.servicio} inicia el ${formatNotificationTime(upcomingReservation.fecha)} en ${upcomingReservation.sede}.`,
          createdAt: upcomingReservation.fecha,
          tone: hoursUntil(upcomingReservation.fecha) <= 4 ? 'warning' : 'info',
          path: '/reservas',
          actionLabel: 'Ver reserva',
        });
      }

      if (cancelledReservation) {
        generated.push({
          id: `client-cancelled-${cancelledReservation.id}`,
          title: 'Una reserva fue cancelada',
          detail: `${cancelledReservation.servicio} ya no sigue activa. Revisa otras sesiones disponibles para reagendarte.`,
          createdAt: cancelledReservation.fecha,
          tone: 'danger',
          path: '/reservas',
          actionLabel: 'Buscar otra sesión',
        });
      }

      if (memberProfile?.fechaVencimiento) {
        const daysRemaining = Math.ceil(daysUntil(memberProfile.fechaVencimiento));

        if (daysRemaining < 0) {
          generated.push({
            id: `client-membership-expired-${memberProfile.id}`,
            title: 'Tu membresía venció',
            detail: 'Tu plan ya no está activo. Actualiza tu perfil o consulta administración para renovarlo.',
            createdAt: memberProfile.fechaVencimiento,
            tone: 'danger',
            path: '/perfil',
            actionLabel: 'Ver perfil',
          });
        } else if (daysRemaining <= 7) {
          generated.push({
            id: `client-membership-due-${memberProfile.id}`,
            title: 'Tu membresía está por vencer',
            detail: `Quedan ${daysRemaining} día${daysRemaining === 1 ? '' : 's'} de vigencia para tu plan ${memberProfile.plan}.`,
            createdAt: memberProfile.fechaVencimiento,
            tone: daysRemaining <= 3 ? 'danger' : 'warning',
            path: '/perfil',
            actionLabel: 'Revisar vigencia',
          });
        }
      }

      if (latestPayment && daysUntil(latestPayment.fecha) >= -7) {
        generated.push({
          id: `client-payment-${latestPayment.id}`,
          title: 'Pago registrado correctamente',
          detail: `Se acreditó ${latestPayment.monto.toFixed(2)} USD con referencia ${latestPayment.referencia}.`,
          createdAt: latestPayment.fecha,
          tone: 'success',
          path: '/perfil',
          actionLabel: 'Ver actividad',
        });
      }

      if (!upcomingReservation && memberProfile?.estado === 'Activo') {
        generated.push({
          id: `client-open-slot-${memberProfile.id}`,
          title: 'Tienes disponibilidad para reservar',
          detail: 'No detectamos sesiones próximas. Puedes apartar una clase desde tu módulo de reservas.',
          createdAt: nowIso,
          tone: 'info',
          path: '/reservas',
          actionLabel: 'Reservar ahora',
        });
      }

      if (weeklyDigest) {
        generated.push({
          id: `client-digest-${startOfDayKey(new Date())}`,
          title: 'Resumen semanal listo',
          detail: `Tienes ${reservations.filter((item) => item.estado !== 'cancelada').length} reservas históricas y ${memberProfile?.pagos.length ?? 0} pagos registrados.`,
          createdAt: nowIso,
          tone: 'info',
          path: '/perfil',
          actionLabel: 'Abrir perfil',
        });
      }
    } else if (isTrainer) {
      const trainerPersona = data.personas.find((item) => item.correo?.toLowerCase() === user.email?.toLowerCase()) ?? null;
      const trainerProfile = trainerPersona ? data.entrenadoresView.find((item) => item.id === trainerPersona.id_persona) ?? null : null;
      const todayKey = startOfDayKey(new Date());
      const schedule = trainerProfile?.schedule.slice().sort((left, right) => new Date(left.horario).getTime() - new Date(right.horario).getTime()) ?? [];
      const todayReservations = trainerProfile
        ? data.reservasView.filter((item) => item.entrenador === trainerProfile.nombre && startOfDayKey(item.fecha) === todayKey)
        : [];
      const nextSession = schedule.find((item) => new Date(item.horario).getTime() >= Date.now()) ?? null;
      const pendingToday = todayReservations.filter((item) => item.estado === 'creada').length;
      const cancelledToday = todayReservations.filter((item) => item.estado === 'cancelada').length;

      if (!trainerProfile) {
        generated.push({
          id: 'trainer-profile-missing',
          title: 'Tu perfil profesional no está enlazado',
          detail: 'No encontramos coincidencia entre tu correo y un entrenador activo. Esto puede afectar agenda y seguimiento.',
          createdAt: nowIso,
          tone: 'warning',
          path: '/perfil',
          actionLabel: 'Revisar perfil',
        });
      }

      if (nextSession && hoursUntil(nextSession.horario) <= 2) {
        generated.push({
          id: `trainer-next-${nextSession.id}`,
          title: 'Tu siguiente bloque está por iniciar',
          detail: `${nextSession.actividad} comienza el ${formatNotificationTime(nextSession.horario)} en ${nextSession.sede}.`,
          createdAt: nextSession.horario,
          tone: hoursUntil(nextSession.horario) <= 1 ? 'warning' : 'info',
          path: '/reservas',
          actionLabel: 'Abrir agenda',
        });
      }

      if (pendingToday > 0) {
        generated.push({
          id: `trainer-pending-${todayKey}`,
          title: 'Reservas pendientes para hoy',
          detail: `${pendingToday} reserva${pendingToday === 1 ? '' : 's'} de tu jornada siguen sin confirmación final.`,
          createdAt: nowIso,
          tone: 'warning',
          path: '/reservas',
          actionLabel: 'Gestionar agenda',
        });
      }

      if (cancelledToday > 0) {
        generated.push({
          id: `trainer-cancelled-${todayKey}`,
          title: 'Hubo cancelaciones en tu turno',
          detail: `${cancelledToday} sesión${cancelledToday === 1 ? '' : 'es'} vinculadas a hoy fueron canceladas o reagendadas.`,
          createdAt: nowIso,
          tone: 'danger',
          path: '/reservas',
          actionLabel: 'Ver cambios',
        });
      }

      if (weeklyDigest) {
        generated.push({
          id: `trainer-digest-${todayKey}`,
          title: 'Resumen de carga semanal',
          detail: `Tu agenda registra ${schedule.length} bloque${schedule.length === 1 ? '' : 's'} activos y ${todayReservations.length} reservas para hoy.`,
          createdAt: nowIso,
          tone: 'info',
          path: '/reservas',
          actionLabel: 'Revisar agenda',
        });
      }
    } else {
      if (dashboard.pagosPendientes > 0) {
        generated.push({
          id: `admin-pending-payments-${dashboard.pagosPendientes}`,
          title: 'Hay reservas pendientes de pago',
          detail: `${dashboard.pagosPendientes} reserva${dashboard.pagosPendientes === 1 ? '' : 's'} siguen en estado creada y requieren seguimiento.`,
          createdAt: nowIso,
          tone: 'warning',
          path: '/pagos',
          actionLabel: 'Abrir pagos',
        });
      }

      if (dashboard.clasesLlenas > 0) {
        generated.push({
          id: `admin-full-classes-${dashboard.clasesLlenas}`,
          title: 'Hay clases al límite de capacidad',
          detail: `${dashboard.clasesLlenas} servicio${dashboard.clasesLlenas === 1 ? '' : 's'} ya alcanzaron el cupo máximo definido.`,
          createdAt: nowIso,
          tone: 'danger',
          path: '/servicios',
          actionLabel: 'Ver servicios',
        });
      }

      if (dashboard.nuevosMiembros > 0) {
        generated.push({
          id: `admin-new-members-${dashboard.nuevosMiembros}`,
          title: 'Ingresaron nuevos miembros',
          detail: `${dashboard.nuevosMiembros} miembro${dashboard.nuevosMiembros === 1 ? '' : 's'} se registraron en los últimos 30 días.`,
          createdAt: nowIso,
          tone: 'success',
          path: '/miembros',
          actionLabel: 'Ver miembros',
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
          detail: `${dashboard.reservasHoy} reservas hoy, ${dashboard.members} miembros y retención actual del ${dashboard.retentionPercent}%.`,
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
    }

    return generated.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [auditLog, data, isClient, isSuperAdmin, isTrainer, maintenanceMode, role, user?.email, weeklyDigest]);

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