"use client";

import { useId } from "react";
import { Controller, useWatch } from "react-hook-form";
import { FormError } from "@/src/components/forms/FormError";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/src/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import { Textarea } from "@/src/components/ui/textarea";
import { formatUtcDateTime } from "@/src/lib/date/format";
import { useUserBanForm } from "@/app/(AuthModule)/admin/_/hooks/form/useUserBanForm";
import type { Feedback } from "@/app/(AuthModule)/admin/_/hooks/feedback";
import { BAN_DURATIONS } from "@/app/(AuthModule)/admin/_/schema";
import {
  BAN_DURATION_CONSEQUENCES,
  BAN_DURATION_LABELS,
  type UserDetail,
} from "@/app/(AuthModule)/admin/_/types";

/** What the dialog says about the account before a ban is chosen. */
function describeCurrentState(user: UserDetail): string {
  const who = `${user.name} (${user.email})`;
  if (user.accessStatus === "active") {
    return `${who} will be signed out of every device and cannot sign in while the ban lasts. Their data is kept.`;
  }
  const current =
    user.accessStatus === "permanently-banned" || !user.banExpires
      ? "banned permanently"
      : `banned until ${formatUtcDateTime(user.banExpires)}`;
  return `${who} is currently ${current}. The new ban replaces it and its period starts now, not at the end of the current one. Any current sessions are signed out.`;
}

/**
 * Apply or replace a ban. Submitting the form is the confirmation; the
 * consequences shown change with the chosen duration, and a replacement
 * says that the new period starts now rather than extending the old one.
 * The five-minute step-up is prompted by the shared runtime on submit.
 */
export function UserBanDialog({
  user,
  open,
  onOpenChange,
  onSettled,
}: {
  user: UserDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled: (feedback: Feedback) => void;
}) {
  const ids = { duration: useId(), reason: useId() };
  const replacing = user.accessStatus !== "active";
  const submitLabel = replacing ? "Replace ban" : "Ban user";
  const { form, onSubmit, reset, pending } = useUserBanForm({
    user,
    onSettled: (feedback) => {
      onSettled(feedback);
      if (feedback.tone !== "error") {
        reset();
        onOpenChange(false);
      }
    },
  });
  // The consequence line follows the chosen duration; a view concern, so watched here.
  const duration = useWatch({ control: form.control, name: "duration" });
  const consequence = duration
    ? BAN_DURATION_CONSEQUENCES[duration]
    : "Select a duration to see what it means.";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form noValidate onSubmit={onSubmit} className="ui:flex ui:flex-col ui:gap-5">
          <DialogHeader>
            <DialogTitle>{replacing ? "Update ban" : "Ban user"}</DialogTitle>
            <DialogDescription>{describeCurrentState(user)}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="ui:gap-4">
            <FormError message={form.formState.errors.root?.message} />
            <Controller
              control={form.control}
              name="duration"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={ids.duration}>Duration</FieldLabel>
                  <NativeSelect
                    id={ids.duration}
                    name={field.name}
                    ref={field.ref}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.error ? `${ids.duration}-error` : undefined}
                    className="ui:w-full"
                  >
                    <NativeSelectOption value="" disabled>
                      Select a duration
                    </NativeSelectOption>
                    {BAN_DURATIONS.map((option) => (
                      <NativeSelectOption key={option} value={option}>
                        {BAN_DURATION_LABELS[option]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <p className="ui:text-xs ui:text-muted-foreground">{consequence}</p>
                  {fieldState.error && (
                    <FieldError id={`${ids.duration}-error`} errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="reason"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={ids.reason}>Reason</FieldLabel>
                  <Textarea
                    {...field}
                    id={ids.reason}
                    rows={3}
                    maxLength={1000}
                    disabled={pending}
                    placeholder="Why this account is being banned (3–1,000 characters)"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.error ? `${ids.reason}-error` : undefined}
                  />
                  {fieldState.error && (
                    <FieldError id={`${ids.reason}-error`} errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
