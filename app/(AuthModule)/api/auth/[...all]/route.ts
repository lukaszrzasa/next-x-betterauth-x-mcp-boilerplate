import { auth } from "@/src/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

async function handle(
  request: Request,
  context: { params: Promise<{ all: string[] }> },
) {
  const { all } = await context.params;
  // Next supplies decoded route segments. Block the entire namespace, including
  // future plugin endpoints, before Better Auth can perform any operation.
  // Keep this at the HTTP boundary: guarded operations may still use auth.api.
  if (all.join("/").split("/")[0] === "admin") {
    return new Response("Not Found", { status: 404 });
  }

  return request.method === "GET"
    ? handlers.GET(request)
    : handlers.POST(request);
}

export { handle as GET, handle as POST };
