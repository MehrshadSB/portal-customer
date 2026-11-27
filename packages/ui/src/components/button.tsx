import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva('app-btn', {
  variants: {
    variant: {
      primary: 'app-btn-primary',
      secondary: 'app-btn-secondary',
      outline: 'app-btn-outline',
      ghost: 'app-btn-ghost',
      destructive: 'app-btn-destructive',
    },
    size: {
      sm: 'relative h-8 px-3 text-xs before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[""]',
      md: 'relative h-9 px-3.5 text-sm before:absolute before:inset-x-0 before:-inset-y-1 before:content-[""]',
      lg: 'relative h-10 px-5 text-sm before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[""]',
      icon: 'relative h-9 w-9 before:absolute before:-inset-1 before:content-[""]',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
