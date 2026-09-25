"use client";

import { useMemo } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/lib/utils";

import { Label } from "@/src/components/ui/label";
import { Separator } from "@/src/components/ui/separator";

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "ui:flex ui:flex-col ui:gap-6",
        "ui:has-[>[data-slot=checkbox-group]]:gap-3 ui:has-[>[data-slot=radio-group]]:gap-3",
        className,
      )}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "ui:mb-3 ui:font-medium",
        "ui:data-[variant=legend]:text-base",
        "ui:data-[variant=label]:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "ui:group/field-group ui:@container/field-group ui:flex ui:w-full ui:flex-col ui:gap-7 ui:data-[slot=checkbox-group]:gap-3 ui:[&>[data-slot=field-group]]:gap-4",
        className,
      )}
      {...props}
    />
  );
}

const fieldVariants = cva(
  "ui:group/field ui:flex ui:w-full ui:gap-3 ui:data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: ["ui:flex-col ui:[&>*]:w-full ui:[&>.sr-only]:w-auto"],
        horizontal: [
          "ui:flex-row ui:items-center",
          "ui:[&>[data-slot=field-label]]:flex-auto",
          "ui:has-[>[data-slot=field-content]]:items-start ui:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        ],
        responsive: [
          "ui:flex-col ui:@md/field-group:flex-row ui:@md/field-group:items-center ui:[&>*]:w-full ui:@md/field-group:[&>*]:w-auto ui:[&>.sr-only]:w-auto",
          "ui:@md/field-group:[&>[data-slot=field-label]]:flex-auto",
          "ui:@md/field-group:has-[>[data-slot=field-content]]:items-start ui:@md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        ],
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  },
);

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "ui:group/field-content ui:flex ui:flex-1 ui:flex-col ui:gap-1.5 ui:leading-snug",
        className,
      )}
      {...props}
    />
  );
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "ui:group/field-label ui:peer/field-label ui:flex ui:w-fit ui:gap-2 ui:leading-snug ui:group-data-[disabled=true]/field:opacity-50",
        "ui:has-[>[data-slot=field]]:w-full ui:has-[>[data-slot=field]]:flex-col ui:has-[>[data-slot=field]]:rounded-md ui:has-[>[data-slot=field]]:border ui:[&>*]:data-[slot=field]:p-4",
        "ui:has-data-[state=checked]:border-primary ui:has-data-[state=checked]:bg-primary/5 ui:dark:has-data-[state=checked]:bg-primary/10",
        className,
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "ui:flex ui:w-fit ui:items-center ui:gap-2 ui:text-sm ui:leading-snug ui:font-medium ui:group-data-[disabled=true]/field:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "ui:text-sm ui:leading-normal ui:font-normal ui:text-muted-foreground ui:group-has-[[data-orientation=horizontal]]/field:text-balance",
        "ui:last:mt-0 ui:nth-last-2:-mt-1 ui:[[data-variant=legend]+&]:-mt-1.5",
        "ui:[&>a]:underline ui:[&>a]:underline-offset-4 ui:[&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "ui:relative ui:-my-2 ui:h-5 ui:text-sm ui:group-data-[variant=outline]/field-group:-mb-2",
        className,
      )}
      {...props}
    >
      <Separator className="ui:absolute ui:inset-0 ui:top-1/2" />
      {children && (
        <span
          className="ui:relative ui:mx-auto ui:block ui:w-fit ui:bg-background ui:px-2 ui:text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors?.length) {
      return null;
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ];

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className="ui:ml-4 ui:flex ui:list-disc ui:flex-col ui:gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>,
        )}
      </ul>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("ui:text-sm ui:font-normal ui:text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
