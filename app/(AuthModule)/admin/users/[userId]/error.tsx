"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@/src/components/feedback/ErrorState";

export default function UserError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("authAdmin.detail.loadError");
  return <ErrorState title={t("title")} message={t("message")} retry={retry} />;
}
