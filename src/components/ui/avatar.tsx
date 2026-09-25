"use client";

import * as React from "react";
import { cn } from "@/src/lib/utils";
import { Avatar as AvatarPrimitive } from "radix-ui";

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "ui:relative ui:flex ui:size-8 ui:shrink-0 ui:overflow-hidden ui:rounded-full",
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("ui:aspect-square ui:size-full ui:object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "ui:flex ui:size-full ui:items-center ui:justify-center ui:rounded-full ui:bg-muted ui:text-xs ui:font-medium ui:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
