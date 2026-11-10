#!/usr/bin/env node
// Deja Firebase listo con solo poner service-account.json en la raíz del repo.
//   npm run firebase:check        → valida credenciales y conexión a Firestore
//   npm run firebase:setup        → check + reglas + índices + usuario admin + settings + seed
//   npm run firebase:netlify-env  → escribe ../netlify.env (git-ignored) con las 3 variables para Netlify
// Pasos sueltos: node scripts/firebase-setup.mjs rules|indexes|admin|settings|seed [--force]
import { readFile, readdir, writeFile, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getSecurityRules } from "firebase-admin/security-rules";
import { loadServiceAccount, serviceAccountCandidates } from "../src/lib/firebase/credentials.mjs";

const WEB = process.cwd();
const ROOT = path.resolve(WEB, "..");
const CONTENT = path.join(ROOT, "content");
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "arte@calirivera.com").toLowerCase();
const COLLECTIONS = ["settings", "pages", "collections", "artworks", "catalogs", "programs", "people", "posts"];
const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const steps = args.filter((a) => !a.startsWith("--"));
const cmd = steps[0] ?? "check";

const log = (s) => console.log(`[firebase] ${s}`);
const fail = (s) => { console.error(`[firebase] ✗ ${s}`); process.exit(1); };

const sa = loadServiceAccount(WEB);
if (!sa) {
  fail(
    "No encontré el service account. Ponelo en la raíz del repo como service-account.json:\n  " +
      serviceAccountCandidates(WEB)[0] +
      "\n  (Firebase Console → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada)"
  );
}
const { credentials, source } = sa;
const app = initializeApp({ credential: cert(credentials), projectId: credentials.projectId });
const db = getFirestore(app);

async function check() {
  log(`credenciales: ${source}`);
  log(`proyecto: ${credentials.projectId} · cuenta: ${credentials.clientEmail}`);
  try {
    const cols = await Promise.race([
      db.listCollections(),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("sin respuesta en 30 s (¿red o clave revocada?)"), { code: "timeout" })), 30_000)),
    ]);
    log(`Firestore OK · colecciones: ${cols.map((c) => c.id).join(", ") || "(vacío)"}`);
  } catch (e) {
    fail(
      `No pude leer Firestore (${e.code ?? ""} ${e.message}).\n` +
        "  ¿Creaste la base de datos? Firebase Console → Firestore Database → Crear base de datos (modo producción, región us-central1 o nam5)."
    );
  }
}

async function rules() {
  const source = await readFile(path.join(WEB, "firestore.rules"), "utf8");
  const rs = await getSecurityRules(app).releaseFirestoreRulesetFromSource(source);
  log(`reglas publicadas · ruleset ${rs.name}`);
}

async function indexes() {
  // firebase-tools acepta GOOGLE_APPLICATION_CREDENTIALS; si las credenciales vienen de env, uso un archivo temporal.
  let keyFile = serviceAccountCandidates(WEB).find((f) => existsSync(f));
  if (!keyFile) {
    keyFile = path.join(await mkdtemp(path.join(tmpdir(), "sa-")), "sa.json");
    await writeFile(keyFile, JSON.stringify({ type: "service_account", project_id: credentials.projectId, client_email: credentials.clientEmail, private_key: credentials.privateKey }), { mode: 0o600 });
  }
  const r = spawnSync("npx", ["-y", "firebase-tools@latest", "deploy", "--only", "firestore:indexes", "--project", credentials.projectId, "--non-interactive"], {
    cwd: WEB,
    stdio: "inherit",
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: keyFile },
  });
  if (r.status !== 0) log("⚠ no se pudieron publicar los índices (el sitio funciona igual; reintentá con: node scripts/firebase-setup.mjs indexes)");
  else log("índices publicados");
}

