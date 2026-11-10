#!/usr/bin/env node
// Genera SESSION_SECRET (firma la sesión del editor y las HMAC de códigos/IPs).
//   npm run cms:secret            → lo imprime
//   npm run cms:secret -- --write → lo agrega a web/.env.local si no existe
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import path from "node:path";

const secret = randomBytes(48).toString("base64url");
if (process.argv.includes("--write")) {
  const file = path.join(process.cwd(), ".env.local");
  const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (/^SESSION_SECRET=.+/m.test(cur)) {
    console.log("[cms] .env.local ya tiene SESSION_SECRET; no lo toco.");
  } else {
    appendFileSync(file, `${cur && !cur.endsWith("\n") ? "\n" : ""}SESSION_SECRET=${secret}\n`, { mode: 0o600 });
    console.log(`[cms] SESSION_SECRET agregado a ${file}`);
  }
} else {
  console.log(`SESSION_SECRET=${secret}`);
  console.log("\nCopialo en Netlify → Environment variables. Cambiarlo cierra la sesión en todos los dispositivos.");
}
