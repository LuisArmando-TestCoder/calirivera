# calirivera.com — web

Next.js 16 (App Router, Cache Components) · TypeScript · SCSS modules (sin Tailwind) · Firestore · Netlify.
Plan general: `../MASTER_PLAN.md`.

## Correr local
```bash
cd web
npm install
cp .env.example .env.local        # opcional
npm run dev                       # http://localhost:3000
```
Sin credenciales, el sitio lee el JSON de `../content` (lo copia `scripts/sync-content.mjs` a `web/.content` antes de `dev` y `build`).

Con Firestore: guardar el service account en `web/.secrets/service-account.json` **o** en `FIREBASE_SERVICE_ACCOUNT`. Ambos están en `.gitignore`.

## Scripts
`dev` · `build` · `start` · `lint` · `typecheck` · `sync-content`

## Estructura
```
src/
  app/                    rutas (una carpeta por página; [slug] para colecciones, catálogos, obra, bitácora)
    admin/                entrada del CMS (rama 4), noindex
  components/             componentes con su .module.scss
  lib/
    content/types.ts      modelo de datos
    content/repo.ts       lecturas (Firestore → fallback JSON), cada una "use cache" + cacheTag
    cache/                capa 1 servidor (tags, invalidateContent) + capa 2 cliente (localStorage versionado)
    firebase/             admin.ts (servidor) · client.ts (navegador)
    routes.ts             mapa del sitio + slugs viejos de colecciones (redirects 301)
  styles/                 _tokens.scss (oklch, clamp, motion) · _reset.scss · globals.scss
docs/FIRESTORE_SCHEMA.md  colecciones, índices, reglas
firestore.rules · firestore.indexes.json · firebase.json
netlify.toml              base = web
```

## Caché en dos capas
1. **Servidor**: funciones de `repo.ts` con `"use cache"`, `cacheLife("max")` y `cacheTag("c:<colección>[:slug]")`. El CMS llama `invalidateContent()` (`updateTag` en Server Actions, `revalidateTag(tag, "max")` en Route Handlers).
2. **Cliente**: `useVersionedCache(key, contentVersion, fetcher)`; `VersionSync` limpia entradas viejas cuando cambia `settings.contentVersion`.

## Deploy (rama 9)
Repo GitHub con raíz `cali-rivera/` → Netlify (base `web`) → DNS de calirivera.com / tallerdelartista.com en Hostinger apuntando a Netlify. Variables de entorno en Netlify, nunca en el repo.

## Firebase: conectar el service account

1. Firebase Console → Configuración del proyecto → **Cuentas de servicio** → *Generar nueva clave privada*.
2. Guardar el JSON como **`service-account.json` en la raíz del repo** (`cali-rivera/service-account.json`). Está en `.gitignore`.
3. Firestore Database → *Crear base de datos* (modo producción) y Authentication → *Comenzar* (si no existen).
4. `cd web && npm install && npm run firebase:setup` → valida la conexión, publica `firestore.rules` e índices, crea el usuario admin `arte@calirivera.com` con claim `admin`, crea `settings/site` y sube el contenido de `content/` con forma de modelo.
5. Netlify: `npm run firebase:netlify-env` escribe `../netlify.env` (git-ignored) con `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` para pegar en las variables del sitio. Borralo después.

Sin service account el sitio funciona igual, leyendo el JSON local de `content/`.
El sitio solo usa `firebase-admin` en el servidor: no hace falta config web de Firebase.

## CMS (editor de Cali)

Dos formas de editar, las dos solo para `ADMIN_EMAIL` (arte@calirivera.com):

1. **En la página** — con sesión iniciada, cada página pública muestra «✎ Editar esta página». Los textos se editan tocándolos; las fotos se cambian tocándolas (recorte + punto importante + descripción); las listas tienen «＋ Agregar» y ↑ ↓ × en cada elemento. Barra inferior: **Deshacer · Guardar borrador · Publicar · Salir**. El borrador se guarda por página (`drafts`) y se retoma al volver.
2. **Panel `/admin`** — accesos grandes (Nueva entrada de Bitácora, Nueva persona, Nueva obra…), listas con búsqueda + paginación, formularios con contadores, validación y vista previa por bloque, selector de diagramación por sección, borrador/publicado, **Historial** (cada cambio se puede deshacer) y **Papelera**.

**Entrar:** `/admin/entrar` → código de 6 números al correo (10 min, 5 intentos, un solo uso, guardado con HMAC). Sesión de 30 días en cookie httpOnly firmada (`cr_session`) + cookie `cr_admin=1` que solo le avisa a las páginas estáticas que carguen el editor (el servidor nunca confía en ella).

**Rate limiting** (colección `rateLimits`, backoff exponencial, IP hasheada): pedir código 5/10 min por IP y 5/h por correo; verificar 10/10 min por IP; API pública `/api/public/search` 60/min y ~2000 lecturas/día por cliente. El admin con sesión no tiene límites.

**Cómo se integra con el diseño:** los componentes del contrato (`src/components/cms/editable.tsx`) solo agregan `data-cms-*`; `CmsBoot` (en el layout raíz) carga el editor únicamente si existe `cr_admin`. Para visitantes: cero JS de edición y páginas 100 % estáticas.
- `path` de un campo: `"<colección>/<id>#<campo.ruta>"` (p. ej. `pages/biografia#sections.2.blocks.0.text`).
- `EditableList` de un arreglo dentro de un documento: `path="pages/biografia#sections.2.blocks"`, `itemType="block" | "image" | "link"`.
- `EditableList` de una colección entera: `path="posts"` (sin `#`), `itemType="post"`; cada elemento debe contener algún `Editable*` con path `posts/<id>#…`.

**Variables:** `SESSION_SECRET`, `SMTP_*`, `MEDIA_STORE`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `GITHUB_PUBLIC_DIR` (ver `.env.example`). Generar el secreto: `npm run cms:secret`.

**Fotos:** se optimizan en el servidor (sharp → WebP 2400 px + placeholder borroso; marca `lowRes` si el original mide < 1000 px). Con `MEDIA_STORE=github` se commitean a `web/public/media/uploads/…` y aparecen cuando Netlify termina de redeployar (1–3 min; cada foto dispara un build). Firebase Storage requiere plan Blaze.

**Sin service account (desarrollo):** todo se guarda en `../content/<colección>/<id>.json` y `web/.cms-data/` (ignorado por git); los códigos de acceso se imprimen en la consola si no hay SMTP.

Tests: `npm test` (rate limit, códigos, sesión, operaciones, validación).
