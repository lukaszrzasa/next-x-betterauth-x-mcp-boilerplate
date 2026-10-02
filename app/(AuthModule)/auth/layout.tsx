import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/app/(AuthModule)/_/components/layout/AuthShell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.layout");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
