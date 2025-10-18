"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Play, Pause, RotateCcw, Zap, ChevronDown, Palette, Grid3X3 } from "lucide-react"

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


// Load presets from external file (kinda like my own language)
const loadPresets = async (): Promise<Record<string, Array<{ x: number; y: number }>>> => {
  try {
    const response = await fetch('/presets.txt')
    const text = await response.text()
    
    const presets: Record<string, Array<{ x: number; y: number }>> = {}
    const lines = text.split('\n')
    let currentPreset = ''
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      
      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue
      }
      
      // Check if this is a preset header
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        currentPreset = trimmedLine.slice(1, -1)
        presets[currentPreset] = []
        continue
      }
      
      // Parse coordinates
      if (currentPreset && trimmedLine.includes(',')) {
        const [x, y] = trimmedLine.split(',').map(Number)
        if (!isNaN(x) && !isNaN(y)) {
          presets[currentPreset].push({ x, y })
        }
      }
    }
    
    return presets
  } catch (error) {
    console.error('Failed to load presets:', error)
    // Fallback to empty object if file loading fails
    return {}
  }
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
  const [templates, setTemplates] = useState<Record<string, Array<{ x: number; y: number }>>>({})
  const [showGrid, setShowGrid] = useState(true)
  const [isKeyboardPanning, setIsKeyboardPanning] = useState(false)
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())
  const [keyboardPanSpeed, setKeyboardPanSpeed] = useState(5)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [originalCellPositions, setOriginalCellPositions] = useState<Set<string>>(new Set())
  const [isDraggingSelection, setIsDraggingSelection] = useState(false)
  const [editMode, setEditMode] = useState<"place" | "select">("place")
  const [tempPreset, setTempPreset] = useState<Array<{ x: number; y: number }>>([])
  const [justCompletedSelection, setJustCompletedSelection] = useState(false)
  const [showControls, setShowControls] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const cycleRef = useRef<number | null>(null)
  const cycleStartRef = useRef<number>(0)
  const cycleStartHueRef = useRef<number>(hue)
  const keyboardPanRef = useRef<number | null>(null)

  // Load presets on component mount
  useEffect(() => {
    const loadPresetsData = async () => {
      const presets = await loadPresets()
      setTemplates(presets)
    }
    loadPresetsData()
  }, [])

  useEffect(() => {
    if (!isRunning) return

    const animate = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current >= speed) {
        setGrid((prev) => {
          return nextGeneration(prev, mode)
        })
        lastUpdateRef.current = timestamp
      }
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [isRunning, speed, mode])

  // Keyboard controls: Space to toggle play/pause, 'p' to toggle mode, 1-4 to set speed, arrows to pan, +/- to zoom
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ignore when typing in inputs
      const active = document.activeElement
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return

      // Handle navigation keys (arrows + WASD)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Equal', 'Minus'].includes(e.code)) {
        e.preventDefault()
        setPressedKeys(prev => new Set(prev).add(e.code))
        setIsKeyboardPanning(true)
        return
      }

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

      if (e.key.toLowerCase() === "g") {
        setShowGrid((g) => !g)
      }

      if (e.key.toLowerCase() === "e" || e.key === "Shift") {
        setEditMode((mode) => mode === "place" ? "select" : "place")
      }

      if (e.key === "Escape") {
        // If we have selected cells, restore them to their original positions
        if (originalCellPositions.size > 0) {
          setGrid(prev => {
            const newGrid = new Set(prev)
            originalCellPositions.forEach(key => {
              newGrid.add(key)
            })
            return newGrid
          })
        }
        setSelectedPreset(null)
        setTempPreset([])
        setSelectedCells(new Set())
        setOriginalCellPositions(new Set())
        setSelectionBox(null)
        setIsDraggingSelection(false)
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

    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Equal', 'Minus'].includes(e.code)) {
        e.preventDefault()
        setPressedKeys(prev => {
          const newSet = new Set(prev)
          newSet.delete(e.code)
          return newSet
        })
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false })
    window.addEventListener("keyup", onKeyUp, { passive: false })
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
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
      // Use smooth interpolation without Math.floor to avoid flashing
      const newHue = (progress * 360 + cycleStartHueRef.current) % 360
      setHue(newHue)
      cycleRef.current = requestAnimationFrame(step)
    }

    cycleRef.current = requestAnimationFrame(step)

    return () => {
      if (cycleRef.current) cancelAnimationFrame(cycleRef.current)
      cycleRef.current = null
    }
  }, [colorCycle])

  // Keyboard panning animation
  useEffect(() => {
    // Only animate when we have pressed keys, but keep cursor hidden if isKeyboardPanning is true
    if (pressedKeys.size === 0) {
      if (keyboardPanRef.current) {
        cancelAnimationFrame(keyboardPanRef.current)
        keyboardPanRef.current = null
      }
      return
    }

    const zoomSpeed = 0.02 // zoom increment per frame

    const animate = () => {
      let newPanX = panX
      let newPanY = panY
      let newZoom = zoom

      // Handle arrow key and WASD panning with dynamic speed
      if (pressedKeys.has('ArrowUp') || pressedKeys.has('KeyW')) newPanY += keyboardPanSpeed
      if (pressedKeys.has('ArrowDown') || pressedKeys.has('KeyS')) newPanY -= keyboardPanSpeed
      if (pressedKeys.has('ArrowLeft') || pressedKeys.has('KeyA')) newPanX += keyboardPanSpeed
      if (pressedKeys.has('ArrowRight') || pressedKeys.has('KeyD')) newPanX -= keyboardPanSpeed

      // Handle +/- zoom with center pivot
      if (pressedKeys.has('Equal')) {
        const oldZoom = zoom
        newZoom = Math.min(MAX_ZOOM, zoom + zoomSpeed)
        // Adjust pan to keep center of screen as pivot
        const zoomRatio = newZoom / oldZoom
        const canvas = canvasRef.current
        if (canvas) {
          const centerX = canvas.width / 2
          const centerY = canvas.height / 2
          newPanX = centerX - (centerX - panX) * zoomRatio
          newPanY = centerY - (centerY - panY) * zoomRatio
        }
      }
      if (pressedKeys.has('Minus')) {
        const oldZoom = zoom
        newZoom = Math.max(MIN_ZOOM, zoom - zoomSpeed)
        // Adjust pan to keep center of screen as pivot
        const zoomRatio = newZoom / oldZoom
        const canvas = canvasRef.current
        if (canvas) {
          const centerX = canvas.width / 2
          const centerY = canvas.height / 2
          newPanX = centerX - (centerX - panX) * zoomRatio
          newPanY = centerY - (centerY - panY) * zoomRatio
        }
      }

      setPanX(newPanX)
      setPanY(newPanY)
      setZoom(newZoom)

      keyboardPanRef.current = requestAnimationFrame(animate)
    }

    keyboardPanRef.current = requestAnimationFrame(animate)

    return () => {
      if (keyboardPanRef.current) {
        cancelAnimationFrame(keyboardPanRef.current)
        keyboardPanRef.current = null
      }
    }
  }, [pressedKeys, panX, panY, zoom, keyboardPanSpeed])

  // Note: We don't automatically stop keyboard panning when keys are released
  // The cursor stays hidden until the mouse actually moves

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

    // Draw grid lines only if showGrid is true
    if (showGrid) {
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
    }

    grid.forEach((key) => {
      const [x, y] = key.split(",").map(Number)
      const screenX = x * cellSize + panX
      const screenY = y * cellSize + panY

      if (screenX + cellSize < 0 || screenX > width || screenY + cellSize < 0 || screenY > height) {
        return
      }

      // Special case for white (hue = 0 with 0% saturation)
      const isWhite = hue === 0
      const mainColor = isWhite ? `hsl(0, 0%, 90%)` : `hsl(${hue}, 70%, 60%)`
      const glowColor = isWhite ? `hsla(0, 0%, 90%, 0.8)` : `hsla(${hue}, 70%, 60%, 0.8)`
      const innerColor = isWhite ? `hsl(0, 0%, 95%)` : `hsl(${hue}, 60%, 80%)`

      ctx.shadowBlur = 15
      ctx.shadowColor = glowColor

      ctx.fillStyle = mainColor
      ctx.fillRect(screenX + 2, screenY + 2, cellSize - 4, cellSize - 4)

      ctx.fillStyle = innerColor
      ctx.fillRect(screenX + 4, screenY + 4, cellSize - 8, cellSize - 8)

      ctx.shadowBlur = 0
    })

    // Draw crosshair when keyboard panning
    if (isKeyboardPanning) {
      const centerX = width / 2
      const centerY = height / 2
      const crosshairSize = 20

      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"
      ctx.lineWidth = 2
      ctx.beginPath()
      // Horizontal line
      ctx.moveTo(centerX - crosshairSize, centerY)
      ctx.lineTo(centerX + crosshairSize, centerY)
      // Vertical line
      ctx.moveTo(centerX, centerY - crosshairSize)
      ctx.lineTo(centerX, centerY + crosshairSize)
      ctx.stroke()
    }

    // Draw selection box when dragging
    if (selectionBox && isDraggingSelection) {
      const cellSize = CELL_SIZE * zoom
      const minX = Math.min(selectionBox.startX, selectionBox.endX)
      const maxX = Math.max(selectionBox.startX, selectionBox.endX)
      const minY = Math.min(selectionBox.startY, selectionBox.endY)
      const maxY = Math.max(selectionBox.startY, selectionBox.endY)

      const screenX = minX * cellSize + panX
      const screenY = minY * cellSize + panY
      const boxWidth = (maxX - minX + 1) * cellSize
      const boxHeight = (maxY - minY + 1) * cellSize

      // Semi-transparent blue selection box
      ctx.fillStyle = "rgba(100, 150, 255, 0.2)"
      ctx.fillRect(screenX, screenY, boxWidth, boxHeight)

      // Blue border
      ctx.strokeStyle = "rgba(100, 150, 255, 0.8)"
      ctx.lineWidth = 2
      ctx.strokeRect(screenX, screenY, boxWidth, boxHeight)
    }

    // Draw temp preset preview (EXACTLY like preset preview)
    if (tempPreset.length > 0) {
      const cellSize = CELL_SIZE * zoom
      const gridX = Math.floor((mousePosition.x - panX) / cellSize)
      const gridY = Math.floor((mousePosition.y - panY) / cellSize)

      // Draw preview cells (EXACTLY like preset preview)
      tempPreset.forEach((cell) => {
        const screenX = (gridX + cell.x) * cellSize + panX
        const screenY = (gridY + cell.y) * cellSize + panY

        if (screenX + cellSize < 0 || screenX > width || screenY + cellSize < 0 || screenY > height) {
          return
        }

        // Semi-transparent blue preview
        ctx.fillStyle = "rgba(100, 150, 255, 0.4)"
        ctx.fillRect(screenX + 2, screenY + 2, cellSize - 4, cellSize - 4)
        
        // Blue border
        ctx.strokeStyle = "rgba(100, 150, 255, 0.8)"
        ctx.lineWidth = 2
        ctx.strokeRect(screenX + 2, screenY + 2, cellSize - 4, cellSize - 4)
      })
    }

    // Draw preset preview when a preset is selected
    if (selectedPreset) {
      const cells = templates[selectedPreset]
      if (cells) {
        const cellSize = CELL_SIZE * zoom
        const gridX = Math.floor((mousePosition.x - panX) / cellSize)
        const gridY = Math.floor((mousePosition.y - panY) / cellSize)

        // Draw preview cells
        cells.forEach((cell) => {
          const screenX = (gridX + cell.x) * cellSize + panX
          const screenY = (gridY + cell.y) * cellSize + panY

          if (screenX + cellSize < 0 || screenX > width || screenY + cellSize < 0 || screenY > height) {
            return
          }

          // Semi-transparent blue preview
          ctx.fillStyle = "rgba(100, 150, 255, 0.4)"
          ctx.fillRect(screenX + 2, screenY + 2, cellSize - 4, cellSize - 4)

          // Border for preview
          ctx.strokeStyle = "rgba(100, 150, 255, 0.8)"
          ctx.lineWidth = 2
          ctx.strokeRect(screenX + 2, screenY + 2, cellSize - 4, cellSize - 4)
        })
      }
    }
  }, [grid, panX, panY, zoom, hue, showGrid, isKeyboardPanning, selectedPreset, mousePosition, templates, selectionBox, isDraggingSelection, selectedCells, tempPreset, editMode, justCompletedSelection])

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

    // Right-click cancels preset selection or restores selected cells
    if (e.button === 2) {
      e.preventDefault() // Prevent context menu and panning
      if (selectedPreset) {
        setSelectedPreset(null)
        return
      }
      if (tempPreset.length > 0) {
        // Restore selected cells to their original positions
        setGrid(prev => {
          const newGrid = new Set(prev)
          originalCellPositions.forEach(key => {
            newGrid.add(key)
          })
          return newGrid
        })
        setTempPreset([])
        setSelectedCells(new Set())
        setOriginalCellPositions(new Set())
        return
      }
    }

    // Handle placing temp preset (left-click only) - EXACTLY like preset
    if (tempPreset.length > 0 && e.button === 0 && !isDraggingSelection && !justCompletedSelection) {
      // Place EXACTLY like a preset
      setGrid(prev => {
        const newGrid = new Set(prev)
        tempPreset.forEach(cell => {
          newGrid.add(cellKey(gridX + cell.x, gridY + cell.y))
        })
        return newGrid
      })
      
      // Clear temp preset (EXACTLY like clearing selectedPreset)
      setTempPreset([])
      setSelectedCells(new Set())
      return
    }

    // If a preset is selected, place it at the clicked position
    if (selectedPreset && e.button === 0) {
      const cells = templates[selectedPreset]
      if (cells) {
        setGrid((prev) => {
          const newGrid = new Set(prev)
          cells.forEach((cell) => {
            newGrid.add(cellKey(gridX + cell.x, gridY + cell.y))
          })
          return newGrid
        })
      }
      setSelectedPreset(null)
      return
    }

    // Normal cell toggle behavior (left-click only) - only in place mode
    if (e.button === 0 && editMode === "place") {
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
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Prevent right-click from triggering panning
    if (e.button === 2) {
      return
    }

    // Only allow selection when in select mode, simulation is paused, and no preset is selected
    if (editMode === "select" && !isRunning && !selectedPreset && e.button === 0) {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const cellSize = CELL_SIZE * zoom
      const gridX = Math.floor((mouseX - panX) / cellSize)
      const gridY = Math.floor((mouseY - panY) / cellSize)

      setSelectionBox({ startX: gridX, startY: gridY, endX: gridX, endY: gridY })
      setIsDraggingSelection(true)
      return
    }

    setDragStartPos({ x: e.clientX, y: e.clientY })
    setDragStartPan({ x: panX, y: panY })
    setIsDragging(false)
  }

  const handleMouseMoveCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Stop keyboard panning when mouse moves
    if (isKeyboardPanning) {
      setIsKeyboardPanning(false)
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Handle selection box dragging
    if (isDraggingSelection && selectionBox) {
      const cellSize = CELL_SIZE * zoom
      const gridX = Math.floor((mouseX - panX) / cellSize)
      const gridY = Math.floor((mouseY - panY) / cellSize)

      setSelectionBox(prev => prev ? { ...prev, endX: gridX, endY: gridY } : null)
      return
    }

    // Update mouse position for preset preview
    if (selectedPreset) {
      setMousePosition({ x: mouseX, y: mouseY })
    }

    // Update mouse position for temp preset preview (selected cells blueprint)
    if (tempPreset.length > 0) {
      setMousePosition({ x: mouseX, y: mouseY })
    }

    if (dragStartPos.x === 0 && dragStartPos.y === 0) {
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

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Prevent right-click from triggering panning
    if (e.button === 2) {
      return
    }

    // Handle selection completion
    if (isDraggingSelection && selectionBox) {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const cellSize = CELL_SIZE * zoom
      const gridX = Math.floor((mouseX - panX) / cellSize)
      const gridY = Math.floor((mouseY - panY) / cellSize)

      const finalBox = { ...selectionBox, endX: gridX, endY: gridY }
      
      // Collect cells in the selection box
      const cells = new Set<string>()
      const minX = Math.min(finalBox.startX, finalBox.endX)
      const maxX = Math.max(finalBox.startX, finalBox.endX)
      const minY = Math.min(finalBox.startY, finalBox.endY)
      const maxY = Math.max(finalBox.startY, finalBox.endY)

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const key = cellKey(x, y)
          if (grid.has(key)) {
            cells.add(key)
          }
        }
      }

      // Convert selected cells to preset format
      const originalCells = Array.from(cells)
      if (originalCells.length > 0) {
        // Find the top-left corner of the selection
        let minX = Infinity, minY = Infinity
        originalCells.forEach(key => {
          const [x, y] = key.split(',').map(Number)
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
        })

        // Convert to relative coordinates (like preset format)
        const relativeCells = originalCells.map(key => {
          const [x, y] = key.split(',').map(Number)
          return { x: x - minX, y: y - minY }
        })

        // Set as temporary preset (EXACTLY like selecting a preset)
        setTempPreset(relativeCells)
        
        // Remove cells from grid
        setGrid(prev => {
          const newGrid = new Set(prev)
          cells.forEach(key => {
            newGrid.delete(key)
          })
          return newGrid
        })
      }

      setSelectedCells(cells)
      setOriginalCellPositions(cells) // Store original positions for restoration
      setSelectionBox(null)
      setIsDraggingSelection(false)
      setJustCompletedSelection(true)
      
      // Switch to place mode after a tiny delay
      setTimeout(() => {
        setEditMode("place")
      }, 1)
      
      // Clear the flag after a short delay
      setTimeout(() => {
        setJustCompletedSelection(false)
      }, 100)
      return
    }


    setTimeout(() => {
      setDragStartPos({ x: 0, y: 0 })
      setIsDragging(false)
    }, 10)
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()

    // If in keyboard panning mode, use wheel to adjust pan speed
    if (isKeyboardPanning) {
      const speedDelta = e.deltaY > 0 ? 0.8 : 1.25
      const newSpeed = Math.max(1, Math.min(20, keyboardPanSpeed * speedDelta))
      setKeyboardPanSpeed(newSpeed)
      return
    }

    // Normal zoom behavior when not in keyboard panning mode
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

  const loadTemplate = (template: string) => {
    const cells = templates[template]
    if (!cells) {
      console.warn(`Template "${template}" not found`)
      return
    }
    
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

      <div className="absolute top-4 left-4 md:top-6 md:left-1/2 md:-translate-x-1/2 md:right-auto z-10 flex gap-2">
        <div className="relative">
          <Button
            onClick={() => setShowHueDropdown(!showHueDropdown)}
            size="sm"
            variant="outline"
            className="glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer"
          >
            <Palette className="h-4 w-4 mr-2" style={{ color: hue === 0 ? `hsl(0, 0%, 90%)` : `hsl(${hue}, 70%, 60%)` }} />
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
                   onClick={() => {
                     setColorCycle(false)
                     setHue(0)
                   }}
                   className="w-8 h-8 rounded border-2 border-white/20 cursor-pointer hover:scale-110 transition-transform"
                   style={{ background: "hsl(0, 0%, 100%)" }}
                   title="White"
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
        
        <Button
          onClick={() => setShowGrid(!showGrid)}
          size="sm"
          variant="outline"
          className={`glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer ${showGrid ? "button-selected" : ""}`}
        >
          <Grid3X3 className="h-4 w-4 mr-2" />
          Grid
        </Button>

      </div>

      {/* Edit Mode Toggle - Left Side */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-30">
        <Button
          onClick={() => setEditMode(editMode === "place" ? "select" : "place")}
          size="sm"
          variant="outline"
          className={`glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer ${editMode === "place" ? "button-selected" : ""}`}
        >
          {editMode === "place" ? "Place" : "Select"}
        </Button>
      </div>

      {/* Controls Button - Top Right */}
      <div className="absolute top-4 right-4 z-30">
        <div className="relative">
          <Button
            onClick={() => setShowControls(!showControls)}
            size="sm"
            variant="outline"
            className="glass-card border-violet/50 hover:border-violet cursor-pointer bg-violet/10 hover:bg-violet/20"
          >
            Controls
          </Button>
          
          {showControls && (
            <div className="absolute top-full right-0 mt-2 w-80 glass-card border border-violet/50 rounded-lg p-4 bg-black/90 backdrop-blur-sm">
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-violet-400 mb-3">Keyboard Controls</h3>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Space</span>
                    <span className="text-white">Play/Pause</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">R</span>
                    <span className="text-white">Reset</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">G</span>
                    <span className="text-white">Toggle Grid</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">E / Shift</span>
                    <span className="text-white">Toggle Place/Select</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">1-4</span>
                    <span className="text-white">Speed (Slow/Med/Fast/Turbo)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Arrow Keys / WASD</span>
                    <span className="text-white">Pan View</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">+ / -</span>
                    <span className="text-white">Zoom In/Out</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Mouse Wheel</span>
                    <span className="text-white">Zoom (or adjust pan speed)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Escape</span>
                    <span className="text-white">Cancel Selection/Preset</span>
                  </div>
                </div>
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
        onContextMenu={(e) => e.preventDefault()}
        className={`w-full h-full ${isKeyboardPanning ? "cursor-none" : cursorOnCell ? "cursor-pointer" : "cursor-crosshair"}`}
      />
      {/* Presets dropdown (bottom-center) - opens upward */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center">
        <div className="relative">
          <Button
            onClick={() => setShowPresets((s) => !s)}
            size="sm"
            variant="outline"
            className="glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer px-8 py-3"
            style={{
              clipPath: 'polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)',
              borderRadius: '8px 8px 0 0'
            }}
          >
            Presets
          </Button>

          {showPresets && (
            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 glass-card border border-electric-blue/50 rounded-lg p-4 w-[90vw] md:w-96 max-w-md origin-bottom">
              <div className="grid grid-cols-4 gap-2">
                {Object.keys(templates).map((templateName) => (
                  <button 
                    key={templateName}
                    onClick={() => { 
                      setSelectedPreset(templateName);
                      setShowPresets(false); 
                    }} 
                    className="p-2 rounded-md bg-transparent border-2 border-white/10 hover:border-violet/50 capitalize text-sm transition-all duration-200 hover:bg-white/5"
                  >
                    {templateName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
