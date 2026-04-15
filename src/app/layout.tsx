import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hepatitis Screening — Wangsaiphun Hospital',
  description: 'ระบบติดตามการคัดกรองไวรัสตับอักเสบ บี และ ซี โรงพยาบาลวังทรายพูน',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-gray-50 text-gray-900 min-h-screen font-sans">
        {children}
      </body>
    </html>
  )
}
