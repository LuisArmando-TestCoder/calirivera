# Notas de extracción — calirivera.com (2026-11-10)

Fuente real del contenido: el JSON `pageData` embebido en los props de Astro (sitio Hostinger AI Builder/Zyro), no el HTML visible. Crudos en `.raw/` (`*.html`, `*.pagedata.json`). Scripts: `~/scripts/extract2.py` (VM).

## Inventario
- 13 páginas → `content/<slug>.json`; sitio global (nav, estilos, header/footer) → `content/_site.json`.
- 79 imágenes únicas (107 referencias) en `assets/<slug>/`, descargadas en resolución original (sin cdn-cgi). Logo en `assets/_site/logo.png`.
- 18 archivos en `assets/files/` (~259 MB): 16 PDFs de catálogos/CV/menú, CV en inglés (.docx), audio `detras_de_la_ventana.mp3`.
- Videos: YouTube (Detrás de la ventana, 4 en Taller del Artista). El hero usa 2 videos de stock de Pexels (no son de Cali; no se descargaron).

## Hallazgo crítico: imágenes generadas/editadas con IA
- **59 de 79 imágenes únicas llevan manifiesto C2PA de OpenAI con `trainedAlgorithmicMedia`** (o sea: pasaron por ChatGPT/gpt-image). Incluye casi todas las galerías de Sueños en Azul, Detrás de la ventana, Exvotos, Musas del Cántaro, y fotos de biografía (incendio-1/2/3, cali-bebe, teatro, cruz, riga-2).
- Coincide con lo que dijo Cali: el sobrino "metió en IA" algunas obras. El metadato no dice si es una restauración/upscale fiel o una obra reinventada → **Cali debe revisar cada una** antes de publicarlas como obra suya. Lista en `content/_images.json` (`aiSignatures`).
- Recomendación: en el modelo de datos, campo `provenance: original | ai-restored | ai-generated | pending-review`, y no publicar `pending-review` en colecciones.

## Imágenes de baja calidad (<1000 px lado mayor): 11
- 6AEYm85N10s.jpeg
- beso-II4wdOCaLll6pSMP.PNG
- cama-1YtbTvTIoHTpOrkA.PNG
- candela-SjvXHdgnaGUodgNo.PNG
- captura-alquimia-2008-8EhGLBTulaFqHDhe.PNG
- chase-2-eOMZM2Q9DuC2xuPI.jpeg
- delirio-12W8wojiBV02mYAN.jpg
- esfera-oficial-XjBqPXfN2Znbch01.PNG
- hqdefault.jpg
- ict-2HZ2xB2MXX8gxLdP.webp
- sexto-sol-t89E6rzBvHb0tenu.PNG
→ Candidatas al tratamiento zoom-out + blur del plan, o a reemplazo con fotos originales.

## Textos faltantes / páginas vacías
- **Atmósfera**: solo el título, sin texto ni imágenes.
- **Plegaria**: página sin bloques (vacía). Existe el PDF `plegaria_catalogo.pdf`.
- **La Cofradía**: solo "LA COFRADÍA · 2017" + botón al PDF (44 MB).
- **Trayectoria & Entrevistas**: sin texto propio; solo botones a CV (ES pdf / EN docx) y 7 notas de prensa.
- **Catálogo "LA CASA MUSEO"**: botón sin enlace.
- Galerías sin títulos, años, técnicas ni medidas por obra (alt vacío). Solo 3 obras con nombre (Sueños en Azul: América Descubierta, Un corazón herido…, Frida Kahlo). Fichas técnicas probablemente dentro de los PDFs → tarea pendiente: extraer fichas de los PDFs.
- Musas del Cántaro y Sueños en Azul tienen texto rico; Sueños en Azul trae un relato largo en primera persona (~1.700 palabras) ideal para el manifiesto/voz.
- Enlaces de prensa llevan `?utm_source=chatgpt.com` → limpiar.
- Metadatos: `aiWebsiteType: Online store`, `inLanguage: en` en JSON-LD (incorrecto, debe ser es-CR).

## Datos útiles
- Contacto: arte@calirivera.com · San José, CR · WhatsApp Taller +506 8348 3785 · Taller en Tres Ríos, Cartago (mapa).
- Reseña de Alfonso Chase (La Prensa Libre, 5 mar 2009) en Catálogos & Proyectos.
- Proyecto POETRY (2001), instalación "Una poesía contada con imágenes y sonidos".
- Tipografía actual: escala h1 56/40, h2 40/32, h3 28/24 (ver `_site.json.styles`).
