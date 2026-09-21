import * as React from 'react'
import { cn } from '../cn'

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  heading?: string
}

export function Panel({ heading, className, children, ...rest }: PanelProps) {
  return (
    <div className={cn('aui-panel', className)} {...rest}>
      {heading ? (
        <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 8 }}>
          {heading}
        </div>
      ) : null}
      {children}
    </div>
  )
}
