"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Play, Pause, RotateCcw, Zap, ChevronDown, Palette } from "lucide-react"

const CELL_SIZE = 20
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

type Grid = Set<string>
type Mode = "classic" | "prime"

const cellKey = (x: number, y: number) => `${x},${y}`

const isPrime = (n: number): boolean => {
  if (n < 2) return false
  if (n === 2) return true
  if (n % 2 === 0) return false
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false
  }
  return true
}

const countNeighbors = (grid: Grid, x: number, y: number): number => {
  let count = 0
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue
      if (grid.has(cellKey(x + dx, y + dy))) count++
    }
  }
  return count
}

const nextGeneration = (grid: Grid, mode: Mode): Grid => {
  const newGrid = new Set<string>()
  const checked = new Set<string>()

  grid.forEach((key) => {
    const [x, y] = key.split(",").map(Number)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx
        const ny = y + dy
        const nKey = cellKey(nx, ny)

        if (checked.has(nKey)) continue
        checked.add(nKey)

        const neighbors = countNeighbors(grid, nx, ny)
        const isAlive = grid.has(nKey)

        if (mode === "classic") {
          if (isAlive) {
            if (neighbors === 2 || neighbors === 3) {
              newGrid.add(nKey)
            }
          } else {
            if (neighbors === 3) {
              newGrid.add(nKey)
            }
          }
        } else {
          if (isAlive) {
            if (neighbors === 6 || neighbors === 7) {
              newGrid.add(nKey)
            }
          } else {
            if (isPrime(neighbors)) {
              newGrid.add(nKey)
            }
          }
        }
      }
    }
  })

  return newGrid
}

const templates = {
  glider: [
    { x: 0, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ],
  blinker: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ],
  toad: [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
  ],
  pulsar: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: -2, y: 2 },
    { x: -2, y: 3 },
    { x: -2, y: 4 },
    { x: 0, y: 5 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
    { x: 3, y: 2 },
    { x: 3, y: 3 },
    { x: 3, y: 4 },
    { x: 5, y: 2 },
    { x: 5, y: 3 },
    { x: 5, y: 4 },
    { x: 6, y: 0 },
    { x: 7, y: 0 },
    { x: 8, y: 0 },
    { x: 6, y: 5 },
    { x: 7, y: 5 },
    { x: 8, y: 5 },
    { x: 10, y: 2 },
    { x: 10, y: 3 },
    { x: 10, y: 4 },
    { x: 0, y: 7 },
    { x: 1, y: 7 },
    { x: 2, y: 7 },
    { x: -2, y: 8 },
    { x: -2, y: 9 },
    { x: -2, y: 10 },
    { x: 0, y: 12 },
    { x: 1, y: 12 },
    { x: 2, y: 12 },
    { x: 3, y: 8 },
    { x: 3, y: 9 },
    { x: 3, y: 10 },
    { x: 5, y: 8 },
    { x: 5, y: 9 },
    { x: 5, y: 10 },
    { x: 10, y: 8 },
    { x: 10, y: 9 },
    { x: 10, y: 10 },
    { x: 6, y: 7 },
    { x: 7, y: 7 },
    { x: 8, y: 7 },
    { x: 6, y: 12 },
    { x: 7, y: 12 },
    { x: 8, y: 12 }
  ],
  beacon: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 3 },
  ],
  popcorn: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: 0, y: 2 },
  ],
  loaf: [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
    { x: 3, y: 1 },
    { x: 1, y: 2 },
    { x: 3, y: 2 },
    { x: 2, y: 3 },
  ],
  beehive: [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
    { x: 3, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
  ],
  gun: [
    // block
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    // bomb
    { x: 10, y: 0 },
    { x: 10, y: -1},
    { x: 10, y: 1 },
    { x: 11, y: 2 },
    { x: 12, y: 3 },
    { x: 13, y: 3 },
    { x: 15, y: 2 },
    { x: 16, y: 1 },
    { x: 16, y: 0 },
    { x: 16, y: -1 },
    { x: 17, y: 0 },
    { x: 15, y: -2 },
    { x: 13, y: -3 },
    { x: 12, y: -3 },
    { x: 11, y: -2 },
    { x: 14, y: 0 },
    // bracket
    { x: 20, y: -1 },
    { x: 20, y: -2 },
    { x: 20, y: -3 },
    { x: 21, y: -1 },
    { x: 21, y: -2 },
    { x: 21, y: -3 },
    { x: 22, y: -4 },
    { x: 22, y: 0 },
    { x: 24, y: 0 },
    { x: 24, y: 1 },
    { x: 24, y: -4 },
    { x: 24, y: -5 },
    // block
    { x: 34, y: -2 },
    { x: 34, y: -3 },
    { x: 35, y: -2 },
    { x: 35, y: -3 }
  ],
}

