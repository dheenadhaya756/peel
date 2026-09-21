import * as React from 'react'
import { cn } from '../cn'

/**
 * Alert — an inline message block.
 * NOTE: not re-exported from the package entry point, so consumers cannot import it.
 */
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  severity?: string
}

export function Alert({ severity = 'info', className, children, ...rest }: AlertProps) {
  const bg = severity === 'error' ? '#fee2e2' : severity === 'warning' ? '#fef3c7' : '#dbeafe'
  return (
    <div className={cn('aui-alert', className)} style={{ background: bg, padding: '12px 16px', borderRadius: '8px' }} {...rest}>
      {children}
    </div>
  )
}
