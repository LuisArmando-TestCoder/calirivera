import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { audit } from "@/lib/cms/audit";
import { getMediaStore } from "@/lib/cms/media";
import { MAX_UPLOAD_BYTES, processImage } from "@/lib/cms/media/process";

/** Admin-only image upload → optimized WebP → MediaStore (github | firebase | local). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado. Volvé a entrar." }, { status: 401 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64_000) return NextResponse.json({ error: "La foto pesa demasiado (máximo 12 MB)." }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No llegó ninguna foto." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "No llegó ninguna foto." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "La foto pesa demasiado (máximo 12 MB)." }, { status: 413 });
  if (!/^image\//.test(file.type)) return NextResponse.json({ error: "Ese archivo no es una imagen." }, { status: 415 });

  const alt = String(form.get("alt") ?? "").slice(0, 300);
  const name = String(form.get("name") ?? (file as File).name ?? "imagen");
  const focalX = Number(form.get("focalX"));
  const focalY = Number(form.get("focalY"));

  try {
    const processed = await processImage(Buffer.from(await file.arrayBuffer()), name);
    const stored = await getMediaStore().put(processed.relPath, processed.data, processed.contentType);
    const asset = {
      src: stored.src,
      alt,
      ...processed.asset,
      ...(Number.isFinite(focalX) && Number.isFinite(focalY) ? { focal: { x: focalX, y: focalY } } : {}),
    };
    await audit({ actor: session.email, action: "upload", note: stored.src });
    return NextResponse.json({ asset, pending: Boolean(stored.pending) });
  } catch (e) {
    console.error("[cms] upload", e);
    return NextResponse.json({ error: "No pudimos guardar la foto. Probá de nuevo." }, { status: 500 });
  }
}
