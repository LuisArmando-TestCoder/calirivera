# Rescate del sitio viejo (rama 2)

Fuente: Wayback Machine (CDX + snapshots `id_`). El sitio Joomla de calirivera.com estuvo vivo y archivado de 2001 a jun-2026; tallerdelartista.com fue Joomla (2009), luego un WordPress de plantilla (2022, imágenes demo) y en 2025 "cuenta suspendida".

## Qué hay aquí
- `urls.json` — inventario de 4.560 URLs archivadas (último snapshot 200, estados, `relevant`, `canonical`).
- `html/` — 544 páginas HTML canónicas descargadas (deduplicadas por id de artículo Joomla). Datos no confiables: no abrir en navegador con scripts.
- `content/*.json` — texto, título, imágenes y enlaces por sección: obras (120), actividades_taller (83), prensa/"puntos de vista" (34), historico (28), exposiciones (25), videos (17), recomendaciones (15), cafe_arte (8), biografia (5), taller (5), manifiesto/mi-visión (2), galeria (3), otros (183, mayormente sitio 2006 y flash 2001-04).
- `assets/` — 364 imágenes recuperadas de las referenciadas por esas páginas (`_index.json` url→archivo). `_missing.json`: 520 imágenes referenciadas que Wayback nunca guardó.
- `pdf/` — 16 PDFs: catálogos Exvotos, Plegaria, Banderas Corpus Christi, Elementos (Manifiesto de Irazú), Sincretismo religioso, Prayer Flags, El Agua, Alquimia de Almas, Biomaster, Programa Japón 2010, Boletín, La NO Bienal 2020 (bases + VF), menús del Café Arte.
  - ⚠️ `Alquimia_de_Almas.pdf` y `biomaster.pdf` están truncados (5 MB) en el propio archivo: pedirle los originales a Cali.
- `redirects.csv` — URL vieja → ruta nueva sugerida (o `gone`). `/bitacora` es ruta nueva del plan.
- `press.md` — prensa externa encontrada en la web.
- `content/_hack_flags.json` — revisión de inyecciones.

## Hackeo
No se encontró spam/inyección en las páginas archivadas: los 55 avisos son scripts legítimos del sitio viejo (popups, Google Analytics viejo, shoutbox, tour virtual en virtualtourscr.com). El hackeo probablemente pasó después del último snapshot o Wayback no lo capturó. Aun así, no reutilizar HTML ni JS viejo: solo texto e imágenes.

## Material clave para el sitio nuevo
- CV completo y biografía larga (nace 1969; 1er lugar Iberoamericano de arte textil 2010; estandartes de la Carta de la Tierra 2003; pasantía Atitlán 2009).
- "Puntos de vista": 20+ críticas y notas de prensa 1995–2005 (La Nación, La República, Tico Times, Fabio Herrera, Mario Maffioli…) → Trayectoria & Entrevistas.
- Exposiciones 2000–2014 con fechas.
- Agenda mensual del Taller del Artista 2012–2020 (talleres, Café Arte, La NO Bienal) → evidencia para el Programa de Colaboración al Artista Nacional y la Bitácora.
- Videos (YouTube embebidos) en `content/videos.json`.

Scripts usados: `../tools/{inventory,dedupe,fetch2,extract,imgs,redirects}.py`.
