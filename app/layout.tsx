import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Playfair_Display } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { Suspense } from "react"

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
})

export const metadata: Metadata = {
  title: "MORGS GAME OF LIFE",
  description: "A custom implementation of Conway's Game of Life",
  generator: "Morgan McDonald",
  icons: {
    icon: "/icon.ico"
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable} ${playfair.variable}`}>
        <Suspense>
          {children}
        </Suspense>
        <Analytics />

        {/* Version text - bottom right corner */}
        <div className="fixed bottom-4 right-4 z-50 text-white text-sm opacity-60 pointer-events-none select-none">
          Version: 1.3
        </div>
      </body>
    </html>
  )
}
