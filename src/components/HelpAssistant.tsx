import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useHotelData } from '../context/HotelDataContext';
import { downloadCsv } from '../lib/export';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

type AssistantReply = {
  text: string;
  actionLabel?: string;
  path?: string;
  command?: 'signout';
  exportType?: 'reservas' | 'huespedes' | 'pagos' | 'usuarios';
};

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zm6.5 11.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2zM5.5 14l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1 1-2.8z" fill="currentColor" />
  </svg>
);

export const HelpAssistant: React.FC = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { data } = useHotelData();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [pendingAction, setPendingAction] = useState<{ label: string; path?: string; command?: 'signout'; exportType?: 'reservas' | 'huespedes' | 'pagos' | 'usuarios' } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Estoy listo para ayudarte con reservas, cobros, hoteles, huéspedes, personal y navegación del panel. Pregúntame algo concreto o usa una sugerencia rápida.',
    },
  ]);

  const quickPrompts = useMemo(
    () => ['¿Qué está pendiente hoy?', '¿Qué hotel tiene más movimiento?', '¿Dónde reviso pagos?', 'Exporta huéspedes', 'Quiero cerrar sesión'],
    [],
  );

  const exportDataset = (type: 'reservas' | 'huespedes' | 'pagos' | 'usuarios') => {
    if (!data) return;

    if (type === 'reservas') {
      downloadCsv(data.reservasView, [
        { header: 'ID Reserva', value: (reservation) => reservation.id },
        { header: 'Huesped', value: (reservation) => reservation.huesped },
        { header: 'Habitacion', value: (reservation) => reservation.habitacion },
        { header: 'Hotel', value: (reservation) => reservation.hotel },
        { header: 'Responsable', value: (reservation) => reservation.responsable },
        { header: 'Fecha', value: (reservation) => new Date(reservation.fecha).toLocaleString('es-HN') },
        { header: 'Estado', value: (reservation) => reservation.estado },
      ], 'reservas_asistente');
      return;
    }

    if (type === 'huespedes') {
      downloadCsv(data.huespedesView, [
        { header: 'ID', value: (guest) => guest.id },
        { header: 'Nombre', value: (guest) => guest.nombre },
        { header: 'Correo', value: (guest) => guest.correo },
        { header: 'Estado', value: (guest) => guest.estado },
        { header: 'Ciudad', value: (guest) => guest.ciudad },
      ], 'huespedes_asistente');
      return;
    }

    if (type === 'pagos') {
      downloadCsv(data.pagosView, [
        { header: 'ID Pago', value: (payment) => payment.id },
        { header: 'Tipo', value: (payment) => payment.tipo },
        { header: 'Huesped', value: (payment) => payment.huesped },
        { header: 'Estadia', value: (payment) => payment.estadia },
        { header: 'Monto', value: (payment) => payment.monto },
        { header: 'Fecha', value: (payment) => payment.fecha },
      ], 'pagos_asistente');
      return;
    }

    downloadCsv(data.usuariosView, [
      { header: 'ID', value: (record) => record.id },
      { header: 'Nombre', value: (record) => record.nombre },
      { header: 'Correo', value: (record) => record.correo },
      { header: 'Ciudad', value: (record) => record.ciudad },
      { header: 'Tipo Perfil', value: (record) => record.tipoPerfil },
    ], 'usuarios_asistente');
  };

  const resolveReply = (question: string): AssistantReply => {
    const normalized = question.trim().toLowerCase();
    const fallback: AssistantReply = {
      text: 'Puedo orientarte sobre reservas, pagos, hoteles, personal, notificaciones y navegación del panel. Intenta con una pregunta más específica.',
    };

    if (!data) {
      return { text: 'Todavía estoy esperando los datos del panel. Intenta de nuevo en unos segundos.' };
    }

    if (normalized.includes('pago') || normalized.includes('cobro')) {
      return {
        text: `El panel registra ${data.pagosView.length} cobros y ${data.reservas.filter((item) => item.estado === 'creada').length} reservas todavía en seguimiento de pago.`,
        actionLabel: 'Ir a pagos',
        path: '/pagos',
      };
    }

    if ((normalized.includes('export') || normalized.includes('descarg')) && normalized.includes('reserva')) {
      return {
        text: 'Voy a exportar las reservas visibles del sistema a CSV.',
        actionLabel: 'Descargar CSV',
        exportType: 'reservas',
      };
    }

    if ((normalized.includes('export') || normalized.includes('descarg')) && (normalized.includes('huesped') || normalized.includes('miembro'))) {
      return {
        text: 'Voy a exportar el listado de huéspedes a CSV.',
        actionLabel: 'Descargar CSV',
        exportType: 'huespedes',
      };
    }

    if ((normalized.includes('export') || normalized.includes('descarg')) && normalized.includes('pago')) {
      return {
        text: 'Voy a exportar el historial de cobros a CSV.',
        actionLabel: 'Descargar CSV',
        exportType: 'pagos',
      };
    }

    if ((normalized.includes('export') || normalized.includes('descarg')) && (normalized.includes('usuario') || normalized.includes('usuarios'))) {
      return {
        text: 'Voy a exportar el directorio de usuarios operativos a CSV.',
        actionLabel: 'Descargar CSV',
        exportType: 'usuarios',
      };
    }

    if (normalized.includes('agenda') || normalized.includes('hoy') || normalized.includes('pendiente')) {
      return {
        text: `Hoy hay ${data.reservasView.filter((item) => new Date(item.fecha).toDateString() === new Date().toDateString()).length} reservas visibles en el sistema.`,
        actionLabel: 'Abrir panel',
        path: '/',
      };
    }

    if (normalized.includes('hotel') || normalized.includes('sede')) {
      const topHotel = data.hotelesView.slice().sort((left, right) => right.reservas - left.reservas)[0] ?? null;
      return topHotel
        ? { text: `El hotel con mayor movimiento es ${topHotel.nombre}, con ${topHotel.reservas} reservas y ${topHotel.habitaciones} habitaciones operativas.`, actionLabel: 'Ver hoteles', path: '/hoteles' }
        : { text: 'Todavía no hay datos de hoteles disponibles.' };
    }

    if (normalized.includes('personal') || normalized.includes('responsable')) {
      const topStaff = data.personalView.slice().sort((left, right) => right.workload - left.workload)[0] ?? null;
      return topStaff
        ? { text: `${topStaff.nombre} lidera la carga semanal con ${topStaff.workload} bloques y ${topStaff.assignedCount} reservas vinculadas.`, actionLabel: 'Ver personal', path: '/personal' }
        : { text: 'No hay personal operativo disponible para resumir ahora mismo.' };
    }

    if (normalized.includes('notific')) {
      return {
        text: 'Las notificaciones se gestionan desde el icono superior y sus preferencias se activan o pausan en tu perfil.',
        actionLabel: 'Ir a perfil',
        path: '/perfil',
      };
    }

    if (normalized.includes('cerrar sesión') || normalized.includes('cerrar sesion') || normalized.includes('salir')) {
      return {
        text: 'Puedo cerrar tu sesión ahora mismo si lo confirmas desde el botón siguiente.',
        actionLabel: 'Cerrar sesión',
        command: 'signout',
      };
    }

    if (normalized.includes('como') || normalized.includes('donde') || normalized.includes('ayuda')) {
      return {
        text: 'Puedes navegar por módulos desde la barra lateral, usar la campana para alertas y aplicar filtros en los gráficos del panel para analizar la operación hotelera.',
      };
    }

    return fallback;
  };

  const submitQuestion = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    const reply = resolveReply(trimmed);
    setMessages((current) => ([
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: trimmed },
      { id: `assistant-${Date.now() + 1}`, role: 'assistant', text: reply.text },
    ]));
    setPendingAction(reply.actionLabel ? { label: reply.actionLabel, path: reply.path, command: reply.command, exportType: reply.exportType } : null);
    setInput('');
  };

  return (
    <div className="help-assistant">
      <button type="button" className={`help-assistant-trigger ${open ? 'active' : ''}`} onClick={() => setOpen((current) => !current)}>
        <SparkIcon />
        <span>Asistencia</span>
      </button>

      {open && (
        <div className="help-assistant-panel">
          <div className="help-assistant-head">
            <div>
              <strong>Asistente FitHub</strong>
              <span>Respuestas rápidas con contexto real del panel.</span>
            </div>
          </div>

          <div className="help-assistant-messages">
            {messages.map((message) => (
              <article key={message.id} className={`help-assistant-message ${message.role}`}>
                <p>{message.text}</p>
              </article>
            ))}
          </div>

          <div className="help-assistant-prompts">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" className="help-assistant-chip" onClick={() => submitQuestion(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          {pendingAction && (
            <button type="button" className="btn help-assistant-action" onClick={() => {
              if (pendingAction.command === 'signout') {
                void signOut();
                return;
              }

              if (pendingAction.exportType) {
                exportDataset(pendingAction.exportType);
                setOpen(false);
                return;
              }

              if (pendingAction.path) {
                navigate(pendingAction.path);
              }
              setOpen(false);
            }}>
              {pendingAction.label}
            </button>
          )}

          <form className="help-assistant-form" onSubmit={(event) => { event.preventDefault(); submitQuestion(input); }}>
            <input className="input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Pregunta algo sobre la operación hotelera..." />
            <button type="submit" className="btn">Enviar</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default HelpAssistant;