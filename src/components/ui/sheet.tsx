"use client";

import * as React from "react";
import { cn } from "@/src/lib/utils";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { useTranslations } from "next-intl";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn("ui:fixed ui:inset-0 ui:z-50 ui:bg-black/50", className)}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  const t = useTranslations("common.actions");
  return (
    <SheetPrimitive.Portal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "app-ui ui:fixed ui:z-50 ui:flex ui:flex-col ui:gap-4 ui:bg-background ui:text-foreground ui:shadow-lg ui:transition ui:ease-in-out",
          side === "right" &&
            "ui:inset-y-0 ui:right-0 ui:h-full ui:w-3/4 ui:border-l ui:sm:max-w-sm",
          side === "left" &&
            "ui:inset-y-0 ui:left-0 ui:h-full ui:w-3/4 ui:border-r ui:sm:max-w-sm",
          side === "top" && "ui:inset-x-0 ui:top-0 ui:h-auto ui:border-b",
          side === "bottom" && "ui:inset-x-0 ui:bottom-0 ui:h-auto ui:border-t",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="ui:absolute ui:top-4 ui:right-4 ui:rounded-xs ui:opacity-70 ui:transition-opacity ui:hover:opacity-100 ui:focus:ring-2 ui:focus:ring-ring ui:focus:ring-offset-2 ui:focus:outline-hidden ui:disabled:pointer-events-none"
          >
            <XIcon className="ui:size-4" />
            <span className="ui:sr-only">{t("close")}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("ui:flex ui:flex-col ui:gap-1.5 ui:p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("ui:font-semibold ui:text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("ui:text-sm ui:text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
};
