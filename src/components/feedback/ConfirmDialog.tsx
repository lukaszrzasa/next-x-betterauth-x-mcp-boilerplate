"use client";

import type { ReactNode } from "react";
import { createCallable } from "react-call";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";

export type ConfirmRequest = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirming button as destructive. */
  destructive?: boolean;
};

/**
 * A yes/no question asked imperatively: `await confirm({...})` resolves to
 * `true` when the person confirms and `false` when they cancel, press Escape
 * or click outside. One `<ConfirmDialogRoot />` is mounted at the app root;
 * callers keep no open/closed state of their own.
 */
const ConfirmDialog = createCallable<ConfirmRequest, boolean>(function ConfirmDialog({
  call,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
}) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && call.end(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => call.end(false)}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={() => call.end(true)}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

export function confirm(request: ConfirmRequest): Promise<boolean> {
  return ConfirmDialog.call(request);
}

export function ConfirmDialogRoot() {
  return <ConfirmDialog />;
}
