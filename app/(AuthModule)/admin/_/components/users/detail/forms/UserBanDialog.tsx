"use client";

import { useId } from "react";
import { useFormatter, useTranslations } from "next-intl";
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
import { useUserBanForm } from "@/app/(AuthModule)/admin/_/hooks/form/useUserBanForm";
import type { Feedback } from "@/app/(AuthModule)/admin/_/hooks/feedback";
import { BAN_DURATIONS } from "@/app/(AuthModule)/admin/_/schema";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";

type BanTranslator = ReturnType<typeof useTranslations<"authAdmin.detail.ban">>;
type Formatter = ReturnType<typeof useFormatter>;

/** What the dialog says about the account before a ban is chosen. */
function describeCurrentState(t: BanTranslator, format: Formatter, user: UserDetail): string {
  const who = `${user.name} (${user.email})`;
  if (user.accessStatus === "active") return t("stateActive", { who });
  const current =
    user.accessStatus === "permanently-banned" || !user.banExpires
      ? t("bannedPermanently")
      : t("bannedUntil", { date: format.dateTime(new Date(user.banExpires), "dateTime") });
  return t("stateBanned", { who, current });
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
  const t = useTranslations("authAdmin.detail.ban");
  const format = useFormatter();
  const ids = { duration: useId(), reason: useId() };
  const replacing = user.accessStatus !== "active";
  const submitLabel = replacing ? t("submitReplace") : t("submit");
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
  const consequence = duration ? t(`consequences.${duration}`) : t("selectDurationHint");

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
            <DialogTitle>{replacing ? t("titleReplace") : t("title")}</DialogTitle>
            <DialogDescription>{describeCurrentState(t, format, user)}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="ui:gap-4">
            <FormError message={form.formState.errors.root?.message} />
            <Controller
              control={form.control}
              name="duration"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={ids.duration}>{t("duration")}</FieldLabel>
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
                      {t("selectDuration")}
                    </NativeSelectOption>
                    {BAN_DURATIONS.map((option) => (
                      <NativeSelectOption key={option} value={option}>
                        {t(`durations.${option}`)}
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
                  <FieldLabel htmlFor={ids.reason}>{t("reason")}</FieldLabel>
                  <Textarea
                    {...field}
                    id={ids.reason}
                    rows={3}
                    maxLength={1000}
                    disabled={pending}
                    placeholder={t("reasonPlaceholder")}
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
              {t("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? t("saving") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
