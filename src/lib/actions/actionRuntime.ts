import { startTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { twoFactorPools } from "../auth/2fa";
import type {
  ActionResult,
  ServerAction,
} from "../auth/builders/adapters/types";
import type { StepUpProof } from "../auth/stepUp";
import type {
  ActionFailure,
  ActionOutcome,
  VerificationPresenter,
} from "./types";
import { VerificationQueue } from "./verificationQueue";

const challengeSchema = z.object({
  pool: z.enum(
    Object.keys(twoFactorPools) as [
      keyof typeof twoFactorPools,
      ...Array<keyof typeof twoFactorPools>,
    ],
  ),
  methods: z.array(z.enum(["totp", "email"])).min(1),
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
            message:
              "The action could not be completed. Check its result before trying again.",
          });
        } catch (controlFlow) {
          reject(controlFlow);
        }
      }
    });
  });
}

function outcome<T>(result: ActionResult<T> | ActionFailure): ActionOutcome<T> {
  return result.ok
    ? { status: "success", data: result.data }
    : { status: "error", error: result };
}

export function createActionRuntime({
  present,
  sendEmail,
}: {
  present: VerificationPresenter;
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
      const initial = await invokeAction(() => action(input));
      if (signal.aborted) return { status: "cancelled" };
      if (initial.ok || initial.reason !== "TWO_FACTOR_REQUIRED")
        return outcome(initial);

      return queue.run<O>(signal, async (waited) => {
        // Only recheck after waiting behind another flow, and only after an
        // explicit refusal. This may execute the action if a grant now exists.
        const result = waited
          ? await invokeAction(() => action(input))
          : initial;
        if (signal.aborted) return { status: "cancelled" };
        if (result.ok || result.reason !== "TWO_FACTOR_REQUIRED")
          return outcome(result);
        const parsed = challengeSchema.safeParse(result.data);
        if (!parsed.success)
          return outcome({
            ok: false,
            reason: "INTERNAL",
            status: 500,
            message: "The verification request could not be understood.",
          });

        let terminal: ActionOutcome<O> | undefined;
        let thrown: { error: unknown } | undefined;
        const close = new AbortController();
        const modalSignal = AbortSignal.any([signal, close.signal]);
        let inFlight: Promise<ActionFailure | null> | undefined;
        const run = (operation: () => Promise<ActionFailure | null>) => {
          if (signal.aborted || terminal) return Promise.resolve(null);
          if (inFlight) return inFlight;
          inFlight = operation()
            .catch((error: unknown) => {
              thrown = { error };
              close.abort();
              return null;
            })
            .finally(() => {
              inFlight = undefined;
            });
          return inFlight;
        };
        try {
          const response = await present({
            challenge: parsed.data,
            signal: modalSignal,
            submit: (proof: StepUpProof) =>
              run(async () => {
                const verified = await invokeAction(() =>
                  action(input, { stepUp: proof }),
                );
                if (!verified.ok && verified.reason === "STEP_UP_INVALID_CODE")
                  return verified;
                terminal = outcome(verified);
                return null;
              }),
            sendEmail: () =>
              run(async () => {
                const sent = await invokeAction(sendEmail);
                if (sent.ok) return null;
                if (sent.reason === "RATE_LIMITED") return sent;
                terminal = outcome(sent);
                return sent;
              }),
          });
          if (thrown) throw thrown.error;
          if (signal.aborted || response === "cancelled")
            return { status: "cancelled" };
          return terminal ?? { status: "cancelled" };
        } finally {
          // Closing/unmounting cannot cancel an already submitted server action.
          await inFlight;
        }
      });
    },
  };
}
