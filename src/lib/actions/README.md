# Client actions

`ActionProvider` is mounted once in `app/layout.tsx`. Import `useAction` from
`@/src/lib/actions` and pass an exported server action backed by `toServerAction`.
Input and output types are inferred from that function.

```tsx
"use client";

import { useAction } from "@/src/lib/actions";
import { updateProfile } from "./actions";

export function SaveProfile() {
  const { execute, isPending, result } = useAction(updateProfile, {
    onSuccess: (profile) => console.log(profile.id),
    onError: (error) => {
      if (error.reason === "INVALID_INPUT") {
        // Narrow error.data before mapping validation issues to your form.
        // Return true after presenting them to suppress shared presentation.
        return true;
      }
    },
  });

  return (
    <>
      <button
        disabled={isPending}
        onClick={() => void execute({ name: "Ada" })}
      >
        Save
      </button>
      {result?.status === "success" && <p>Saved</p>}
    </>
  );
}
```

`execute(input)` resolves to `{ status: "success", data }`,
`{ status: "error", error }`, `{ status: "cancelled" }`, or `{ status: "busy" }`.
For an action with no input, use `execute(undefined)`. Pending covers the initial
request, time in the verification queue, the dialog, and the proof submission.
A second invocation on the same hook returns `busy` without changing its state.
Framework control-flow exceptions and programming errors in callbacks may still
reject; expected action refusals and transport failures are returned as outcomes.

## Errors and cancellation

The per-hook `onError` runs first; returning `true` means the caller handled it.
Otherwise the provider's `onError` runs with the same convention, followed by a
bare dismissible alert. Configure provider callbacks in a client wrapper (replace
the existing root provider; do not add another). Use its error reason to delegate
`UNAUTHENTICATED`, `EMAIL_VERIFICATION_REQUIRED`, or
`TWO_FACTOR_ENROLLMENT_REQUIRED` to future recovery flows.

Cancellation has no error notification. Unmounting cancels queued verification,
closes that consumer's modal, and suppresses its callbacks. It cannot undo a
server request already submitted. The verification queue retains ownership until
an in-flight proof or email send finishes, so it cannot collide with the next flow.

## Verification

The runtime prompts only after `TWO_FACTOR_REQUIRED`. A queued action rechecks
without a proof when its turn starts: an earlier verification may already satisfy
its pool. Otherwise it gets its own modal and proof; codes are never broadcast to
other actions. `STEP_UP_INVALID_CODE` stays inside the modal. Lockout and all
other action failures finish the flow. Network failures have reason `TRANSPORT`;
there is no automatic retry because the action may have executed.

Coordination is per mounted application, not across browser tabs. The server
remains authoritative; sending a code in another tab replaces the session's
previous code. Next.js also serializes server-action dispatch internally; the
hook adds no global pause for actions that do not require verification.

The modal uses `react-call`, React Hook Form for input and validation, and
`react-call/mutation-flow` for pending state and duplicate-submit protection.
Only the email delivery notice has local display state. Replace the bare modal
markup in `VerificationModal.tsx` during the UI task; `VerificationRequest` is its
boundary with the runtime.

Email codes last five minutes, survive typos, and are atomically consumed on
success. Five failures lock verification using the existing 15-minute counter
window (measured from the first failure). Sending is limited to once per 30
seconds per session and does not reset the failure budget. Email sending uses a
session-authenticated action created by `defineAction`.

Better Auth handles rolling renewal of still-valid sessions. `nextCookies()`
forwards refreshed cookies from server actions; expired sessions remain terminal.

## Checks

- `bun test`: builder, runtime, hook, and actual react-call modal tests. Server and
  DOM suites run in separate processes to isolate their module mocks.
- `bun run typecheck` and `bun run lint`.
- `bun run test:redis`: actual Lua tests using a local `REDIS_URL`. These use unique
  expiring test keys and remove them afterward; no application keys are touched.
