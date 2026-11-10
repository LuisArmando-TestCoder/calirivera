"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestCodeAction, verifyCodeAction } from "@/app/admin/entrar/actions";
import s from "./admin.module.scss";

const RESEND_S = 30;

function mailShortcut(email: string): { label: string; href: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com") return { label: "Abrir Gmail", href: "https://mail.google.com/mail/u/0/#inbox" };
  if (/(outlook|hotmail|live)\./.test(domain)) return { label: "Abrir Outlook", href: "https://outlook.live.com/mail/" };
  if (domain === "icloud.com" || domain === "me.com") return { label: "Abrir iCloud Mail", href: "https://www.icloud.com/mail" };
  if (domain === "calirivera.com" || domain === "tallerdelartista.com") return { label: "Abrir el correo", href: "https://mail.hostinger.com/" };
  return null;
}

export function LoginForm({ defaultEmail, next }: { defaultEmail: string; next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [pending, start] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const send = () =>
    start(async () => {
      setError("");
      const r = await requestCodeAction(email);
      if (!r.ok) return setError(r.error);
      setStep("code");
      setCode("");
      setCooldown(RESEND_S);
      router.prefetch(next ?? "/admin");
    });

  const verify = (value: string) =>
    start(async () => {
      setError("");
      const r = await verifyCodeAction(email, value, next);
      if (!r.ok) {
        setError(r.error);
        setShake((n) => n + 1);
        if (r.reason !== "invalid") setCode("");
        return;
      }
      setStep("done");
      setTimeout(() => router.replace(r.redirect), 450);
    });

  const shortcut = mailShortcut(email);

  return (
    <div className={s.loginCard} data-step={step}>
      <p className={s.eyebrow}>Cali Rivera · Editor</p>

      {step === "email" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className={s.stack}
        >
          <h1 className={s.loginTitle}>Entrar para editar el sitio</h1>
          <p className={s.muted}>Te mandamos un código de 6 números a tu correo. Sin contraseñas.</p>
          <label className={s.field}>
            <span>Tu correo</span>
            <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <button className={s.btnPrimaryBig} disabled={pending || !email}>
            {pending ? "Enviando…" : "Enviarme el código"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) verify(code);
          }}
          onPaste={(e) => {
            const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (digits.length === 6) {
              e.preventDefault();
              setCode(digits);
              verify(digits);
            }
          }}
          className={s.stack}
        >
          <h1 className={s.loginTitle}>Revisá tu correo</h1>
          <p className={s.muted}>
            Mandamos un código a <strong>{email}</strong> ·{" "}
            <button type="button" className={s.linkBtn} onClick={() => setStep("email")}>
              Cambiar
            </button>
          </p>
          <label htmlFor="otp" className={s.srOnly}>
            Código de 6 números
          </label>
          <input
            ref={codeRef}
            id="otp"
            key={shake}
            className={s.otp}
            data-error={error ? "" : undefined}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            required
            value={code}
            aria-describedby="otp-msg"
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) verify(v);
            }}
          />
          <p id="otp-msg" className={error ? s.error : s.muted} role={error ? "alert" : "status"} aria-live="polite">
            {error || (pending ? "Revisando…" : "Vence en 10 minutos.")}
          </p>
          <div className={s.row}>
            <button type="submit" className={s.btnPrimaryBig} disabled={pending || code.length !== 6}>
              Entrar
            </button>
          </div>
          <div className={s.row}>
            <button type="button" className={s.btn} disabled={cooldown > 0 || pending} onClick={send}>
              {cooldown > 0 ? `Reenviar en 0:${String(cooldown).padStart(2, "0")}` : "Reenviar el código"}
            </button>
            {shortcut && (
              <a className={s.btn} href={shortcut.href} target="_blank" rel="noreferrer">
                {shortcut.label}
              </a>
            )}
          </div>
        </form>
      )}

      {step === "done" && (
        <div className={s.stack} role="status">
          <svg className={s.check} viewBox="0 0 52 52" aria-hidden>
            <circle cx="26" cy="26" r="24" />
            <path d="M15 27 l8 8 l15 -17" />
          </svg>
          <h1 className={s.loginTitle}>¡Listo!</h1>
        </div>
      )}
    </div>
  );
}
