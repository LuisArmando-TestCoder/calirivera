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
