"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CursorGlow } from "@/components/cursor-glow"
import { AnimatedBackground } from "@/components/animated-background"
import { Simulation } from "@/components/simulation"

export default function Home() {
  const [showSimulation, setShowSimulation] = useState(false)

  if (showSimulation) {
    return <Simulation />
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center cursor-glow overflow-hidden">
      <AnimatedBackground />
      <CursorGlow />

      <div className="relative z-10 flex flex-col items-center gap-12 px-4 animate-fade-in">
        {/* Main title */}
  <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-8xl font-bold text-center text-balance tracking-tight">
          <span className="text-black">
            MORG&apos;S
          </span>
          <br />
          <span className="text-foreground">GAME OF LIFE</span>
        </h1>

  {/* Credit line */}
  <p className="mt-2 text-sm text-black opacity-90">Developed by Morgan McDonald - Inspired by Conway's Game of Life</p>

        {/* Begin button */}
        <Button
          onClick={() => setShowSimulation(true)}
          size="lg"
          className="glass-card px-8 py-6 sm:px-12 sm:py-8 text-lg sm:text-xl font-semibold tracking-wide
                     bg-electric-blue/20 hover:bg-electric-blue/30 
                     border-2 border-electric-blue/50 hover:border-electric-blue
                     text-foreground hover:text-electric-blue
                     transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-electric-blue/20
                     rounded-2xl"
        >
          BEGIN SIMULATION
        </Button>
      </div>
    </main>
  )
}
