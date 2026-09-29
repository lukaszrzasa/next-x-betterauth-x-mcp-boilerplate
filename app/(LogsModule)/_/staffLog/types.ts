import type { StaffLogBlock } from "./blocks";

/** What a caller hands to `recordStaffLog`. The actor is not part of it: it is the context's user. */
export type StaffLogEntry = {
  /** What was done, e.g. `user.banned`. */
  action: string;
  /** What it was done to: any module's resource, by type and ID. */
  resource: { type: string; id: string };
  message: StaffLogBlock[];
};

/** The entry could not be written; the staff action it describes has already happened. */
export class StaffLogError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StaffLogError";
  }
}
