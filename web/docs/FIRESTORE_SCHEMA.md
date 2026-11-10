# Firestore — esquema

Plan Spark (gratis): 50.000 lecturas / 20.000 escrituras / 1 GiB por día. Los tipos viven en `src/lib/content/types.ts`.

## Cómo se lee
- El sitio lee **solo desde el servidor** (firebase-admin) dentro de scopes `"use cache"` con `cacheTag` → cada página se prerenderiza y se sirve desde caché; Firestore se toca solo cuando el CMS invalida un tag. Eso deja el consumo diario muy por debajo del límite.
- Capa 2 (cliente): `localStorage` versionado por `settings/site.contentVersion` (`src/lib/cache/client.ts`).
- Sin service account, `repo.ts` cae a JSON local (`../content` → `web/.content`).

## Colecciones

| Colección | Doc id | Campos clave | Notas |
|---|---|---|---|
| `settings` | `site` | siteName, tagline, email, location, social[], footerNote, **contentVersion**, updatedAt | Lectura pública. Toda escritura del CMS sube `contentVersion`. |
| `pages` | slug (`inicio`, `biografia`, `taller-del-artista`, `manifiesto`, …) | title, hero, sections[] (Section → blocks[]), seo, status | Secciones con `layout` (preset del motor procedural, rama 5). |
| `collections` | slug | title, statement, cover, period, artworkIds[], order, status | 7 actuales: atmosfera, musas-del-cantaro, suenos-en-azul, detras-de-la-ventana, exvotos, plegaria, la-cofradia. |
| `artworks` | slug | title, year, technique, dimensions, collectionId, images[], **aiAltered**, availability, notes, order, status | `aiAltered=true` → no se publica hasta reemplazar la imagen. |
| `catalogs` | slug | kind (catalog/project/exhibition), title, year, summary, cover, fileUrl, body[] | |
| `programs` | kind (`colaboracion`, `incubadora`, `jovenes-talentos`) | title, schedule, summary, body[], cover | |
| `people` | slug | name, discipline, programKinds[], bio, portrait, featured[] (p. ej. un poema), links[]; beneficiarios: achievement, supportGiven, date | Una persona puede estar en varios programas. |
| `posts` | slug | title, excerpt, cover, body[], **publishedAt**, tags[], programKind | Bitácora, orden más nuevo → más viejo. |
| `authCodes` | hash del correo | codeHash, expiresAt, attempts | Solo servidor (rama 4). |
| `rateLimits` | `ip:<hash>` / `email:<hash>` | count, windowStart, backoffUntil, strikes | Solo servidor; backoff exponencial (rama 4). |
| `auditLog` | auto | at, actor, action, collection, docId, diff | Solo servidor. |

Todos los documentos publicables llevan: `id, slug, status ('draft'|'published'), order?, createdAt, updatedAt` (ISO).

### Block (contenido enriquecido)
`heading | paragraph | image | gallery | quote | poem` — ver `Block` en `types.ts`. Las imágenes (`ImageAsset`) llevan `lowRes` para que el diseño use tratamientos de blur/zoom en vez de mostrar pixeles.

## Índices
`firestore.indexes.json`: posts (status + publishedAt desc, con y sin programKind), artworks (status + collectionId + order), people (status + programKinds array-contains + order).

## Reglas
`firestore.rules`:
- Contenido: lectura pública si `status == 'published'`; escritura solo admin.
- Admin = custom claim `admin == true` **o** correo verificado `arte@calirivera.com`.
- `settings`: lectura pública, escritura admin.
- `authCodes`, `rateLimits`, `auditLog`: cerradas al cliente (solo firebase-admin).

Desplegar reglas/índices: `npx firebase-tools deploy --only firestore --project <id>`.
