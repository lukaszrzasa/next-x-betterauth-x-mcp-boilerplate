import { Skeleton } from "@/src/components/ui/skeleton";
import { AppBreadcrumbs } from "@/app/_/shell/AppBreadcrumbs";
import { adminRoutes } from "@/app/(AdminModule)/_/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

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
          <Skeleton className="ui:h-8 ui:w-24" />
        </div>
      ))}
    </div>
  );
}

export default function UserLoading() {
  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Admin", href: adminRoutes.dashboard.href },
          { label: authRoutes.adminUsers.label, href: authRoutes.adminUsers.href },
          { label: "User" },
        ]}
      />
      <div role="status" aria-label="Loading user" className="ui:flex ui:w-full ui:max-w-[80rem] ui:flex-col ui:gap-6">
        <div className="ui:flex ui:items-start ui:gap-4">
          <Skeleton className="ui:size-14 ui:rounded-full" />
          <div className="ui:flex ui:flex-col ui:gap-2">
            <Skeleton className="ui:h-7 ui:w-56" />
            <Skeleton className="ui:h-4 ui:w-48" />
            <div className="ui:flex ui:gap-2">
              <Skeleton className="ui:h-5 ui:w-16" />
              <Skeleton className="ui:h-5 ui:w-16" />
              <Skeleton className="ui:h-5 ui:w-16" />
            </div>
          </div>
        </div>
        <div className="ui:grid ui:grid-cols-1 ui:gap-6 ui:lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="ui:flex ui:flex-col ui:gap-6">
            <SectionSkeleton rows={2} />
            <SectionSkeleton rows={4} />
          </div>
          <div className="ui:flex ui:flex-col ui:gap-6">
            <SectionSkeleton rows={2} />
            <SectionSkeleton rows={4} />
          </div>
        </div>
        <span className="ui:sr-only">Loading user…</span>
      </div>
    </>
  );
}
