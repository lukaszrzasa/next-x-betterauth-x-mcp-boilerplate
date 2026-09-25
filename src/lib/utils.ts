import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const mergeClasses = extendTailwindMerge({ prefix: "ui" });

export function cn(...inputs: ClassValue[]) {
  return mergeClasses(clsx(inputs));
}
