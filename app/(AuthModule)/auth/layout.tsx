import type { Metadata } from "next";
import { AuthShell } from "@/app/(AuthModule)/_/components/layout/AuthShell";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
