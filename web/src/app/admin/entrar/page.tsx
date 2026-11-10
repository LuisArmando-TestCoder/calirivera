import { Suspense } from "react";
import { LoginForm } from "@/components/cms/admin/LoginForm";
import { adminEmail } from "@/lib/auth/secret";
import s from "@/components/cms/admin/admin.module.scss";

export const metadata = { title: "Entrar" };

async function Form({ searchParams }: { searchParams: PageProps<"/admin/entrar">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return <LoginForm defaultEmail={adminEmail()} next={next} />;
}

export default function Entrar(props: PageProps<"/admin/entrar">) {
  return (
    <main className={s.loginWrap}>
      <Suspense fallback={<LoginForm defaultEmail={adminEmail()} />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
