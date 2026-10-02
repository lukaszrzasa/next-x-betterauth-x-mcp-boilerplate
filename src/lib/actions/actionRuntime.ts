import { startTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type {
  ActionResult,
  ServerAction,
} from "@/src/lib/auth/builders/adapters";
import {
  REQUIRED_STEP_UPS,
  STEP_UP_METHODS,
  type StepUpProof,
} from "@/src/lib/auth/stepUpPolicy";
import type {
  ActionFailure,
  ActionOutcome,
  VerificationPresenter,
} from "./types";
import { VerificationQueue } from "./verificationQueue";

const challengeSchema = z.object({
  policy: z.enum(REQUIRED_STEP_UPS),
  methods: z.array(z.enum(STEP_UP_METHODS)).min(1),
});

/** Each server invocation runs in a React action context, including retries. */
export function invokeAction<T>(
  invoke: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T> | ActionFailure> {
  return new Promise((resolve, reject) => {
    startTransition(async () => {
      try {
        resolve(await invoke());
      } catch (error) {
        try {
          unstable_rethrow(error);
          resolve({
            ok: false,
            reason: "TRANSPORT",
            status: 0,
            // Not shown as is: `describeFailure` renders TRANSPORT from the catalog.
            message: "errors.transport",
          });
        } catch (controlFlow) {
          reject(controlFlow);
        }
      }
    });
  });
}

function toOutcome<T>(result: ActionResult<T> | ActionFailure): ActionOutcome<T> {
  return result.ok
    ? { status: "success", data: result.data }
    : { status: "error", error: result };
}

export function createActionRuntime({
  presentVerification,
  sendEmail,
}: {
  presentVerification: VerificationPresenter;
  sendEmail: () => Promise<ActionResult<void>>;
}) {
  const queue = new VerificationQueue();

  return {
    async execute<I, O>(
      action: ServerAction<I, O>,
      input: I,
      signal: AbortSignal,
    ): Promise<ActionOutcome<O>> {
      if (signal.aborted) return { status: "cancelled" };
      const firstAttempt = await invokeAction(() => action(input));
      if (signal.aborted) return { status: "cancelled" };
      if (firstAttempt.ok || firstAttempt.reason !== "TWO_FACTOR_REQUIRED")
        return toOutcome(firstAttempt);

      return queue.run<O>(signal, async (waited) => {
        // Only recheck after waiting behind another flow, and only after an
        // explicit refusal. This may execute the action if a grant now exists.
        const result = waited
          ? await invokeAction(() => action(input))
          : firstAttempt;
        if (signal.aborted) return { status: "cancelled" };
        if (result.ok || result.reason !== "TWO_FACTOR_REQUIRED")
          return toOutcome(result);
        const parsed = challengeSchema.safeParse(result.data);
        if (!parsed.success)
          return toOutcome({
            ok: false,
            reason: "INTERNAL",
            status: 500,
            message: "The verification request could not be understood.",
          });

        let finalOutcome: ActionOutcome<O> | undefined;
        let unexpectedError: { error: unknown } | undefined;
        const closeModal = new AbortController();
        const modalSignal = AbortSignal.any([signal, closeModal.signal]);
        let inFlight: Promise<ActionFailure | null> | undefined;
        // Only one modal request (verify or send) is in flight at a time.
        const runExclusive = (
          operation: () => Promise<ActionFailure | null>,
        ) => {
          if (signal.aborted || finalOutcome) return Promise.resolve(null);
          if (inFlight) return inFlight;
          inFlight = operation()
            .catch((error: unknown) => {
              unexpectedError = { error };
              closeModal.abort();
              return null;
            })
            .finally(() => {
              inFlight = undefined;
            });
          return inFlight;
        };
        try {
          const response = await presentVerification({
            challenge: parsed.data,
            signal: modalSignal,
            submit: (proof: StepUpProof) =>
              runExclusive(async () => {
                const verified = await invokeAction(() =>
                  action(input, { stepUp: proof }),
                );
                if (!verified.ok && verified.reason === "STEP_UP_INVALID_CODE")
                  return verified;
                finalOutcome = toOutcome(verified);
                return null;
              }),
            sendEmail: () =>
              runExclusive(async () => {
                const sent = await invokeAction(sendEmail);
                if (sent.ok) return null;
                if (sent.reason === "RATE_LIMITED") return sent;
                finalOutcome = toOutcome(sent);
                return sent;
              }),
          });
          if (unexpectedError) throw unexpectedError.error;
          if (signal.aborted || response === "cancelled")
            return { status: "cancelled" };
          return finalOutcome ?? { status: "cancelled" };
        } finally {
          // Closing/unmounting cannot cancel an already submitted server action.
          await inFlight;
        }
      });
    },
  };
}
