import Link from "next/link";
import { Button } from "@/src/components/ui/button";

export function AuthFooter({
  children,
  href,
  label,
}: {
  children?: React.ReactNode;
  href: string;
  label: string;
}) {
  return (
    <p className="ui:mt-6 ui:text-center ui:text-sm ui:text-muted-foreground">
      {children}
      <Button variant="link" asChild>
        <Link href={href}>{label}</Link>
      </Button>
    </p>
  );
}
