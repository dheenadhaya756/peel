import * as React from 'react'
import { cn } from '../cn'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, ...rest }: InputProps) {
  return (
    <label style={{ display: 'block', fontSize: '14px', color: '#0f172a' }}>
      {label ? <span style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>{label}</span> : null}
      <input
        className={cn('aui-input', className)}
        style={error ? { borderColor: '#ef4444' } : undefined}
        {...rest}
      />
      {error ? <span style={{ color: '#dc2626', fontSize: '12px', marginTop: 4, display: 'block' }}>{error}</span> : null}
    </label>
  )
}
