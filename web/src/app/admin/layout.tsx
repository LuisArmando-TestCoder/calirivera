import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/cms/shared/Toaster";
import s from "@/components/cms/admin/admin.module.scss";

export const metadata: Metadata = {
  title: { default: "Editor", template: "%s · Editor" },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = { themeColor: "#f6f2ea" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className={s.shell} data-cms-admin>
      <Toaster>{children}</Toaster>
    </div>
  );
}
