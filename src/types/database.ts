// src/types/database.ts

export interface Persona {
  id_persona?: string;
  nombre: string;
  correo: string;
  direccion_ciudad: string;
  direccion_colonia: string;
  direccion_calle: string;
  fecha_nacimiento: string;
}

export interface Telefono {
  id_persona: string;
  telefono: string;
}
export interface Actividad {
  id_actividad?: string;
  nombre_actividad: string;
  descripcion: string;
  tipo: 'Clase grupal' | 'Servicio';
  id_sede: string;
}

export interface Reserva {
  id_reserva?: string;
  id_cliente: string;
  id_programacion: string;
  estado: 'creada' | 'confirmada' | 'cancelada' | 'completada';
  precio_aplicado: number;
}