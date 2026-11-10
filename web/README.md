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
