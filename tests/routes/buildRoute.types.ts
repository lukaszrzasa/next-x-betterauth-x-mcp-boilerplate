import { buildRoute } from "@/src/lib/routes";

// Parameters are derived from the template; the checker rejects mismatches.
buildRoute("/users/[id]", { id: "1" });
buildRoute("/docs/[...slug]", { slug: ["a"] });
buildRoute("/panel");
buildRoute("/panel", undefined, { tab: "x" });

// @ts-expect-error missing parameter
buildRoute("/users/[id]");
// @ts-expect-error unknown parameter
buildRoute("/users/[id]", { id: "1", extra: true });
// @ts-expect-error a template without segments takes no params
buildRoute("/panel", { id: "1" });
