"use client";

import { useEffect, useRef, useState } from "react";
import { createCallable } from "react-call";
import { useMutationFlow } from "react-call/mutation-flow";
import { useForm, useWatch } from "react-hook-form";
import { CODE_PATTERN, type StepUpProof } from "@/src/lib/auth/stepUpPolicy";
import type { VerificationPresenter, VerificationRequest } from "./types";

type Submission = { kind: "send" } | { kind: "verify"; proof: StepUpProof };

const VerificationModal = createCallable<
  VerificationRequest,
  "finished" | "cancelled"
>(function VerificationModal({ call, challenge, signal, submit, sendEmail }) {
  const dialog = useRef<HTMLDialogElement>(null);
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
        setNotice("A code was sent to your email address.");
      }
    },
  );

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label="Verify your identity"
      onCancel={(event) => {
        event.preventDefault();
        if (!runSubmission.pending) call.end("cancelled");
      }}
    >
      <form
        noValidate
        onSubmit={handleSubmit((proof) => runSubmission({ kind: "verify", proof }))}
      >
        <h2>Verify your identity</h2>
        <fieldset disabled={runSubmission.pending}>
          {challenge.methods.length > 1 && (
            <label>
              Verification method
              <select
                {...register("method", {
                  onChange: () => {
                    resetField("code");
                    clearErrors();
                    setNotice("");
                  },
                })}
              >
                {challenge.methods.map((available) => (
                  <option key={available} value={available}>
                    {available === "totp" ? "Authenticator app" : "Email"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {method === "email" && (
            <button type="button" onClick={() => runSubmission({ kind: "send" })}>
              Send email code
            </button>
          )}
          <label>
            Six-digit code
            <input
              {...register("code", {
                required: "Enter your six-digit code.",
                pattern: {
                  value: CODE_PATTERN,
                  message: "Enter exactly six digits.",
                },
              })}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-invalid={!!errors.code}
              aria-describedby="verification-feedback"
              autoFocus
            />
          </label>
          <button type="submit">Verify and continue</button>
          <button type="button" onClick={() => call.end("cancelled")}>
            Cancel
          </button>
        </fieldset>
        <p id="verification-feedback" role="status">
          {runSubmission.pending
            ? "Please wait…"
            : (errors.code?.message ?? errors.root?.send?.message ?? notice)}
        </p>
      </form>
    </dialog>
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
