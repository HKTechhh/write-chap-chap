import { forwardRef } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

interface WrapProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  htmlFor?: string
  children: ReactNode
  className?: string
}

export function FieldWrap({ label, hint, error, required, htmlFor, children, className }: WrapProps) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : (
        hint && <p className="hint">{hint}</p>
      )}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  wrapClassName?: string
  leading?: ReactNode
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, wrapClassName, className, leading, trailing, id, ...props },
  ref,
) {
  const inputId = id ?? props.name
  return (
    <FieldWrap
      label={label}
      hint={hint}
      error={error}
      required={props.required}
      htmlFor={inputId}
      className={wrapClassName}
    >
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'field',
            leading && 'pl-10',
            trailing && 'pr-10',
            error && 'field-error',
            className,
          )}
          {...props}
        />
        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">{trailing}</span>
        )}
      </div>
    </FieldWrap>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  wrapClassName?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, wrapClassName, className, id, ...props },
  ref,
) {
  const inputId = id ?? props.name
  return (
    <FieldWrap
      label={label}
      hint={hint}
      error={error}
      required={props.required}
      htmlFor={inputId}
      className={wrapClassName}
    >
      <textarea
        ref={ref}
        id={inputId}
        className={cn('field min-h-[110px] resize-y leading-relaxed', error && 'field-error', className)}
        {...props}
      />
    </FieldWrap>
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  wrapClassName?: string
  options: { value: string | number; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, wrapClassName, className, options, placeholder, id, ...props },
  ref,
) {
  const inputId = id ?? props.name
  return (
    <FieldWrap
      label={label}
      hint={hint}
      error={error}
      required={props.required}
      htmlFor={inputId}
      className={wrapClassName}
    >
      <select
        ref={ref}
        id={inputId}
        className={cn('field appearance-none bg-surface pr-9', error && 'field-error', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e\")",
          backgroundPosition: 'right 0.6rem center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '1.25em 1.25em',
        }}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  )
})

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
  description?: ReactNode
}

export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  const inputId = id ?? props.name
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 bg-surface p-3.5 transition-colors',
        'hover:border-brand-300 hover:bg-brand-50/40',
        props.checked && 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-200',
        className,
      )}
    >
      <input
        type="checkbox"
        id={inputId}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-500">{description}</span>}
      </span>
    </label>
  )
}
