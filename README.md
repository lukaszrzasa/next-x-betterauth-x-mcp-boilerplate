This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## Authentication and initial setup

Start local services with `docker compose up -d`, then run `bun run db:migrate`.
Configure `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
`RESEND_API_KEY`, and `RESEND_FROM_EMAIL` in the deployment environment.
The Resend sender must be authorized for the intended recipients.

Open `/auth/setup` on an empty installation and create the root administrator.
The installation table records that account's ID. Setup is then permanently
unavailable; it is also blocked if any user already exists. There are no setup
environment flags, recovery passwords, or second-admin bootstrap paths.

The account must complete Better Auth authenticator enrollment at `/auth/enroll`:
confirm the password, scan the QR, verify a code, and save the recovery codes.
An interrupted enrollment resumes on the next sign-in.

Setup status is validated when the Next.js server starts and cached for requests.
Before setup completes, all pages redirect to setup and other APIs are blocked.
The setup transaction rechecks the database and updates the cached state after
committing.

The auth views cover sign-in, sign-up, confirmation emails, forgot/reset password,
authenticator challenges and recovery-code login. Signed-in pages share one
application shell: a top bar with theme toggle and account menu (Settings,
Admin for staff, Sign out), plus a collapsible sidebar on `/admin` routes.
`/panel`, `/settings/*` and the dashboard pages are empty entry points that
carry only their breadcrumb. Existing staff without an
enrolled factor can access only required enrollment, sign-out, and email confirmation.
Ordinary-user enrollment and post-login account settings remain out of scope.

Validation: `bun run test`, `bun run lint`, `bun run typecheck`, and `bun run build`.
`bun run test` also runs the setup integration suite when `DATABASE_URL` is set.
It creates and drops an isolated PostgreSQL schema to test atomic bootstrap,
concurrent submissions and provider 2FA compatibility; no accounts are created
in the application tables. Environments without `DATABASE_URL` explicitly skip
that suite. Form and initialization-cache checks use the same test command.