async function admin() {
  const auth = getAuth(app);
  let user;
  try {
    user = await auth.getUserByEmail(ADMIN_EMAIL);
  } catch (e) {
    if (e.code !== "auth/user-not-found") {
      log(`⚠ Firebase Auth no disponible (${e.code}). Activalo en Console → Authentication → Comenzar. Las reglas igual aceptan el correo verificado.`);
      return;
    }
    user = await auth.createUser({ email: ADMIN_EMAIL, emailVerified: true, displayName: "Cali Rivera" });
    log(`usuario admin creado: ${ADMIN_EMAIL}`);
  }
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: true });
  log(`claim admin=true → ${ADMIN_EMAIL} (${user.uid})`);
}

async function settings() {
  const ref = db.collection("settings").doc("site");
  const snap = await ref.get();
  if (snap.exists && !FORCE) return log("settings/site ya existe (usa --force para sobrescribir)");
  const now = new Date().toISOString();
  await ref.set({
    id: "site",
    slug: "site",
    status: "published",
    siteName: "Cali Rivera",
    tagline: "El arte es para ser libres.",
    email: ADMIN_EMAIL,
    location: "San José, Costa Rica",
    social: [
      { label: "Instagram", href: "https://www.instagram.com/caliriveraartista" },
      { label: "Facebook", href: "https://www.facebook.com/elarteparaserlibres/" },
    ],
    footerNote: "Obra viva y legado artístico desde Costa Rica.",
    contentVersion: String(Date.now()),
    createdAt: snap.exists ? snap.get("createdAt") ?? now : now,
    updatedAt: now,
  });
  log("settings/site listo");
}

async function readModelDocs(name) {
  const docs = [];
  const file = path.join(CONTENT, `${name}.json`);
  if (existsSync(file)) {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    docs.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  const dir = path.join(CONTENT, name);
  if (existsSync(dir)) {
    for (const f of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
      const slug = f.replace(/\.json$/, "");
      docs.push({ id: slug, slug, ...JSON.parse(await readFile(path.join(dir, f), "utf8")) });
    }
  }
  return docs;
}

async function seed() {
  // Mismo origen que el fallback local de repo.ts: content/<colección>.json o content/<colección>/<slug>.json
  let total = 0;
  for (const name of COLLECTIONS.filter((c) => c !== "settings")) {
    const docs = await readModelDocs(name);
    if (!docs.length) continue;
    let batch = db.batch();
    let n = 0;
    for (const d of docs) {
      const id = String(d.id ?? d.slug);
      const ref = db.collection(name).doc(id);
      if (!FORCE && (await ref.get()).exists) continue;
      const now = new Date().toISOString();
      batch.set(ref, { status: "published", createdAt: now, ...d, id, slug: d.slug ?? id, updatedAt: now });
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    await batch.commit();
    total += n;
    log(`seed ${name}: ${n} docs`);
  }
  if (!total) log("seed: no hay contenido con forma de modelo en content/ todavía (lo genera la rama 5); nada que subir");
  else await db.collection("settings").doc("site").set({ contentVersion: String(Date.now()), updatedAt: new Date().toISOString() }, { merge: true });
}

async function netlifyEnv() {
  const out = path.join(ROOT, "netlify.env");
  const esc = credentials.privateKey.replace(/\n/g, "\\n");
  await writeFile(
    out,
    `# Pegar en Netlify → Site configuration → Environment variables (o: netlify env:import netlify.env)\n# NO comitear. Borrar este archivo después de cargarlo.\nFIREBASE_PROJECT_ID=${credentials.projectId}\nFIREBASE_CLIENT_EMAIL=${credentials.clientEmail}\nFIREBASE_PRIVATE_KEY="${esc}"\nADMIN_EMAIL=${ADMIN_EMAIL}\nNEXT_PUBLIC_SITE_URL=https://calirivera.com\n`,
    { mode: 0o600 }
  );
  log(`variables para Netlify escritas en ${out}`);
}

const STEPS = { check, rules, indexes, admin, settings, seed, "netlify-env": netlifyEnv };
const plan = cmd === "all" ? ["check", "rules", "indexes", "admin", "settings", "seed"] : steps.length ? steps : ["check"];
for (const s of plan) {
  if (!STEPS[s]) fail(`paso desconocido: ${s}. Opciones: ${Object.keys(STEPS).join(", ")}, all`);
  await STEPS[s]();
}
log("listo ✓");
