# Cali Rivera / Taller del Artista — Plan maestro

Cliente: Cali Rivera (artista, San José, CR). Admin único: arte@calirivera.com.
Dominios (pagos hasta ~nov 2027, en Hostinger): calirivera.com, tallerdelartista.com.
Sitio actual: Hostinger AI Builder (Zyro), hecho por su sobrino José Carlos. Se reemplaza por código propio.
Canal principal de Cali: celular. No es tech-savvy. 26 años de labor del Taller, ~68.000 archivos perdidos en un hackeo.

## Stack (costo $0)
- Next.js (App Router, SSR/ISR) + TypeScript, SIN Tailwind → SCSS modules
- Firestore (Spark, 50k lecturas/día) — service account la provee Luis
- Firebase Storage o imágenes en repo/CDN de Netlify (decidir en rama 3)
- GitHub repo → Netlify (hosting), DNS de Hostinger apuntando a Netlify
- Cache de 2 capas: SSR/ISR (servidor) + localStorage (cliente) con invalidación por versión/updatedAt
- Rate limiting con exponential backoff en endpoints públicos y de auth (no para admin ya autenticado); tope ~2.000 lecturas/día por cliente

## Mapa de sitio actual (extraer todo)
/ · /biografia · /catalogos-and-proyectos · /taller-del-artista · /colecciones
(atmosfera, musas-del-cantaro, suenos-en-azul, detras-de-la-ventana, exvotos, plegaria, la-cofradia) · /trayectoria-and-entrevistas
Redes: facebook.com/elarteparaserlibres · instagram.com/caliriveraartista. Lema: "EL ARTE ES PARA SER LIBRES."

## Secciones nuevas (de la llamada)
- Programa de Colaboración al Artista Nacional (casos: origamista campeón mundial de halterofilia en Atenas; porristas con síndrome de Down campeonas mundiales; cantante 2º lugar festival de ópera en Perú; Semilla de Danza → Teatro Nacional; evento pro-trasplante de corazón; vestuario donado)
- La Incubadora (jueves, literatura: poetas, escritores, cuentistas) — fichas de autor + un poema
- Jóvenes Talentos (viernes, músicos, bailarines, performance)
- Bitácora / eventos (blog, más nuevo → más viejo)
- Manifiesto del Taller

## CMS custom (requisito central)
- Login por código al correo (solo arte@calirivera.com)
- WYSIWYG in-place: contenteditable en textos, botones "+" en listas, preview en el mismo lugar, mobile-first
- Formularios que reaccionan a lo que ingresa; subida de imágenes con datos (título, año, técnica, medidas)
- Toda lista de largo indeterminado: búsqueda + paginación
- Motor de diagramación procedural: toma headings/párrafos y los diagrama con uno de varios layouts "award" según largo/estructura
- Avisar si una obra fue alterada por IA (hay piezas que el sobrino modificó con IA → marcar/reemplazar)

## Diseño
- Award-grade (ver ../award-grade-web-skills, especialmente 01, 02, 03, 04, 08, 19, 20, 24)
- Cada página con su propia retícula/diagramación, lenguaje cohesivo
- Imágenes de baja calidad → efectos zoom-out + blur / copias, para que la resolución no comprometa
- Fase final: voz de Cali (ElevenLabs, a partir de audios de WhatsApp, con su consentimiento) narrando las secciones

## Ramas (cada una es su propia tarea)
1. Extracción del sitio actual → content/*.json + assets/            [puede correr ya]
2. Rescate del sitio viejo hackeado (Wayback/Google) + mapa de URLs rotas → redirects   [puede correr ya]
3. Scaffold Next.js + SCSS + modelo Firestore + seed                 [puede correr ya]
4. CMS custom (auth por código, inline edit, rate limit)             [depende de 3]
5. Sistema de diseño + páginas award-grade + motor procedural        [depende de 1, 3]
6. Secciones nuevas (Colaboración, Incubadora, Jóvenes Talentos, Bitácora, Manifiesto) [depende de 4, 5]
7. Voz de Cali (ElevenLabs) + experiencia auditiva                   [bloqueada: audios + consentimiento]
8. SEO, sitemap, redirects 301, OG                                   [depende de 2, 5]
9. Deploy: GitHub + Netlify + DNS Hostinger + entrega del sobrino     [bloqueada: permisos]
10. Update final "award-winning / product-market fit" + verificación  [al final]

## Permisos / insumos (actualizado 2026-11-10)
- [x] Borrado habilitado en la carpeta (locks de git limpiados)
- [x] Firebase preparado: `service-account.json` en la RAÍZ del repo (gitignored) → `cd web && npm install && npm run firebase:setup`
- [ ] Luis conecta el service account (crear Firestore + activar Authentication en la consola)
- [ ] Luis crea el repo en GitHub y lo conecta (el código ya tiene git local)
- [ ] DNS Hostinger: se pide cuando el sitio esté listo (rama 9)
- [x] OK de Cali para clonar su voz · [ ] Luis consigue los audios de WhatsApp
- [x] Guión de voz: doc "Guión de voz · Cali Rivera" (24 beats) — pendientes marcados ahí
- Fotos: se usan las extraídas del sitio (assets/ y legacy/assets/). OJO: 59/79 imágenes del sitio actual tienen firma C2PA de OpenAI (pasaron por IA) → Cali revisa antes de publicarlas como obra.

## Hallazgos de ramas 1–2
- content/_notes.md: páginas vacías (Atmósfera, Plegaria, La Cofradía), 11 imágenes <1000 px, 18 archivos (PDFs, CV, mp3).
- legacy/README.md: sitio Joomla 2001–2026 rescatado de Wayback: 544 páginas, 364 imágenes, 16 PDFs, agenda del Taller 2012–2020 (evidencia para Colaboración/Bitácora), 34 críticas de prensa, redirects.csv.
