import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

const buttonVariants = cva(
  "inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-base font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-brand-strong text-white",
        taxi: "bg-brand-strong text-white",
        ghost: "bg-transparent text-ink",
        danger: "border border-danger/30 bg-surface text-danger",
        line: "border border-line bg-surface text-ink",
      },
      size: {
        default: "h-12 px-5",
        sm: "h-10 px-4 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
