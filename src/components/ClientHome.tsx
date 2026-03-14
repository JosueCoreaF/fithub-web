import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGymData } from '../context/GymDataContext';
import heroImage from '../assets/hero.png';

export const ClientHome: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error } = useGymData();

  const linkedPerson = useMemo(() => {
    if (!data || !user?.email) return null;
    return data.personas.find((item) => item.correo?.toLowerCase() === user.email?.toLowerCase()) ?? null;
  }, [data, user?.email]);

  const memberProfile = useMemo(() => {
    if (!data || !linkedPerson) return null;
    return data.miembrosView.find((item) => item.id === linkedPerson.id_persona) ?? null;
  }, [data, linkedPerson]);
  const services = data?.serviciosView ?? [];

  const reservations = useMemo(() => {
    if (!data || !linkedPerson) return [];

    return data.reservasView
      .filter((item) => item.clienteId === linkedPerson.id_persona)
      .slice()
      .sort((left, right) => new Date(left.fecha).getTime() - new Date(right.fecha).getTime());
  }, [data, linkedPerson]);

  const upcomingReservations = useMemo(
    () => reservations.filter((item) => new Date(item.fecha).getTime() >= Date.now() && item.estado !== 'cancelada'),
    [reservations],
  );

  const nextReservation = upcomingReservations[0] ?? null;
  const reservedKeys = useMemo(
    () => new Set(reservations.map((item) => `${item.servicio}-${new Date(item.fecha).toISOString()}`)),
    [reservations],
  );
  const favoriteSede = useMemo(() => {
    const counts = new Map<string, number>();
    reservations.forEach((item) => {
      counts.set(item.sede, (counts.get(item.sede) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort(([, left], [, right]) => right - left)[0]?.[0] ?? null;
  }, [reservations]);
  const favoriteType = useMemo(() => {
    const serviceTypeByName = new Map(services.map((service) => [service.nombre, service.tipo]));
    const counts = new Map<string, number>();

    reservations.forEach((item) => {
      const type = serviceTypeByName.get(item.servicio);
      if (!type) return;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    });

    return Array.from(counts.entries()).sort(([, left], [, right]) => right - left)[0]?.[0] ?? null;
  }, [reservations, services]);
  const preferredWeekday = useMemo(() => {
    const counts = new Map<number, number>();
    reservations.forEach((item) => {
      const day = new Date(item.fecha).getDay();
      counts.set(day, (counts.get(day) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort(([, left], [, right]) => right - left)[0]?.[0] ?? null;
  }, [reservations]);
  const preferredHourBucket = useMemo(() => {
    const counts = new Map<'manana' | 'tarde' | 'noche', number>();
    reservations.forEach((item) => {
      const hour = new Date(item.fecha).getHours();
      const bucket = hour < 12 ? 'manana' : hour < 18 ? 'tarde' : 'noche';
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort(([, left], [, right]) => right - left)[0]?.[0] ?? null;
  }, [reservations]);
  const recommendedServices = useMemo(() => {
    return services
      .filter((item) => new Date(item.fechaISO).getTime() >= Date.now())
      .filter((item) => item.capacidad > item.inscritos)
      .filter((item) => !reservedKeys.has(`${item.nombre}-${new Date(item.fechaISO).toISOString()}`))
      .map((item) => {
        const date = new Date(item.fechaISO);
        const weekday = date.getDay();
        const bucket = date.getHours() < 12 ? 'manana' : date.getHours() < 18 ? 'tarde' : 'noche';
        let score = 0;

        if (favoriteSede && item.sede === favoriteSede) score += 4;
        if (favoriteType && item.tipo === favoriteType) score += 4;
        if (preferredWeekday !== null && weekday === preferredWeekday) score += 3;
        if (preferredHourBucket && bucket === preferredHourBucket) score += 2;

        const seatsLeft = item.capacidad - item.inscritos;
        if (seatsLeft <= 2) score += 2;
        if (date.getTime() - Date.now() <= 1000 * 60 * 60 * 48) score += 1;

        return { ...item, score, seatsLeft };
      })
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return new Date(left.fechaISO).getTime() - new Date(right.fechaISO).getTime();
      })
      .slice(0, 3);
  }, [favoriteSede, favoriteType, preferredWeekday, preferredHourBucket, reservedKeys, services]);
  const completedThisMonth = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return reservations.filter((item) => {
      const date = new Date(item.fecha);
      return item.estado === 'completada' && date.getMonth() === month && date.getFullYear() === year;
    }).length;
  }, [reservations]);
  const weeklyGoalProgress = Math.min(4, completedThisMonth);
  const membershipDaysRemaining = useMemo(() => {
    if (!memberProfile?.fechaVencimiento) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(memberProfile.fechaVencimiento);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  }, [memberProfile?.fechaVencimiento]);

  const membershipAlert = useMemo(() => {
    if (membershipDaysRemaining === null) return null;
    if (membershipDaysRemaining < 0) {
      return {
        tone: 'danger',
        title: 'Tu membresía ya venció',
        detail: 'Tu plan dejó de estar activo. Revisa tu membresía para renovarla o cambiar a otro ciclo.',
      };
    }
    if (membershipDaysRemaining <= 7) {
      return {
        tone: membershipDaysRemaining <= 3 ? 'danger' : 'warn',
        title: 'Tu membresía está por vencer',
        detail: `Quedan ${membershipDaysRemaining} día${membershipDaysRemaining === 1 ? '' : 's'} para tu plan ${memberProfile?.plan ?? 'actual'}.`,
      };
    }
    return null;
  }, [memberProfile?.plan, membershipDaysRemaining]);

  const preferredHourLabel = useMemo(() => {
    if (preferredHourBucket === 'manana') return 'Manana';
    if (preferredHourBucket === 'tarde') return 'Tarde';
    if (preferredHourBucket === 'noche') return 'Noche';
    return 'Flexible';
  }, [preferredHourBucket]);

  const welcomeCopy = useMemo(() => {
    if (nextReservation) {
      return {
        title: `Hola${linkedPerson?.nombre ? `, ${linkedPerson.nombre.split(' ')[0]}` : ''}. Tu próxima sesión ya te espera.`,
        detail: `${nextReservation.servicio} será el ${new Date(nextReservation.fecha).toLocaleString('es-HN')} en ${nextReservation.sede}.`,
      };
    }

    if (membershipDaysRemaining !== null && membershipDaysRemaining <= 7) {
      return {
        title: `Hola${linkedPerson?.nombre ? `, ${linkedPerson.nombre.split(' ')[0]}` : ''}. Mantén tu ritmo activo.`,
        detail: `Tu plan ${memberProfile?.plan ?? 'actual'} está cerca de vencer. Renueva o cambia de ciclo sin salir de la app.`,
      };
    }

    return {
      title: `Hola${linkedPerson?.nombre ? `, ${linkedPerson.nombre.split(' ')[0]}` : ''}. Hoy es un buen día para entrenar.`,
      detail: 'Explora clases, asegura tu cupo y mantén tu progreso con una experiencia pensada para clientes.',
    };
  }, [linkedPerson?.nombre, memberProfile?.plan, membershipDaysRemaining, nextReservation]);

  const suggestedActions = [
    {
      eyebrow: nextReservation ? 'Agenda inmediata' : 'Siguiente paso',
      theme: 'cyan',
      title: nextReservation ? 'Prepara tu próxima clase' : 'Reserva tu próxima sesión',
      detail: nextReservation ? 'Revisa hora, sede y entrenador antes de salir.' : 'Descubre horarios con cupo y confirma en un solo paso.',
      cta: nextReservation ? 'Ver reservas' : 'Reservar ahora',
      onClick: () => navigate('/reservas'),
    },
    {
      eyebrow: membershipAlert ? 'Plan en foco' : 'Control de membresia',
      theme: 'amber',
      title: membershipAlert ? 'Renueva o cambia tu plan' : 'Tu membresía está lista',
      detail: membershipAlert ? membershipAlert.detail : `Tu plan ${memberProfile?.plan ?? 'actual'} sigue ${memberProfile?.estado?.toLowerCase() ?? 'activo'}.`,
      cta: 'Ver membresía',
      onClick: () => navigate('/membresia'),
    },
  ];
  const recommendationCards = [
    {
      eyebrow: 'Afinidad por sede',
      theme: 'emerald',
      title: favoriteSede ? `Tu sede más activa: ${favoriteSede}` : 'Explora una sede favorita',
      detail: favoriteSede ? 'Sigue tu rutina donde ya tienes mejor ritmo y continuidad.' : 'Reserva en la sede que mejor se adapte a tu horario y empieza a crear hábito.',
      cta: 'Ver reservas',
      onClick: () => navigate('/reservas'),
    },
    {
      eyebrow: 'Patron detectado',
      theme: 'cyan',
      title: favoriteType ? `Tu tipo de clase: ${favoriteType}` : 'Descubre clases para ti',
      detail: favoriteType ? `Priorizamos horarios de ${favoriteType.toLowerCase()} cercanos a tu patrón habitual.` : 'Prueba una clase grupal o servicio para encontrar tu ritmo ideal.',
      cta: 'Explorar clases',
      onClick: () => navigate('/reservas'),
    },
  ];

  return (
    <div className="page client-home-page">
      <header className="dashboard-header">
        <div>
          <span className="trainers-eyebrow">Portal del cliente</span>
          <h2>Tu espacio FitHub</h2>
          <p className="muted">Una experiencia pensada para entrenar con ritmo, reservar sin fricción y tener tu plan siempre bajo control.</p>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={() => navigate('/membresia')}>Ver membresía</button>
          <button className="btn ghost" onClick={() => navigate('/pagos')}>Ver mis pagos</button>
          <button className="btn ghost" onClick={() => navigate('/perfil')}>Editar perfil</button>
          <button className="btn" onClick={() => navigate('/reservas')}>Ver mis reservas</button>
        </div>
      </header>

      {error && <p className="muted">{error}</p>}
      {loading && <p className="muted">Cargando tu información...</p>}

      {!loading && !linkedPerson && (
        <article className="card">
          <h3>Perfil pendiente de enlazar</h3>
          <p className="muted">Tu cuenta ya existe, pero todavía no encontramos una persona operativa asociada a tu correo actual.</p>
        </article>
      )}

      <section className="client-home-hero">
        <article className="card client-home-hero-main">
          <span className="trainers-eyebrow">Bienvenida</span>
          <h3>{welcomeCopy.title}</h3>
          <p className="muted">{welcomeCopy.detail}</p>
          <div className="client-home-hero-actions">
            <button className="btn" onClick={() => navigate('/reservas')}>{nextReservation ? 'Ver mi agenda' : 'Reservar ahora'}</button>
            <button className="btn ghost" onClick={() => navigate('/membresia')}>Ver mi membresía</button>
          </div>
          <div className="client-home-hero-visual" aria-hidden="true">
            <img src={heroImage} alt="" className="client-home-hero-image" />
            <div className="client-home-hero-imageOverlay" />
            <div className="client-home-hero-panel">
              <strong>FitHub Momentum</strong>
              <span>{favoriteType ?? 'Tu siguiente clase'} · {favoriteSede ?? 'Tu mejor sede'}</span>
              <small>{preferredHourBucket ? `Tu franja favorita: ${preferredHourBucket}` : 'Listo para tu próxima sesión'}</small>
            </div>
          </div>
        </article>

        <article className="card client-home-hero-side">
          <span className="trainers-eyebrow">Ritmo actual</span>
          <div className="client-home-progress-ring">
            <strong>{weeklyGoalProgress}/4</strong>
            <span>meta mensual visible</span>
          </div>
          <p className="muted">Has completado {completedThisMonth} sesiones este mes. Mantén la constancia para no perder impulso.</p>
          <div className="client-home-hero-kpis">
            <div>
              <strong>{favoriteSede ?? 'Nueva sede'}</strong>
              <span>sede destacada</span>
            </div>
            <div>
              <strong>{favoriteType ?? 'Explora'}</strong>
              <span>tipo sugerido</span>
            </div>
          </div>
        </article>
      </section>

      {membershipAlert && (
        <article className={`card client-alert-card ${membershipAlert.tone}`}>
          <div>
            <strong>{membershipAlert.title}</strong>
            <p className="muted">{membershipAlert.detail}</p>
          </div>
          <button className="btn" onClick={() => navigate('/membresia')}>Revisar membresía</button>
        </article>
      )}

      <section className="client-home-spotlight">
        <article className="card client-home-spotlight-card">
          <div className="client-home-spotlight-head">
            <span className="trainers-eyebrow">Radar personal</span>
            <span className="client-home-spotlight-pill">Momentum activo</span>
          </div>
          <h3>{nextReservation ? 'Tu semana ya tiene una siguiente parada' : 'Tu panel esta listo para activar la semana'}</h3>
          <p className="muted">
            {nextReservation
              ? `Ya tienes ${upcomingReservations.length} reserva${upcomingReservations.length === 1 ? '' : 's'} en agenda. Tu mejor ventana sigue siendo ${preferredHourLabel.toLowerCase()} y ${favoriteSede ?? 'tu sede habitual'} se mantiene como punto fuerte.`
              : `Todavia no tienes una sesion programada. FitHub detecta mejor afinidad con ${favoriteType?.toLowerCase() ?? 'clases guiadas'} y una rutina de ${preferredHourLabel.toLowerCase()} para que retomes sin friccion.`}
          </p>
          <div className="client-home-spotlight-metrics">
            <div>
              <span>Proxima activacion</span>
              <strong>{nextReservation ? nextReservation.servicio : 'Reserva recomendada'}</strong>
              <small>{nextReservation ? new Date(nextReservation.fecha).toLocaleString('es-HN') : 'Explora horarios con cupo inmediato'}</small>
            </div>
            <div>
              <span>Sede con mejor continuidad</span>
              <strong>{favoriteSede ?? 'Pendiente de definir'}</strong>
              <small>{favoriteSede ? 'Tu asistencia reciente la posiciona primero' : 'Prueba una sede y crea tu patron ideal'}</small>
            </div>
            <div>
              <span>Ritmo de entrenamiento</span>
              <strong>{preferredHourLabel}</strong>
              <small>{favoriteType ? `${favoriteType} encaja mejor con tu historial` : 'Aun estamos detectando tus preferencias'}</small>
            </div>
          </div>
          <div className="client-home-hero-actions">
            <button className="btn" onClick={() => navigate('/reservas')}>{nextReservation ? 'Abrir mi agenda' : 'Reservar ahora'}</button>
            <button className="btn ghost" onClick={() => navigate('/membresia')}>Ajustar mi plan</button>
          </div>
        </article>

        <div className="client-home-summary-stack">
          <article className="card client-home-summary-card accent-cyan">
            <div className="client-home-summary-top">
              <span>Reservas activas</span>
              <small>{nextReservation ? 'Agenda viva' : 'Sin bloqueos'}</small>
            </div>
            <strong>{upcomingReservations.length}</strong>
            <p>{nextReservation ? `${nextReservation.servicio} lidera tu agenda actual.` : 'No tienes sesiones futuras confirmadas.'}</p>
          </article>
          <article className="card client-home-summary-card accent-emerald">
            <div className="client-home-summary-top">
              <span>Plan actual</span>
              <small>{memberProfile?.estado ?? 'Pendiente'}</small>
            </div>
            <strong>{memberProfile?.plan ?? 'Sin plan'}</strong>
            <p>{membershipDaysRemaining === null ? 'Todavia no hay vigencia visible para tu cuenta.' : membershipDaysRemaining >= 0 ? `${membershipDaysRemaining} dias restantes antes del siguiente corte.` : `Tu plan vencio hace ${Math.abs(membershipDaysRemaining)} dias.`}</p>
          </article>
          <article className="card client-home-summary-card accent-amber">
            <div className="client-home-summary-top">
              <span>Progreso del mes</span>
              <small>{weeklyGoalProgress >= 4 ? 'Meta conseguida' : 'En construccion'}</small>
            </div>
            <strong>{completedThisMonth}</strong>
            <p>{weeklyGoalProgress >= 4 ? 'Ya alcanzaste la meta visible de este ciclo.' : `Te faltan ${4 - weeklyGoalProgress} sesiones para cerrar tu objetivo actual.`}</p>
          </article>
        </div>
      </section>

      <div className="client-home-grid">
        <article className="card client-home-next-card">
          <span className="trainers-eyebrow">Próxima sesión</span>
          {nextReservation ? (
            <>
              <h3>{nextReservation.servicio}</h3>
              <p className="muted">{new Date(nextReservation.fecha).toLocaleString('es-HN')} · {nextReservation.sede}</p>
              <div className="client-home-next-meta">
                <div className="profile-security-item">
                  <strong>Entrenador</strong>
                  <span>{nextReservation.entrenador}</span>
                </div>
                <div className="profile-security-item">
                  <strong>Estado</strong>
                  <span>{nextReservation.estado}</span>
                </div>
              </div>
              <div className="client-home-hero-actions">
                <button className="btn" onClick={() => navigate('/reservas')}>Gestionar reserva</button>
                <button className="btn ghost" onClick={() => navigate('/pagos')}>Ver mis pagos</button>
              </div>
            </>
          ) : (
            <>
              <h3>Aún no tienes una próxima clase</h3>
              <p className="muted">Explora sesiones disponibles y reserva tu siguiente entrenamiento desde un solo lugar.</p>
              <div className="client-home-hero-actions">
                <button className="btn" onClick={() => navigate('/reservas')}>Buscar clases</button>
              </div>
            </>
          )}
        </article>

        <article className="card client-home-membership-card">
          <span className="trainers-eyebrow">Membresía</span>
          <h3>{memberProfile?.plan ?? 'Sin plan activo'}</h3>
          <p className="muted">{membershipDaysRemaining === null ? 'Sin vigencia visible.' : membershipDaysRemaining >= 0 ? `${membershipDaysRemaining} días restantes en tu plan.` : `Vencida hace ${Math.abs(membershipDaysRemaining)} días.`}</p>
          <div className="profile-security-list">
            <div className="profile-security-item">
              <strong>Estado</strong>
              <span>{memberProfile?.estado ?? 'Sin membresía'}</span>
            </div>
            <div className="profile-security-item">
              <strong>Vigencia</strong>
              <span>{memberProfile?.fechaVencimiento ? new Date(memberProfile.fechaVencimiento).toLocaleDateString('es-HN') : 'No disponible'}</span>
            </div>
            <div className="profile-security-item">
              <strong>Ciudad</strong>
              <span>{memberProfile?.ciudad ?? linkedPerson?.direccion_ciudad ?? 'Sin ciudad registrada'}</span>
            </div>
          </div>
        </article>
      </div>

      <section className="client-home-editorial-section">
        <article className="card client-home-editorial-intro">
          <span className="trainers-eyebrow">Accesos clave</span>
          <h3>Todo lo que necesitas para moverte sin salir del panel.</h3>
          <p className="muted">Reservas, plan y seguimiento inmediato en un bloque con prioridad clara, pensado para uso diario y no como tablero administrativo.</p>
        </article>

        <div className="client-home-actions-grid">
          {suggestedActions.map((item) => (
            <article key={item.title} className={`card client-home-action-card ${item.theme}`}>
              <span className="trainers-eyebrow">{item.eyebrow}</span>
              <h3>{item.title}</h3>
              <p className="muted">{item.detail}</p>
              <button className="btn ghost" onClick={item.onClick}>{item.cta}</button>
            </article>
          ))}
        </div>
      </section>

      <section className="client-home-recommendations-shell">
        <article className="card client-home-recommendation-intro">
          <span className="trainers-eyebrow">Descubrimiento</span>
          <h3>Recomendaciones con más criterio y menos relleno.</h3>
          <p className="muted">FitHub prioriza afinidad real por sede, tipo de clase, horario y cupos disponibles para que tus siguientes decisiones se sientan obvias.</p>
        </article>

        <div className="client-home-recommendations-grid">
          {recommendationCards.map((item) => (
            <article key={item.title} className={`card client-home-action-card ${item.theme}`}>
              <span className="trainers-eyebrow">{item.eyebrow}</span>
              <h3>{item.title}</h3>
              <p className="muted">{item.detail}</p>
              <button className="btn ghost" onClick={item.onClick}>{item.cta}</button>
            </article>
          ))}

          <article className="card client-home-recommendation-list-card">
            <span className="trainers-eyebrow">Sugerencias cercanas</span>
            <h3>Próximas clases para ti</h3>
            <div className="reservas-mini-list">
              {recommendedServices.length > 0 ? recommendedServices.map((service) => (
                <div key={service.id} className="reservas-mini-item">
                  <div className="reservas-mini-head">
                    <strong>{service.nombre}</strong>
                    <span className="pill ok">{service.tipo}</span>
                  </div>
                  <div className="muted">{new Date(service.fechaISO).toLocaleString('es-HN')} · {service.sede}</div>
                  <div className="muted">Entrenador: {service.instructor} · {service.seatsLeft} cupos libres · afinidad {service.score}</div>
                </div>
              )) : <p className="muted">Aún no hay sugerencias claras. Explora nuevas clases y sedes desde tus reservas.</p>}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
};

export default ClientHome;