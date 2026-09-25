import Link from "next/link";
import {
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { appName } from "@/src/lib/config";

export function AuthHeading({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <CardHeader className="ui:mb-7 ui:gap-3 ui:px-0">
      <p className="ui:mb-1 ui:text-[10px] ui:font-semibold ui:tracking-widest ui:text-muted-foreground ui:uppercase">
        {appName}
      </p>
      <CardTitle>
        <h1 className="ui:text-3xl ui:leading-tight ui:font-semibold ui:tracking-tight">
          {title}
        </h1>
      </CardTitle>
      <CardDescription className="ui:leading-relaxed">
        {children}
      </CardDescription>
    </CardHeader>
  );
}

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
