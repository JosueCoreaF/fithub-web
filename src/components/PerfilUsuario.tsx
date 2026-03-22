import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncProfilePersona } from '../lib/api';
import { useHotelData } from '../context/HotelDataContext';
import EditableEntityImage from './EditableEntityImage';

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() ?? '';

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
};

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, onChange }) => (
  <label className="profile-toggle-row">
    <div>
      <strong>{label}</strong>
      <span>{description}</span>
    </div>
    <button type="button" className={`profile-toggle ${checked ? 'active' : ''}`} onClick={onChange} aria-pressed={checked}>
      <span />
    </button>
  </label>
);

export const PerfilUsuario: React.FC = () => {
  const { user, role, isAdmin, isSuperAdmin, signOut, updateProfile } = useAuth();
  const { data, refresh } = useHotelData();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? 'Mariana Rivera');
  const [email, setEmail] = useState(user?.email ?? 'mariana.rivera@fithub.admin');
  const [phone, setPhone] = useState((user?.user_metadata?.phone as string | undefined) ?? '+504 9988-2211');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [street, setStreet] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(Boolean(user?.user_metadata?.notificationsEnabled ?? true));
  const [weeklyDigest, setWeeklyDigest] = useState(Boolean(user?.user_metadata?.weeklyDigest ?? false));
  const [maintenanceMode, setMaintenanceMode] = useState(Boolean(user?.user_metadata?.maintenanceMode ?? false));
  const [auditLog, setAuditLog] = useState(Boolean(user?.user_metadata?.auditLog ?? true));
  const [selectedRole, setSelectedRole] = useState(role);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setFullName(user.user_metadata.full_name as string);
    }

    if (user?.email) {
      setEmail(user.email);
    }

    if (typeof user?.user_metadata?.phone === 'string') {
      setPhone(user.user_metadata.phone as string);
    }

    setNotificationsEnabled(Boolean(user?.user_metadata?.notificationsEnabled ?? true));
    setWeeklyDigest(Boolean(user?.user_metadata?.weeklyDigest ?? false));
    setMaintenanceMode(Boolean(user?.user_metadata?.maintenanceMode ?? false));
    setAuditLog(Boolean(user?.user_metadata?.auditLog ?? true));
    setSelectedRole(role);
  }, [role, user]);

  const linkedPerson = data
    ? data.personas.find((item) => normalizeEmail(item.correo) === normalizeEmail(email || user?.email))
      ?? data.personas.find((item) => normalizeEmail(item.correo) === normalizeEmail(user?.email))
      ?? null
    : null;

  useEffect(() => {
    if (!data || !linkedPerson) return;

    const person = linkedPerson;

    if (person?.nombre) {
      setFullName((current: string) => current || person.nombre);
    }

    const phoneRow = person ? data.personas.find((item) => item.id_persona === person.id_persona) : null;
    const linkedPhone = person ? data.huespedesView.find((item) => item.id === person.id_persona)?.telefono : null;

    if (linkedPhone) {
      setPhone(linkedPhone);
    } else if (phoneRow && user?.user_metadata?.phone) {
      setPhone(user.user_metadata.phone as string);
    }

    if (person) {
      setCity(person.direccion_ciudad ?? '');
      setNeighborhood(person.direccion_colonia ?? '');
      setStreet(person.direccion_calle ?? '');
    }
  }, [data, linkedPerson, user]);
  const profileImageId = user?.id ?? user?.email ?? 'anonymous-profile';

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSave = async () => {
    if (!user?.email) return;

    setSaving(true);
    setFeedback(null);
    setSaveError(null);

    try {
      await updateProfile({
        email,
        fullName,
        phone,
        role: isSuperAdmin ? selectedRole : role,
        preferences: {
          notificationsEnabled,
          weeklyDigest,
          maintenanceMode,
          auditLog,
        },
      });

      await syncProfilePersona(user.email, {
        nombre: fullName,
        correo: email,
        telefono: phone,
        ciudad: city,
        colonia: neighborhood,
        calle: street,
      });

      await refresh();
      setFeedback(email !== user.email ? 'Perfil guardado. Si cambiaste el correo, revisa tu bandeja para confirmarlo.' : 'Perfil actualizado correctamente.');
    } catch (profileError) {
      setSaveError(profileError instanceof Error ? profileError.message : 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = role === 'super_admin' ? 'Super admin' : role === 'admin' ? 'Admin' : 'Acceso interno';
  const profileBadge = isSuperAdmin ? 'Perfil de super admin' : isAdmin ? 'Perfil administrativo' : 'Perfil interno';
  const profileDescription = 'Gestiona tu identidad, preferencias y ajustes internos desde un solo lugar.';

  return (
    <div className="page profile-page">
      <header className="dashboard-header profile-header">
        <div>
          <span className="profile-admin-badge">{profileBadge}</span>
          <h2>Perfil de usuario</h2>
          <p className="muted">{profileDescription}</p>
        </div>
        <div className="profile-header-actions">
          <button className="btn ghost" onClick={handleSignOut}>Cerrar sesión</button>
          <button className="btn" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
        </div>
      </header>

      {(feedback || saveError) && (
        <div className={`profile-feedback ${saveError ? 'error' : 'success'}`}>
          {saveError ?? feedback}
        </div>
      )}

      <section className="profile-hero-grid">
        <article className="card profile-hero-card">
          <div className="profile-avatar-block">
            <EditableEntityImage
              kind="profile"
              entityId={profileImageId}
              alt={`Foto de ${fullName}`}
              fallback={fullName.slice(0, 2).toUpperCase()}
              variant="profile"
              className="profile-image-editor"
            />
            <div className="profile-avatar-copy">
              <span className="profile-kicker">{isAdmin ? 'Cuenta administrativa' : 'Cuenta profesional'}</span>
              <h3>{fullName}</h3>
              <p>FitHub Central, Tegucigalpa</p>
            </div>
          </div>

          <div className="profile-hero-meta">
            <div className="profile-meta-pill">
              <strong>Último acceso</strong>
              <span>Hoy, 08:24 a. m.</span>
            </div>
            <div className="profile-meta-pill">
              <strong>Rol</strong>
              <span>{roleLabel}</span>
            </div>
            <div className="profile-meta-pill">
              <strong>{isSuperAdmin ? 'Gobernanza' : 'Estado'}</strong>
              <span>{isSuperAdmin ? 'Control global habilitado' : 'Sesion protegida'}</span>
            </div>
          </div>
        </article>

        <article className="card profile-summary-card">
          {isAdmin && (
            <div className="profile-admin-note">
              <strong>Acceso restringido</strong>
              <span>Esta vista habilita bloques internos adicionales para usuarios con rol administrativo.</span>
            </div>
          )}
          <div className="profile-summary-item">
            <span>Areas bajo control</span>
            <strong>{isSuperAdmin ? '7 modulos' : isAdmin ? '6 modulos' : '1 modulo'}</strong>
          </div>
          <div className="profile-summary-item">
            <span>Alertas criticas</span>
            <strong>{isSuperAdmin ? '3 pendientes' : isAdmin ? '2 pendientes' : '0 pendientes'}</strong>
          </div>
          <div className="profile-summary-item">
            <span>Sincronizacion</span>
            <strong>Operativa</strong>
          </div>
        </article>
      </section>

      <section className="profile-content-grid">
        <article className="card profile-section-card">
          <div className="profile-section-head">
            <span className="profile-kicker">Identidad</span>
            <h3>Datos del perfil</h3>
          </div>

          <div className="profile-form-grid">
            <label className="profile-field">
              <span>Nombre completo</span>
              <input className="input" value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>
            <label className="profile-field">
              <span>Correo</span>
              <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="profile-field profile-field-full">
              <span>Teléfono</span>
              <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <label className="profile-field">
              <span>Ciudad</span>
              <input className="input" value={city} onChange={(event) => setCity(event.target.value)} />
            </label>
            <label className="profile-field">
              <span>Colonia</span>
              <input className="input" value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} />
            </label>
            <label className="profile-field profile-field-full">
              <span>Calle</span>
              <input className="input" value={street} onChange={(event) => setStreet(event.target.value)} />
            </label>
            {isSuperAdmin ? (
              <label className="profile-field profile-field-full">
                <span>Rol visible en la app</span>
                <select className="input" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as typeof role)}>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super admin</option>
                </select>
              </label>
            ) : (
              <label className="profile-field profile-field-full">
                <span>Rol actual</span>
                <input className="input" value={roleLabel} readOnly />
              </label>
            )}
          </div>
          <p className="muted profile-role-note">{isSuperAdmin ? 'Como super admin puedes ajustar tu rol visible, pero los cambios sobre otros usuarios deben hacerse desde el modulo de accesos.' : 'Tu rol ya no se puede modificar desde perfil. Solo un super admin puede reasignarlo desde el modulo de accesos.'}</p>
        </article>

        <article className="card profile-section-card">
          <div className="profile-section-head">
            <span className="profile-kicker">Preferencias</span>
            <h3>Experiencia y avisos</h3>
          </div>

          <div className="profile-toggle-list">
            <ToggleRow
              label="Notificaciones directas"
              description="Activa el centro de notificaciones superior con avisos críticos sobre reservas, pagos y operación."
              checked={notificationsEnabled}
              onChange={() => setNotificationsEnabled((value) => !value)}
            />
            <ToggleRow
              label="Resumen semanal"
              description="Añade una tarjeta de resumen semanal con métricas clave dentro del centro de notificaciones."
              checked={weeklyDigest}
              onChange={() => setWeeklyDigest((value) => !value)}
            />
          </div>
        </article>

        <article className="card profile-section-card">
          <div className="profile-section-head">
            <span className="profile-kicker">Seguridad</span>
            <h3>Acceso y protección</h3>
          </div>

          <div className="profile-security-list">
            <div className="profile-security-item">
              <strong>Autenticación en dos pasos</strong>
              <span>Activa y vinculada al dispositivo principal.</span>
            </div>
            <div className="profile-security-item">
              <strong>Sesiones activas</strong>
              <span>Cierre automático por inactividad activo después de 15 minutos sin uso.</span>
            </div>
            <div className="profile-security-item">
              <strong>Rotación de contraseña</strong>
              <span>Último cambio hace 21 días.</span>
            </div>
          </div>
        </article>

        <article className="card profile-section-card profile-section-card-wide">
          <div className="profile-section-head">
            <span className="profile-kicker">Ajustes internos</span>
            <h3>Operacion avanzada</h3>
          </div>

          <div className="profile-toggle-list">
            <ToggleRow
              label="Modo mantenimiento"
              description="Pausa acciones sensibles del panel mientras se revisa la operacion interna."
              checked={maintenanceMode}
              onChange={() => setMaintenanceMode((value) => !value)}
            />
            <ToggleRow
              label="Registro de auditoria ampliado"
              description="Guarda detalle extendido de movimientos administrativos y cambios criticos."
              checked={auditLog}
              onChange={() => setAuditLog((value) => !value)}
            />
          </div>
        </article>
      </section>
    </div>
  );
};

export default PerfilUsuario;