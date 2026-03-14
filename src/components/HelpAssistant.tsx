import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGymData } from '../context/GymDataContext';
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
  exportType?: 'reservas' | 'miembros' | 'pagos' | 'usuarios';
};

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zm6.5 11.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2zM5.5 14l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1 1-2.8z" fill="currentColor" />
  </svg>
);

const formatDateTime = (value: string) => new Date(value).toLocaleString('es-HN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const HelpAssistant: React.FC = () => {
  const navigate = useNavigate();
  const { user, role, isClient, isTrainer, signOut } = useAuth();
  const { data } = useGymData();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [pendingAction, setPendingAction] = useState<{ label: string; path?: string; command?: 'signout'; exportType?: 'reservas' | 'miembros' | 'pagos' | 'usuarios' } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Estoy listo para ayudarte con reservas, pagos, membresías, sedes y uso del panel. Pregúntame algo concreto o usa una sugerencia rápida.',
    },
  ]);

  const quickPrompts = useMemo(() => {
    if (isClient) {
      return ['¿Cuál es mi próxima reserva?', '¿Cuándo vence mi membresía?', '¿Cómo reservo una sesión?', 'Exporta mis reservas', 'Quiero cerrar sesión'];
    }

    if (isTrainer) {
      return ['¿Qué tengo hoy?', '¿Hay reservas pendientes?', '¿Dónde veo mi agenda?', 'Exporta reservas', 'Quiero cerrar sesión'];
    }

    return ['¿Qué está pendiente hoy?', '¿Qué sede tiene más movimiento?', '¿Dónde reviso pagos?', 'Exporta pagos', 'Quiero cerrar sesión'];
  }, [isClient, isTrainer]);

  const exportDataset = (type: 'reservas' | 'miembros' | 'pagos' | 'usuarios') => {
    if (!data) return;

    if (type === 'reservas') {
      const linkedPerson = user?.email
        ? data.personas.find((item) => item.correo?.toLowerCase() === user.email?.toLowerCase()) ?? null
        : null;
      const trainerProfile = linkedPerson
        ? data.entrenadoresView.find((item) => item.id === linkedPerson.id_persona) ?? null
        : null;
      const reservations = isClient && linkedPerson
        ? data.reservasView.filter((item) => item.clienteId === linkedPerson.id_persona)
        : isTrainer && trainerProfile
          ? data.reservasView.filter((item) => item.entrenador === trainerProfile.nombre)
          : data.reservasView;

      downloadCsv(reservations, [
        { header: 'ID Reserva', value: (reservation) => reservation.id },
        { header: 'Cliente', value: (reservation) => reservation.cliente },
        { header: 'Servicio', value: (reservation) => reservation.servicio },
        { header: 'Sede', value: (reservation) => reservation.sede },
        { header: 'Entrenador', value: (reservation) => reservation.entrenador },
        { header: 'Fecha', value: (reservation) => new Date(reservation.fecha).toLocaleString('es-HN') },
        { header: 'Estado', value: (reservation) => reservation.estado },
      ], isClient ? 'mis_reservas_asistente' : 'reservas_asistente');
      return;
    }

    if (type === 'miembros') {
      downloadCsv(data.miembrosView, [
        { header: 'ID', value: (member) => member.id },
        { header: 'Nombre', value: (member) => member.nombre },
        { header: 'Correo', value: (member) => member.correo },
        { header: 'Plan', value: (member) => member.plan },
        { header: 'Estado', value: (member) => member.estado },
        { header: 'Ciudad', value: (member) => member.ciudad },
      ], 'miembros_asistente');
      return;
    }

    if (type === 'pagos') {
      downloadCsv(data.pagosView, [
        { header: 'ID Pago', value: (payment) => payment.id },
        { header: 'Tipo', value: (payment) => payment.tipo },
        { header: 'Cliente', value: (payment) => payment.cliente },
        { header: 'Concepto', value: (payment) => payment.concepto },
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
      text: 'Puedo orientarte sobre reservas, pagos, membresías, sedes, entrenadores, notificaciones y navegación del panel. Intenta con una pregunta más específica.',
    };

    if (!data || !user?.email) {
      return { text: 'Todavía estoy esperando los datos del panel. Intenta de nuevo en unos segundos.' };
    }

    const linkedPerson = data.personas.find((item) => item.correo?.toLowerCase() === user.email?.toLowerCase()) ?? null;
    const memberProfile = linkedPerson ? data.miembrosView.find((item) => item.id === linkedPerson.id_persona) ?? null : null;
    const clientReservations = linkedPerson
      ? data.reservasView.filter((item) => item.clienteId === linkedPerson.id_persona).sort((left, right) => new Date(left.fecha).getTime() - new Date(right.fecha).getTime())
      : [];

    if (normalized.includes('reserva') && isClient) {
      const nextReservation = clientReservations.find((item) => item.estado !== 'cancelada' && new Date(item.fecha).getTime() >= Date.now()) ?? null;

      if (!nextReservation) {
        return {
          text: 'No veo reservas futuras activas en tu perfil. Puedes crear una desde el módulo de reservas filtrando por sede, fecha o tipo.',
          actionLabel: 'Abrir reservas',
          path: '/reservas',
        };
      }

      return {
        text: `Tu próxima reserva es ${nextReservation.servicio} el ${formatDateTime(nextReservation.fecha)} en ${nextReservation.sede}.`,
        actionLabel: 'Ver mis reservas',
        path: '/reservas',
      };
    }

    if ((normalized.includes('membres') || normalized.includes('vence')) && isClient) {
      if (!memberProfile?.fechaVencimiento) {
        return { text: 'No encontré una membresía activa vinculada a tu cuenta. Revisa tu perfil o consulta administración.' };
      }

      return {
        text: `Tu membresía ${memberProfile.plan} vence el ${new Date(memberProfile.fechaVencimiento).toLocaleDateString('es-HN')} y su estado actual es ${memberProfile.estado}.`,
        actionLabel: 'Ver perfil',
        path: '/perfil',
      };
    }

    if (normalized.includes('pago')) {
      if (isClient) {
        const latestPayment = memberProfile?.pagos.slice().sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime())[0] ?? null;

        return latestPayment
          ? { text: `Tu pago más reciente fue por ${latestPayment.monto.toFixed(2)} USD con referencia ${latestPayment.referencia} el ${new Date(latestPayment.fecha).toLocaleDateString('es-HN')}.`, actionLabel: 'Abrir perfil', path: '/perfil' }
          : { text: 'No encontré pagos registrados en tu perfil todavía.' };
      }

      return {
        text: `El panel registra ${data.pagosView.length} pagos y ${data.reservas.filter((item) => item.estado === 'creada').length} reservas todavía en seguimiento de pago.`,
        actionLabel: 'Ir a pagos',
        path: '/pagos',
      };
    }

    if ((normalized.includes('export') || normalized.includes('descarg')) && normalized.includes('reserva')) {
      return {
        text: isClient ? 'Voy a exportar tus reservas actuales a CSV.' : 'Voy a exportar las reservas visibles del sistema a CSV.',
        actionLabel: 'Descargar CSV',
        exportType: 'reservas',
      };
    }

    if ((normalized.includes('export') || normalized.includes('descarg')) && normalized.includes('miembro')) {
      return {
        text: 'Voy a exportar el listado de miembros a CSV.',
        actionLabel: 'Descargar CSV',
        exportType: 'miembros',
      };
    }

    if ((normalized.includes('export') || normalized.includes('descarg')) && normalized.includes('pago')) {
      return {
        text: 'Voy a exportar el historial de pagos a CSV.',
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

    if (normalized.includes('agenda') || normalized.includes('hoy')) {
      if (isTrainer && linkedPerson) {
        const trainer = data.entrenadoresView.find((item) => item.id === linkedPerson.id_persona) ?? null;
        const nextSession = trainer?.schedule.slice().sort((left, right) => new Date(left.horario).getTime() - new Date(right.horario).getTime()).find((item) => new Date(item.horario).getTime() >= Date.now()) ?? null;
        return nextSession
          ? { text: `Tu siguiente bloque es ${nextSession.actividad} el ${formatDateTime(nextSession.horario)} en ${nextSession.sede}.`, actionLabel: 'Ver agenda', path: '/reservas' }
          : { text: 'No detecto bloques futuros asignados ahora mismo. Revisa tu agenda para confirmarlo.' };
      }

      return {
        text: `Hoy hay ${data.reservasView.filter((item) => new Date(item.fecha).toDateString() === new Date().toDateString()).length} reservas visibles en el sistema.`,
        actionLabel: 'Abrir panel',
        path: '/',
      };
    }

    if (normalized.includes('sede')) {
      const topSede = data.sedesView.slice().sort((left, right) => right.reservas - left.reservas)[0] ?? null;
      return topSede
        ? { text: `La sede con mayor movimiento es ${topSede.nombre}, con ${topSede.reservas} reservas y ${topSede.actividades} actividades.`, actionLabel: 'Ver sedes', path: '/sedes' }
        : { text: 'Todavía no hay datos de sedes disponibles.' };
    }

    if (normalized.includes('entrenador')) {
      const topTrainer = data.entrenadoresView.slice().sort((left, right) => right.workload - left.workload)[0] ?? null;
      return topTrainer
        ? { text: `${topTrainer.nombre} lidera la carga semanal con ${topTrainer.workload} bloques y ${topTrainer.assignedCount} clientes asignados.`, actionLabel: 'Ver entrenadores', path: '/entrenadores' }
        : { text: 'No hay entrenadores disponibles para resumir ahora mismo.' };
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
      return role === 'client'
        ? { text: 'Como cliente puedes reservar desde Reservas, revisar tu vigencia en Perfil y monitorear avisos desde la campana superior.' }
        : { text: 'Puedes navegar por módulos desde la barra lateral, usar la campana para alertas y aplicar filtros en los gráficos del panel para analizar operación.' };
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
            <input className="input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Pregunta algo sobre tu operación..." />
            <button type="submit" className="btn">Enviar</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default HelpAssistant;