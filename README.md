# Next.js × Better Auth × MCP

> **An AI-resilient Next.js architecture built on enterprise patterns.**

Code-generating AI agents are incredible for velocity, but terrible at implicit security. If an AI assistant wires up a new UI button to a database service, it will often hallucinate or completely skip the permission checks.

**"The AI will remember the security rules" is a poor architectural dependency.**

This project is my sandbox for solving that problem. I am bringing the architectural rigor of my **.NET** background into the **Next.js/React** ecosystem to build a system where security is enforced by the compiler, not by prompt engineering.

## The Core Concept: Secure-by-Design Execution

Instead of hoping an AI (or a human developer) remembers to validate a request, this architecture makes it incredibly difficult to casually skip straight to the database.

I built a strict execution pipeline using the Builder pattern and branded TypeScript types:

```text
UI → Server Action → ActionBuilder → Context → DB Service
                          │                        ↑
                 Validates input,             Called ONLY by the
                 Checks access policy,        operation handler
                 Requires 2FA/verification
```

1. **The Operation** declares the rules.
2. **The Builder** enforces them.
3. **The Handler** only receives the execution context *after* all policies pass.
4. **The Database Service** strictly requires this branded context to run.

If an AI tries to bypass the `ActionBuilder` and call the DB directly, the TypeScript compiler fails. **The architecture catches the hallucination before it becomes a vulnerability.**

[Explore the Builder Implementation →](src/lib/auth/builders/README.md)

## Tech Stack

This isn't just a theory; it’s a fully functional application featuring authentication, session management, 2FA verification, and user administration.

* **Core:** Next.js, React, TypeScript
* **Auth & Security:** Better Auth
* **Data Layer:** PostgreSQL, Drizzle ORM
* **Caching & Sessions:** Redis
* **Localization:** next-intl, ICU catalogs per module scope, refusals and emails rendered in the request's language
* **Future-proofing:** MCP (Model Context Protocol)

## Why I Built This

Last week, I had an idea: take what I've learned from **Next.js** and **Modular Monolith architecture in .NET**, bring it together, and build something I could actually run.

This is that idea taking shape—a spare-time project where I put those patterns to work, see how they hold up with AI assistants contributing code, and refine them as I go. I'm building it for the fun of seeing the pieces click, with plenty still to figure out.

## Roadmap & What's Next

This architecture is actively evolving. My current focus areas:

- 🚀 **MCP Integration:** Exposing these secure operations as tools via the Model Context Protocol, allowing AI agents to interact with the system safely.
- 🧹 **Boundary Refactoring:** Untangling the `operation → policy → service` flow and extracting all business logic out of the DB services.
- 🧭 **Timezone & language preferences:** Localization ships (English and Polish, negotiated per request; see [ADR 0005](docs/adr/0005-localization-at-the-boundary.md)); a stored per-user language, a switcher and timezone presentation are the next steps.

## Dive Deeper

Want to run it or look under the hood?

* 🛠 [Local Setup Guide](docs/local-setup.md)
* 📐 [Architecture Deep-Dive](docs/architecture.md)
* 🧠 [Design Decisions & Trade-offs](docs/README.md)
