import React, { useMemo, useState } from 'react';
import { downloadCsv } from '../lib/export';
import {
  createOperationalUser,
  deleteOperationalUser,
  updateOperationalUser,
  type OperationalUserInput,
  type OperationalUserView,
} from '../lib/api';
import { useHotelData } from '../context/HotelDataContext';

const emptyForm: OperationalUserInput = {
  nombre: '',
  correo: '',
  telefono: '',
  ciudad: '',
  colonia: '',
  calle: '',
  fechaNacimiento: '',
  esCliente: true,
  esEntrenador: false,
  especialidad: '',
  estadoLaboral: 'Activo',
};

const roleLabel: Record<OperationalUserView['tipoPerfil'], string> = {
  cliente: 'Huesped',
  entrenador: 'Personal',
  cliente_y_entrenador: 'Huesped y personal',
  persona: 'Registro base',
};

export const Usuarios: React.FC = () => {
  const { data, loading, error, refresh } = useHotelData();
  const usuarios = data?.usuariosView ?? [];
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | OperationalUserView['tipoPerfil']>('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<OperationalUserView | null>(null);
  const [form, setForm] = useState<OperationalUserInput>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return usuarios.filter((usuario) => {
      const matchesType = typeFilter === 'todos' || usuario.tipoPerfil === typeFilter;
      const matchesQuery = !normalizedQuery
        || usuario.nombre.toLowerCase().includes(normalizedQuery)
        || usuario.correo.toLowerCase().includes(normalizedQuery)
        || usuario.ciudad.toLowerCase().includes(normalizedQuery)
        || (usuario.colonia ?? '').toLowerCase().includes(normalizedQuery)
        || (usuario.calle ?? '').toLowerCase().includes(normalizedQuery)
        || usuario.telefono.toLowerCase().includes(normalizedQuery);

      return matchesType && matchesQuery;
    }).sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'));
  }, [query, typeFilter, usuarios]);

  const summary = useMemo(() => ({
    total: usuarios.length,
    huespedes: usuarios.filter((usuario) => usuario.esCliente).length,
    personal: usuarios.filter((usuario) => usuario.esEntrenador).length,
    registrosBase: usuarios.filter((usuario) => usuario.tipoPerfil === 'persona').length,
    mixtos: usuarios.filter((usuario) => usuario.tipoPerfil === 'cliente_y_entrenador').length,
  }), [usuarios]);

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setModalOpen(true);
    setActionError(null);
  };

  const openEdit = (usuario: OperationalUserView) => {
    setEditingUser(usuario);
    setForm({
      nombre: usuario.nombre,
      correo: usuario.correo,
      telefono: usuario.telefono,
      ciudad: usuario.ciudad === 'Sin ciudad' ? '' : usuario.ciudad,
      colonia: usuario.colonia ?? '',
      calle: usuario.calle ?? '',
      fechaNacimiento: usuario.fechaNacimiento ?? '',
      esCliente: usuario.esCliente,
      esEntrenador: usuario.esEntrenador,
      especialidad: usuario.especialidad ?? '',
      estadoLaboral: (usuario.estadoLaboral as OperationalUserInput['estadoLaboral']) ?? 'Activo',
    });
    setModalOpen(true);
    setActionError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    setActionError(null);

    try {
      if (editingUser) {
        await updateOperationalUser(editingUser.id, form);
        setFeedback('Usuario operativo actualizado.');
      } else {
        await createOperationalUser(form);
        setFeedback('Usuario operativo creado.');
      }
      await refresh();
      setModalOpen(false);
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : 'No se pudo guardar el usuario.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (usuario: OperationalUserView) => {
    if (!window.confirm(`Eliminar a ${usuario.nombre}? Esto quitara su persona y enlaces operativos.`)) return;

    setFeedback(null);
    setActionError(null);
    try {
      await deleteOperationalUser(usuario.id);
      await refresh();
      setFeedback('Usuario operativo eliminado.');
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el usuario.');
    }
  };

  const handleExportUsers = () => {
    downloadCsv(filteredUsers, [
      { header: 'ID', value: (user) => user.id },
      { header: 'Nombre', value: (user) => user.nombre },
      { header: 'Correo', value: (user) => user.correo },
      { header: 'Telefono', value: (user) => user.telefono },
      { header: 'Ciudad', value: (user) => user.ciudad },
      { header: 'Colonia', value: (user) => user.colonia ?? '' },
      { header: 'Calle', value: (user) => user.calle ?? '' },
      { header: 'Fecha Nacimiento', value: (user) => user.fechaNacimiento ?? '' },
      { header: 'Perfil Huesped', value: (user) => user.esCliente ? 'Si' : 'No' },
      { header: 'Perfil Personal', value: (user) => user.esEntrenador ? 'Si' : 'No' },
      { header: 'Tipo Perfil', value: (user) => roleLabel[user.tipoPerfil] },
      { header: 'Especialidad', value: (user) => user.especialidad ?? '' },
      { header: 'Estado Laboral', value: (user) => user.estadoLaboral ?? '' },
      { header: 'Fecha Registro', value: (user) => user.fechaRegistro ?? '' },
    ], 'usuarios_operativos');
  };

  return (
    <div className="page users-page">
      <div className="users-header">
        <div>
          <h2>Directorio operativo</h2>
          <p className="muted">Alta y mantenimiento de personas base del hotel. Desde aquí defines si una persona funciona como huésped, personal o ambos.</p>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={handleExportUsers} disabled={filteredUsers.length === 0}>
            Exportar CSV
          </button>
          <button className="cta-button" onClick={openCreate}>Nueva persona</button>
        </div>
      </div>

      {(error || actionError || feedback) && (
        <div className={`profile-feedback ${(error || actionError) ? 'error' : 'success'}`}>
          {error ?? actionError ?? feedback}
        </div>
      )}

      <section className="users-summary-grid">
        <article className="card users-summary-card"><span>Personas registradas</span><strong>{summary.total}</strong></article>
        <article className="card users-summary-card"><span>Huéspedes</span><strong>{summary.huespedes}</strong></article>
        <article className="card users-summary-card"><span>Personal</span><strong>{summary.personal}</strong></article>
        <article className="card users-summary-card"><span>Mixtos o base</span><strong>{summary.mixtos + summary.registrosBase}</strong></article>
      </section>

      <section className="users-top-grid">
        <article className="card users-table-card">
          <div className="users-toolbar">
            <input className="input" placeholder="Buscar por nombre, correo, direccion o telefono" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
              <option value="todos">Todos los perfiles</option>
              <option value="cliente">Huéspedes</option>
              <option value="entrenador">Personal</option>
              <option value="cliente_y_entrenador">Huésped y personal</option>
              <option value="persona">Solo registro base</option>
            </select>
          </div>

          <div className="members-table-scroll">
            <table className="table dark users-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Rol operativo</th>
                  <th>Ciudad</th>
                  <th>Teléfono</th>
                  <th>Vinculación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((usuario) => (
                  <tr key={usuario.id}>
                    <td>
                      <div className="users-cell-stack">
                        <strong>{usuario.nombre}</strong>
                        <span>{usuario.correo}</span>
                      </div>
                    </td>
                    <td><span className={`pill ${usuario.esEntrenador ? 'ok' : usuario.esCliente ? 'warn' : 'danger'}`}>{roleLabel[usuario.tipoPerfil]}</span></td>
                    <td>{usuario.ciudad}</td>
                    <td>{usuario.telefono || 'Sin teléfono'}</td>
                    <td>
                      <div className="users-cell-stack">
                        <strong>{usuario.especialidad ?? (usuario.esCliente ? 'Perfil de huésped activo' : 'Sin especialidad')}</strong>
                        <span>{usuario.esEntrenador ? (usuario.estadoLaboral ?? 'Sin estado laboral') : (usuario.fechaRegistro ?? 'Sin fecha de registro')}</span>
                      </div>
                    </td>
                    <td>
                      <div className="users-actions">
                        <button className="btn small" onClick={() => openEdit(usuario)}>Editar</button>
                        <button className="btn small ghost" onClick={() => void handleDelete(usuario)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted members-table-empty">No hay usuarios que coincidan con el filtro actual.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card users-settings-card">
          <div className="users-section-head">
            <div>
              <span className="trainers-eyebrow">Alcance</span>
              <h3>Qué resuelve este módulo</h3>
            </div>
          </div>

          <div className="users-guidance-list">
            <article className="users-guidance-item">
              <strong>Úsalo para altas maestras</strong>
              <p className="muted">Aquí creas la persona base y decides si tendrá perfil de huésped, de personal o ambos.</p>
            </article>
            <article className="users-guidance-item">
              <strong>Huéspedes y Personal siguen separados</strong>
              <p className="muted">Las pantallas de Huespedes y Personal sirven para seguimiento operativo, no para administrar la identidad maestra.</p>
            </article>
            <article className="users-guidance-item">
              <strong>No es configuración del hotel</strong>
              <p className="muted">Los ajustes generales de operación deben vivir en otra sección, no mezclados con el directorio de personas.</p>
            </article>
          </div>
        </article>
      </section>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal users-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{editingUser ? 'Editar persona operativa' : 'Nueva persona operativa'}</h3>
            <form className="users-form-grid" onSubmit={handleSubmit}>
              <input className="input" placeholder="Nombre completo" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} required />
              <input className="input" type="email" placeholder="Correo" value={form.correo} onChange={(event) => setForm((current) => ({ ...current, correo: event.target.value }))} required />
              <input className="input" placeholder="Telefono" value={form.telefono} onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))} />
              <input className="input" placeholder="Ciudad" value={form.ciudad} onChange={(event) => setForm((current) => ({ ...current, ciudad: event.target.value }))} />
              <input className="input" placeholder="Colonia" value={form.colonia ?? ''} onChange={(event) => setForm((current) => ({ ...current, colonia: event.target.value }))} />
              <input className="input users-form-full" placeholder="Calle" value={form.calle ?? ''} onChange={(event) => setForm((current) => ({ ...current, calle: event.target.value }))} />
              <input className="input" type="date" value={form.fechaNacimiento} onChange={(event) => setForm((current) => ({ ...current, fechaNacimiento: event.target.value }))} required />
              <select className="input" value={form.estadoLaboral} onChange={(event) => setForm((current) => ({ ...current, estadoLaboral: event.target.value as OperationalUserInput['estadoLaboral'] }))}>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
                <option value="Vacaciones">Vacaciones</option>
              </select>

              <label className="users-checkbox-row">
                <input type="checkbox" checked={form.esCliente} onChange={(event) => setForm((current) => ({ ...current, esCliente: event.target.checked }))} />
                <span>Crear o mantener perfil de huésped</span>
              </label>
              <label className="users-checkbox-row">
                <input type="checkbox" checked={form.esEntrenador} onChange={(event) => setForm((current) => ({ ...current, esEntrenador: event.target.checked }))} />
                <span>Crear o mantener perfil de personal</span>
              </label>

              {form.esEntrenador && (
                <input className="input users-form-full" placeholder="Especialidad" value={form.especialidad} onChange={(event) => setForm((current) => ({ ...current, especialidad: event.target.value }))} />
              )}

              <div className="users-modal-actions users-form-full">
                <button className="btn" type="submit" disabled={submitting}>{submitting ? 'Guardando...' : 'Guardar persona'}</button>
                <button className="btn ghost" type="button" onClick={() => setModalOpen(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Usuarios;