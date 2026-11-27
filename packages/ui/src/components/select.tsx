import * as React from 'react';
import { cn } from '../lib/cn';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn('app-field flex h-9 w-full px-3 py-1.5 text-sm', className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn('app-field flex min-h-24 w-full resize-y px-3 py-2 text-sm leading-relaxed', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
