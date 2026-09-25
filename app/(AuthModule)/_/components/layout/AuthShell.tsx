import Image from "next/image";
import { AppBrand } from "@/app/_/shell/AppBrand";
import { Card, CardContent } from "@/src/components/ui/card";
import { appName } from "@/src/lib/config";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-ui ui:grid ui:min-h-dvh ui:bg-background ui:md:grid-cols-[minmax(350px,48%)_1fr] ui:lg:grid-cols-[minmax(420px,40%)_1fr]">
      <section className="ui:flex ui:min-h-dvh ui:min-w-0 ui:flex-col ui:px-6 ui:py-7 ui:md:p-8 ui:lg:px-14 ui:lg:pt-10">
        <AppBrand className="ui:self-start" />
        <Card className="ui:mx-auto ui:my-auto ui:w-full ui:max-w-[360px] ui:border-0 ui:py-16 ui:shadow-none">
          <CardContent className="ui:px-0">{children}</CardContent>
        </Card>
        <footer className="ui:flex ui:justify-between ui:gap-3 ui:text-[11px] ui:text-muted-foreground">
          <span>
            © {new Date().getFullYear()} {appName}
          </span>
          <span>Clone it, rename it, ship it.</span>
        </footer>
      </section>
      <aside
        aria-label="Decorative placeholder"
        className="ui:relative ui:my-3.5 ui:mr-3.5 ui:hidden ui:min-h-[600px] ui:overflow-hidden ui:rounded-xl ui:bg-muted ui:md:block"
      >
        <Image
          src="/auth-placeholder.svg"
          alt=""
          fill
          priority
          className="ui:object-cover"
        />
        <div className="ui:absolute ui:right-10 ui:bottom-14 ui:left-8 ui:text-white ui:lg:left-12">
          <p className="ui:mb-5 ui:text-[10px] ui:tracking-[2px] ui:uppercase ui:opacity-80">
            Your next project starts here
          </p>
          <h2 className="ui:max-w-lg ui:text-[clamp(30px,3.6vw,54px)] ui:leading-tight ui:font-normal ui:tracking-tighter">
            Every great product
            <br />
            starts with a first commit.
          </h2>
        </div>
      </aside>
    </main>
  );
}
