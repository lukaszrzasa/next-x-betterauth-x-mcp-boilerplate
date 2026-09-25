/**
 * Width classes matching the users table's columns, for the loading skeleton.
 * A plain module (no "use client") so a server component can read the array;
 * a value imported from a client module would arrive as a client reference.
 */
export const USERS_COLUMN_SKELETON_WIDTHS = [
  "ui:w-48",
  "ui:w-20",
  "ui:w-20",
  "ui:w-24",
  "ui:w-24",
  "ui:w-16",
] as const;
