# FitHub - Plataforma de Gestión Deportiva

[cite_start]Este proyecto es el backend y sistema de gestión para la cadena de gimnasios **FitHub**.Centraliza la lógica de reservas, membresías y pagos para evitar inconsistencias y sobreventa de cupos.

## 🛠️ Requisitos Previos

* **Node.js**: Versión 18 o superior.
* **Git**: Configurado con tu usuario de GitHub.
* **Supabase**: Cuenta activa con un proyecto creado.

## ⚙️ Configuración del Entorno (Multiplataforma)

Debido a que el equipo utiliza diferentes sistemas operativos (**Arch Linux** y **Windows**), es obligatorio configurar el manejo de finales de línea para evitar conflictos en Git:

### En Windows (PowerShell/CMD):
```bash
git config --global core.autocrlf true

🚀 Instalación y Ejecución
Clonar el repositorio:

git clone [url-del-repo]
cd fithub-web


Instalar dependencias:
npm install

Configurar variables de entorno:
Crea un archivo .env en la raíz basado en .env.example:

Fragmento de código
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase

Correr en modo desarrollo:
npm run dev