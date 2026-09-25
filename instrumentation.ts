export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadInstallationState } =
      await import("./src/lib/auth/installation");

    await loadInstallationState();
  }
}
