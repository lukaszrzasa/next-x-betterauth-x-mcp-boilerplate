import { useAction } from "@/src/lib/actions";
import type { ServerAction } from "@/src/lib/auth/builders/adapters";

declare const save: ServerAction<{ name: string }, { id: number }>;

// Compile-only contract: types must flow through the hook unchanged.
export function useTypedExample() {
  const action = useAction(save, {
    onSuccess: (data) => {
      const id: number = data.id;
      return id;
    },
  });
  async function check() {
    const result = await action.execute({ name: "Ada" });
    // @ts-expect-error Server input remains required and typed.
    await action.execute({ name: 123 });
    if (result.status === "success") {
      const id: number = result.data.id;
      // @ts-expect-error Output isn't widened to any.
      const missing: string = result.data.missing;
      return { id, missing };
    }
  }
  return check;
}
