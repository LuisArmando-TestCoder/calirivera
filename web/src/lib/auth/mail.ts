import "server-only";
import nodemailer from "nodemailer";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Sends the login code. Without SMTP (dev), prints it to the server console. */
export async function sendLoginCode(to: string, code: string, meta: { when: string; ip?: string }) {
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  const subject = `${code} es tu código para entrar a calirivera.com`;
  const text = [
    `Tu código para entrar al editor de calirivera.com:`,
    ``,
    `    ${pretty}`,
    ``,
    `Vence en 10 minutos y sirve una sola vez.`,
    `Pedido: ${meta.when}.`,
    ``,
    `¿No lo pediste? Podés ignorar este correo: nadie puede entrar sin el código.`,
  ].join("\n");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4efe6;font-family:Georgia,'Times New Roman',serif;color:#1d1b18">
<span style="display:none;max-height:0;overflow:hidden">Vence en 10 minutos. Si no lo pediste, ignorá este correo.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fffdf8;border:1px solid #e6dccb;border-radius:4px" cellpadding="0" cellspacing="0">
<tr><td style="padding:36px 32px 8px;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#7a6f60">Cali Rivera · Editor</td></tr>
<tr><td style="padding:8px 32px 0;font-size:22px;line-height:1.35">Tu código para entrar</td></tr>
<tr><td style="padding:24px 32px"><div style="font:600 36px/1 'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:.18em;color:#1d1b18">${esc(pretty)}</div></td></tr>
<tr><td style="padding:0 32px 28px;font-size:15px;line-height:1.6;color:#4a443c">Vence en 10 minutos y sirve una sola vez.<br>Pedido: ${esc(meta.when)}.</td></tr>
<tr><td style="padding:20px 32px 32px;border-top:1px solid #efe7d8;font-size:13px;line-height:1.6;color:#7a6f60">¿No lo pediste? Podés ignorar este correo: nadie puede entrar sin el código.</td></tr>
</table><p style="font-size:12px;color:#9a8f80;margin-top:20px">El arte es para ser libres.</p></td></tr></table></body></html>`;

  if (!smtpConfigured()) {
    console.log(`\n[cms] ── Código de acceso para ${to}: ${pretty}  (SMTP no configurado; solo en desarrollo) ──\n`);
    if (process.env.NODE_ENV === "production") throw new Error("SMTP no configurado");
    return;
  }
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    // que un servidor de correo lento no deje la función colgada hasta que Netlify la corte
    connectionTimeout: 8000,
    greetingTimeout: 6000,
    socketTimeout: 10000,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || `Cali Rivera <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
}
