import { z } from "zod";

const uuid = z.uuid();

/** Request IDs arrive from the client; anything that is not a UUID can match nothing. */
export const isUuid = (value: string): boolean => uuid.safeParse(value).success;
