import { Skeleton } from "@/src/components/ui/skeleton";

/** The Profile page's own skeleton; the settings navigation above it stays mounted. */
export default function ProfileLoading() {
  return (
    <div role="status" aria-label="Loading profile" className="ui:flex ui:w-full ui:flex-col ui:gap-6">
      <div className="ui:flex ui:flex-col ui:gap-5 ui:rounded-xl ui:border ui:bg-card ui:p-5 ui:sm:p-6">
        <div className="ui:flex ui:items-center ui:gap-3">
          <Skeleton className="ui:size-9 ui:rounded-lg" />
          <Skeleton className="ui:h-5 ui:w-32" />
        </div>
        <Skeleton className="ui:h-11 ui:max-w-lg" />
        <Skeleton className="ui:h-8 ui:w-24" />
      </div>
      <span className="ui:sr-only">Loading profile…</span>
    </div>
  );
}
