"use client";

import Link from "next/link";
import { useViewer } from "@/app/_/shell/ViewerProvider";
import { cn } from "@/src/lib/utils";
import { resolveEntityLink } from "@/app/(LogsModule)/admin/_/entityNavigation";
import type { ActorView, EntityView } from "@/app/(LogsModule)/admin/_/types";

const linkClass = "ui:font-medium ui:text-foreground ui:underline ui:underline-offset-4 ui:hover:text-primary";

/**
 * A captured snapshot: the label stored with the event, linked through the
 * navigation registry when the viewer may open the destination. Never a
 * stored URL. A historical type this release does not support is shown as
 * plain text with an indication; an unusable stored label is named as such.
 */
export function EntityLabel({ entity, className }: { entity: EntityView; className?: string }) {
  const { can } = useViewer();
  const link = resolveEntityLink(entity, can);
  const label = entity.label ?? "Unnamed entity";

  if (link.status === "linked") {
    return (
      <Link href={link.href} prefetch={false} className={cn(linkClass, className)}>
        {label}
      </Link>
    );
  }

  return (
    <span className={cn(entity.label === null && "ui:italic ui:text-muted-foreground", className)}>
      {label}
      {link.status === "unsupported" && (
        <span className="ui:ml-1.5 ui:text-xs ui:font-normal ui:text-muted-foreground">
          (Unsupported entity type: {entity.type})
        </span>
      )}
    </span>
  );
}

/** Who acted: a user snapshot (linked like any entity), Anonymous, or a kind from a newer release. */
export function ActorLabel({ actor, className }: { actor: ActorView; className?: string }) {
  if (actor.kind === "user" && actor.id) {
    return <EntityLabel entity={{ type: "user", id: actor.id, label: actor.label }} className={className} />;
  }
  if (actor.kind === "anonymous") {
    return <span className={cn("ui:text-muted-foreground", className)}>Anonymous</span>;
  }
  return (
    <span className={className}>
      {actor.label}
      <span className="ui:ml-1.5 ui:text-xs ui:text-muted-foreground">(Unsupported actor kind: {actor.kind})</span>
    </span>
  );
}
