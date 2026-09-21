import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../cn'

const badge = cva('aui-badge', {
  variants: {
    tone: {
      neutral: 'bg-[#f1f5f9] text-[#475569]',
      info: 'bg-[#dbeafe] text-[#1d4ed8]',
      success: 'bg-[#dcfce7] text-[#15803d]',
      warning: 'bg-[#fef3c7] text-[#b45309]',
      danger: 'bg-[#fee2e2] text-[#b91c1c]',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: string
}

export function Badge({ tone, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn(badge({ tone: tone as never }), className)} {...rest}>
      {children}
    </span>
  )
}
