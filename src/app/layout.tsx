import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'IIC작업실',
  description: 'IIC작업실 현황 대시보드',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="min-h-dvh bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">{children}</div>
      </body>
    </html>
  )
}


