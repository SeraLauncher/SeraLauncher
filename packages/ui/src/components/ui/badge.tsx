import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 h-[20px] px-2 rounded-md text-[11px] font-medium border border-border leading-none transition-colors select-none",
  {
    variants: {
      variant: {
        default: "bg-sidebar-accent text-foreground",
        environment: "bg-sidebar-accent text-foreground",
        secondary: "bg-sidebar-accent text-foreground",
        card: "bg-card text-foreground",
        primary: "border-transparent bg-primary text-primary-foreground shadow-xs",
        outline: "bg-transparent text-muted-foreground",
        destructive: "border-destructive/30 bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: {
      variant: "environment",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode;
}

function Badge({ className, variant, icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
