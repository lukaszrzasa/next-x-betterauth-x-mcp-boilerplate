import type { RecordedKey } from "@/app/(LogsModule)/_/db/email/findAttempt";
import { LogRecordingError, type RecordResult } from "@/app/(LogsModule)/_/types";

/**
 * A record key that already names an attempt: the same sanitized payload
 * from the same requester is a replay and gets the original ID back;
 * anything else under that key is `RECORD_KEY_CONFLICT`. What was recorded
 * first stays as it is either way.
 */
export function replayOrConflict(recorded: RecordedKey, inputDigest: string): RecordResult {
  if (recorded.inputDigest !== inputDigest) throw new LogRecordingError("RECORD_KEY_CONFLICT");
  return { id: recorded.id, duplicate: true };
}
