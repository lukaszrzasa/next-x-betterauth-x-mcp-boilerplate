import { useTranslations } from "next-intl";
import { Skeleton } from "@/src/components/ui/skeleton";

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="ui:flex ui:flex-col ui:gap-5 ui:rounded-xl ui:border ui:bg-card ui:p-5 ui:sm:p-6">
      <div className="ui:flex ui:items-center ui:gap-3">
        <Skeleton className="ui:size-9 ui:rounded-lg" />
        <Skeleton className="ui:h-5 ui:w-32" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="ui:flex ui:items-center ui:justify-between ui:gap-6">
          <div className="ui:flex ui:flex-col ui:gap-2">
            <Skeleton className="ui:h-3 ui:w-20" />
            <Skeleton className="ui:h-4 ui:w-40" />
          </div>
          <Skeleton className="ui:h-8 ui:w-28" />
        </div>
      ))}
    </div>
  );
}

/** The Account page's own skeleton; the settings navigation above it stays mounted. */
export default function AccountLoading() {
  const t = useTranslations("auth.settingsPages");
  return (
    <div role="status" aria-label={t("loadingAccount")} className="ui:flex ui:w-full ui:flex-col ui:gap-6">
      <SectionSkeleton rows={1} />
      <SectionSkeleton rows={1} />
      <SectionSkeleton rows={1} />
      <SectionSkeleton rows={1} />
      <SectionSkeleton rows={2} />
      <span className="ui:sr-only">{t("loadingAccountText")}</span>
    </div>
  );
}
