# El editor de Cali («lo que ves es lo que queda»)

## Qué es
Cali entra con su correo (le llega un código, sin contraseña) y edita **sobre el sitio mismo**: toca un texto y
escribe, toca una foto y la cambia, y con «＋ Agregar» suma obras, recuerdos, entradas, fotos, textos o un enlace
de video (YouTube/Vimeo; el sitio no aloja archivos de video). Con «＋ Página nueva» crea una página que se suma
sola al menú.

## Qué pasa con cada cambio
1. **Guardado acá**: cada cambio queda en el dispositivo (localStorage) al instante. Si se apaga el teléfono,
   al volver a «Editar esta página» se recupera solo.
2. **Enviado**: «Publicar» manda los cambios al servidor, que los valida y los guarda.
3. **Armando el sitio**: con el almacén GitHub, la publicación es UN commit en `content/…`; Netlify lo ve y
   reconstruye. Mientras tanto Cali sigue viendo su cambio (se redibuja encima de la página).
4. **En línea**: el sitio nuevo sabe de qué commit salió (`NEXT_PUBLIC_BUILD_COMMIT`); cuando contiene la
   publicación, el editor avisa.

El indicador de estado (abajo, en todas las páginas con sesión) dice qué está en camino, qué falta publicar y
qué ya está en línea, y explica el proceso en «¿Cómo funciona esto?».

## Gratis, sin base de datos
- Contenido: archivos JSON en el repo (`content/<colección>/<id>.json`), con historial de git.
- Fotos: se optimizan y se suben al repo (`web/public/media/…`).
- Datos internos (códigos de acceso, límites, historial, borradores): rama `cms-data`, que no despliega.
- Variables en Netlify: `SESSION_SECRET`, `SMTP_*`, `GITHUB_TOKEN` (fine-grained, «Contents: read & write» solo
  en este repo), `GITHUB_REPO`, y opcionalmente `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID`.
- Si algún día se quiere que los cambios salgan al instante, se configura Firebase y el mismo editor usa
  Firestore sin tocar nada más.

## Quitar cosas
- **Archivar**: deja de verse en el sitio, queda guardado (Panel → lista → «Mostrar» para volver).
- **Papelera**: para lo que ya no va; se recupera o se borra del todo desde Panel → Papelera.
- **Historial**: Panel → Historial permite volver atrás cualquier cambio.

## Dónde está el código
`src/components/cms/overlay/` (editor sobre la página, estado, guardado local) · `src/lib/cms/store/github.ts`
(almacén en el repo) · `src/lib/cms/deploy.ts` (seguimiento del despliegue) · `src/app/[slug]/` (páginas nuevas).

## Quién puede entrar

- `ADMIN_EMAIL`: el correo de Cali.
- `EDITOR_EMAILS` (opcional, separados por coma): otros correos autorizados, por ejemplo el de Oriens.ninja.

Cada persona escribe **su** correo en `/admin/entrar` y recibe **su propio** código (distinto del de los demás,
vence en 10 minutos, sirve una vez). El historial guarda quién hizo cada cambio. Quitar un correo de la lista
le cierra la sesión en el momento.
