import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'import' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 font-semibold rounded-lg border transition-all whitespace-nowrap cursor-pointer',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          size === 'md' && 'px-4 py-2 text-[12.5px]',
          size === 'sm' && 'px-3 py-1.5 text-[11.5px]',
          variant === 'default' && 'bg-white border-gray-200 text-gray-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50',
          variant === 'primary' && 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700',
          variant === 'import'  && 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100',
          variant === 'ghost'   && 'bg-transparent border-transparent text-gray-500 hover:bg-gray-100',
          variant === 'danger'  && 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100',
          variant === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
