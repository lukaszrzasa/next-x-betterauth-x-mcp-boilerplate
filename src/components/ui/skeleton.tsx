import { cn } from "@/src/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("ui:animate-pulse ui:rounded-md ui:bg-accent", className)}
      {...props}
    />
  );
}

export { Skeleton };
