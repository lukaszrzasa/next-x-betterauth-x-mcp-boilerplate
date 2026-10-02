"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutDashboardIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { appRoutes } from "@/src/lib/app/routes";
import { useSignOut } from "@/app/(AuthModule)/_/hooks/useSignOut";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { initialsOf } from "@/src/lib/initials";
import { useViewer } from "./ViewerProvider";

/** The header's account control: a sign-in link for guests, the account menu otherwise. */
export function UserMenu() {
  const { viewer, can } = useViewer();
  const { signOut, pending, error } = useSignOut();
  const [open, setOpen] = useState(false);
  const t = useTranslations();

  if (!viewer) {
    return (
      <Button size="sm" asChild>
        <Link href={authRoutes.signIn.href}>{t("common.actions.signIn")}</Link>
      </Button>
    );
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        // Stay open while signing out so a failure can be announced in place.
        if (pending && !next) return;
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="ui:size-8 ui:rounded-full"
          aria-label={t("common.shell.accountMenu")}
        >
          <Avatar className="ui:size-8">
            {viewer.image && <AvatarImage src={viewer.image} alt="" />}
            <AvatarFallback>{initialsOf(viewer.name, viewer.email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="ui:w-56">
        <DropdownMenuLabel className="ui:font-normal">
          <p className="ui:truncate ui:text-sm ui:font-medium">{viewer.name}</p>
          <p className="ui:truncate ui:text-xs ui:text-muted-foreground">{viewer.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={authRoutes.settings.href}>
              <SettingsIcon />
              {t("nav.settings")}
            </Link>
          </DropdownMenuItem>
          {can(appRoutes.dashboard.access) && (
            <DropdownMenuItem asChild>
              <Link href={appRoutes.dashboard.href}>
                <LayoutDashboardIcon />
                {t("common.shell.admin")}
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <LogOutIcon />
          {pending ? t("common.actions.signingOut") : t("common.actions.signOut")}
        </DropdownMenuItem>
        {error && (
          <p role="alert" className="ui:px-2 ui:py-1.5 ui:text-xs ui:text-destructive">
            {error}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
