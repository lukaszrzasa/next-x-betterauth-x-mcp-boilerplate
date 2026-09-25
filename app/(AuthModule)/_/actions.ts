"use server";

import { toServerAction } from "@/src/lib/auth/builders/adapters";
import { setupRootAdmin } from "./operations/setup";

export const setupRootAdminAction = toServerAction(setupRootAdmin);
