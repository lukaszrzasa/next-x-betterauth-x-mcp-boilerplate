"use client";

import { useId, useState } from "react";
import { createCallable } from "react-call";
import { useMutationFlow } from "react-call/mutation-flow";
import { Controller, useForm, useWatch } from "react-hook-form";
import { MailIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import { cn } from "@/src/lib/utils";
import {
  CODE_LENGTH,
  CODE_PATTERN,
  type StepUpMethod,
  type StepUpProof,
} from "@/src/lib/auth/stepUpPolicy";
import type { VerificationPresenter, VerificationRequest } from "./types";

type Submission = { kind: "send" } | { kind: "verify"; proof: StepUpProof };

/** Where the code comes from, selecting the wording of "Enter the six-digit code…". */
function codeSource(chooses: boolean, method: StepUpMethod): "chosen" | StepUpMethod {
  return chooses ? "chosen" : method;
}

/**
 * The step-up prompt the action runtime opens after `TWO_FACTOR_REQUIRED`.
 * Its boundary with the runtime is `VerificationRequest`; the runtime owns
 * which methods are offered (in the server's order, first one default),
 * retries with the stored input, invalid-code presentation, lockout, email
 * dispatch and abort. This component only collects a six-digit code.
 */
const VerificationModal = createCallable<
  VerificationRequest,
  "finished" | "cancelled"
>(function VerificationModal({ call, challenge, signal, submit, sendEmail }) {
  const t = useTranslations("common.verification");
  const tActions = useTranslations("common.actions");
  const ids = { method: useId(), code: useId(), feedback: useId() };
  const [notice, setNotice] = useState("");
  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    resetField,
    formState: { errors },
  } = useForm<StepUpProof>({
    defaultValues: { method: challenge.methods[0], code: "" },
  });
  const method = useWatch({ control, name: "method" });
  const runSubmission = useMutationFlow<"finished" | "cancelled", Submission>(
    call,
    async (flow, submission) => {
      if (signal.aborted) return;
      clearErrors();
      setNotice("");
      const error =
        submission.kind === "verify"
          ? await submit(submission.proof)
          : await sendEmail();
      if (signal.aborted) return;
      if (submission.kind === "verify") {
        if (!error) flow.end("finished");
        else
          setError(
            "code",
            { type: "server", message: error.message },
            { shouldFocus: true },
          );
      } else if (error) {
        if (error.reason === "RATE_LIMITED")
          setError("root.send", { message: error.message });
        else flow.end("finished");
      } else {
        setNotice(t("codeSent"));
      }
    },
  );

  const cancel = () => {
    if (!runSubmission.pending) call.end("cancelled");
  };
  const feedback = runSubmission.pending
    ? t("pleaseWait")
    : (errors.code?.message ?? errors.root?.send?.message ?? notice);

  return (
    <Dialog open onOpenChange={(open) => !open && cancel()}>
      <DialogContent
        showCloseButton={false}
        className="ui:sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <form
          noValidate
          onSubmit={handleSubmit((proof) => runSubmission({ kind: "verify", proof }))}
          className="ui:flex ui:flex-col ui:gap-5"
        >
          <DialogHeader>
            <DialogTitle className="ui:flex ui:items-center ui:gap-2">
              <ShieldCheckIcon aria-hidden="true" className="ui:size-5 ui:text-muted-foreground" />
              {t("title")}
            </DialogTitle>
            <DialogDescription>
              {t("description", { source: codeSource(challenge.methods.length > 1, method) })}
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={runSubmission.pending} className="ui:contents">
            <FieldGroup className="ui:gap-4">
              {challenge.methods.length > 1 && (
                <Field>
                  <FieldLabel htmlFor={ids.method}>{t("methodLabel")}</FieldLabel>
                  <NativeSelect
                    id={ids.method}
                    className="ui:w-full"
                    {...register("method", {
                      onChange: () => {
                        resetField("code");
                        clearErrors();
                        setNotice("");
                      },
                    })}
                  >
                    {challenge.methods.map((available) => (
                      <NativeSelectOption key={available} value={available}>
                        {t(`methods.${available}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              {method === "email" && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => runSubmission({ kind: "send" })}
                  >
                    <MailIcon aria-hidden="true" />
                    {t("sendEmailCode")}
                  </Button>
                </div>
              )}
              <Controller
                control={control}
                name="code"
                rules={{
                  required: t("codeRequired"),
                  pattern: { value: CODE_PATTERN, message: t("codePattern") },
                }}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={ids.code}>{t("codeLabel")}</FieldLabel>
                    <Input
                      {...field}
                      id={ids.code}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={CODE_LENGTH}
                      className="ui:h-11 ui:font-mono ui:text-lg ui:tracking-[0.3em]"
                      aria-invalid={fieldState.invalid}
                      aria-describedby={ids.feedback}
                      autoFocus
                    />
                  </Field>
                )}
              />
            </FieldGroup>
            <p
              id={ids.feedback}
              role="status"
              aria-live="polite"
              className={cn(
                "ui:min-h-5 ui:text-sm",
                errors.code || errors.root?.send ? "ui:text-destructive" : "ui:text-muted-foreground",
              )}
            >
              {feedback}
            </p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={cancel}>
                {tActions("cancel")}
              </Button>
              <Button type="submit">{t("verifyAndContinue")}</Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
});

export const presentVerification: VerificationPresenter = async (request) => {
  if (request.signal.aborted) return "cancelled";
  const promise = VerificationModal.call(request);
  const cancel = () => VerificationModal.end(promise, "cancelled");
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    return await promise;
  } finally {
    request.signal.removeEventListener("abort", cancel);
  }
};

export function VerificationModalRoot() {
  return <VerificationModal />;
}
