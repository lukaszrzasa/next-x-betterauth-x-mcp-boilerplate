"use client";

import {authRoutes} from "@/app/(AuthModule)/_/routes";
import type {StaffLogBlockView} from "@/app/(LogsModule)/_/staffLog/schema";
import {LogTime} from "@/app/(LogsModule)/admin/_/components/shared/LogTime";
import {useViewer} from "@/src/components/shell/ViewerProvider";
import {buildRoute} from "@/src/lib/routes";
import {cn} from "@/src/lib/utils";
import Link from "next/link";
import { useTranslations } from "next-intl";

const linkClass = "ui:font-medium ui:text-foreground ui:underline ui:underline-offset-4 ui:hover:text-primary";

/** A user by the name given, linked to their page when the viewer may open it. */
export function StaffLogUser({ id, label, className }: { id: string; label: string; className?: string }) {
  const { can } = useViewer();
  if (!can(authRoutes.adminUser.access)) return <span className={cn("ui:font-medium", className)}>{label}</span>;
  return (
    <Link
      href={buildRoute(authRoutes.adminUser.href, { userId: id })}
      prefetch={false}
      className={cn(linkClass, className)}
    >
      {label}
    </Link>
  );
}

/**
 * One block, rendered from what it carries and nothing else. This switch is
 * the whole renderer: a block type is added here, in the `StaffLogBlock`
 * union and in its schema, and nowhere in the modules that write entries.
 */
function Block({ block }: { block: StaffLogBlockView }) {
  switch (block.type) {
    case "text":
      return <>{block.value}</>;
    case "user":
      return <StaffLogUser id={block.id} label={block.label} />;
    case "date":
      return <LogTime value={block.value} className="ui:font-medium" />;
    case "url":
      return block.href.startsWith("/") ? (
        <Link href={block.href} prefetch={false} className={linkClass}>
          {block.label}
        </Link>
      ) : (
        <a href={block.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {block.label}
        </a>
      );
    case "value":
      return <span className="ui:rounded ui:bg-muted ui:px-1 ui:py-0.5 ui:font-medium">{block.value}</span>;
    case "unsupported":
      return <UnsupportedBlock />;
    default: {
      return block;
    }
  }
}

function UnsupportedBlock() {
  const t = useTranslations("logsAdmin.shared");
  return <span className="ui:text-muted-foreground ui:italic">{t("unsupportedContent")}</span>;
}

/** The message as one sentence, in block order. */
export function StaffLogMessage({ blocks, className }: { blocks: readonly StaffLogBlockView[]; className?: string }) {
  return (
    <span className={cn("ui:break-words ui:whitespace-pre-wrap", className)}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </span>
  );
}
