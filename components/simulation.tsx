"use client"

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, RotateCcw, Zap, ChevronDown, Palette, Grid3X3, Download, HelpCircle, Circle, Minus, Square, PaintBucket, Box, Type } from "lucide-react"
import { QuadtreeGrid } from "@/lib/quadtree-grid"
import { ImportExportModal } from "@/components/importExport"
import { WebGLRenderer } from "@/components/webgl-renderer"
import { useSimulationWorker } from "@/hooks/use-simulation-worker"
import { RulesetPanel } from "@/components/ruleset-panel"

const CELL_SIZE = 20
const MIN_ZOOM = 0.01
const MAX_ZOOM = 10

import { cellKey, parseCellKey, getNeighbors, cellKeysToPositions, positionsToCellKeys } from "@/lib/cell-utils"

import { loadPresetsFromFile } from "@/lib/preset-parser"

export function Simulation() {
  // Use worker for simulation logic
  const { 
    grid, 
    isRunning, 
    speed, 
    startSimulation, 
    stopSimulation, 
    resetSimulation, 
    setSpeed, 
    setLightspeed, 
    loadPreset, 
    updateGrid, 
    getState, 
    cellCount = 0, 
    workerRef, 
    generation, 
    currentAlgorithm, 
    performanceStats,
    setRuleset,
    ruleset
  } = useSimulationWorker()

  // UI state (worker doesn't need to know about these)
  const [hue, setHue] = useState(270) // Default violet
  const [showHueDropdown, setShowHueDropdown] = useState(false)
  const [showSpeedDropdown, setShowSpeedDropdown] = useState(false)
  const [colorCycle, setColorCycle] = useState(false)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 })
  const [dragStartPan, setDragStartPan] = useState({ x: 0, y: 0 })
  const [cursorOnCell, setCursorOnCell] = useState(false)
  const [templates, setTemplates] = useState<Record<string, Array<{ x: number; y: number }>>>({})
  const [customPresets, setCustomPresets] = useState<Record<string, Array<{ x: number; y: number }>>>({})
  const [showGrid, setShowGrid] = useState(true)
  const [isKeyboardPanning, setIsKeyboardPanning] = useState(false)
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())
  const [keyboardPanSpeed, setKeyboardPanSpeed] = useState(5)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [originalCellPositions, setOriginalCellPositions] = useState<Set<string>>(new Set())
  const [isDraggingHandle, setIsDraggingHandle] = useState(false)
  const [isDraggingSelection, setIsDraggingSelection] = useState(false)
  const [isMovingSelection, setIsMovingSelection] = useState(false)
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const [selectionDragStart, setSelectionDragStart] = useState<{ x: number; y: number } | null>(null)
  const [selectionOffset, setSelectionOffset] = useState({ x: 0, y: 0 })
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null)
  const [editMode, setEditMode] = useState<"move" | "place" | "select">("place")
  const [brushMode, setBrushMode] = useState<"singular" | "line" | "rectangle" | "fill" | "circle">("singular")
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushPreview, setBrushPreview] = useState<{
    type: 'line' | 'rectangle' | 'circle' | 'fill' | 'singular' | null
    start: { x: number; y: number }
    end: { x: number; y: number }
    cells: Array<{ x: number; y: number }>
    limitReached?: boolean
  } | null>(null)
  const [tempPreset, setTempPreset] = useState<Array<{ x: number; y: number }>>([])
  const [justCompletedSelection, setJustCompletedSelection] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)
  const [presetTab, setPresetTab] = useState<"built-in" | "custom">("built-in")
  const [fps, setFps] = useState(0)
  const [showFps, setShowFps] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([])

  // Helper function to calculate preview cells for different brush types
  const calculateBrushPreview = useCallback((start: { x: number; y: number }, end: { x: number; y: number }, type: 'line' | 'rectangle' | 'circle' | 'fill') => {
    const cellsToAdd: Array<{ x: number; y: number }> = []
    const cellsToRemove: Array<{ x: number; y: number }> = []

    let limitReached = false

    switch (type) {
      case 'line': {
        // Use Bresenham's line algorithm for perfect straight lines
        const dx = Math.abs(end.x - start.x)
        const dy = Math.abs(end.y - start.y)
        const sx = start.x < end.x ? 1 : -1
        const sy = start.y < end.y ? 1 : -1
        let err = dx - dy

        let x = start.x
        let y = start.y

        while (true) {
          if (grid.has(x, y)) {
            cellsToRemove.push({ x, y })
          } else {
            cellsToAdd.push({ x, y })
          }

          if (x === end.x && y === end.y) break

          const e2 = 2 * err
          if (e2 > -dy) {
            err -= dy
            x += sx
          }
          if (e2 < dx) {
            err += dx
            y += sy
          }
        }
        break
      }

      case 'rectangle': {
        // Rectangle brush: draw hollow rectangle outline
        const minX = Math.min(start.x, end.x)
        const maxX = Math.max(start.x, end.x)
        const minY = Math.min(start.y, end.y)
        const maxY = Math.max(start.y, end.y)

        // Draw only the outline (perimeter)
        for (let x = minX; x <= maxX; x++) {
          // Top and bottom edges
          if (grid.has(x, minY)) {
            cellsToRemove.push({ x, y: minY })
          } else {
            cellsToAdd.push({ x, y: minY })
          }

          if (minY !== maxY) { // Only add bottom if height > 0
            if (grid.has(x, maxY)) {
              cellsToRemove.push({ x, y: maxY })
            } else {
              cellsToAdd.push({ x, y: maxY })
            }
          }
        }

        for (let y = minY + 1; y < maxY; y++) {
          // Left and right edges (excluding corners which are already added)
          if (grid.has(minX, y)) {
            cellsToRemove.push({ x: minX, y })
          } else {
            cellsToAdd.push({ x: minX, y })
          }

          if (minX !== maxX) { // Only add right if width > 0
            if (grid.has(maxX, y)) {
              cellsToRemove.push({ x: maxX, y })
            } else {
              cellsToAdd.push({ x: maxX, y })
            }
          }
        }
        break
      }

      case 'circle': {
        // Circle brush: draw hollow circle
        const centerX = start.x
        const centerY = start.y
        const radius = Math.max(
          Math.abs(end.x - centerX),
          Math.abs(end.y - centerY)
        )

        // Draw circle using Bresenham's circle algorithm
        let x = radius
        let y = 0
        let err = 0

        while (x >= y) {
          // Draw 8 points of the circle for each position
          const points = [
            { x: centerX + x, y: centerY + y },
            { x: centerX + y, y: centerY + x },
            { x: centerX - y, y: centerY + x },
            { x: centerX - x, y: centerY + y },
            { x: centerX - x, y: centerY - y },
            { x: centerX - y, y: centerY - x },
            { x: centerX + y, y: centerY - x },
            { x: centerX + x, y: centerY - y }
          ]

          points.forEach(point => {
            if (grid.has(point.x, point.y)) {
              cellsToRemove.push(point)
            } else {
              cellsToAdd.push(point)
            }
          })

          if (err <= 0) {
            y += 1
            err += 2 * y + 1
          }
          if (err > 0) {
            x -= 1
            err -= 2 * x + 1
          }
        }
        break
      }

      case 'fill': {
        // Fill brush: flood fill from start position (with cell limit)
        const MAX_FILL_CELLS = 25000 // Cap on max cells that can be filled

        // Simple flood fill starting from start position
        const stack: Array<{ x: number; y: number }> = [start]
        const visited = new Set<string>()
        const startCellExists = grid.has(start.x, start.y)

        let cellsProcessed = 0

        while (stack.length > 0 && cellsProcessed < MAX_FILL_CELLS) {
          const current = stack.pop()!
          const key = `${current.x},${current.y}`

          if (visited.has(key)) continue
          visited.add(key)

          const cellExists = grid.has(current.x, current.y)

          // Only fill if this matches the starting cell state
          if (cellExists === startCellExists) {
            if (cellExists) {
              cellsToRemove.push(current)
            } else {
              cellsToAdd.push(current)
            }
            cellsProcessed++

            // Add neighbors to stack
            const neighbors = [
              { x: current.x + 1, y: current.y },
              { x: current.x - 1, y: current.y },
              { x: current.x, y: current.y + 1 },
              { x: current.x, y: current.y - 1 }
            ]

            neighbors.forEach(neighbor => {
              const neighborKey = `${neighbor.x},${neighbor.y}`
              if (!visited.has(neighborKey)) {
                stack.push(neighbor)
              }
            })
          }
        }

        if (cellsProcessed >= MAX_FILL_CELLS) {
          limitReached = true
        }
        break
      }
    }

    return { cells: [...cellsToAdd, ...cellsToRemove], limitReached }
  }, [grid])

  // Persistent selection state
  const [persistentSelection, setPersistentSelection] = useState<{
    box: { startX: number; startY: number; endX: number; endY: number }
    cells: Array<{ x: number; y: number }>
    rotation: number
    mirrorHorizontal: boolean
    mirrorVertical: boolean
  } | null>(null)
  const [isDraggingMoveKnob, setIsDraggingMoveKnob] = useState(false)

  // Export selection state - separate from regular selection
  const [exportCells, setExportCells] = useState<Array<{ x: number; y: number }>>([])
  const [isExportMode, setIsExportMode] = useState(false)
  const [exportSelectionBox, setExportSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Grid update counter to force React re-renders
  const [gridUpdateCounter, setGridUpdateCounter] = useState(0)
  useEffect(() => {
    const loadPresetsData = async () => {
      try {
        const presets = await loadPresetsFromFile('/presets.txt')
        console.log('Loaded presets:', Object.keys(presets))
        setTemplates(presets)
      } catch (error) {
        console.error('Failed to load presets:', error)
        setTemplates({})
      }
    }
    loadPresetsData()
  }, [])

  // FPS counter - tracks actual rendering FPS
  useEffect(() => {
    let frameCount = 0
    let lastFpsUpdate = performance.now()

    const updateFps = () => {
      frameCount++

      const currentTime = performance.now()

      // Update FPS every second
      if (currentTime - lastFpsUpdate >= 1000) {
        setFps(frameCount)
        frameCount = 0
        lastFpsUpdate = currentTime
      }

      // Only continue if FPS is still enabled
      if (showFps) {
        setTimeout(updateFps, 16) // 60fps check, but much lighter than requestAnimationFrame
      }
    }

    if (showFps) {
      updateFps()
    }
  }, [showFps])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cycleRef = useRef<number | null>(null)
  const cycleStartRef = useRef<number>(0)
  const cycleStartHueRef = useRef<number>(hue)
  const keyboardPanRef = useRef<number | null>(null)

  // Local state for speed slider (worker uses speed value)
  const [speedSlider, setSpeedSlider] = useState(0)  // Match worker's initial speed of 1000ms (slowest)

  // Check if lightspeed mode is active (speed = 1ms)
  const isLightspeedActive = speed === 1

  const handleSpacebar = useCallback(() => {
    if (isRunning) {
      stopSimulation()
    } else {
      startSimulation()
    }
  }, [isRunning, stopSimulation, startSimulation])

  // Send mode updates to worker when mode changes
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'SET_MODE', data: { mode: 'classic' } })
    }
  }, [])

  // Sync speed slider only for special cases (lightspeed), let slider be source of truth
  useEffect(() => {
    // Only sync for special cases like lightspeed mode
    if (speed === 1) {
      setSpeedSlider(100) // Lightspeed = max slider position
    }
    // For normal speeds, let the slider be the source of truth
    // No automatic sync to prevent jumping during manual dragging
  }, [speed, setSpeedSlider])

  // Sync grid updates with rendering
  useEffect(() => {
    if (!isRunning) {
      return // Don't run interval when simulation is paused
    }

    const interval = setInterval(() => {
      // Force re-render when simulation is running
      setGridUpdateCounter(prev => prev + 1)
    }, 16) // 60fps

    return () => clearInterval(interval)
  }, [isRunning])

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
  }, [colorCycle, hue])

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
      if (pressedKeys.has('Equal') || pressedKeys.has('KeyX')) {
        const oldZoom = zoom
        newZoom = Math.min(MAX_ZOOM, zoom + 0.02)
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
      if (pressedKeys.has('Minus') || pressedKeys.has('KeyZ')) {
        const oldZoom = zoom
        newZoom = Math.max(MIN_ZOOM, zoom - 0.02)
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

  // Keyboard controls: Space to toggle play/pause, 'p' to toggle mode, 1-4 to set speed, arrows to pan, +/- to zoom
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ignore when typing in inputs
      const active = document.activeElement
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return

      // Handle navigation keys (arrows + WASD)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Equal', 'Minus', 'KeyZ', 'KeyX'].includes(e.code)) {
        e.preventDefault()
        setPressedKeys(prev => new Set(prev).add(e.code))
        setIsKeyboardPanning(true)
        return
      }

      if (e.code === "Space") {
        e.preventDefault()
        handleSpacebar()
      }

      if (e.key.toLowerCase() === "r") {
        resetSimulation()
      }

      if (e.key.toLowerCase() === "f") {
        setShowFps((f: boolean) => !f)
      }

      if (e.key.toLowerCase() === "g") {
        setShowGrid((g: boolean) => !g)
      }

      if (e.key.toLowerCase() === "e" || e.key === "Shift") {
        setEditMode((editMode) => {
          switch (editMode) {
            case "move": return "place"
            case "place": return "select"
            case "select": return "move"
            default: return "place"
          }
        })
      }

      if (e.key === "Escape") {
        // If we have selected cells, restore them to their original positions
        if (originalCellPositions.size > 0) {
          const cellsToRemove = cellKeysToPositions(originalCellPositions)
          const cellsToAdd = tempPreset.map(cell => ({ x: cell.x, y: cell.y }))

          updateGrid(cellsToAdd, cellsToRemove)
        }
        setSelectedPreset(null)
        // Don't clear tempPreset if we're in export mode
        if (!isExportMode) {
          setTempPreset([])
        }
        setSelectedCells(new Set())
        setOriginalCellPositions(new Set())
        setSelectionBox(null)
        setIsDraggingSelection(false)
        // Clear persistent selection
        if (persistentSelection) {
          if (persistentSelection.cells.length > 0) {
            // Apply transformations to cells before placing them back
            const transformedCells = persistentSelection.cells.map((cell: { x: number; y: number }) => {
              let transformedX = persistentSelection.box.startX + cell.x
              let transformedY = persistentSelection.box.startY + cell.y

              // Apply rotation
              if (persistentSelection.rotation !== 0) {
                const centerX = (Math.min(persistentSelection.box.startX, persistentSelection.box.endX) +
                                Math.max(persistentSelection.box.startX, persistentSelection.box.endX)) / 2
                const centerY = (Math.min(persistentSelection.box.startY, persistentSelection.box.endY) +
                                Math.max(persistentSelection.box.startY, persistentSelection.box.endY)) / 2

                const cos = Math.cos(persistentSelection.rotation * Math.PI / 180)
                const sin = Math.sin(persistentSelection.rotation * Math.PI / 180)

                const relX = transformedX - centerX
                const relY = transformedY - centerY

                transformedX = centerX + relX * cos - relY * sin
                transformedY = centerY + relX * sin + relY * cos
              }

              // Apply mirroring
              if (persistentSelection.mirrorHorizontal) {
                const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
                const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
                transformedX = minX + maxX - transformedX
              }

              if (persistentSelection.mirrorVertical) {
                const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
                const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)
                transformedY = minY + maxY - transformedY
              }

              return { x: Math.round(transformedX), y: Math.round(transformedY) }
            })

            updateGrid(transformedCells, [])
          }
          setPersistentSelection(null)
        }

        // Cancel export mode if active
        if (isExportMode) {
          setIsExportMode(false)
          setExportSelectionBox(null)
        }
        // Clear exporting state if active
        if (isExporting) {
          setIsExporting(false)
        }
      }

      if (e.key.toLowerCase() === "l") {
        setLightspeed()
      }

      if (/^[1-5]$/.test(e.key)) {
        // Map 1->singular, 2->line, 3->rectangle, 4->fill, 5->circle
        switch (e.key) {
          case "1":
            setBrushMode("singular")
            break
          case "2":
            setBrushMode("line")
            break
          case "3":
            setBrushMode("rectangle")
            break
          case "4":
            setBrushMode("fill")
            break
          case "5":
            setBrushMode("circle")
            break
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Equal', 'Minus', 'KeyZ', 'KeyX'].includes(e.code)) {
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
  }, [handleSpacebar, resetSimulation, originalCellPositions, tempPreset, persistentSelection, updateGrid, setSelectedPreset, setTempPreset, setSelectedCells, setOriginalCellPositions, setSelectionBox, setIsDraggingSelection, setPersistentSelection, setSpeedSlider, setSpeed, setPressedKeys, setIsKeyboardPanning, setShowGrid, setShowFps, setEditMode, isExportMode, setIsExportMode, setExportSelectionBox, setExportCells, isExporting, setIsExporting, editMode, setBrushMode, setLightspeed])

  const blueprintCells = useMemo(() => {
    const cells: Array<{ x: number; y: number; isBlueprint: boolean }> = []

    // Calculate current mouse position directly from canvas
    const canvas = canvasRef.current
    if (!canvas) return cells

    const rect = canvas.getBoundingClientRect()
    const currentMouseX = mousePosition.x // Use the state mouse position
    const currentMouseY = mousePosition.y

    const cellSize = CELL_SIZE * zoom
    const gridX = Math.floor((currentMouseX - panX) / cellSize)
    const gridY = Math.floor((currentMouseY - panY) / cellSize)

    if (tempPreset.length > 0) {
      tempPreset.forEach((cell) => {
        cells.push({ x: gridX + cell.x, y: gridY + cell.y, isBlueprint: true })
      })
    }

    if (selectedPreset) {
      const presetCells = templates[selectedPreset] || customPresets[selectedPreset]
      if (presetCells) {
        presetCells.forEach((cell) => {
          cells.push({ x: gridX + cell.x, y: gridY + cell.y, isBlueprint: true })
        })
      }
    }

    return cells
  }, [tempPreset, selectedPreset, mousePosition, panX, panY, zoom, templates, customPresets])

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

    // Don't place cells during export mode or if export selection just completed
    if (isExportMode || exportSelectionBox || isExporting) {
      return
    }

    // Right-click cancels preset selection or restores selected cells
    if (e.button === 2) {
      e.preventDefault() // Prevent context menu and panning
      if (selectedPreset) {
        setSelectedPreset(null)
        return
      }
      if (tempPreset.length > 0) {
        // Restore selected cells to their original positions
        if (originalCellPositions.size > 0) {
          const cellsToRemove = cellKeysToPositions(originalCellPositions)
          const cellsToAdd = tempPreset.map(cell => ({ x: cell.x, y: cell.y }))

          updateGrid(cellsToAdd, cellsToRemove)
        }
        setTempPreset([])
        setSelectedCells(new Set())
        setOriginalCellPositions(new Set())
        return
      }
    }

    // Handle placing temp preset (left-click only) - EXACTLY like preset
    if (tempPreset.length > 0 && e.button === 0 && !isDraggingSelection && !justCompletedSelection) {
      // Place EXACTLY like a preset
      const cellsToAdd = tempPreset.map(cell => ({ x: gridX + cell.x, y: gridY + cell.y }))
      updateGrid(cellsToAdd, [])

      // Clear temp preset (EXACTLY like clearing selectedPreset)
      setTempPreset([])
      setSelectedCells(new Set())
      return
    }

    // If a preset is selected, place it at the clicked position
    if (selectedPreset && e.button === 0) {
      const cells = templates[selectedPreset] || customPresets[selectedPreset]
      if (cells) {
        const cellsToAdd = cells.map(cell => ({ x: gridX + cell.x, y: gridY + cell.y }))
        updateGrid(cellsToAdd, [])
      }
      setSelectedPreset(null)
      return
    }

    // Move mode: do nothing on click (panning handled by mouse move)
    if (editMode === "move") {
      return
    }

    // Select mode: handled in handleMouseDown
    if (editMode === "select") {
      return
    }

    // Place mode: only handle non-singular brushes here
    if (e.button === 0 && editMode === "place" && brushMode !== "singular") {
      // For singular brush, clicking places a single cell - handled in handleMouseDown
      return
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Prevent right-click from triggering panning
    if (e.button === 2) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const cellSize = CELL_SIZE * zoom
    const gridX = Math.floor((mouseX - panX) / cellSize)
    const gridY = Math.floor((mouseY - panY) / cellSize)

    // Handle export mode - drag to select cells for export
    if (isExportMode && e.button === 0) {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Start export selection box
      setExportSelectionBox({
        startX: mouseX,
        startY: mouseY,
        endX: mouseX,
        endY: mouseY
      })
      return
    }

    // Move mode: start panning
    if (editMode === "move") {
      setDragStartPos({ x: e.clientX, y: e.clientY })
      setDragStartPan({ x: panX, y: panY })
      setIsDragging(false)
      return
    }

    // Select mode: start selection
    if (editMode === "select" && !isRunning && !selectedPreset && !isExportMode && !isExporting) {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const cellSize = CELL_SIZE * zoom
      const gridX = Math.floor((mouseX - panX) / cellSize)
      const gridY = Math.floor((mouseY - panY) / cellSize)

      // Check if clicking on control knobs
      if (persistentSelection) {
        const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
        const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
        const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
        const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        // Blue move knob (center of selection)
        const moveKnobX = centerX
        const moveKnobY = centerY
        const moveKnobScreenX = moveKnobX * cellSize + panX
        const moveKnobScreenY = moveKnobY * cellSize + panY
        const moveDistance = Math.sqrt((mouseX - moveKnobScreenX) ** 2 + (mouseY - moveKnobScreenY) ** 2)

        if (moveDistance <= cellSize * 0.75) {
          setIsDraggingMoveKnob(true)
          setSelectionDragStart({ x: mouseX, y: mouseY })
          return
        }
      }

      // Check if clicking inside persistent selection area (not on control knobs) for dragging
      if (persistentSelection) {
        const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
        const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
        const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
        const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)

        if (gridX >= minX && gridX <= maxX && gridY >= minY && gridY <= maxY) {
          setIsDraggingMoveKnob(true)
          setSelectionDragStart({ x: mouseX, y: mouseY })
          return
        }
      }

      // Check if clicking on resize handle (legacy)
      if (selectionBox) {
        const maxX = Math.max(selectionBox.startX, selectionBox.endX)
        const maxY = Math.max(selectionBox.startY, selectionBox.endY)
        const handleX = maxX + 0.5
        const handleY = maxY + 0.5
        const handleScreenX = handleX * cellSize + panX
        const handleScreenY = handleY * cellSize + panY
        const distance = Math.sqrt((mouseX - handleScreenX) ** 2 + (mouseY - handleScreenY) ** 2)

        if (distance <= cellSize / 2) {
          setIsDraggingHandle(true)
          return
        }
      }

      // Check if clicking inside existing selection box for dragging
      if (selectionBox) {
        const minX = Math.min(selectionBox.startX, selectionBox.endX)
        const maxX = Math.max(selectionBox.startX, selectionBox.endX)
        const minY = Math.min(selectionBox.startY, selectionBox.endY)
        const maxY = Math.max(selectionBox.startY, selectionBox.endY)

        if (gridX >= minX && gridX <= maxX && gridY >= minY && gridY <= maxY) {
          setIsMovingSelection(true)
          setSelectionDragStart({ x: mouseX, y: mouseY })
          setSelectionPosition({ x: gridX, y: gridY })
          setSelectionOffset({ x: 0, y: 0 })
          return
        }
      }

      // Check if clicking outside persistent selection - deselect
      if (persistentSelection) {
        const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
        const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
        const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
        const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)

        if (gridX < minX || gridX > maxX || gridY < minY || gridY > maxY) {
          // Clear persistent selection and place cells with transformations applied
          if (persistentSelection.cells.length > 0) {
            // Apply transformations to cells before placing them back
            const transformedCells = persistentSelection.cells.map((cell: { x: number; y: number }) => {
              let transformedX = persistentSelection.box.startX + cell.x
              let transformedY = persistentSelection.box.startY + cell.y

              // Apply rotation
              if (persistentSelection.rotation !== 0) {
                const centerX = (Math.min(persistentSelection.box.startX, persistentSelection.box.endX) +
                                Math.max(persistentSelection.box.startX, persistentSelection.box.endX)) / 2
                const centerY = (Math.min(persistentSelection.box.startY, persistentSelection.box.endY) +
                                Math.max(persistentSelection.box.startY, persistentSelection.box.endY)) / 2

                const cos = Math.cos(persistentSelection.rotation * Math.PI / 180)
                const sin = Math.sin(persistentSelection.rotation * Math.PI / 180)

                const relX = transformedX - centerX
                const relY = transformedY - centerY

                transformedX = centerX + relX * cos - relY * sin
                transformedY = centerY + relX * sin + relY * cos
              }

              // Apply mirroring
              if (persistentSelection.mirrorHorizontal) {
                const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
                const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
                transformedX = minX + maxX - transformedX
              }

              if (persistentSelection.mirrorVertical) {
                const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
                const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)
                transformedY = minY + maxY - transformedY
              }

              return { x: Math.round(transformedX), y: Math.round(transformedY) }
            })

            updateGrid(transformedCells, [])
          }
          setPersistentSelection(null)
          return
        }
      }

      // Start new selection
      const selectionCanvas = canvasRef.current
      if (!selectionCanvas) return

      const selectionRect = selectionCanvas.getBoundingClientRect()
      const selectionMouseX = e.clientX - selectionRect.left
      const selectionMouseY = e.clientY - selectionRect.top

      console.log('=== START SELECTION ===')
      console.log('Mouse position:', selectionMouseX, selectionMouseY)

      // Store pixel coordinates for consistency
      setSelectionBox({
        startX: selectionMouseX,
        startY: selectionMouseY,
        endX: selectionMouseX,
        endY: selectionMouseY
      })
      setIsDraggingSelection(true)
      return
    }

  // Check if clicking inside persistent selection area (not on control knobs) for dragging
  if (persistentSelection) {
    const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
    const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
    const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
    const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)

    if (gridX >= minX && gridX <= maxX && gridY >= minY && gridY <= maxY) {
      setIsDraggingMoveKnob(true)
      setSelectionDragStart({ x: mouseX, y: mouseY })
      return
    }
  }

  // Check if clicking on resize handle (legacy)
  if (selectionBox) {
    const maxX = Math.max(selectionBox.startX, selectionBox.endX)
    const maxY = Math.max(selectionBox.startY, selectionBox.endY)
    const handleX = maxX + 0.5
    const handleY = maxY + 0.5
    const handleScreenX = handleX * cellSize + panX
    const handleScreenY = handleY * cellSize + panY
    const distance = Math.sqrt((mouseX - handleScreenX) ** 2 + (mouseY - handleScreenY) ** 2)

    if (distance <= cellSize / 2) {
      setIsDraggingHandle(true)
      return
    }
  }

  // Check if clicking inside existing selection box for dragging
  if (selectionBox) {
    const minX = Math.min(selectionBox.startX, selectionBox.endX)
    const maxX = Math.max(selectionBox.startX, selectionBox.endX)
    const minY = Math.min(selectionBox.startY, selectionBox.endY)
    const maxY = Math.max(selectionBox.startY, selectionBox.endY)

    if (gridX >= minX && gridX <= maxX && gridY >= minY && gridY <= maxY) {
      setIsMovingSelection(true)
      setSelectionDragStart({ x: mouseX, y: mouseY })
      setSelectionPosition({ x: gridX, y: gridY })
      setSelectionOffset({ x: 0, y: 0 })
      return
    }
  }

  // Check if clicking outside persistent selection - deselect
  if (persistentSelection) {
    const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
    const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
    const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
    const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)

    if (gridX < minX || gridX > maxX || gridY < minY || gridY > maxY) {
      // Clear persistent selection and place cells with transformations applied
      if (persistentSelection.cells.length > 0) {
        // Apply transformations to cells before placing them back
        const transformedCells = persistentSelection.cells.map((cell: { x: number; y: number }) => {
          let transformedX = persistentSelection.box.startX + cell.x
          let transformedY = persistentSelection.box.startY + cell.y

          // Apply rotation
          if (persistentSelection.rotation !== 0) {
            const centerX = (Math.min(persistentSelection.box.startX, persistentSelection.box.endX) +
                            Math.max(persistentSelection.box.startX, persistentSelection.box.endX)) / 2
            const centerY = (Math.min(persistentSelection.box.startY, persistentSelection.box.endY) +
                            Math.max(persistentSelection.box.startY, persistentSelection.box.endY)) / 2

            const cos = Math.cos(persistentSelection.rotation * Math.PI / 180)
            const sin = Math.sin(persistentSelection.rotation * Math.PI / 180)

            const relX = transformedX - centerX
            const relY = transformedY - centerY

            transformedX = centerX + relX * cos - relY * sin
            transformedY = centerY + relX * sin + relY * cos
          }

          // Apply mirroring
          if (persistentSelection.mirrorHorizontal) {
            const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
            const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
            transformedX = minX + maxX - transformedX
          }

          if (persistentSelection.mirrorVertical) {
            const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
            const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)
            transformedY = minY + maxY - transformedY
          }

          return { x: Math.round(transformedX), y: Math.round(transformedY) }
        })

        updateGrid(transformedCells, [])
      }
      setPersistentSelection(null)
      return
    }
  }

  // Place mode: start drawing with current brush
  if (editMode === "place" && e.button === 0) {
    const startGridX = Math.floor((mouseX - panX) / cellSize)
    const startGridY = Math.floor((mouseY - panY) / cellSize)

    // For singular brush, place a single cell immediately
    if (brushMode === "singular") {
      if (grid.has(startGridX, startGridY)) {
        updateGrid([], [{ x: startGridX, y: startGridY }])
      } else {
        updateGrid([{ x: startGridX, y: startGridY }], [])
      }
    } else {
      // For other brushes, just set the drawing start
      setIsDrawing(true)
      setBrushPreview({
        type: brushMode,
        start: { x: startGridX, y: startGridY },
        end: { x: startGridX, y: startGridY },
        cells: [],
        limitReached: false
      })
    }
    return
  }

  // Start new selection
  const selectionCanvas = canvasRef.current
  if (!selectionCanvas) return

  const selectionRect = selectionCanvas.getBoundingClientRect()
  const selectionMouseX = e.clientX - selectionRect.left
  const selectionMouseY = e.clientY - selectionRect.top

  console.log('=== START SELECTION ===')
  console.log('Mouse position:', selectionMouseX, selectionMouseY)

  // Store pixel coordinates for consistency
  setSelectionBox({
    startX: selectionMouseX,
    startY: selectionMouseY,
    endX: selectionMouseX,
    endY: selectionMouseY
  })
  setIsDraggingSelection(true)
  return
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

  // Handle export selection box dragging
  if (isExportMode && exportSelectionBox) {
    setExportSelectionBox(prev => prev ? {
      ...prev,
      endX: mouseX,
      endY: mouseY
    } : null)
    // Force immediate re-render
    setGridUpdateCounter(prev => prev + 1)
    return
  }

  // Handle selection box dragging (regular selection only)
  if (isDraggingSelection && selectionBox) {
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    setSelectionBox(prev => prev ? {
      ...prev,
      endX: mouseX,
      endY: mouseY
    } : null)
    // Force immediate re-render
    setGridUpdateCounter(prev => prev + 1)
    return
  }

  // Handle selection moving
  if (isMovingSelection && selectionDragStart && selectionPosition) {
    const cellSize = CELL_SIZE * zoom
    const dx = mouseX - selectionDragStart.x
    const dy = mouseY - selectionDragStart.y
    const cellDx = Math.round(dx / cellSize)
    const cellDy = Math.round(dy / cellSize)
    setSelectionOffset({ x: cellDx, y: cellDy })
    return
  }

  // Handle move knob dragging
  if (isDraggingMoveKnob && persistentSelection && selectionDragStart) {
    const cellSize = CELL_SIZE * zoom
    const dx = mouseX - selectionDragStart.x
    const dy = mouseY - selectionDragStart.y

    // Calculate target grid position
    const targetGridX = Math.round((selectionDragStart.x + dx - panX) / cellSize)
    const targetGridY = Math.round((selectionDragStart.y + dy - panY) / cellSize)

    // Calculate current grid position
    const currentMinX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
    const currentMinY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)

    // Calculate delta needed
    const cellDx = targetGridX - currentMinX
    const cellDy = targetGridY - currentMinY

    // Only update if we've moved
    if (cellDx !== 0 || cellDy !== 0) {
      setPersistentSelection(prev => prev ? {
        ...prev,
        box: {
          startX: prev.box.startX + cellDx,
          startY: prev.box.startY + cellDy,
          endX: prev.box.endX + cellDx,
          endY: prev.box.endY + cellDy
        }
      } : null)
    }
    return
  }

  // Handle drawing in place mode
  if (editMode === "place" && isDrawing && brushPreview) {
    const cellSize = CELL_SIZE * zoom
    const currentGridX = Math.floor((mouseX - panX) / cellSize)
    const currentGridY = Math.floor((mouseY - panY) / cellSize)

    // Calculate preview cells for the current brush
    const previewResult = calculateBrushPreview(brushPreview.start, { x: currentGridX, y: currentGridY }, brushMode as 'line' | 'rectangle' | 'circle' | 'fill')

    // Update preview state
    setBrushPreview(prev => prev ? {
      ...prev,
      end: { x: currentGridX, y: currentGridY },
      cells: previewResult.cells,
      limitReached: previewResult.limitReached
    } : null)
    return
  }

  // Handle move mode panning
  if (editMode === "move" && dragStartPos.x !== 0 && dragStartPos.y !== 0) {
    const dx = e.clientX - dragStartPos.x
    const dy = e.clientY - dragStartPos.y

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      setIsDragging(true)
      setPanX(dragStartPan.x + dx)
      setPanY(dragStartPan.y + dy)
    }
    return
  }

  // Update mouse position for preset preview (selected cells blueprint)
  if (tempPreset.length > 0) {
    setMousePosition({ x: mouseX, y: mouseY })
  }

  // Update mouse position for preset preview
  if (selectedPreset) {
    setMousePosition({ x: mouseX, y: mouseY })
  }

  // Always update mouse position so blueprint cells follow cursor
  setMousePosition({ x: mouseX, y: mouseY })

  if (dragStartPos.x === 0 && dragStartPos.y === 0) {
    const cellSize = CELL_SIZE * zoom
    const gridX = Math.floor((mouseX - panX) / cellSize)
    const gridY = Math.floor((mouseY - panY) / cellSize)

    setCursorOnCell(grid.has(gridX, gridY))
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

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Handle export selection completion
    if (isExportMode && exportSelectionBox) {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Update the final selection box
      const finalBox = {
        ...exportSelectionBox,
        endX: mouseX,
        endY: mouseY
      }

      // Get all cells from the grid
      const allGridCells = grid.getAllCells()
      if (allGridCells.size === 0) {
        showToast('No cells found in the grid. Please add some cells first.', "error")
        setIsExportMode(false)
        setExportSelectionBox(null)
        return
      }

      // Convert pixel selection bounds to grid coordinate bounds
      const cellSize = CELL_SIZE * zoom
      const minPixelX = Math.min(finalBox.startX, finalBox.endX)
      const maxPixelX = Math.max(finalBox.startX, finalBox.endX)
      const minPixelY = Math.min(finalBox.startY, finalBox.endY)
      const maxPixelY = Math.max(finalBox.startY, finalBox.endY)

      // Find cells that fall within the pixel selection bounds
      const selectedCells: Array<{ x: number; y: number }> = []
      let foundCells = 0

      allGridCells.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number)

        // Convert grid coordinates to pixel coordinates
        const cellPixelX = x * cellSize + panX
        const cellPixelY = y * cellSize + panY

        // Check if cell falls within the selection bounds
        if (cellPixelX >= minPixelX && cellPixelX <= maxPixelX &&
            cellPixelY >= minPixelY && cellPixelY <= maxPixelY) {
          selectedCells.push({ x: x, y: y })
          foundCells++
        }
      })

      if (foundCells === 0) {
        showToast('No cells found in the selected area. Please make sure there are cells in the area you selected.', "error")
        setExportSelectionBox(null)
        return
      }

      // Convert to relative coordinates (like preset format)
      const minGridX = Math.min(...selectedCells.map(cell => cell.x))
      const minGridY = Math.min(...selectedCells.map(cell => cell.y))
      const relativeCells = selectedCells.map(cell => ({
        x: cell.x - minGridX,
        y: cell.y - minGridY
      }))

      // Set export cells and open modal
      setExportCells(relativeCells)
      setIsExporting(true)

      // Clear export state after a short delay to ensure no mouse events interfere
      setTimeout(() => {
        setIsExportMode(false)
        setExportSelectionBox(null)
        setIsExporting(false)
        setShowImportExport(true)
      }, 50)
      return
    }

    // Don't allow cell placement during export mode
    if (isExportMode || exportSelectionBox || isExporting) {
      return
    }

    // Handle move knob dragging completion
    if (isDraggingMoveKnob) {
      setIsDraggingMoveKnob(false)
      setSelectionDragStart(null)
      return
    }

    // Handle selection completion
    if (isDraggingSelection && selectionBox) {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Update the final selection box
      const finalBox = {
        ...selectionBox,
        endX: mouseX,
        endY: mouseY
      }

      // Get all cells from the grid
      const allGridCells = grid.getAllCells()

      if (allGridCells.size === 0) {
        setSelectionBox(null)
        setIsDraggingSelection(false)
        setJustCompletedSelection(false)
        return
      }

      // Convert pixel selection bounds to grid coordinate bounds
      const cellSize = CELL_SIZE * zoom
      const minPixelX = Math.min(finalBox.startX, finalBox.endX)
      const maxPixelX = Math.max(finalBox.startX, finalBox.endX)
      const minPixelY = Math.min(finalBox.startY, finalBox.endY)
      const maxPixelY = Math.max(finalBox.startY, finalBox.endY)

      // Find cells that fall within the pixel selection bounds
      const cells = new Set<string>()
      let foundCells = 0

      allGridCells.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number)

        // Convert grid coordinates to pixel coordinates
        const cellPixelX = x * cellSize + panX
        const cellPixelY = y * cellSize + panY

        // Check if cell falls within the selection bounds
        if (cellPixelX >= minPixelX && cellPixelX <= maxPixelX &&
            cellPixelY >= minPixelY && cellPixelY <= maxPixelY) {
          cells.add(cellKey)
          foundCells++
        }
      })

      // Convert selected cells to preset format
      const originalCells = Array.from(cells)
      if (originalCells.length > 0) {
        // Find the actual bounds of the selected cells (not the drag box)
        let cellMinX = Infinity, cellMaxX = -Infinity
        let cellMinY = Infinity, cellMaxY = -Infinity
        originalCells.forEach(key => {
          const pos = parseCellKey(key)
          cellMinX = Math.min(cellMinX, pos.x)
          cellMaxX = Math.max(cellMaxX, pos.x)
          cellMinY = Math.min(cellMinY, pos.y)
          cellMaxY = Math.max(cellMaxY, pos.y)
        })

        // Create a cropped box that exactly fits the selected cells
        const croppedBox = {
          startX: cellMinX,
          startY: cellMinY,
          endX: cellMaxX,
          endY: cellMaxY
        }

        // Convert to relative coordinates (like preset format) based on actual cell bounds
        const relativeCells = originalCells.map(key => {
          const pos = parseCellKey(key)
          return { x: pos.x - cellMinX, y: pos.y - cellMinY }
        })

        // Create persistent selection with cropped box
        setPersistentSelection({
          box: croppedBox,
          cells: relativeCells,
          rotation: 0,
          mirrorHorizontal: false,
          mirrorVertical: false
        })

        // Remove cells from grid (they become part of the persistent selection)
        const cellsToRemove = cellKeysToPositions(new Set(originalCells))
        updateGrid([], cellsToRemove)
      }

      // Clear temporary selection state
      setSelectionBox(null)
      setIsDraggingSelection(false)
      setJustCompletedSelection(false)
    }

    // Handle drawing completion in place mode
    if (editMode === "place" && isDrawing && brushPreview) {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const cellSize = CELL_SIZE * zoom
      const endGridX = Math.floor((mouseX - panX) / cellSize)
      const endGridY = Math.floor((mouseY - panY) / cellSize)

      // Apply the drawing for non-singular brushes
      if (brushMode !== "singular") {
        const finalResult = calculateBrushPreview(brushPreview.start, { x: endGridX, y: endGridY }, brushMode as 'line' | 'rectangle' | 'circle' | 'fill')

        // Show toast if fill limit was reached
        if (finalResult.limitReached) {
          showToast("Fill operation reached the maximum limit of 25,000 cells. The fill was truncated.", "error")
        }

        if (finalResult.cells.length > 0) {
          updateGrid(finalResult.cells.filter((cell: { x: number; y: number }) => !grid.has(cell.x, cell.y)), finalResult.cells.filter((cell: { x: number; y: number }) => grid.has(cell.x, cell.y)))
        }
      }

      // Clear drawing state
      setIsDrawing(false)
      setBrushPreview(null)
    }

    setTimeout(() => {
      setDragStartPos({ x: 0, y: 0 })
      setIsDragging(false)
    }, 10)
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // Only prevent default when in keyboard panning mode to avoid passive listener error
    if (isKeyboardPanning) {
      e.preventDefault()
    }

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

    const canvas = canvasRef.current
    if (!canvas) return

    const cellSize = CELL_SIZE * zoom
    const centerX = Math.floor((canvas.width / 2 - panX) / cellSize)
    const centerY = Math.floor((canvas.height / 2 - panY) / cellSize)

    const centeredCells = cells.map((cell) => ({
      x: centerX + cell.x,
      y: centerY + cell.y
    }))

    loadPreset(centeredCells)
  }

  const handleReset = () => {
    resetSimulation()
  }

  const handleExportComplete = () => {
    // Clear export cells after successful export
    setExportCells([])
    setSelectedCells(new Set())
    setOriginalCellPositions(new Set())
    setSelectionBox(null)
    setEditMode("place")
    showToast("Pattern exported successfully!", "success")
  }

  const handleImportComplete = (presets: Record<string, Array<{ x: number; y: number }>>) => {
    setCustomPresets(prev => ({ ...prev, ...presets }))
    const presetNames = Object.keys(presets)
    if (presetNames.length > 0) {
      // Successfully imported patterns
      showToast(`Imported ${presetNames.length} pattern${presetNames.length > 1 ? 's' : ''}: ${presetNames.join(', ')}`, "success")
    }
  }

  const handleStartExport = () => {
    setIsExportMode(true)
    setShowImportExport(true)
  }

  const [showPresets, setShowPresets] = useState(false);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 3000)
  }

  return (
    <main className="relative min-h-screen bg-background overflow-hidden">

      {/* Toast Notifications */}
      <div className="fixed bottom-4 left-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm border transition-all duration-300 ${
              toast.type === 'success'
                ? 'bg-green-500/20 border-green-500 text-green-100'
                : 'bg-red-500/20 border-red-500 text-red-100'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Top Left - Mode Indicator */}
      <div className="absolute top-4 left-4 z-30">
        <div className="glass-card border border-violet/30 rounded-lg px-3 py-2 bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              editMode === 'move' ? 'bg-blue-400' :
              editMode === 'place' ? 'bg-green-400' : 'bg-orange-400'
            }`}></div>
            <span className="text-sm font-medium text-foreground/90">
              {editMode === 'move' ? 'Move Mode' :
               editMode === 'place' ? 'Place Mode' : 'Select Mode'}
            </span>
            {editMode === 'place' && (
              <span className="text-xs text-foreground/70 ml-1">
                ({brushMode})
              </span>
            )}
          </div>
          {editMode === 'place' && (
            <div className="flex gap-1 mt-2">
              <button
                onClick={() => setBrushMode("singular")}
                className={`w-8 h-8 rounded transition-colors flex items-center justify-center ${
                  brushMode === "singular"
                    ? 'bg-green-400 text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
                title="Dot brush (1)"
              >
                <Box className="h-4 w-4" />
              </button>
              <button
                onClick={() => setBrushMode("line")}
                className={`w-8 h-8 rounded transition-colors flex items-center justify-center ${
                  brushMode === "line"
                    ? 'bg-green-400 text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
                title="Line brush (2)"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setBrushMode("rectangle")}
                className={`w-8 h-8 rounded transition-colors flex items-center justify-center ${
                  brushMode === "rectangle"
                    ? 'bg-green-400 text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
                title="Rectangle brush (3)"
              >
                <Square className="h-4 w-4" />
              </button>
              <button
                onClick={() => setBrushMode("fill")}
                className={`w-8 h-8 rounded transition-colors flex items-center justify-center ${
                  brushMode === "fill"
                    ? 'bg-green-400 text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
                title="Fill brush (4)"
              >
                <PaintBucket className="h-4 w-4" />
              </button>
              <button
                onClick={() => setBrushMode("circle")}
                className={`w-8 h-8 rounded transition-colors flex items-center justify-center ${
                  brushMode === "circle"
                    ? 'bg-green-400 text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
                title="Circle brush (5)"
              >
                <Circle className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Export Selection Mode Indicator */}
      {isExportMode && (
        <div className="absolute top-24 left-4 z-30 glass-card border border-orange-500/50 rounded-lg px-4 py-2 bg-orange-500/20 backdrop-blur-sm">
          <span className="text-orange-400 font-medium">Export Selection Mode - Drag to select cells for export</span>
        </div>
      )}

      {/* Top Center - Status */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
        <div className="w-32 md:w-48">
          <img 
            src="/logo.png" 
            alt="Morg's Game of Life" 
            className="w-full h-auto"
          />
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <div className="glass-card border border-electric-blue/30 rounded-lg px-3 py-1 bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm">
            <span className="text-sm md:text-base text-foreground/90 font-mono font-medium">
              {cellCount.toLocaleString()} cells
            </span>
          </div>
          {showFps && (
            <div className="glass-card border border-green-500/30 rounded-lg px-3 py-1 bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm">
              <span className="text-sm md:text-base text-green-400 font-mono font-medium">
                {fps} FPS
              </span>
            </div>
          )}
          {currentAlgorithm && currentAlgorithm !== 'spatial' && (
            <div className="glass-card border border-purple-500/30 rounded-lg px-3 py-1 bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm">
              <span className="text-sm md:text-base text-purple-400 font-mono font-medium">
                {currentAlgorithm.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Top Right - Controls */}
      <div className="absolute top-4 right-4 z-30 flex flex-col gap-2 items-end">
        {/* Ruleset Panel */}
        <RulesetPanel 
          onRulesetChange={setRuleset}
          className="w-64 mb-2"
        />
        
        <div className="flex gap-2">
          <Button
            onClick={() => setShowControls(!showControls)}
            size="sm"
            variant="outline"
            className="glass-card border-violet/50 hover:border-violet cursor-pointer bg-violet/10 hover:bg-violet/20"
          >
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showControls ? "rotate-180" : ""}`} />
          </Button>

          {showControls && (
            <div className="absolute top-full right-0 mt-2 w-80 glass-card border border-violet/50 rounded-lg p-4 bg-black/90 backdrop-blur-sm">
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-violet-400 mb-3">Controls</h3>

                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-gray-300 font-medium mb-1">Navigation</div>
                    <div className="text-white space-y-1 pl-2">
                      <div><span className="text-gray-400">Arrow Keys / WASD</span> Pan view</div>
                      <div><span className="text-gray-400">+/-</span> Zoom in/out</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-300 font-medium mb-1">Simulation</div>
                    <div className="text-white space-y-1 pl-2">
                      <div><span className="text-gray-400">Space</span> Play/Pause</div>
                      <div><span className="text-gray-400">R</span> Reset</div>
                      <div><span className="text-gray-400">L</span> Lightspeed</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-300 font-medium mb-1">Edit Mode</div>
                    <div className="text-white space-y-1 pl-2">
                      <div><span className="text-gray-400">E / Shift</span> Cycle: Move → Place → Select</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-300 font-medium mb-1">Brushes (Place Mode)</div>
                    <div className="text-white space-y-1 pl-2">
                      <div><span className="text-gray-400">1</span> Dot</div>
                      <div><span className="text-gray-400">2</span> Line</div>
                      <div><span className="text-gray-400">3</span> Rectangle</div>
                      <div><span className="text-gray-400">4</span> Fill (max 25,000 cells)</div>
                      <div><span className="text-gray-400">5</span> Circle</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-300 font-medium mb-1">Display</div>
                    <div className="text-white space-y-1 pl-2">
                      <div><span className="text-gray-400">G</span> Toggle grid</div>
                      <div><span className="text-gray-400">F</span> Toggle FPS</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-300 font-medium mb-1">Mouse</div>
                    <div className="text-white space-y-1 pl-2">
                      <div><span className="text-gray-400">Click</span> Place cells or select</div>
                      <div><span className="text-gray-400">Drag</span> Pan (Move) or select area (Select)</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Left Side - Import/Export and Presets */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
        <div className="relative">
          <Button
            onClick={() => setShowImportExport((s) => !s)}
            size="sm"
            variant="outline"
            className="glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Import/Export
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showImportExport ? "rotate-180" : ""}`} />
          </Button>
        </div>

        <div className="relative">
          <Button
            onClick={() => setShowPresets((s) => !s)}
            size="sm"
            variant="outline"
            className="glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm"
          >
            Presets
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showPresets ? "rotate-180" : ""}`} />
          </Button>

          {showPresets && (
            <div className="absolute top-full mt-2 left-0 glass-card border border-electric-blue/50 rounded-lg p-4 w-[90vw] md:w-96 max-w-md origin-top">
              <div className="flex gap-2 mb-4">
                <Button
                  onClick={() => setPresetTab("built-in")}
                  size="sm"
                  variant={presetTab === "built-in" ? "default" : "outline"}
                  className={`flex-1 ${presetTab === "built-in" ? "button-selected" : ""}`}
                >
                  Built-in
                </Button>
                <Button
                  onClick={() => setPresetTab("custom")}
                  size="sm"
                  variant={presetTab === "custom" ? "default" : "outline"}
                  className={`flex-1 ${presetTab === "custom" ? "button-selected" : ""}`}
                >
                  Custom
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {presetTab === "built-in" ? (
                  Object.keys(templates).length > 0 ? (
                    Object.keys(templates).map((templateName) => (
                      <button
                        key={templateName}
                        onClick={() => {
                          console.log('Loading preset:', templateName)
                          setSelectedPreset(templateName);
                          setShowPresets(false);
                        }}
                        className="p-2 rounded-md bg-transparent border-2 border-white/10 hover:border-violet/50 capitalize text-sm transition-all duration-200 hover:bg-white/5"
                      >
                        {templateName}
                      </button>
                    ))
                  ) : (
                    <div className="col-span-4 text-center text-gray-400 text-sm py-4">
                      Loading presets...
                    </div>
                  )
                ) : (
                  <>
                    {Object.keys(customPresets).length > 0 ? (
                      Object.keys(customPresets).map((presetName) => (
                        <button
                          key={presetName}
                          onClick={() => {
                            setSelectedPreset(presetName);
                            setShowPresets(false);
                          }}
                          className="p-2 rounded-md bg-transparent border-2 border-white/10 hover:border-violet/50 capitalize text-sm transition-all duration-200 hover:bg-white/5"
                        >
                          {presetName}
                        </button>
                      ))
                    ) : (
                      <div className="col-span-4 text-center text-gray-400 text-sm py-4">
                        No custom presets
                      </div>
                    )}
                    {tempPreset.length > 0 && (
                      <button
                        onClick={() => {
                          const name = prompt("Enter preset name:")
                          if (name && name.trim()) {
                            setCustomPresets(prev => ({ ...prev, [name.trim()]: tempPreset }))
                            setTempPreset([])
                            setSelectedCells(new Set())
                            setOriginalCellPositions(new Set())
                            showToast(`Saved preset "${name.trim()}" successfully!`, "success")
                          }
                        }}
                        className="p-2 rounded-md bg-green-600/20 border-2 border-green-500 hover:border-green-400 text-green-400 text-sm transition-all duration-200 hover:bg-green-600/30"
                      >
                        Save Selection
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Toolbar - Simulation Controls */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3 items-center">
        <Button
          onClick={handleReset}
          size="lg"
          variant="outline"
          className="glass-card w-12 h-12 p-0 border-2 border-electric-blue/50 hover:border-electric-blue hover:bg-electric-blue/20 bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm cursor-pointer"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>

        <Button
          onClick={() => {
            if (isRunning) {
              stopSimulation()
            } else {
              startSimulation()
            }
          }}
          size="lg"
          className="glass-card w-12 h-12 p-0 border-2 border-electric-blue/50 hover:border-electric-blue cursor-pointer bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm"
        >
          {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>

        {/* Speed Control - Compact */}
        <div className="flex flex-col gap-2 items-center mt-2">
          <Slider
            value={[speedSlider]}
            onValueChange={(value) => {
              setSpeedSlider(value[0])
              setSpeed(value[0])
            }}
            max={100}
            min={0}
            step={1}
            orientation="vertical"
            className="h-24 w-3 cursor-pointer"
          />
          <Button
            onClick={setLightspeed}
            size="sm"
            variant="outline"
            className={`glass-card border-yellow-500/50 hover:border-yellow-500 hover:bg-yellow-500/20 text-yellow-400 cursor-pointer px-2 py-1 text-xs transition-all duration-200 ${
              isLightspeedActive
                ? "bg-yellow-500/30 border-yellow-400 shadow-lg shadow-yellow-500/50 ring-2 ring-yellow-400/50"
                : ""
            }`}
            title="Lightspeed - Maximum possible speed"
          >
            <Zap className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Bottom Center - Grid Toggle and Color Picker */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
        <div className="flex gap-4 items-center">
          <div className="relative">
            <Button
              onClick={() => setShowHueDropdown(!showHueDropdown)}
              size="sm"
              variant="outline"
              className="glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm"
            >
              <Palette className="h-4 w-4 mr-2" style={{ color: (hue === 0 || hue === 360) ? `hsl(0, 0%, 100%)` : `hsl(${hue}, 70%, 60%)` }} />
              Color
              <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showHueDropdown ? "rotate-180" : ""}`} />
            </Button>

            {showHueDropdown && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 glass-card border border-electric-blue/50 rounded-lg p-4 w-64 origin-bottom bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm">
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
                      setHue(20)
                    }}
                    className="w-8 h-8 rounded border-2 border-white/20 cursor-pointer hover:scale-110 transition-transform"
                    style={{ background: "hsl(20, 70%, 60%)" }}
                    title="Orange"
                  />
                  <button 
                    onClick={() => {
                      setColorCycle(false)
                      setHue(50)
                    }}
                    className="w-8 h-8 rounded border-2 border-white/20 cursor-pointer hover:scale-110 transition-transform"
                    style={{ background: "hsl(50, 70%, 60%)" }}
                    title="Yellow"
                  />
                  <button
                    onClick={() => {
                      setColorCycle(false)
                      setHue(360)
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
            className={`glass-card border-electric-blue/50 hover:border-electric-blue cursor-pointer bg-gradient-to-r from-violet/10 to-purple/10 backdrop-blur-sm ${showGrid ? "button-selected" : ""}`}
          >
            <Grid3X3 className="h-4 w-4 mr-2" />
            Grid
          </Button>
        </div>
      </div>
      {persistentSelection && (
        <div className="absolute pointer-events-auto z-40">
          {(() => {
            const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
            const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
            const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
            const centerX = (minX + maxX) / 2
            const centerY = minY - 2 // Position above selection

            const centerScreenX = centerX * CELL_SIZE * zoom + panX
            const centerScreenY = centerY * CELL_SIZE * zoom + panY

            return (
              <div
                className="flex gap-1 bg-black/80 backdrop-blur-sm rounded-lg p-2 border border-white/20"
                style={{
                  position: 'absolute',
                  left: centerScreenX - 88, // Center the buttons (5 buttons × 32px + 4 gaps × 4px = 176px total, so -88px centers it)
                  top: centerScreenY - 60, // Position above selection (button height ~40px + margin)
                }}
              >
                <button
                  onClick={() => {
                    if (!persistentSelection) return

                    // Apply transformations to get actual cell positions
                    const transformedCells = persistentSelection.cells.map((cell: { x: number; y: number }) => {
                      let transformedX = persistentSelection.box.startX + cell.x
                      let transformedY = persistentSelection.box.startY + cell.y

                      // Apply rotation
                      if (persistentSelection.rotation !== 0) {
                        const centerX = (Math.min(persistentSelection.box.startX, persistentSelection.box.endX) +
                                        Math.max(persistentSelection.box.startX, persistentSelection.box.endX)) / 2
                        const centerY = (Math.min(persistentSelection.box.startY, persistentSelection.box.endY) +
                                        Math.max(persistentSelection.box.startY, persistentSelection.box.endY)) / 2

                        const cos = Math.cos(persistentSelection.rotation * Math.PI / 180)
                        const sin = Math.sin(persistentSelection.rotation * Math.PI / 180)

                        const relX = transformedX - centerX
                        const relY = transformedY - centerY

                        transformedX = centerX + relX * cos - relY * sin
                        transformedY = centerY + relX * sin + relY * cos
                      }

                      // Apply mirroring
                      if (persistentSelection.mirrorHorizontal) {
                        const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
                        const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
                        transformedX = minX + maxX - transformedX
                      }

                      if (persistentSelection.mirrorVertical) {
                        const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
                        const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)
                        transformedY = minY + maxY - transformedY
                      }

                      return { x: Math.round(transformedX), y: Math.round(transformedY) }
                    })

                    // Remove the cells from the grid
                    updateGrid([], transformedCells)

                    // Clear the persistent selection
                    setPersistentSelection(null)
                  }}
                  className={`w-8 h-8 rounded border-2 flex items-center justify-center text-xs font-bold transition-all hover:scale-110 ${
                    'bg-red-500/20 border-red-500 hover:bg-red-500/40 text-red-300'
                  }`}
                  title="Delete Selection"
                >
                  ✕
                </button>
                <button
                  onClick={() => setPersistentSelection(prev => prev ? {
                    ...prev,
                    rotation: (prev.rotation + 90) % 360
                  } : null)}
                  className={`w-8 h-8 rounded border-2 flex items-center justify-center text-xs font-bold transition-all hover:scale-110 ${
                    'bg-cyan-500/20 border-cyan-500 hover:bg-cyan-500/40 text-cyan-300'
                  }`}
                  title="Rotate 90°"
                >
                  ↻
                </button>
                <button
                  onClick={() => setPersistentSelection(prev => prev ? {
                    ...prev,
                    mirrorHorizontal: !prev.mirrorHorizontal
                  } : null)}
                  className={`w-8 h-8 rounded border-2 flex items-center justify-center text-xs font-bold transition-all hover:scale-110 ${
                    persistentSelection.mirrorHorizontal
                      ? 'bg-yellow-500/80 border-yellow-400 text-yellow-100'
                      : 'bg-yellow-500/20 border-yellow-500 hover:bg-yellow-500/40 text-yellow-300'
                  }`}
                  title="Mirror Horizontal"
                >
                  ↔
                </button>
                <button
                  onClick={() => setPersistentSelection(prev => prev ? {
                    ...prev,
                    mirrorVertical: !prev.mirrorVertical
                  } : null)}
                  className={`w-8 h-8 rounded border-2 flex items-center justify-center text-xs font-bold transition-all hover:scale-110 ${
                    persistentSelection.mirrorVertical
                      ? 'bg-green-500/80 border-green-400 text-green-100'
                      : 'bg-green-500/20 border-green-500 hover:bg-green-500/40 text-green-300'
                  }`}
                  title="Mirror Vertical"
                >
                  ↕
                </button>
                <button
                  onClick={() => {
                    if (!persistentSelection) return

                    // Apply transformations to get actual cell positions
                    const transformedCells = persistentSelection.cells.map((cell: { x: number; y: number }) => {
                      let transformedX = persistentSelection.box.startX + cell.x
                      let transformedY = persistentSelection.box.startY + cell.y

                      // Apply rotation
                      if (persistentSelection.rotation !== 0) {
                        const centerX = (Math.min(persistentSelection.box.startX, persistentSelection.box.endX) +
                                        Math.max(persistentSelection.box.startX, persistentSelection.box.endX)) / 2
                        const centerY = (Math.min(persistentSelection.box.startY, persistentSelection.box.endY) +
                                        Math.max(persistentSelection.box.startY, persistentSelection.box.endY)) / 2

                        const cos = Math.cos(persistentSelection.rotation * Math.PI / 180)
                        const sin = Math.sin(persistentSelection.rotation * Math.PI / 180)

                        const relX = transformedX - centerX
                        const relY = transformedY - centerY

                        transformedX = centerX + relX * cos - relY * sin
                        transformedY = centerY + relX * sin + relY * cos
                      }

                      // Apply mirroring
                      if (persistentSelection.mirrorHorizontal) {
                        const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
                        const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
                        transformedX = minX + maxX - transformedX
                      }

                      if (persistentSelection.mirrorVertical) {
                        const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
                        const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)
                        transformedY = minY + maxY - transformedY
                      }

                      return { x: Math.round(transformedX), y: Math.round(transformedY) }
                    })

                    // Find the actual bounds of the transformed cells to get correct width
                    let minX = Infinity, maxX = -Infinity
                    transformedCells.forEach((cell: { x: number; y: number }) => {
                      minX = Math.min(minX, cell.x)
                      maxX = Math.max(maxX, cell.x)
                    })
                    const actualWidth = maxX - minX + 1

                    // Create duplicate cells positioned to the right
                    const duplicateCells = transformedCells.map(cell => ({
                      x: cell.x + actualWidth,
                      y: cell.y
                    }))

                    // Add the duplicated cells to the grid as regular cells
                    updateGrid(duplicateCells, [])

                    // Original persistent selection remains unchanged
                  }}
                  className={`w-8 h-8 rounded border-2 flex items-center justify-center text-xs font-bold transition-all hover:scale-110 ${
                    'bg-purple-500/20 border-purple-500 hover:bg-purple-500/40 text-purple-300'
                  }`}
                  title="Duplicate to Grid Right"
                >
                  ⧉
                </button>
              </div>
            )
          })()}
        </div>
      )}
      {showGrid && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.4) 1px, transparent 1px)
            `,
            backgroundSize: `${CELL_SIZE * zoom}px ${CELL_SIZE * zoom}px`,
            backgroundPosition: `${panX}px ${panY}px`,
            opacity: 0.7
          }}
        />
      )}

      {isKeyboardPanning && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50 cursor-none">
          <div className="relative w-8 h-8">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/70 transform -translate-y-1/2"></div>
            <div className="absolute left-1/2 top-0 w-px h-full bg-white/70 transform -translate-x-1/2"></div>
          </div>
        </div>
      )}

      <WebGLRenderer
        cells={grid.getAllCells()}
        blueprintCells={blueprintCells}
        brushPreviewCells={brushPreview?.cells.map(cell => ({ ...cell, type: brushPreview.type === 'singular' ? 'line' : brushPreview.type! })) || []}
        selectionBox={isExportMode ? exportSelectionBox : (persistentSelection ? persistentSelection.box : selectionBox)}
        selectedCells={selectedCells}
        panX={panX}
        panY={panY}
        zoom={zoom}
        hue={hue}
        showGrid={showGrid}
        width={typeof window !== "undefined" ? window.innerWidth : 1920}
        height={typeof window !== "undefined" ? window.innerHeight : 1080}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveCanvas}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e: React.MouseEvent<HTMLCanvasElement>) => e.preventDefault()}
        canvasRef={canvasRef}
        className={`w-full h-full ${
          editMode === "move" ? "cursor-grab" :
          editMode === "place" && brushMode === "singular" ? "cursor-crosshair" :
          editMode === "place" ? "cursor-cell" :
          editMode === "select" ? "cursor-pointer" :
          isKeyboardPanning ? "cursor-none" : cursorOnCell ? "cursor-pointer" : "cursor-crosshair"
        }`}
        isKeyboardPanning={isKeyboardPanning}
        cursorOnCell={cursorOnCell}
        gridUpdateKey={gridUpdateCounter}
        persistentSelection={persistentSelection}
        isSelectingForExport={isExportMode}
      />

      <ImportExportModal
        isVisible={showImportExport}
        onClose={() => {
          setShowImportExport(false)
          // Cancel export mode and clear cells if still active
          if (isExportMode) {
            setIsExportMode(false)
            setExportSelectionBox(null)
          }
          // Clear export cells and exporting state when modal is closed without exporting
          setExportCells([])
          setIsExporting(false)
        }}
        tempPreset={exportCells}
        onExportComplete={handleExportComplete}
        onImportComplete={handleImportComplete}
        onStartExport={handleStartExport}
        showToast={showToast}
      />
    </main>
  );
}
