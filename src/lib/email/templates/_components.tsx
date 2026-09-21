import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

// Re-exported so templates keep a single local import.
export { appName } from "@/src/lib/config";

const styles = {
  body: {
    backgroundColor: "#f4f4f5",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    margin: 0,
    padding: "32px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #e4e4e7",
    borderRadius: "8px",
    margin: "0 auto",
    maxWidth: "480px",
    padding: "32px",
  },
  heading: {
    color: "#18181b",
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: "28px",
    margin: "0 0 16px",
  },
  text: {
    color: "#3f3f46",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  button: {
    backgroundColor: "#18181b",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 500,
    padding: "12px 20px",
    textDecoration: "none",
  },
  code: {
    backgroundColor: "#f4f4f5",
    border: "1px solid #e4e4e7",
    borderRadius: "6px",
    color: "#18181b",
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: "28px",
    fontWeight: 600,
    letterSpacing: "6px",
    margin: "24px 0",
    padding: "16px 20px",
    textAlign: "center" as const,
  },
  hr: {
    border: "none",
    borderTop: "1px solid #e4e4e7",
    margin: "28px 0 20px",
  },
  muted: {
    color: "#71717a",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "0 0 8px",
    wordBreak: "break-all" as const,
  },
} as const;

/**
 * Shared shell: every template renders its own copy so email clients get a
 * complete document. `preview` is the snippet shown next to the subject in
 * most inboxes.
 */
export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>{children}</Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return <Heading style={styles.heading}>{children}</Heading>;
}

export function EmailText({ children }: { children: ReactNode }) {
  return <Text style={styles.text}>{children}</Text>;
}

export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "24px 0" }}>
      <Button href={href} style={styles.button}>
        {children}
      </Button>
    </Section>
  );
}

/**
 * One-time codes are rendered as selectable text rather than an image so they
 * survive image blocking and stay copy-pasteable on mobile.
 */
export function EmailCode({ children }: { children: ReactNode }) {
  return <Text style={styles.code}>{children}</Text>;
}

/**
 * Small print below a divider, for emails that carry no link to fall back to.
 */
export function EmailNote({ children }: { children: ReactNode }) {
  return (
    <>
      <Hr style={styles.hr} />
      <Text style={styles.muted}>{children}</Text>
    </>
  );
}

/**
 * Some clients strip buttons, so the destination is always repeated as text.
 */
export function EmailFallbackLink({ href, note }: { href: string; note: string }) {
  return (
    <>
      <Hr style={styles.hr} />
      <Text style={styles.muted}>
        If the button does not work, paste this link into your browser:
      </Text>
      <Text style={styles.muted}>
        <Link href={href} style={{ color: "#71717a" }}>
          {href}
        </Link>
      </Text>
      <Text style={styles.muted}>{note}</Text>
    </>
  );
}