export function Simulation() {
  const [grid, setGrid] = useState<Grid>(new Set())
  const [isRunning, setIsRunning] = useState(false)
  const [speed, setSpeed] = useState(500)
  const [mode, setMode] = useState<Mode>("classic")
  const [hue, setHue] = useState(270) // Default violet
  const [showHueDropdown, setShowHueDropdown] = useState(false)
  const [colorCycle, setColorCycle] = useState(false)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 })
  const [dragStartPan, setDragStartPan] = useState({ x: 0, y: 0 })
  const [cursorOnCell, setCursorOnCell] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const cycleRef = useRef<number | null>(null)
  const cycleStartRef = useRef<number>(0)
  const cycleStartHueRef = useRef<number>(hue)

  useEffect(() => {
    if (!isRunning) return

    const animate = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current >= speed) {
        setGrid((prev) => nextGeneration(prev, mode))
        lastUpdateRef.current = timestamp
      }
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [isRunning, speed, mode])

  // Keyboard controls: Space to toggle play/pause, 'p' to toggle mode, 1-4 to set speed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ignore when typing in inputs
      const active = document.activeElement
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return

      if (e.code === "Space") {
        e.preventDefault()
        setIsRunning((r) => !r)
      }

      if (e.key.toLowerCase() === "p") {
        setMode((m) => (m === "classic" ? "prime" : "classic"))
      }

      if (e.key.toLowerCase() === "r") {
        setGrid(new Set())
        setIsRunning(false)
      }

      if (/^[1-4]$/.test(e.key)) {
        // Map 1->slow, 2->med, 3->fast, 4->turbo
        switch (e.key) {
          case "1":
            setSpeed(1000)
            break
          case "2":
            setSpeed(500)
            break
          case "3":
            setSpeed(100)
            break
          case "4":
            setSpeed(25)
            break
        }
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Color cycling effect: when enabled, slowly cycle hue through 0-360
  useEffect(() => {
    if (!colorCycle) {
      if (cycleRef.current) {
        cancelAnimationFrame(cycleRef.current)
        cycleRef.current = null
      }
      return
    }

    cycleStartRef.current = performance.now()
    cycleStartHueRef.current = hue

    const step = (ts: number) => {
      const elapsed = ts - cycleStartRef.current
      // cycle every 20 seconds (20000ms)
      const period = 20000
      const progress = (elapsed % period) / period
      const newHue = Math.floor((progress * 360 + cycleStartHueRef.current) % 360)
      setHue(newHue)
      cycleRef.current = requestAnimationFrame(step)
    }

    cycleRef.current = requestAnimationFrame(step)

    return () => {
      if (cycleRef.current) cancelAnimationFrame(cycleRef.current)
      cycleRef.current = null
    }
  }, [colorCycle])

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    ctx.clearRect(0, 0, width, height)

    const cellSize = CELL_SIZE * zoom

    const startX = Math.floor(-panX / cellSize)
    const startY = Math.floor(-panY / cellSize)
    const endX = Math.ceil((width - panX) / cellSize)
    const endY = Math.ceil((height - panY) / cellSize)

    ctx.strokeStyle = "rgba(100, 150, 255, 0.1)"
    ctx.lineWidth = 1

    for (let x = startX; x <= endX; x++) {
      const screenX = x * cellSize + panX
      ctx.beginPath()
      ctx.moveTo(screenX, 0)
      ctx.lineTo(screenX, height)
      ctx.stroke()
    }

    for (let y = startY; y <= endY; y++) {
      const screenY = y * cellSize + panY
      ctx.beginPath()
      ctx.moveTo(0, screenY)
      ctx.lineTo(width, screenY)
      ctx.stroke()
    }

    grid.forEach((key) => {
      const [x, y] = key.split(",").map(Number)
      const screenX = x * cellSize + panX
      const screenY = y * cellSize + panY

      if (screenX + cellSize < 0 || screenX > width || screenY + cellSize < 0 || screenY > height) {
        return
      }

      const mainColor = `hsl(${hue}, 70%, 60%)`
      const glowColor = `hsla(${hue}, 70%, 60%, 0.8)`
      const innerColor = `hsl(${hue}, 60%, 80%)`

      ctx.shadowBlur = 15
      ctx.shadowColor = glowColor

      ctx.fillStyle = mainColor
      ctx.fillRect(screenX + 2, screenY + 2, cellSize - 4, cellSize - 4)

      ctx.fillStyle = innerColor
      ctx.fillRect(screenX + 4, screenY + 4, cellSize - 8, cellSize - 8)

      ctx.shadowBlur = 0
    })
  }, [grid, panX, panY, zoom, hue])

  useEffect(() => {
    drawGrid()
  }, [drawGrid])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const cellSize = CELL_SIZE * zoom
    const gridX = Math.floor((mouseX - panX) / cellSize)
    const gridY = Math.floor((mouseY - panY) / cellSize)

    const key = cellKey(gridX, gridY)
    setGrid((prev) => {
      const newGrid = new Set(prev)
      if (newGrid.has(key)) {
        newGrid.delete(key)
      } else {
        newGrid.add(key)
      }
      return newGrid
    })
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setDragStartPos({ x: e.clientX, y: e.clientY })
    setDragStartPan({ x: panX, y: panY })
    setIsDragging(false)
  }

  const handleMouseMoveCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragStartPos.x === 0 && dragStartPos.y === 0) {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const cellSize = CELL_SIZE * zoom
      const gridX = Math.floor((mouseX - panX) / cellSize)
      const gridY = Math.floor((mouseY - panY) / cellSize)

      const key = cellKey(gridX, gridY)
      setCursorOnCell(grid.has(key))
      return
    }

    const dx = e.clientX - dragStartPos.x
    const dy = e.clientY - dragStartPos.y

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      setIsDragging(true)
      setPanX(dragStartPan.x + dx)
      setPanY(dragStartPan.y + dy)
    }
  }

  const handleMouseUp = () => {
    setTimeout(() => {
      setDragStartPos({ x: 0, y: 0 })
      setIsDragging(false)
    }, 10)
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * delta))

    const zoomRatio = newZoom / zoom
    setPanX(mouseX - (mouseX - panX) * zoomRatio)
    setPanY(mouseY - (mouseY - panY) * zoomRatio)
    setZoom(newZoom)
  }

  const loadTemplate = (template: keyof typeof templates) => {
    const cells = templates[template]
    const newGrid = new Set<string>()

    const canvas = canvasRef.current
    if (!canvas) return

    const cellSize = CELL_SIZE * zoom
    const centerX = Math.floor((canvas.width / 2 - panX) / cellSize)
    const centerY = Math.floor((canvas.height / 2 - panY) / cellSize)

    cells.forEach((cell) => {
      newGrid.add(cellKey(centerX + cell.x, centerY + cell.y))
    })
    setGrid(newGrid)
  }

  const handleReset = () => {
    setGrid(new Set())
    setIsRunning(false)
  }

  const [showPresets, setShowPresets] = useState(false)

  return (
    <main className="relative min-h-screen bg-background overflow-hidden">
      <ThemeToggle />

      <div className="absolute top-4 left-4 md:top-6 md:left-1/2 md:-translate-x-1/2 md:right-auto z-10">
        <div className="relative">
          <Button
            onClick={() => setShowHueDropdown(!showHueDropdown)}
            size="sm"
            variant="outline"
            className="glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer"
          >
            <Palette className="h-4 w-4 mr-2" style={{ color: `hsl(${hue}, 70%, 60%)` }} />
            Cell Color
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showHueDropdown ? "rotate-180" : ""}`} />
          </Button>

          {showHueDropdown && (
            <div className="absolute top-full mt-2 left-0 md:left-auto md:right-0 md:translate-x-0 glass-card border border-electric-blue/50 rounded-lg p-4 w-[90vw] md:w-64 max-w-xs origin-left">
              <label className="text-sm font-medium mb-2 block">Hue: {hue}°</label>
              <input
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={(e) => {
                  setColorCycle(false)
                  setHue(Number(e.target.value))
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, 
                    hsl(0, 70%, 60%), 
                    hsl(60, 70%, 60%), 
                    hsl(120, 70%, 60%), 
                    hsl(180, 70%, 60%), 
                    hsl(240, 70%, 60%), 
                    hsl(300, 70%, 60%), 
                    hsl(360, 70%, 60%))`,
                }}
              />
              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setColorCycle(false)
                    setHue(240)
                  }}
                  className="w-8 h-8 rounded border-2 border-white/20 cursor-pointer hover:scale-110 transition-transform"
                  style={{ background: "hsl(240, 70%, 60%)" }}
                  title="Blue"
                />
                <button
                  onClick={() => {
                    setColorCycle(false)
                    setHue(270)
                  }}
                  className="w-8 h-8 rounded border-2 border-white/20 cursor-pointer hover:scale-110 transition-transform"
                  style={{ background: "hsl(270, 70%, 60%)" }}
                  title="Violet"
                />
                <button
                  onClick={() => {
                    setColorCycle(false)
                    setHue(300)
                  }}
                  className="w-8 h-8 rounded border-2 border-white/20 cursor-pointer hover:scale-110 transition-transform"
                  style={{ background: "hsl(300, 70%, 60%)" }}
                  title="Magenta"
                />
                <button
                  onClick={() => {
                    setColorCycle(false)
                    setHue(0)
                  }}
                  className="w-8 h-8 rounded border-2 border-white/20 cursor-pointer hover:scale-110 transition-transform"
                  style={{ background: "hsl(0, 70%, 60%)" }}
                  title="Red"
                />
                <button
                  onClick={() => {
                    setColorCycle(false)
                    setHue(120)
                  }}
                  className="w-8 h-8 rounded border-2 border-white/20 cursor-pointer hover:scale-110 transition-transform"
                  style={{ background: "hsl(120, 70%, 60%)" }}
                  title="Green"
                />
                <button
                  onClick={() => {
                    setColorCycle(false)
                    setHue(180)
                  }}
                  className="w-8 h-8 rounded border-2 border-white/20 cursor-pointer hover:scale-110 transition-transform"
                  style={{ background: "hsl(180, 70%, 60%)" }}
                  title="Cyan"
                />
                <button
                  onClick={() => setColorCycle((c) => !c)}
                  className={`w-8 h-8 rounded border-2 border-white/20 cursor-pointer hover:scale-110 transition-transform flex items-center justify-center ${colorCycle ? "ring-2 ring-offset-1 ring-pink-400" : ""}`}
                  title="Cycle hues"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

  <div className="absolute top-16 sm:top-12 left-1/2 -translate-x-1/2 md:top-6 md:left-6 md:-translate-x-0 z-30 flex flex-col gap-3 md:gap-4 max-w-[90%] text-center">
        <h2 className="font-sans text-lg md:text-2xl font-bold text-foreground break-words">MORG&apos;S GAME OF LIFE</h2>

        <div className="flex gap-2">
          <Button
            onClick={() => setMode("classic")}
            size="sm"
            variant={mode === "classic" ? "default" : "outline"}
            className={`glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer ${mode === "classic" ? "button-selected" : ""}`}
          >
            Classic
          </Button>
          <Button
            onClick={() => setMode("prime")}
            size="sm"
            variant={mode === "prime" ? "default" : "outline"}
            className={`glass-card border-violet/50 hover:border-violet cursor-pointer ${mode === "prime" ? "button-selected" : ""}`}
          >
            Prime
          </Button>
        </div>
      </div>

  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 md:top-1/2 md:right-6 md:left-auto md:-translate-x-0 md:bottom-auto md:-translate-y-1/2 z-20 flex flex-row md:flex-col gap-3 md:gap-4">
        <Button
          onClick={handleReset}
          size="lg"
          variant="outline"
          className="glass-card w-12 h-12 md:w-16 md:h-16 p-0 border-2 border-electric-blue/50 hover:border-electric-blue hover:bg-electric-blue/20 bg-transparent cursor-pointer"
        >
          <RotateCcw className="h-5 w-5 md:h-6 md:w-6" />
        </Button>

        <Button
          onClick={() => setIsRunning(!isRunning)}
          size="lg"
          className="glass-card w-12 h-12 md:w-16 md:h-16 p-0 bg-electric-blue/20 hover:bg-electric-blue/30 border-2 border-electric-blue/50 hover:border-electric-blue cursor-pointer"
        >
          {isRunning ? <Pause className="h-5 w-5 md:h-6 md:w-6" /> : <Play className="h-5 w-5 md:h-6 md:w-6" />}
        </Button>
        {/* desktop-only vertical speed buttons under the controls */}
        <div className="hidden md:flex flex-col gap-2 mt-2">
          <Button
            onClick={() => setSpeed(1000)}
            size="sm"
            variant={speed === 1000 ? "default" : "outline"}
            className={`glass-card border-electric-blue/50 cursor-pointer ${speed === 1000 ? "button-selected" : ""}`}
          >
            <Zap className="h-4 w-4 mr-1" />
            Slow
          </Button>
          <Button
            onClick={() => setSpeed(500)}
            size="sm"
            variant={speed === 500 ? "default" : "outline"}
            className={`glass-card border-electric-blue/50 cursor-pointer ${speed === 500 ? "button-selected" : ""}`}
          >
            <Zap className="h-4 w-4 mr-1" />
            Med
          </Button>
          <Button
            onClick={() => setSpeed(100)}
            size="sm"
            variant={speed === 100 ? "default" : "outline"}
            className={`glass-card border-electric-blue/50 cursor-pointer ${speed === 100 ? "button-selected" : ""}`}
          >
            <Zap className="h-4 w-4 mr-1" />
            Fast
          </Button>
          <Button
            onClick={() => setSpeed(25)}
            size="sm"
            variant={speed === 25 ? "default" : "outline"}
            className={`glass-card border-pink-500/70 hover:border-pink-500 cursor-pointer ${speed === 25 ? "button-selected turbo-button" : ""}`}
          >
            <Zap className="h-4 w-4 mr-1" />
            Turbo
          </Button>
        </div>
      </div>

  <div className="absolute bottom-28 left-1/2 -translate-x-1/2 md:bottom-6 md:left-6 md:-translate-x-0 z-10 flex flex-col items-center gap-2 md:flex-row md:gap-2">
        {/* speed buttons row (mobile) - centers under presets */}
        <div className="flex gap-2 mt-2 md:hidden">
          <Button
            onClick={() => setSpeed(1000)}
            size="sm"
            variant={speed === 1000 ? "default" : "outline"}
            className={`glass-card border-electric-blue/50 cursor-pointer ${speed === 1000 ? "button-selected" : ""}`}
          >
            <Zap className="h-4 w-4 mr-1" />
            Slow
          </Button>
          <Button
            onClick={() => setSpeed(500)}
            size="sm"
            variant={speed === 500 ? "default" : "outline"}
            className={`glass-card border-electric-blue/50 cursor-pointer ${speed === 500 ? "button-selected" : ""}`}
          >
            <Zap className="h-4 w-4 mr-1" />
            Med
          </Button>
          <Button
            onClick={() => setSpeed(100)}
            size="sm"
            variant={speed === 100 ? "default" : "outline"}
            className={`glass-card border-electric-blue/50 cursor-pointer ${speed === 100 ? "button-selected" : ""}`}
          >
            <Zap className="h-4 w-4 mr-1" />
            Fast
          </Button>
          <Button
            onClick={() => setSpeed(25)}
            size="sm"
            variant={speed === 25 ? "default" : "outline"}
            className={`glass-card border-pink-500/70 hover:border-pink-500 cursor-pointer ${speed === 25 ? "button-selected turbo-button" : ""}`}
          >
            <Zap className="h-4 w-4 mr-1" />
            Turbo
          </Button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={typeof window !== "undefined" ? window.innerWidth : 1920}
        height={typeof window !== "undefined" ? window.innerHeight : 1080}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveCanvas}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={cursorOnCell ? "w-full h-full cursor-pointer" : "w-full h-full cursor-crosshair"}
      />
      {/* Presets dropdown (bottom-center) - opens upward */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center">
        <div className="relative">
          <Button
            onClick={() => setShowPresets((s) => !s)}
            size="sm"
            variant="outline"
            className="glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer"
          >
            Presets
          </Button>

          {showPresets && (
            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 glass-card border border-electric-blue/50 rounded-lg p-3 w-[90vw] md:w-80 max-w-xs grid grid-cols-3 gap-2 origin-bottom">
              <button onClick={() => { loadTemplate('glider'); setShowPresets(false); }} className="p-2 rounded bg-transparent border-2 border-white/10 hover:border-violet/50">Glider</button>
              <button onClick={() => { loadTemplate('blinker'); setShowPresets(false); }} className="p-2 rounded bg-transparent border-2 border-white/10 hover:border-violet/50">Blinker</button>
              <button onClick={() => { loadTemplate('toad'); setShowPresets(false); }} className="p-2 rounded bg-transparent border-2 border-white/10 hover:border-violet/50">Toad</button>
              <button onClick={() => { loadTemplate('pulsar'); setShowPresets(false); }} className="p-2 rounded bg-transparent border-2 border-white/10 hover:border-violet/50">Pulsar</button>
              <button onClick={() => { loadTemplate('beacon'); setShowPresets(false); }} className="p-2 rounded bg-transparent border-2 border-white/10 hover:border-violet/50">Beacon</button>
              <button onClick={() => { loadTemplate('popcorn'); setShowPresets(false); }} className="p-2 rounded bg-transparent border-2 border-white/10 hover:border-violet/50">Popcorn</button>
              <button onClick={() => { loadTemplate('loaf'); setShowPresets(false); }} className="p-2 rounded bg-transparent border-2 border-white/10 hover:border-violet/50">Loaf</button>
              <button onClick={() => { loadTemplate('beehive'); setShowPresets(false); }} className="p-2 rounded bg-transparent border-2 border-white/10 hover:border-violet/50">Beehive</button>
              <button onClick={() => { loadTemplate('gun'); setShowPresets(false); }} className="p-2 rounded bg-transparent border-2 border-white/10 hover:border-violet/50">Gun</button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
