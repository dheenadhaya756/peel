import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Peel — agent-ready design systems',
  description:
    'Score a design system for agent readiness, convert it into a three-layer contract, see every component before and after, and ship it to GitHub.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
