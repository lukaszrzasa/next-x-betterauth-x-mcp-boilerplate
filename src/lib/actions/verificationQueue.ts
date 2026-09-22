import type { ActionOutcome } from "./types";

/** One owner for the session's email challenge. In-flight requests retain the
 * slot even after cancellation; the next owner must not race a late send/proof.
 */
export class VerificationQueue {
  private tail: Promise<void> = Promise.resolve();
  private size = 0;

  run<T>(
    signal: AbortSignal,
    work: (waited: boolean) => Promise<ActionOutcome<T>>,
  ): Promise<ActionOutcome<T>> {
    const waited = this.size++ > 0;
    return new Promise((resolve, reject) => {
      const cancel = () => resolve({ status: "cancelled" });
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      this.tail = this.tail.then(async () => {
        try {
          if (!signal.aborted) resolve(await work(waited));
        } catch (error) {
          reject(error);
        } finally {
          this.size--;
          signal.removeEventListener("abort", cancel);
        }
      });
    });
  }
}
