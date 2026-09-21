import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../cn'

const button = cva('aui-button', {
  variants: {
    variant: {
      primary: 'bg-[#3b82f6] text-white hover:bg-[#2563eb]',
      secondary: 'bg-[#f1f5f9] text-[#0f172a] hover:bg-[#e2e8f0]',
      danger: 'bg-[#ef4444] text-white hover:bg-[#dc2626]',
      ghost: 'bg-transparent text-[#475569] hover:bg-[#f1f5f9]',
    },
    size: {
      sm: 'h-[28px] px-[10px] text-[12px]',
      md: 'h-[36px] px-[16px] text-[14px]',
      lg: 'h-[44px] px-[20px] text-[16px]',
    },
  },
})

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style of the button. */
  variant?: string
  size?: string
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(button({ variant: variant as never, size: size as never }), className)}
      disabled={loading || rest.disabled}
      style={{ borderColor: '#e2e8f0' }}
      {...rest}
    >
      {loading ? <span style={{ width: 14, height: 14, border: '2px solid #ffffff' }} /> : null}
      {children}
    </button>
  )
}
