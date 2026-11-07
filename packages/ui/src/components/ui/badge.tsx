import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 h-[20px] px-2 rounded-md text-[11px] font-medium leading-none transition-colors select-none border-0 outline-none",
  {
    variants: {
      variant: {
        default: "bg-secondary text-foreground",
        environment: "bg-secondary text-foreground",
        secondary: "bg-secondary text-foreground",
        card: "bg-card text-foreground",
        primary: "bg-primary text-primary-foreground shadow-xs",
        outline: "bg-transparent text-muted-foreground",
        destructive: "bg-destructive/15 text-destructive",
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
