import { defineRoutes } from "@/src/lib/access/routes";

/** Routes that belong to the application as a whole rather than to one module. */
export const appRoutes = defineRoutes({
  home: { href: "/", label: "Home", access: "public" },
});
