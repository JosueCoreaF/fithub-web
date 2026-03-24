import React, { useEffect, useState } from 'react';
import {
  createCustomTariff,
  deleteCustomTariff,
  fetchTariffCatalog,
  saveTariffConfig,
  updateCurrentRoomTariff,
  updateCustomTariff,
  type CustomTariffInput,
  type CustomTariffView,
  type SupportedCurrency,
  type TariffCatalogView,
  type TariffConfigInput,
} from '../lib/api';
import { useHotelData } from '../context/HotelDataContext';
import { convertCurrencyAmount } from '../lib/tariffMath';

const formatMoney = (value: number, currency: SupportedCurrency) => `${value.toFixed(2)} ${currency}`;

const emptyCustomTariffForm: CustomTariffInput = {
  hotelId: '',
  nombre: '',
  descripcion: '',
  montoNoche: 0,
  moneda: 'USD',
  activa: true,
  prioridad: 0,
};

export const Tarifas: React.FC = () => {
  const { data, refresh } = useHotelData();
  const hotels = data?.hotelesView ?? [];
  const [selectedHotelId, setSelectedHotelId] = useState<string>('Todos');
  const [catalog, setCatalog] = useState<TariffCatalogView | null>(null);
  const [configForm, setConfigForm] = useState<TariffConfigInput>({
    monedaBase: 'USD',
    monedaAlterna: 'HNL',
    descuentoTerceraEdad: 0,
    edadTerceraEdad: 60,
  });
  const [customTariffForm, setCustomTariffForm] = useState<CustomTariffInput>(emptyCustomTariffForm);
  const [editingCustomTariff, setEditingCustomTariff] = useState<CustomTariffView | null>(null);
  const [editingCurrentRate, setEditingCurrentRate] = useState<{ roomId: string; habitacion: string; montoNoche: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadCatalog = async (refreshRate = false) => {
    setLoading(true);
    setActionError(null);

    try {
      const nextCatalog = await fetchTariffCatalog({
        hotelId: selectedHotelId !== 'Todos' ? selectedHotelId : undefined,
        refresh: refreshRate,
      });
      setCatalog(nextCatalog);
      setConfigForm({
        monedaBase: nextCatalog.config.monedaBase,
        monedaAlterna: nextCatalog.config.monedaAlterna,
        descuentoTerceraEdad: nextCatalog.config.descuentoTerceraEdad,
        edadTerceraEdad: nextCatalog.config.edadTerceraEdad,
      });
      if (selectedHotelId === 'Todos' && hotels.length > 0 && !customTariffForm.hotelId) {
        setCustomTariffForm((current) => ({ ...current, hotelId: hotels[0].id }));
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo cargar el catálogo tarifario.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, [selectedHotelId]);

  const handleSaveConfig = async () => {
    setSaving(true);
    setActionError(null);
    setMessage(null);

    try {
      const nextConfig = await saveTariffConfig(configForm);
      setCatalog((current) => current ? { ...current, config: nextConfig } : current);
      setMessage('Configuración tarifaria actualizada.');
      await loadCatalog(true);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo guardar la configuración tarifaria.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustomTariff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setActionError(null);
    setMessage(null);

    try {
      if (editingCustomTariff) {
        await updateCustomTariff(editingCustomTariff.id, customTariffForm);
        setMessage('Tarifa personalizada actualizada.');
      } else {
        await createCustomTariff(customTariffForm);
        setMessage('Tarifa personalizada creada.');
      }
      setEditingCustomTariff(null);
      setCustomTariffForm(emptyCustomTariffForm);
      await loadCatalog();
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo guardar la tarifa personalizada.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomTariff = async (tariff: CustomTariffView) => {
    if (!window.confirm(`Eliminar la tarifa ${tariff.nombre}?`)) return;
    setSaving(true);
    setActionError(null);
    setMessage(null);

    try {
      await deleteCustomTariff(tariff.id);
      setMessage('Tarifa personalizada eliminada.');
      await loadCatalog();
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo eliminar la tarifa personalizada.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCurrentRate = async () => {
    if (!editingCurrentRate) return;

    setSaving(true);
    setActionError(null);
    setMessage(null);

    try {
      await updateCurrentRoomTariff(editingCurrentRate.roomId, Number(editingCurrentRate.montoNoche));
      setEditingCurrentRate(null);
      setMessage('Tarifa actual actualizada.');
      await loadCatalog();
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo actualizar la tarifa actual.');
    } finally {
      setSaving(false);
    }
  };

  const currentRates = catalog?.actuales ?? [];
  const customRates = catalog?.personalizadas ?? [];

  return (
    <div className="page tarifas-page">
      <div className="tarifas-header">
        <div>
          <h2>Tarifas</h2>
          <p className="muted">Controla tarifas actuales, tarifas personalizadas, conversión automática de moneda y descuento de tercera edad.</p>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={() => void loadCatalog(true)} disabled={loading || saving}>Actualizar tipo de cambio</button>
        </div>
      </div>

      {(message || actionError) && (
        <div className={`profile-feedback ${actionError ? 'error' : 'success'}`}>
          {actionError ?? message}
        </div>
      )}

      <section className="tarifas-summary-grid">
        <article className="card tarifas-summary-card">
          <span>Moneda base</span>
          <strong>{catalog?.config.monedaBase ?? configForm.monedaBase}</strong>
        </article>
        <article className="card tarifas-summary-card">
          <span>Moneda alterna</span>
          <strong>{catalog?.config.monedaAlterna ?? configForm.monedaAlterna}</strong>
        </article>
        <article className="card tarifas-summary-card">
          <span>Tipo de cambio</span>
          <strong>{catalog?.config.tipoCambio?.toFixed(4) ?? '0.0000'}</strong>
          <small>{catalog?.config.actualizadoEn ? new Date(catalog.config.actualizadoEn).toLocaleString('es-HN') : 'Sin actualización'}</small>
        </article>
        <article className="card tarifas-summary-card">
          <span>Tercera edad</span>
          <strong>{catalog?.config.descuentoTerceraEdad ?? configForm.descuentoTerceraEdad}%</strong>
          <small>Desde {catalog?.config.edadTerceraEdad ?? configForm.edadTerceraEdad} años</small>
        </article>
      </section>

      <section className="tarifas-layout">
        <article className="card tarifas-config-card">
          <div className="tarifas-section-head">
            <div>
              <span className="trainers-eyebrow">Configuración</span>
              <h3>Moneda y descuento</h3>
            </div>
          </div>

          <div className="tarifas-form-grid">
            <label>
              <span>Moneda base</span>
              <select className="input" value={configForm.monedaBase} onChange={(event) => setConfigForm((current) => ({ ...current, monedaBase: event.target.value as SupportedCurrency }))}>
                <option value="USD">USD</option>
                <option value="HNL">HNL</option>
              </select>
            </label>
            <label>
              <span>Moneda alterna</span>
              <select className="input" value={configForm.monedaAlterna} onChange={(event) => setConfigForm((current) => ({ ...current, monedaAlterna: event.target.value as SupportedCurrency }))}>
                <option value="USD">USD</option>
                <option value="HNL">HNL</option>
              </select>
            </label>
            <label>
              <span>Descuento tercera edad %</span>
              <input className="input" type="number" min="0" max="100" step="0.01" value={configForm.descuentoTerceraEdad} onChange={(event) => setConfigForm((current) => ({ ...current, descuentoTerceraEdad: Number(event.target.value) }))} />
            </label>
            <label>
              <span>Edad mínima</span>
              <input className="input" type="number" min="50" max="100" step="1" value={configForm.edadTerceraEdad} onChange={(event) => setConfigForm((current) => ({ ...current, edadTerceraEdad: Number(event.target.value) }))} />
            </label>
          </div>

          <button className="btn" onClick={() => void handleSaveConfig()} disabled={saving || loading}>Guardar configuración</button>
        </article>

        <article className="card tarifas-custom-card">
          <div className="tarifas-section-head">
            <div>
              <span className="trainers-eyebrow">Personalizadas</span>
              <h3>{editingCustomTariff ? 'Editar tarifa personalizada' : 'Nueva tarifa personalizada'}</h3>
            </div>
          </div>

          <form className="tarifas-form-grid" onSubmit={handleSaveCustomTariff}>
            <label>
              <span>Hotel</span>
              <select className="input" value={customTariffForm.hotelId} onChange={(event) => setCustomTariffForm((current) => ({ ...current, hotelId: event.target.value }))} required>
                <option value="">Selecciona hotel</option>
                {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.nombre}</option>)}
              </select>
            </label>
            <label>
              <span>Nombre</span>
              <input className="input" value={customTariffForm.nombre} onChange={(event) => setCustomTariffForm((current) => ({ ...current, nombre: event.target.value }))} required />
            </label>
            <label>
              <span>Moneda</span>
              <select className="input" value={customTariffForm.moneda} onChange={(event) => setCustomTariffForm((current) => ({ ...current, moneda: event.target.value as SupportedCurrency }))}>
                <option value="USD">USD</option>
                <option value="HNL">HNL</option>
              </select>
            </label>
            <label>
              <span>Monto por noche</span>
              <input className="input" type="number" min="0" step="0.01" value={customTariffForm.montoNoche} onChange={(event) => setCustomTariffForm((current) => ({ ...current, montoNoche: Number(event.target.value) }))} required />
            </label>
            <label>
              <span>Prioridad</span>
              <input className="input" type="number" min="0" step="1" value={customTariffForm.prioridad ?? 0} onChange={(event) => setCustomTariffForm((current) => ({ ...current, prioridad: Number(event.target.value) }))} />
            </label>
            <label className="tarifas-form-full">
              <span>Descripción</span>
              <textarea className="input tarifas-textarea" rows={3} value={customTariffForm.descripcion ?? ''} onChange={(event) => setCustomTariffForm((current) => ({ ...current, descripcion: event.target.value }))} />
            </label>
            <label className="reservas-editor-checkbox tarifas-form-full">
              <input type="checkbox" checked={customTariffForm.activa ?? true} onChange={(event) => setCustomTariffForm((current) => ({ ...current, activa: event.target.checked }))} />
              <span>Tarifa activa para recepción y reservas</span>
            </label>
            <div className="tarifas-form-actions tarifas-form-full">
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Guardando...' : editingCustomTariff ? 'Actualizar tarifa' : 'Crear tarifa'}</button>
              {editingCustomTariff ? <button className="btn ghost" type="button" onClick={() => {
                setEditingCustomTariff(null);
                setCustomTariffForm(emptyCustomTariffForm);
              }}>Cancelar edición</button> : null}
            </div>
          </form>
        </article>
      </section>

      <section className="card tarifas-table-card">
        <div className="tarifas-section-head tarifas-table-head">
          <div>
            <span className="trainers-eyebrow">Actuales</span>
            <h3>Tarifas vigentes por habitación</h3>
          </div>
          <select className="input tarifas-filter" value={selectedHotelId} onChange={(event) => setSelectedHotelId(event.target.value)}>
            <option value="Todos">Todos los hoteles</option>
            {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.nombre}</option>)}
          </select>
        </div>

        {loading ? <p className="muted">Cargando tarifas...</p> : (
          <div className="members-table-scroll">
            <table className="table dark tarifas-table">
              <thead>
                <tr>
                  <th>Hotel</th>
                  <th>Habitación</th>
                  <th>Tipo</th>
                  <th>Tarifa base</th>
                  <th>Equivalente</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {currentRates.map((rate) => (
                  <tr key={rate.id}>
                    <td>{rate.hotel}</td>
                    <td>{rate.codigo} · {rate.habitacion}</td>
                    <td>{rate.tipo}</td>
                    <td>{formatMoney(rate.montoNoche, catalog?.config.monedaBase ?? 'USD')}</td>
                    <td>{catalog ? formatMoney(convertCurrencyAmount(rate.montoNoche, catalog.config.monedaBase, catalog.config.monedaAlterna, catalog.config), catalog.config.monedaAlterna) : 'N/D'}</td>
                    <td>
                      <button className="btn small ghost" onClick={() => setEditingCurrentRate({ roomId: rate.id, habitacion: rate.habitacion, montoNoche: String(rate.montoNoche) })}>Editar actual</button>
                    </td>
                  </tr>
                ))}
                {currentRates.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted members-table-empty">No hay tarifas actuales para el filtro seleccionado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card tarifas-table-card">
        <div className="tarifas-section-head">
          <div>
            <span className="trainers-eyebrow">Catálogo</span>
            <h3>Tarifas personalizadas</h3>
            <p className="muted">Las tarifas personalizadas ahora se crean a nivel hotel y pueden reutilizarse en cualquier habitación al reservar.</p>
          </div>
        </div>

        <div className="members-table-scroll">
          <table className="table dark tarifas-table">
            <thead>
              <tr>
                <th>Hotel</th>
                <th>Alcance</th>
                <th>Tarifa</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customRates.map((tariff) => (
                <tr key={tariff.id}>
                  <td>{tariff.hotel}</td>
                  <td>{tariff.habitacion ? `${tariff.codigo ? `${tariff.codigo} · ` : ''}${tariff.habitacion}` : 'Hotel completo'}</td>
                  <td>
                    <div className="users-cell-stack">
                      <strong>{tariff.nombre}</strong>
                      <span>{tariff.descripcion || 'Sin descripción'}</span>
                    </div>
                  </td>
                  <td>{formatMoney(tariff.montoNoche, tariff.moneda)}</td>
                  <td><span className={`pill ${tariff.activa ? 'ok' : 'danger'}`}>{tariff.activa ? 'Activa' : 'Inactiva'}</span></td>
                  <td>
                    <div className="users-actions">
                      <button className="btn small" onClick={() => {
                        setEditingCustomTariff(tariff);
                        setCustomTariffForm({
                          hotelId: tariff.hotelId,
                          nombre: tariff.nombre,
                          descripcion: tariff.descripcion ?? '',
                          montoNoche: tariff.montoNoche,
                          moneda: tariff.moneda,
                          activa: tariff.activa,
                          prioridad: tariff.prioridad,
                        });
                      }}>Editar</button>
                      <button className="btn small ghost" onClick={() => void handleDeleteCustomTariff(tariff)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
              {customRates.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted members-table-empty">No hay tarifas personalizadas registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingCurrentRate && (
        <div className="modal-overlay" onClick={() => setEditingCurrentRate(null)}>
          <div className="modal tarifas-rate-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Actualizar tarifa actual</h3>
            <p className="muted">{editingCurrentRate.habitacion}</p>
            <input className="input" type="number" min="0" step="0.01" value={editingCurrentRate.montoNoche} onChange={(event) => setEditingCurrentRate((current) => current ? { ...current, montoNoche: event.target.value } : current)} />
            <div className="tarifas-form-actions">
              <button className="btn" onClick={() => void handleSaveCurrentRate()} disabled={saving}>{saving ? 'Guardando...' : 'Guardar tarifa'}</button>
              <button className="btn ghost" onClick={() => setEditingCurrentRate(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tarifas;
