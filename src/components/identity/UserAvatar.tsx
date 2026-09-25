"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { initialsOf } from "@/src/lib/initials";
import { cn } from "@/src/lib/utils";

/** A person's picture with an initials fallback; decorative next to their name. */
export function UserAvatar({
  name,
  email,
  image,
  className,
}: {
  name: string;
  email: string;
  image: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("ui:size-8", className)}>
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback aria-hidden="true" className="ui:text-xs ui:font-medium">
        {initialsOf(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
