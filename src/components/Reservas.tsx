import React, { useMemo, useState } from 'react';
import AreaChartNeon from './AreaChartNeon';
import DonutChart from './DonutChart';
import BarChart from './BarChart';
import PieDonut from './PieDonut';
import SedeDistributionChart from './SedeDistributionChart';

export const Reservas: React.FC = () => {
  // demo / ejemplo de reservas (puedes reemplazar por datos reales desde Supabase)
  const reservas = [
  // LUNES 09
  { id: 'r1', cliente: 'Juan Pérez', servicio: 'Spinning', fecha: '2026-03-03T09:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '09:00' },
  { id: 'r2', cliente: 'María López', servicio: 'Yoga', fecha: '2026-03-09T11:00:00', estado: 'Pendiente', attended: false, sede: 'City Mall', hora: '11:00' },
  { id: 'r11', cliente: 'Roberto Sosa', servicio: 'Spinning', fecha: '2026-03-09T18:30:00', estado: 'Pendiente', attended: false, sede: 'City Mall', hora: '18:30' },
  
  // MARTES 10
  { id: 'r3', cliente: 'Carlos Ruiz', servicio: 'Entrenamiento Personal', fecha: '2026-03-10T08:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '08:00' },
  { id: 'r12', cliente: 'Gabriela M.', servicio: 'Yoga', fecha: '2026-03-10T09:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '09:00' },
  { id: 'r13', cliente: 'Fernando Paz', servicio: 'Crossfit', fecha: '2026-03-10T19:00:00', estado: 'Cancelada', attended: false, sede: 'City Mall', hora: '19:00' },
  
  // MIÉRCOLES 11 (Día de alta demanda)
  { id: 'r4', cliente: 'Ana Gómez', servicio: 'Spinning', fecha: '2026-03-11T07:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '07:00' },
  { id: 'r6', cliente: 'Sofía Ruiz', servicio: 'Pilates', fecha: '2026-03-11T17:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '17:00' },
  { id: 'r14', cliente: 'Luciana Rios', servicio: 'Spinning', fecha: '2026-03-11T18:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '18:00' },
  { id: 'r21', cliente: 'Kevin Duarte', servicio: 'Spinning', fecha: '2026-03-11T19:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '19:00' },

  // JUEVES 12 (Hoy)
  { id: 'r5', cliente: 'Luis Díaz', servicio: 'Yoga', fecha: '2026-03-12T10:30:00', estado: 'Cancelada', attended: false, sede: 'Multiplaza', hora: '10:30' },
  { id: 'r16', cliente: 'Saraí Mejía', servicio: 'Pilates', fecha: '2026-03-12T10:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '10:00' },
  { id: 'r17', cliente: 'Ricardo V.', servicio: 'Yoga', fecha: '2026-03-12T17:30:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '17:30' },
  { id: 'r19', cliente: 'Josué Lagos', servicio: 'Entrenamiento Personal', fecha: '2026-03-12T20:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '20:00' },

  // VIERNES 13
  { id: 'r18', cliente: 'Paola Nuñez', servicio: 'Spinning', fecha: '2026-03-13T08:00:00', estado: 'Cancelada', attended: false, sede: 'Multiplaza', hora: '08:00' },
  { id: 'r22', cliente: 'Carmen J.', servicio: 'Pilates', fecha: '2026-03-13T07:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '07:00' },
  { id: 'r23', cliente: 'Daniel Rivera', servicio: 'Crossfit', fecha: '2026-03-13T19:30:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '19:30' },

  // SÁBADO 14
  { id: 'r7', cliente: 'Marcos V.', servicio: 'Spinning', fecha: '2026-03-14T09:00:00', estado: 'Pendiente', attended: false, sede: 'City Mall', hora: '09:00' },
  { id: 'r8', cliente: 'Lucía P.', servicio: 'Yoga', fecha: '2026-03-14T11:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '11:00' },
  { id: 'r25', cliente: 'Héctor G.', servicio: 'Spinning', fecha: '2026-03-14T18:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '18:00' },

  // DOMINGO 15
  { id: 'r9', cliente: 'Carlos Ruiz', servicio: 'Entrenamiento Personal', fecha: '2026-03-15T08:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '08:00' },
  { id: 'r27', cliente: 'Óscar M.', servicio: 'Yoga', fecha: '2026-03-15T16:00:00', estado: 'Cancelada', attended: false, sede: 'City Mall', hora: '16:00' },
  { id: 'r29', cliente: 'Alex Flores', servicio: 'Spinning', fecha: '2026-03-15T19:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '19:00' },
  { id: 'r30', cliente: 'Gabriela Castellanos', servicio: 'Pilates', fecha: '2026-03-26T07:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '07:00' },
  { id: 'r31', cliente: 'Fernando Ortiz', servicio: 'Crossfit', fecha: '2026-03-26T18:00:00', estado: 'Pendiente', attended: false, sede: 'City Mall', hora: '18:00' },
  { id: 'r32', cliente: 'Mónica Zúñiga', servicio: 'Spinning', fecha: '2026-03-27T08:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '08:00' },
  { id: 'r33', cliente: 'Héctor Zelaya', servicio: 'Yoga', fecha: '2026-03-27T17:00:00', estado: 'Cancelada', attended: false, sede: 'City Mall', hora: '17:00' },
  { id: 'r34', cliente: 'Daniela Reina', servicio: 'Entrenamiento Personal', fecha: '2026-03-28T09:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '09:00' },
  { id: 'r35', cliente: 'Javier Solís', servicio: 'Spinning', fecha: '2026-03-28T10:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '10:00' },
  
  // SEMANA 4 DE MARZO (Pico de fin de mes)
  { id: 'r36', cliente: 'Sofía Montoya', servicio: 'Yoga', fecha: '2026-03-30T07:30:00', estado: 'Confirmada', attended: true, sede: 'Roatan', hora: '07:30' },
  { id: 'r37', cliente: 'Ricardo Alfaro', servicio: 'Spinning', fecha: '2026-03-30T18:30:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '18:30' },
  { id: 'r38', cliente: 'Paola Mendoza', servicio: 'Pilates', fecha: '2026-03-31T06:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '06:00' },
  { id: 'r39', cliente: 'Andrés Villeda', servicio: 'Crossfit', fecha: '2026-03-31T19:00:00', estado: 'Pendiente', attended: false, sede: 'City Mall', hora: '19:00' },
  { id: 'r40', cliente: 'Elena Carranza', servicio: 'Spinning', fecha: '2026-03-31T07:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '07:00' },

  // INICIO DE ABRIL (Para probar el cambio de mes en el selector)
  { id: 'r41', cliente: 'Marcos Rivera', servicio: 'Yoga', fecha: '2026-04-01T08:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '08:00' },
  { id: 'r42', cliente: 'Lucía Méndez', servicio: 'Spinning', fecha: '2026-04-01T17:30:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '17:30' },
  { id: 'r43', cliente: 'Carlos Espinal', servicio: 'Entrenamiento Personal', fecha: '2026-04-02T09:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '09:00' },
  { id: 'r44', cliente: 'Isabela Duarte', servicio: 'Pilates', fecha: '2026-04-02T18:00:00', estado: 'Pendiente', attended: false, sede: 'City Mall', hora: '18:00' },
  { id: 'r45', cliente: 'Kevin Estrada', servicio: 'Spinning', fecha: '2026-04-03T07:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '07:00' },
  { id: 'r46', cliente: 'Valeria Orellana', servicio: 'Yoga', fecha: '2026-04-03T19:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '19:00' },
  { id: 'r47', cliente: 'Jorge Lobo', servicio: 'Crossfit', fecha: '2026-04-04T10:00:00', estado: 'Cancelada', attended: false, sede: 'Multiplaza', hora: '10:00' },
  { id: 'r48', cliente: 'Natalia Sierra', servicio: 'Pilates', fecha: '2026-04-05T08:30:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '08:30' },
  { id: 'r49', cliente: 'Bairon Mejía', servicio: 'Spinning', fecha: '2026-04-06T18:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '18:00' },
  { id: 'r50', cliente: 'Camila Rosales', servicio: 'Yoga', fecha: '2026-04-06T07:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '07:00' },
  
  // REGISTROS EXTRAS PARA "HORAS PICO" (Mismo día, diferentes horas)
  { id: 'r51', cliente: 'Nelson P.', servicio: 'Spinning', fecha: '2026-03-31T18:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '18:00' },
  { id: 'r52', cliente: 'Fabiola R.', servicio: 'Spinning', fecha: '2026-03-31T18:15:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '18:15' },
  { id: 'r53', cliente: 'Gustavo T.', servicio: 'Spinning', fecha: '2026-03-31T18:30:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '18:30' },
  { id: 'r54', cliente: 'Rina S.', servicio: 'Yoga', fecha: '2026-04-01T17:00:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '17:00' },
  { id: 'r55', cliente: 'Samuel K.', servicio: 'Yoga', fecha: '2026-04-01T17:15:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '17:15' },
  { id: 'r56', cliente: 'Tania B.', servicio: 'Yoga', fecha: '2026-04-01T17:45:00', estado: 'Confirmada', attended: true, sede: 'Multiplaza', hora: '17:45' },
  { id: 'r57', cliente: 'Victor M.', servicio: 'Crossfit', fecha: '2026-04-02T19:00:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '19:00' },
  { id: 'r58', cliente: 'Wendy G.', servicio: 'Crossfit', fecha: '2026-04-02T19:20:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '19:20' },
  { id: 'r59', cliente: 'Xavi L.', servicio: 'Crossfit', fecha: '2026-04-02T19:40:00', estado: 'Confirmada', attended: true, sede: 'City Mall', hora: '19:40' },
];

  // Preparar datos para gráficos
  const stats = useMemo(() => {
    // Últimos 7 días (etiquetas)
    const today = new Date('2026-03-15');
    const labels: string[] = [];
    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      labels.push(d.toLocaleDateString('es-ES', { month: 'short', day: '2-digit' }));
      dayKeys.push(d.toISOString().slice(0, 10));
    }

    // Contar por día
    const countsByDay = dayKeys.map(k => reservas.filter(r => r.fecha.startsWith(k)).length);
    const countsAttended = dayKeys.map(k => reservas.filter(r => r.fecha.startsWith(k) && r.attended).length);

    // Distribución por estado
    const estadoCounts: Record<string, number> = {};
    reservas.forEach(r => { estadoCounts[r.estado] = (estadoCounts[r.estado] || 0) + 1; });
    const total = reservas.length;
    const confirmed = estadoCounts['Confirmada'] || estadoCounts['Confirmado'] || 0;
    const pending = estadoCounts['Pendiente'] || 0;
    const cancelled = estadoCounts['Cancelada'] || 0;

    // Por día de la semana (Lun..Dom)
    const weekdayCounts = [0,0,0,0,0,0,0];
    reservas.forEach(r => {
      const d = new Date(r.fecha);
      weekdayCounts[d.getDay() === 0 ? 6 : d.getDay() - 1]++;
    });

    return { labels, countsByDay, countsAttended, estadoCounts, total, confirmed, pending, cancelled, weekdayCounts };
  }, [reservas]);

  const donutPercent = Math.round((stats.confirmed / Math.max(1, stats.total)) * 100);

  // meses disponibles desde reservas
  // Generar lista de los 12 meses del año basado en el año más reciente de las reservas
  const months = useMemo(() => {
    // determinar año más reciente en reservas
    const latest = reservas.reduce((acc, r) => {
      const d = new Date(r.fecha);
      return (!acc || d > acc) ? d : acc;
    }, null as Date | null) || new Date();
    const year = latest.getFullYear();
    const list: { key: string; label: string }[] = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(year, m, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
      list.push({ key, label });
    }
    return list; // orden: Ene..Dic
  }, [reservas]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    // por defecto usar el mes de la reserva más reciente
    const latest = reservas.reduce((acc, r) => {
      const d = new Date(r.fecha);
      return (!acc || d > acc) ? d : acc;
    }, null as Date | null) || new Date();
    return `${latest.getFullYear()}-${String(latest.getMonth()+1).padStart(2,'0')}`;
  });

  // preparar datos para últimos 7 días dentro del mes seleccionado
  // Agrupar reservas por fecha dentro del mes seleccionado y generar puntos para AreaChartNeon
  const areaData = useMemo(() => {
    const conteoPorFecha: { [key: string]: number } = {};

    reservas
      .filter(r => r.fecha.startsWith(selectedMonth))
      .forEach(res => {
        const fechaSimple = res.fecha.split('T')[0];
        conteoPorFecha[fechaSimple] = (conteoPorFecha[fechaSimple] || 0) + 1;
      });

    return Object.keys(conteoPorFecha)
      .map(fecha => ({
        name: new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
        reservas: conteoPorFecha[fecha],
        fechaOriginal: fecha,
      }))
      .sort((a, b) => a.fechaOriginal.localeCompare(b.fechaOriginal));
  }, [reservas, selectedMonth]);

  // Distribución por sede
  const sedesMap: Record<string, number> = {};
  reservas.forEach(r => { sedesMap[r.sede] = (sedesMap[r.sede] || 0) + 1; });
  const sedeSegments = Object.entries(sedesMap).map(([label, value], i) => ({ label, value, color: ['#06b6d4', '#7c3aed', '#06d6a0', '#ff7ab6'][i % 4] }));

  const reservaCountTotal = (segments: {label:string,value:number}[]) => segments.reduce((s,seg)=>s+seg.value,0) || 1;

  // Estado segments
  const estadoSegments = [
    { label: 'Confirmadas', value: stats.confirmed, color: '#06b6d4' },
    { label: 'Pendientes', value: stats.pending, color: '#f59e0b' },
    { label: 'Canceladas', value: stats.cancelled, color: '#ef4444' },
  ];

  // helper: formatea fecha ISO a '08 Mar - 09:00 AM'
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const datePart = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} - ${timePart}`;
  };

  // ocupación hoy (ejemplo): totalCapacity configurable
  const totalCapacity = 100;
  const todayKey = new Date('2026-03-15').toISOString().slice(0,10);
  const todayCount = reservas.filter(r => r.fecha.startsWith(todayKey)).length;
  const occupancyPercent = Math.round((todayCount / totalCapacity) * 100);

  return (
    <div className="page">
      <h2>Reservas</h2>
      

      <div className="grid" style={{ gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <div>
          <div className="card neon-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ marginBottom: 8 }}>Reservas / Últimos 7 días</h3>
              <div>
                <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ background: 'transparent', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: 8 }}>
                  {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <AreaChartNeon data={areaData} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Tabla de próximas reservas</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>Sede</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {reservas.map(r => (
                  <tr key={r.id}>
                    <td>{r.cliente}</td>
                    <td>{r.servicio}</td>
                    <td>{r.sede}</td>
                    <td>{formatDate(r.fecha)}</td>
                    <td>{(() => {
                      const cls = r.estado.startsWith('Confirm') ? 'ok' : r.estado.startsWith('Pend') ? 'warn' : 'danger';
                      return <span className={`pill ${cls}`}>{r.estado}</span>;
                    })()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Distribución por sede (gráfico clave para trazabilidad) */}
          <div style={{ marginTop: 12 }}>
            <SedeDistributionChart data={sedeSegments.map(s => ({ name: s.label, value: s.value, color: s.color }))} />
          </div>
        </div>

        <div>
          <div className="card neon-card" style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
            <div>
              <div className="muted">Total reservas</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.total}</div>
              <div className="muted">Confirmadas: {stats.confirmed} • Pendientes: {stats.pending}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="muted">Ocupación hoy</div>
              <DonutChart percent={occupancyPercent} size={160} color="#06b6d4" />
              <div className="muted">{todayCount} / {totalCapacity} cupos</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h4>Horas / Día (Horas Pico)</h4>
            <BarChart values={stats.weekdayCounts} />
            <div className="muted">Lun • Mar • Mié • Jue • Vie • Sáb • Dom</div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h4>Reservas por Sede</h4>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: '0 0 220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PieDonut segments={sedeSegments} size={200} stroke={28} />
              </div>
              <div style={{ flex: 1 }}>
                {sedeSegments.map(s => {
                  const pct = Math.round((s.value / reservaCountTotal(sedeSegments)) * 100);
                  return (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width:12, height:12, background:s.color, borderRadius:4, boxShadow:`0 8px 26px ${s.color}44` }} />
                      <div style={{ flex:1 }}><strong>{s.label}</strong></div>
                      <div className="muted">{s.value} • {pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h4>Estados</h4>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ flex: '0 0 180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PieDonut segments={estadoSegments} size={160} stroke={30} />
              </div>
              <div className="muted">Completadas vs Canceladas / No asistidas</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reservas;
