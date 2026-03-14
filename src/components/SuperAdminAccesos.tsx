import React, { useEffect, useMemo, useState } from 'react';
import { assignAccessRole, createAccessInvitation, fetchAccessAudit, fetchAccessInvitations, fetchAccessProfiles, type AccessAuditEntry, type AccessInvitation, type AccessProfile } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const roleOptions: Array<{ value: AccessProfile['role']; label: string }> = [
  { value: 'trainer', label: 'Entrenador' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super admin' },
];

const roleLabel = (role: AccessProfile['role']) => role === 'super_admin' ? 'Super admin' : role === 'admin' ? 'Admin' : 'Entrenador';

const profileTypeLabel: Record<string, string> = {
  cliente: 'Cliente',
  entrenador: 'Entrenador',
  cliente_y_entrenador: 'Cliente y entrenador',
  persona: 'Persona',
  sin_enlace: 'Sin enlace',
};

const formatLastAccess = (value: string | null) => {
  if (!value) return 'Sin acceso reciente';
  return new Date(value).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' });
};

const formatAuditAction = (value: string) => {
  if (value === 'invite_created') return 'Invitación creada';
  if (value === 'invite_accepted') return 'Invitación aceptada';
  if (value === 'role_changed') return 'Rol modificado';
  return value;
};

export const SuperAdminAccesos: React.FC = () => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [auditEntries, setAuditEntries] = useState<AccessAuditEntry[]>([]);
  const [invitations, setInvitations] = useState<AccessInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AccessProfile['role']>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, AccessProfile['role']>>({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteRole, setInviteRole] = useState<AccessProfile['role']>('trainer');
  const [inviting, setInviting] = useState(false);

  const loadProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextProfiles, nextAudit, nextInvitations] = await Promise.all([
        fetchAccessProfiles(),
        fetchAccessAudit(),
        fetchAccessInvitations(),
      ]);
      setProfiles(nextProfiles);
      setAuditEntries(nextAudit);
      setInvitations(nextInvitations);
      setDraftRoles(Object.fromEntries(nextProfiles.map((profile) => [profile.userId, profile.role])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los accesos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      const matchesRole = roleFilter === 'all' || profile.role === roleFilter;
      const matchesQuery = !normalizedQuery
        || profile.email.toLowerCase().includes(normalizedQuery)
        || profile.fullName.toLowerCase().includes(normalizedQuery)
        || (profile.personaNombre ?? '').toLowerCase().includes(normalizedQuery);

      return matchesRole && matchesQuery;
    });
  }, [profiles, query, roleFilter]);

  const summary = useMemo(() => ({
    total: profiles.length,
    superAdmins: profiles.filter((profile) => profile.role === 'super_admin').length,
    admins: profiles.filter((profile) => profile.role === 'admin').length,
    linked: profiles.filter((profile) => profile.personaId).length,
  }), [profiles]);

  const activeInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.status === 'pending'),
    [invitations],
  );

  const handleAssignRole = async (profile: AccessProfile) => {
    const nextRole = draftRoles[profile.userId] ?? profile.role;

    if (nextRole === profile.role) return;

    setSavingId(profile.userId);
    setFeedback(null);
    setError(null);

    try {
      await assignAccessRole(profile.userId, nextRole);
      await loadProfiles();
      setFeedback(`Rol actualizado para ${profile.email}. Si esa persona ya estaba conectada, debe refrescar sesión para ver el cambio.`);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'No se pudo actualizar el rol.');
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviting(true);
    setFeedback(null);
    setError(null);

    try {
      const invitation = await createAccessInvitation({
        email: inviteEmail,
        fullName: inviteFullName,
        role: inviteRole,
      });
      await loadProfiles();
      const inviteUrl = `${window.location.origin}/auth?mode=register&invite=${invitation.inviteToken}`;
      setFeedback(`Invitación creada para ${invitation.email}. Comparte este enlace: ${inviteUrl}`);
      setInviteEmail('');
      setInviteFullName('');
      setInviteRole('trainer');
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'No se pudo crear la invitación.');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="page super-admin-page">
      <header className="dashboard-header super-admin-header">
        <div>
          <span className="trainers-eyebrow">Super admin</span>
          <h2>Control de accesos y roles</h2>
          <p className="muted">Este módulo consume funciones SQL restringidas para listar usuarios de Auth y reasignar roles de forma centralizada.</p>
        </div>
      </header>

      {(feedback || error) && (
        <div className={`profile-feedback ${error ? 'error' : 'success'}`}>
          {error ?? feedback}
        </div>
      )}

      <section className="super-admin-summary-grid">
        <article className="card super-admin-summary-card"><span>Cuentas detectadas</span><strong>{summary.total}</strong></article>
        <article className="card super-admin-summary-card"><span>Super admins</span><strong>{summary.superAdmins}</strong></article>
        <article className="card super-admin-summary-card"><span>Admins</span><strong>{summary.admins}</strong></article>
        <article className="card super-admin-summary-card"><span>Invitaciones activas</span><strong>{activeInvitations.length}</strong></article>
      </section>

      <section className="super-admin-top-grid">
        <article className="card super-admin-invite-card">
          <div className="super-admin-section-head">
            <div>
              <span className="trainers-eyebrow">Invitaciones</span>
              <h3>Crear acceso nuevo</h3>
            </div>
          </div>
          <form className="super-admin-invite-form" onSubmit={handleCreateInvitation}>
            <input className="input" type="email" placeholder="correo@dominio.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required />
            <input className="input" placeholder="Nombre completo" value={inviteFullName} onChange={(event) => setInviteFullName(event.target.value)} />
            <select className="input" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as AccessProfile['role'])}>
              {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button className="btn" type="submit" disabled={inviting}>{inviting ? 'Creando...' : 'Crear invitación'}</button>
          </form>
          <div className="super-admin-invitation-list">
            {activeInvitations.slice(0, 4).map((invitation) => (
              <article key={invitation.id} className="super-admin-invitation-item">
                <strong>{invitation.email}</strong>
                <span>{roleLabel(invitation.role)} · vence {formatLastAccess(invitation.expiresAt)}</span>
              </article>
            ))}
            {activeInvitations.length === 0 && <p className="muted">No hay invitaciones pendientes.</p>}
          </div>
        </article>

        <article className="card super-admin-audit-card">
          <div className="super-admin-section-head">
            <div>
              <span className="trainers-eyebrow">Auditoría</span>
              <h3>Últimos movimientos</h3>
            </div>
          </div>
          <div className="super-admin-audit-list">
            {auditEntries.slice(0, 6).map((entry) => (
              <article key={entry.id} className="super-admin-audit-item">
                <strong>{formatAuditAction(entry.action)}</strong>
                <span>{entry.targetEmail ?? 'Sin correo'}{entry.nextRole ? ` · ${entry.nextRole}` : ''}</span>
                <span>{entry.actorEmail ?? 'Sistema'} · {formatLastAccess(entry.createdAt)}</span>
              </article>
            ))}
            {auditEntries.length === 0 && <p className="muted">Todavía no hay trazas de accesos.</p>}
          </div>
        </article>
      </section>

      <section className="card super-admin-toolbar-card">
        <div className="super-admin-toolbar">
          <input className="input" placeholder="Buscar por nombre o correo" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select className="input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | AccessProfile['role'])}>
            <option value="all">Todos los roles</option>
            <option value="trainer">Entrenadores</option>
            <option value="admin">Admins</option>
            <option value="super_admin">Super admins</option>
          </select>
        </div>
      </section>

      <section className="card super-admin-table-card">
        {loading ? (
          <p className="muted">Cargando accesos...</p>
        ) : (
          <table className="table super-admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Enlace operativo</th>
                <th>Estado</th>
                <th>Rol</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((profile) => {
                const isSelf = profile.userId === user?.id;
                const dirty = (draftRoles[profile.userId] ?? profile.role) !== profile.role;

                return (
                  <tr key={profile.userId}>
                    <td>
                      <div className="super-admin-user-cell">
                        <strong>{profile.fullName}</strong>
                        <span>{profile.email}</span>
                        <span>{formatLastAccess(profile.lastSignInAt)}{isSelf ? ' · Tú' : ''}</span>
                      </div>
                    </td>
                    <td>
                      <div className="super-admin-link-cell">
                        <strong>{profile.personaNombre ?? 'Sin persona enlazada'}</strong>
                        <span>{profileTypeLabel[profile.profileType] ?? profile.profileType}</span>
                        <span>{profile.telefono ?? 'Sin teléfono'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${profile.emailConfirmed ? 'ok' : 'warn'}`}>
                        {profile.emailConfirmed ? 'Confirmado' : 'Pendiente'}
                      </span>
                    </td>
                    <td>
                      <select
                        className="input super-admin-role-select"
                        value={draftRoles[profile.userId] ?? profile.role}
                        onChange={(event) => setDraftRoles((current) => ({
                          ...current,
                          [profile.userId]: event.target.value as AccessProfile['role'],
                        }))}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <div className="super-admin-role-current">Actual: {roleLabel(profile.role)}</div>
                    </td>
                    <td>
                      <button className="btn small" disabled={!dirty || savingId === profile.userId} onClick={() => void handleAssignRole(profile)}>
                        {savingId === profile.userId ? 'Guardando...' : 'Aplicar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredProfiles.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">No hay usuarios que coincidan con el filtro actual.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

export default SuperAdminAccesos;