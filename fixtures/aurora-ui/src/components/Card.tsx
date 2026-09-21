import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../cn'

const card = cva('aui-card', {
  variants: {
    tone: {
      default: '',
      raised: 'shadow-[0_8px_24px_rgba(15,23,42,0.10)]',
      flat: 'shadow-none border-[#f1f5f9]',
    },
    padding: {
      tight: 'p-[12px]',
      normal: 'p-[24px]',
      loose: 'p-[32px]',
    },
  },
  defaultVariants: {
    tone: 'default',
    padding: 'normal',
  },
})

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: string
  padding?: string
  title?: string
  footer?: React.ReactNode
}

export function Card({ tone, padding, title, footer, className, children, ...rest }: CardProps) {
  return (
    <div className={cn(card({ tone: tone as never, padding: padding as never }), className)} {...rest}>
      {title ? <h3 className="aui-card-title" style={{ color: '#0f172a', fontSize: '16px' }}>{title}</h3> : null}
      <div className="aui-card-body">{children}</div>
      {footer ? <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>{footer}</div> : null}
    </div>
  )
}
