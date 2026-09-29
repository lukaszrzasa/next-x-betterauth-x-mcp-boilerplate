import { z } from "zod";

const uuid = z.uuid();

/** IDs that arrive from a client; anything that is not a UUID can match no UUID column. */
export const isUuid = (value: string): boolean => uuid.safeParse(value).success;
