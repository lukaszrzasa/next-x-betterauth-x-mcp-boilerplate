"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";
import { Slot } from "radix-ui";
import { Button } from "@/src/components/ui/button";
import { Separator } from "@/src/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
} from "@/app/_/shell/sidebarState";
import { useIsMobile } from "@/src/lib/hooks/useIsMobile";
import { cn } from "@/src/lib/utils";

/**
 * Sidebar primitives adapted from shadcn/ui for the `ui:` utility prefix.
 * Only the parts the dashboard shell needs: provider, layout wrapper, the
 * collapsible desktop sidebar with its mobile drawer, trigger, rail, inset,
 * groups and menu links. Search, badges, nested menus and skeletons are out.
 */

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  /** Desktop: expanded or collapsed to icons. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Mobile drawer. */
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  /** Toggles whichever state applies at the current breakpoint. */
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

/** Context only; `SidebarLayout` renders the sized wrapper for sidebar pages. */
function SidebarProvider({
  defaultOpen = true,
  children,
}: {
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [open, setOpenState] = React.useState(defaultOpen);

  // Runs from event handlers only; the cookie is the next request's default.
  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
  }, []);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
    } else {
      setOpen(!open);
    }
  }, [isMobile, open, setOpen]);

  const value = React.useMemo<SidebarContextProps>(
    () => ({
      state: open ? "expanded" : "collapsed",
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
    }),
    [open, setOpen, openMobile, isMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </SidebarContext.Provider>
  );
}

function SidebarLayout({
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-wrapper"
      style={
        {
          "--sidebar-width": SIDEBAR_WIDTH,
          "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
          ...style,
        } as React.CSSProperties
      }
      className={cn(
        "ui:group/sidebar-wrapper ui:flex ui:min-h-svh ui:w-full",
        className,
      )}
      {...props}
    />
  );
}

function Sidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          side="left"
          className="ui:w-(--sidebar-width) ui:bg-sidebar ui:p-0 ui:text-sidebar-foreground"
          style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
        >
          <SheetHeader className="ui:sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Dashboard navigation drawer.</SheetDescription>
          </SheetHeader>
          <div className="ui:flex ui:h-full ui:w-full ui:flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="ui:group ui:peer ui:hidden ui:text-sidebar-foreground ui:md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? "icon" : ""}
      data-side="left"
      data-slot="sidebar"
    >
      {/* Reserves the sidebar's width in the document flow. */}
      <div
        data-slot="sidebar-gap"
        className="ui:relative ui:w-(--sidebar-width) ui:bg-transparent ui:transition-[width] ui:duration-200 ui:ease-linear ui:group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "ui:fixed ui:inset-y-0 ui:left-0 ui:z-10 ui:hidden ui:h-svh ui:w-(--sidebar-width) ui:border-r ui:border-sidebar-border ui:transition-[width] ui:duration-200 ui:ease-linear ui:md:flex ui:group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
          className,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="ui:flex ui:h-full ui:w-full ui:flex-col ui:bg-sidebar"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("ui:size-8", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="ui:sr-only">Toggle sidebar</span>
    </Button>
  );
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar, isMobile } = useSidebar();

  if (isMobile) {
    return null;
  }

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle sidebar"
      className={cn(
        "ui:absolute ui:inset-y-0 ui:-right-4 ui:z-20 ui:hidden ui:w-4 ui:cursor-w-resize ui:-translate-x-1/2 ui:transition-all ui:ease-linear ui:group-data-[collapsible=icon]:cursor-e-resize ui:after:absolute ui:after:inset-y-0 ui:after:left-1/2 ui:after:w-[2px] ui:hover:after:bg-sidebar-border ui:sm:flex",
        className,
      )}
      {...props}
    />
  );
}

/** Content column beside the desktop sidebar. Not a landmark; the shell renders `main`. */
function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-inset"
      className={cn(
        "ui:relative ui:flex ui:w-full ui:min-w-0 ui:flex-1 ui:flex-col ui:bg-background",
        className,
      )}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("ui:flex ui:flex-col ui:gap-2 ui:p-2", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("ui:flex ui:flex-col ui:gap-2 ui:p-2", className)}
      {...props}
    />
  );
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("ui:mx-2 ui:w-auto ui:bg-sidebar-border", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "ui:flex ui:min-h-0 ui:flex-1 ui:flex-col ui:gap-2 ui:overflow-auto ui:group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn(
        "ui:relative ui:flex ui:w-full ui:min-w-0 ui:flex-col ui:p-2",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "ui:flex ui:h-8 ui:shrink-0 ui:items-center ui:rounded-md ui:px-2 ui:text-xs ui:font-medium ui:text-sidebar-foreground/70 ui:outline-hidden ui:transition-[margin,opacity] ui:duration-200 ui:ease-linear ui:focus-visible:ring-2 ui:focus-visible:ring-sidebar-ring ui:group-data-[collapsible=icon]:-mt-8 ui:group-data-[collapsible=icon]:opacity-0 ui:[&>svg]:size-4 ui:[&>svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("ui:w-full ui:text-sm", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("ui:flex ui:w-full ui:min-w-0 ui:flex-col ui:gap-1", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("ui:group/menu-item ui:relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "ui:peer/menu-button ui:flex ui:w-full ui:items-center ui:gap-2 ui:overflow-hidden ui:rounded-md ui:p-2 ui:text-left ui:text-sm ui:outline-hidden ui:ring-sidebar-ring ui:transition-[width,height,padding] ui:hover:bg-sidebar-accent ui:hover:text-sidebar-accent-foreground ui:focus-visible:ring-2 ui:active:bg-sidebar-accent ui:active:text-sidebar-accent-foreground ui:disabled:pointer-events-none ui:disabled:opacity-50 ui:aria-disabled:pointer-events-none ui:aria-disabled:opacity-50 ui:data-[active=true]:bg-sidebar-accent ui:data-[active=true]:font-medium ui:data-[active=true]:text-sidebar-accent-foreground ui:data-[state=open]:hover:bg-sidebar-accent ui:data-[state=open]:hover:text-sidebar-accent-foreground ui:group-data-[collapsible=icon]:size-8! ui:group-data-[collapsible=icon]:p-2! ui:[&>span:last-child]:truncate ui:[&>svg]:size-4 ui:[&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "ui:hover:bg-sidebar-accent ui:hover:text-sidebar-accent-foreground",
        outline:
          "ui:bg-background ui:shadow-[0_0_0_1px_var(--sidebar-border)] ui:hover:bg-sidebar-accent ui:hover:text-sidebar-accent-foreground ui:hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "ui:h-8 ui:text-sm",
        sm: "ui:h-7 ui:text-xs",
        lg: "ui:h-12 ui:text-sm ui:group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot.Root : "button";
  const { isMobile, state } = useSidebar();

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  );

  if (!tooltip) {
    return button;
  }

  const tooltipProps = typeof tooltip === "string" ? { children: tooltip } : tooltip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltipProps}
      />
    </Tooltip>
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarLayout,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
