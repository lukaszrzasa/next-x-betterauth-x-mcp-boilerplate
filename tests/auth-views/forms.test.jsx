import { afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost:3000" });
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "Element",
  "Node",
  "MutationObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
])
  globalThis[name] =
    typeof window[name] === "function" && name.includes("AnimationFrame")
      ? window[name].bind(window)
      : window[name];

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const replace = mock();
const refresh = mock();
const signUp = mock(async () => ({ data: { user: {} }, error: null }));
const signIn = mock(async () => ({ data: { user: {} }, error: null }));
const totp = mock(async () => ({ data: { user: {} }, error: null }));
const enable = mock(async () => ({
  data: {
    method: "totp",
    totpURI: "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP",
    backupCodes: ["abcde-12345"],
  },
  error: null,
}));
const recovery = mock(async () => ({ data: { user: {} }, error: null }));
const sendOtp = mock(async () => ({ data: { status: true }, error: null }));
const verifyOtp = mock(async () => ({ data: { user: {} }, error: null }));

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));
mock.module("../../src/lib/auth/client.ts", () => ({
  authClient: {
    signUp: { email: signUp },
    signIn: { email: signIn },
    twoFactor: {
      enable,
      verifyTotp: totp,
      verifyBackupCode: recovery,
      sendOtp,
      verifyOtp,
    },
  },
}));

const { render, fireEvent, screen, cleanup, waitFor } =
  await import("@testing-library/react");
const { SignUpForm } =
  await import("../../app/(AuthModule)/_/components/signUp/SignUpForm");
const { SignInForm } =
  await import("../../app/(AuthModule)/_/components/signIn/SignInForm");
const { RecoveryCodes } =
  await import("../../app/(AuthModule)/_/components/enrollment/RecoveryCodes");

afterEach(() => {
  cleanup();
  for (const fn of [replace, refresh, signUp, signIn, totp, recovery, enable, sendOtp, verifyOtp])
    fn.mockClear();
});

function fill(label, value) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}

test("Zod validation attaches password mismatch to the confirmation field before signup", async () => {
  render(<SignUpForm />);
  fill("Full name", "Test User");
  fill("Email address", "test@example.com");
  fill("Password", "password-12345");
  fill("Confirm password", "different-12345");
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(await screen.findByText("Passwords do not match.")).toBeTruthy();
  expect(
    screen.getByLabelText("Confirm password").getAttribute("aria-invalid"),
  ).toBe("true");
  expect(signUp).not.toHaveBeenCalled();
});

test("valid signup calls the provider once and refreshes authenticated navigation", async () => {
  render(<SignUpForm />);
  fill("Full name", "Test User");
  fill("Email address", "test@example.com");
  fill("Password", "password-12345");
  fill("Confirm password", "password-12345");
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
  expect(signUp.mock.calls[0][0].confirmPassword).toBeUndefined();
  expect(replace).toHaveBeenCalledWith("/panel");
  expect(refresh).toHaveBeenCalled();
});

test("password sign-in cannot navigate before its second factor; recovery is a separate challenge", async () => {
  signIn.mockResolvedValueOnce({
    data: { twoFactorRedirect: true },
    error: null,
  });
  render(<SignInForm />);
  fill("Email address", "test@example.com");
  fill("Password", "password-12345");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

  await screen.findByLabelText("Authenticator code");
  expect(replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use a recovery code" }));
  fill("Recovery code", "abcde-12345");
  fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));

  await waitFor(() => expect(recovery).toHaveBeenCalledTimes(1));
  expect(totp).not.toHaveBeenCalled();
  expect(replace).toHaveBeenCalledWith("/panel");
});

test("an emailed code is requested once when chosen and completes sign-in", async () => {
  signIn.mockResolvedValueOnce({
    data: { twoFactorRedirect: true },
    error: null,
  });
  render(<SignInForm />);
  fill("Email address", "test@example.com");
  fill("Password", "password-12345");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

  await screen.findByLabelText("Authenticator code");
  expect(sendOtp).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Email me a code instead" }));
  await screen.findByText(/We emailed you a six-digit code/);
  expect(sendOtp).toHaveBeenCalledTimes(1);

  // Switching away and back must not mail another code on its own.
  fireEvent.click(screen.getByRole("button", { name: "Use an authenticator code" }));
  await screen.findByLabelText("Authenticator code");
  fireEvent.click(screen.getByRole("button", { name: "Email me a code instead" }));
  await screen.findByText(/We emailed you a six-digit code/);
  expect(sendOtp).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
  await waitFor(() => expect(sendOtp).toHaveBeenCalledTimes(2));

  fill("Email code", "123456");
  fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
  await waitFor(() => expect(verifyOtp).toHaveBeenCalledTimes(1));
  expect(verifyOtp).toHaveBeenCalledWith({ code: "123456", trustDevice: false });
  expect(totp).not.toHaveBeenCalled();
  expect(replace).toHaveBeenCalledWith("/panel");
});

test("a refused email code shows the server's reason", async () => {
  signIn.mockResolvedValueOnce({ data: { twoFactorRedirect: true }, error: null });
  sendOtp.mockResolvedValueOnce({
    data: null,
    error: { code: "EMAIL_NOT_VERIFIED", message: "Verify your email address before signing in with an email code." },
  });
  render(<SignInForm />);
  fill("Email address", "test@example.com");
  fill("Password", "password-12345");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByLabelText("Authenticator code");
  fireEvent.click(screen.getByRole("button", { name: "Email me a code instead" }));
  await screen.findByText(/Verify your email address before signing in/);
});

test("the Radix recovery-code acknowledgement gates continuation", async () => {
  const onContinue = mock();
  render(<RecoveryCodes codes={["abcde-12345"]} onContinue={onContinue} />);
  const button = screen.getByRole("button", { name: "Continue to panel" });

  expect(button.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(onContinue).toHaveBeenCalledTimes(1);
});

const { EnrollmentForm } =
  await import("../../app/(AuthModule)/_/components/enrollment/EnrollmentForm");

test("enrollment delegates to Better Auth and shows recovery codes only after verification", async () => {
  render(<EnrollmentForm />);
  fill("Confirm your password", "password-12345");
  fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
  await screen.findByLabelText("Authenticator code");
  expect(enable).toHaveBeenCalledWith({
    password: "password-12345",
    method: "totp",
  });
  expect(screen.queryByText("abcde-12345")).toBeNull();
  totp.mockResolvedValueOnce({
    data: null,
    error: { message: "Invalid code" },
  });
  fill("Authenticator code", "123456");
  fireEvent.click(screen.getByRole("button", { name: "Verify authenticator" }));
  await screen.findByText("Invalid code");
  expect(screen.queryByText("abcde-12345")).toBeNull();
  expect(replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Verify authenticator" }));
  await screen.findByText("abcde-12345");
  expect(totp).toHaveBeenLastCalledWith({ code: "123456", trustDevice: false });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Continue to panel" }));
  expect(replace).toHaveBeenCalledWith("/panel");
});
