// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// Usamos import.meta.env que es el estándar de Vite para variables de entorno
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validación básica de seguridad
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan las variables de entorno de Supabase en el archivo .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);