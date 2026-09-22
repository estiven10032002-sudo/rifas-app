# Mis Rifas

Aplicación web para administrar rifas de hasta 100 puestos (en pesos colombianos):
panel de administración protegido, página pública por rifa, participantes con varios
números, control de pagos, sorteo con resultado guardado, exportación y respaldo.

- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS
- **Base de datos, login e imágenes:** Supabase (Postgres)
- **Hosting:** Vercel

Todo tiene plan gratuito. No necesitas saber programar: sigue los pasos en orden.

---

## Cómo funciona la seguridad (en corto)

- Los datos viven en Supabase, **no** en el navegador. Si cambias de computador o de celular, todo sigue ahí.
- El público **solo** ve el estado de cada número (libre / reservado / pagado) y el ganador. Nunca ve nombres, teléfonos, notas ni pagos.
- Solo quien inicie sesión con tu correo y contraseña puede editar. Las reglas están en la base de datos (RLS), no solo en la pantalla.
- Un número **no puede** asignarse a dos personas: lo impide la base de datos, aunque dos personas guarden al mismo tiempo.
- El sorteo lo hace la base de datos, guarda el resultado y no se puede editar a mano. Para repetirlo hay que **anular** el sorteo con un motivo, y el anulado queda en el historial.

---

## Paso a paso para publicarla

### 1. Crear el proyecto en Supabase

1. Entra a <https://supabase.com> y crea una cuenta (puedes usar GitHub o Google).
2. Pulsa **New project**. Ponle un nombre (por ejemplo `rifas`), elige una contraseña para la base de datos (guárdala) y la región más cercana (por ejemplo *South America (São Paulo)*).
3. Espera un par de minutos a que termine de crearse.

### 2. Crear las tablas

1. En Supabase, abre **SQL Editor** → **New query**.
2. Abre el archivo `supabase/migrations/20250101000000_init.sql` de este proyecto, copia **todo** su contenido y pégalo.
3. Pulsa **Run**. Debe decir *Success*. (Puedes ejecutarlo dos veces sin problema; no borra datos.)

### 3. Copiar las dos claves

En Supabase ve a **Project Settings → API Keys** (o **Data API**) y copia:

- **Project URL** → será `NEXT_PUBLIC_SUPABASE_URL`
- **anon / publishable key** → será `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Ambas son públicas por diseño. **Nunca** uses la clave `service_role` / `secret` en esta app.

### 4. Crear tu usuario administrador

La app **no tiene registro público** a propósito: solo existe el usuario que tú crees.

1. En Supabase ve a **Authentication → Users → Add user → Create new user**.
2. Escribe tu correo y una contraseña larga.
3. Marca **Auto Confirm User**.
4. Recomendado: en **Authentication → Sign In / Providers** desactiva **Allow new users to sign up**, para que nadie más pueda crear cuentas.

### 5. Subir el código a GitHub

1. Crea una cuenta en <https://github.com> si no tienes.
2. Crea un repositorio nuevo (privado está bien) y sube esta carpeta (sin `node_modules`; ya está en `.gitignore`).

### 6. Publicar en Vercel

1. Entra a <https://vercel.com> con tu cuenta de GitHub → **Add New → Project** → elige tu repositorio.
2. Antes de desplegar, abre **Environment Variables** y agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` = la URL del paso 3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave del paso 3
3. Pulsa **Deploy**. En 1–2 minutos tendrás una dirección como `https://tu-proyecto.vercel.app`.

### 7. Entrar y probar

1. Ve a `https://tu-proyecto.vercel.app/login` e inicia sesión.
2. Pulsa **Cargar rifa de prueba**: crea una rifa de 100 puestos con 12 participantes y 24 números ocupados.
3. Explora todo. Cuando termines, en **Mis rifas** usa **Borrar datos de prueba** (no toca tus rifas reales).
4. Crea tu rifa real con **Nueva rifa** y completa **Configuración** (premio, fecha, contacto, reglas, foto).
5. El enlace público de cada rifa es `https://tu-proyecto.vercel.app/rifa/el-nombre-de-tu-rifa`. Cópialo desde el botón del panel y compártelo por WhatsApp.

---

## Uso diario

| Pestaña | Para qué sirve |
|---|---|
| **Resumen** | Recaudado, pendiente, disponibles, reservados, pagados. Tablero de 100 números: toca uno para reservarlo, marcarlo pagado o liberarlo. |
| **Participantes** | Buscar por nombre, teléfono o número. Crear/editar/eliminar personas y asignarles varios números (puedes escribir `3, 7, 10-15`). |
| **Sorteo** | Elige si los reservados participan, confirma y sortea. El resultado queda guardado. |
| **Configuración** | Datos de la rifa, foto del premio, estado, visibilidad pública, eliminar la rifa. |
| **Historial** | Quién cambió qué y cuándo (se registra solo). |
| **Respaldo** | Descarga CSV (participantes, los 100 puestos, resultado del sorteo) y un respaldo completo en JSON. |

**Consejo:** descarga el respaldo JSON al terminar cada rifa y antes del sorteo. El plan gratuito de Supabase no incluye respaldos descargables automáticos.

---

## Que Supabase no se "duerma"

Los proyectos gratuitos de Supabase se pausan tras una semana sin actividad. Este proyecto incluye una tarea diaria (`vercel.json`) que llama a `/api/keepalive`, así que se mantiene activo mientras esté desplegado en Vercel. Si alguna vez ves el proyecto pausado, entra al panel de Supabase y pulsa **Restore**; no se pierden datos.

---

## Actualizar sin perder datos

- Para cambiar el código: edita, haz commit en GitHub y Vercel vuelve a desplegar solo. Los datos están en Supabase y no se tocan.
- Para cambiar la base de datos: **no edites** el archivo `20250101000000_init.sql`. Crea un archivo nuevo en `supabase/migrations/` (por ejemplo `20250301000000_agregar_algo.sql`) y ejecútalo en el SQL Editor. Usa `alter table ... add column if not exists` y evita `drop table`.

---

## Probar en tu computador (opcional)

```bash
npm install
cp .env.example .env.local   # pega tus dos valores
npm run dev                   # http://localhost:3000
npm run typecheck             # revisar tipos
npm run test:db               # 62 pruebas de las reglas de la base de datos
```

Requiere Node 18.18 o superior.

---

## Aviso

Esta herramienta organiza y registra la rifa; no reemplaza los permisos que la ley pueda exigir. En Colombia los juegos de suerte y azar (rifas) tienen normativa propia (Ley 643 de 2001); verifica con la autoridad competente si tu rifa necesita autorización.
