import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, type, error, ref, ...props }: InputProps) {
  return (
    <div className="relative w-full">
      <input
        type={type}
        className={cn(
          'flex w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
          error && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        ref={ref}
        aria-invalid={!!error}
        aria-describedby={error ? `${props.id}-error` : undefined}
        {...props}
      />
      {error && (
        <p
          id={`${props.id}-error`}
          className="mt-1.5 text-xs text-destructive font-medium"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
