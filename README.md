# ditu — Sistema de Checklist QA

Herramienta interna de Mediastream para el monitoreo y control de calidad de dispositivos. Permite a los operadores registrar checklists diarios por dispositivo, y a los administradores gestionar ítems, dispositivos y revisar histórico.

## Stack

- HTML + CSS + JS vanilla (sin frameworks, sin build step)
- [Supabase](https://supabase.com) como backend (auth + base de datos)
- GitHub Pages como hosting

## Estructura de archivos

```
├── login.html              # Pantalla de login y activación de cuenta por invitación
├── checklist.html          # Formulario principal de checklist (operadores)
├── dashboard.html          # Vista de resultados e histórico
├── admin.html              # Gestión de ítems del checklist
├── admin_dispositivos.html # Gestión de dispositivos
├── backup.html             # Exportación y respaldo de datos
└── ditu_gif_pequeno.gif    # Asset visual del encabezado
```

## Base de datos (Supabase)

| Tabla | Descripción |
|---|---|
| `checklist_devices` | Dispositivos disponibles (nombre, versión, activo/inactivo) |
| `checklist_items` | Ítems del formulario (pregunta, criterio, orden, activo/inactivo) |
| `checklist_runs` | Registro de cada sesión de checklist completada |
| `checklist_results` | Respuestas individuales por ítem por run |
| `profiles` | Perfil extendido de cada usuario (rol, nombre) |

RLS habilitado en todas las tablas. Políticas: SELECT/INSERT/UPDATE para usuarios autenticados.

## Deploy

El proyecto se despliega automáticamente vía GitHub Pages desde la rama `main`.

URL de producción: `https://jottamdstrm11.github.io/ditu-checklist/`

## Agregar usuarios

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard/project/akpuifenfstvobwtqtcq) → Authentication → Users
2. Click en **Add user** → **Invite user**
3. El usuario recibirá un email con enlace para crear su contraseña
4. El enlace redirige a `login.html` donde se activa la cuenta

> Nota: El plan gratuito de Supabase tiene un límite de 2 emails por hora.

## Configuración de Supabase

| Parámetro | Valor |
|---|---|
| Project URL | `https://akpuifenfstvobwtqtcq.supabase.co` |
| Site URL | `https://jottamdstrm11.github.io/ditu-checklist/login.html` |
| Redirect URLs | `login.html`, `checklist.html` |

## Desarrollo local

No requiere servidor ni instalación. Abrir directamente los `.html` en el navegador o usar cualquier servidor estático:

```bash
# Con Python
python3 -m http.server 8080

# Con Node
npx serve .
```

> Al abrir localmente, el GIF y las rutas relativas funcionan correctamente siempre que se sirvan desde un servidor HTTP (no `file://`).
