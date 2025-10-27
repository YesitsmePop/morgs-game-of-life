"use client"

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, RotateCcw, Zap, ChevronDown, Palette, Grid3X3, Download, HelpCircle } from "lucide-react"
import { QuadtreeGrid } from "@/lib/quadtree-grid"
import { ImportExportModal } from "@/components/importExport"
import { WebGLRenderer } from "@/components/webgl-renderer"
import { useSimulationWorker } from "@/hooks/use-simulation-worker"

const CELL_SIZE = 20
const MIN_ZOOM = 0.01
const MAX_ZOOM = 10

import { cellKey, parseCellKey, getNeighbors, cellKeysToPositions, positionsToCellKeys } from "@/lib/cell-utils"

import { loadPresetsFromFile } from "@/lib/preset-parser"

export function Simulation() {
  // Use worker for simulation logic
  const { grid, isRunning, speed, startSimulation, stopSimulation, resetSimulation, setSpeed, setLightspeed, loadPreset, updateGrid, getState, cellCount, workerRef, generation, currentAlgorithm, performanceStats } = useSimulationWorker()

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
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [originalCellPositions, setOriginalCellPositions] = useState<Set<string>>(new Set())
  const [isDraggingHandle, setIsDraggingHandle] = useState(false)
  const [isDraggingSelection, setIsDraggingSelection] = useState(false)
  const [isMovingSelection, setIsMovingSelection] = useState(false)
  const [selectionDragStart, setSelectionDragStart] = useState<{ x: number; y: number } | null>(null)
  const [selectionOffset, setSelectionOffset] = useState({ x: 0, y: 0 })
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null)
  const [editMode, setEditMode] = useState<"place" | "select">("place")
  const [tempPreset, setTempPreset] = useState<Array<{ x: number; y: number }>>([])
  const [justCompletedSelection, setJustCompletedSelection] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)
  const [presetTab, setPresetTab] = useState<"built-in" | "custom">("built-in")
  const [fps, setFps] = useState(0)
  const [showFps, setShowFps] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([])

  // Toast notification functions
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 3000)
  }

  // Persistent selection state
  const [persistentSelection, setPersistentSelection] = useState<{
    box: { startX: number; startY: number; endX: number; endY: number }
    cells: Array<{ x: number; y: number }>
    rotation: number
    mirrorHorizontal: boolean
    mirrorVertical: boolean
  } | null>(null)
  const [isDraggingMoveKnob, setIsDraggingMoveKnob] = useState(false)

  // Export selection state
  const [isSelectingForExport, setIsSelectingForExport] = useState(false)
  const [exportSelectionBox, setExportSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)

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
      if (pressedKeys.has('Equal')) {
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
      if (pressedKeys.has('Minus')) {
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
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Equal', 'Minus'].includes(e.code)) {
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

      if (e.key.toLowerCase() === "g") {
        setShowGrid((g: boolean) => !g)
      }

      if (e.key.toLowerCase() === "f") {
        setShowFps((f: boolean) => !f)
      }

      if (e.key.toLowerCase() === "e" || e.key === "Shift") {
        setEditMode((editMode) => editMode === "place" ? "select" : "place")
      }

      if (e.key === "Escape") {
        // If we have selected cells, restore them to their original positions
        if (originalCellPositions.size > 0) {
          const cellsToRemove = cellKeysToPositions(originalCellPositions)
          const cellsToAdd = tempPreset.map(cell => ({ x: cell.x, y: cell.y }))

          updateGrid(cellsToAdd, cellsToRemove)
        }
        setSelectedPreset(null)
        setTempPreset([])
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

        // Cancel export selection if active
        if (isSelectingForExport) {
          setIsSelectingForExport(false)
          setExportSelectionBox(null)
          setEditMode("place")
        }
      }

      if (/^[1-4]$/.test(e.key)) {
        // Map 1->slowest, 2->medium, 3->fast, 4->fastest (maximum speed range)
        switch (e.key) {
          case "1":
            setSpeedSlider(0)   // Slowest (1000ms interval)
            setSpeed(0)
            break
          case "2":
            setSpeedSlider(33)  // Medium (59ms interval)
            setSpeed(33)
            break
          case "3":
            setSpeedSlider(67)  // Fast (35ms interval)
            setSpeed(67)
            break
          case "4":
            setSpeedSlider(100) // Fastest (25ms interval)
            setSpeed(100)
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
  }, [handleSpacebar, resetSimulation, originalCellPositions, tempPreset, persistentSelection, updateGrid, setSelectedPreset, setTempPreset, setSelectedCells, setOriginalCellPositions, setSelectionBox, setIsDraggingSelection, setPersistentSelection, setSpeedSlider, setSpeed, setPressedKeys, setIsKeyboardPanning, setShowGrid, setShowFps, setEditMode, isSelectingForExport, setIsSelectingForExport, setExportSelectionBox])

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

    // Normal cell toggle behavior (left-click only) - only in place mode
    if (e.button === 0 && editMode === "place") {
      if (grid.has(gridX, gridY)) {
        updateGrid([], [{ x: gridX, y: gridY }])
      } else {
        updateGrid([{ x: gridX, y: gridY }], [])
      }
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Prevent right-click from triggering panning
    if (e.button === 2) {
      return
    }

    // Handle export selection mode - simple drag-to-select for export
    if (isSelectingForExport && e.button === 0) {
      const exportCanvas = canvasRef.current
      if (!exportCanvas) return

      const exportRect = exportCanvas.getBoundingClientRect()
      const exportMouseX = e.clientX - exportRect.left
      const exportMouseY = e.clientY - exportRect.top

      console.log('=== START EXPORT SELECTION ===')
      console.log('Mouse position:', exportMouseX, exportMouseY)

      // Store pixel coordinates instead of grid coordinates for simplicity
      setExportSelectionBox({
        startX: exportMouseX,
        startY: exportMouseY,
        endX: exportMouseX,
        endY: exportMouseY
      })
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
            const transformedCells = persistentSelection.cells.map(cell => {
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

    // Handle export selection dragging
    if (isSelectingForExport && exportSelectionBox) {
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      console.log('=== UPDATE EXPORT SELECTION ===')
      console.log('Current mouse pixel coords:', mouseX, mouseY)
      console.log('Current selection box:', exportSelectionBox)

      setExportSelectionBox(prev => prev ? {
        ...prev,
        endX: mouseX,
        endY: mouseY
      } : null)
      return
    }

    // Handle selection box dragging
    if (isDraggingSelection && selectionBox) {
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      console.log('=== UPDATE SELECTION ===')
      console.log('Current mouse pixel coords:', mouseX, mouseY)
      console.log('Current selection box:', selectionBox)

      setSelectionBox(prev => prev ? {
        ...prev,
        endX: mouseX,
        endY: mouseY
      } : null)
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

    // Handle export selection completion
    if (isSelectingForExport && exportSelectionBox) {
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

      console.log('=== EXPORT SELECTION COMPLETE ===')
      console.log('Final pixel selection box:', finalBox)

      // Get all cells from the grid
      const allGridCells = grid.getAllCells()
      console.log('Total cells in grid:', allGridCells.size)

      if (allGridCells.size === 0) {
        console.log('No cells in grid!')
        alert('No cells found in the grid. Please add some cells first.')
        setIsSelectingForExport(false)
        setExportSelectionBox(null)
        setEditMode("place")
        return
      }

      // Convert pixel selection bounds to grid coordinate bounds
      const cellSize = CELL_SIZE * zoom
      const minPixelX = Math.min(finalBox.startX, finalBox.endX)
      const maxPixelX = Math.max(finalBox.startX, finalBox.endX)
      const minPixelY = Math.min(finalBox.startY, finalBox.endY)
      const maxPixelY = Math.max(finalBox.startY, finalBox.endY)

      console.log('Pixel bounds:', { minPixelX, maxPixelX, minPixelY, maxPixelY })
      console.log('Cell size:', cellSize, 'Zoom:', zoom)

      // Find cells that fall within the pixel selection bounds
      const selectedCells: Array<{ x: number; y: number }> = []
      let foundCells = 0

      allGridCells.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number)

        // Convert grid coordinates to pixel coordinates
        const cellPixelX = x * cellSize + panX
        const cellPixelY = y * cellSize + panY

        console.log(`Checking cell ${x},${y} -> pixel ${cellPixelX},${cellPixelY}`)

        // Check if cell falls within the selection bounds
        if (cellPixelX >= minPixelX && cellPixelX <= maxPixelX &&
            cellPixelY >= minPixelY && cellPixelY <= maxPixelY) {
          selectedCells.push({ x: x, y: y })
          foundCells++
          console.log('Found cell in selection:', x, y)
        }
      })

      console.log('Found cells in selection:', foundCells)
      console.log('Selected cells array:', selectedCells)

      if (foundCells === 0) {
        console.log('No cells found in selection box')
        alert('No cells found in the selected area. Please make sure there are cells in the area you selected.')
        setIsSelectingForExport(false)
        setExportSelectionBox(null)
        setEditMode("place")
        return
      }

      // Set tempPreset with the selected cells (convert back to relative coordinates)
      const minGridX = Math.floor((minPixelX - panX) / cellSize)
      const minGridY = Math.floor((minPixelY - panY) / cellSize)

      const relativeCells = selectedCells.map(cell => ({
        x: cell.x - minGridX,
        y: cell.y - minGridY
      }))

      setTempPreset(relativeCells)
      console.log('Set tempPreset with:', relativeCells.length, 'cells')

      // Clear export selection state
      setExportSelectionBox(null)
      setIsSelectingForExport(false)
      setEditMode("place")

      // Open the export modal immediately
      setShowImportExport(true)
      return
    }

    // Handle selection moving completion
    if (isMovingSelection && selectionOffset && selectionBox) {
      // Apply the offset to the temp preset
      const offsetX = selectionOffset.x
      const offsetY = selectionOffset.y

      if (offsetX !== 0 || offsetY !== 0) {
        const newTempPreset = tempPreset.map((cell: { x: number; y: number }) => ({
          x: cell.x + offsetX,
          y: cell.y + offsetY
        }))
        setTempPreset(newTempPreset)
      }

      setIsMovingSelection(false)
      setSelectionDragStart(null)
      setSelectionOffset({ x: 0, y: 0 })
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

      console.log('=== SELECTION COMPLETE ===')
      console.log('Final pixel selection box:', finalBox)

      // Get all cells from the grid
      const allGridCells = grid.getAllCells()
      console.log('Total cells in grid:', allGridCells.size)

      if (allGridCells.size === 0) {
        console.log('No cells in grid!')
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

      console.log('Pixel bounds:', { minPixelX, maxPixelX, minPixelY, maxPixelY })

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
          console.log('Found cell in selection:', x, y)
        }
      })

      console.log('Found cells in selection:', foundCells)

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
    setTempPreset([])
    setSelectedCells(new Set())
    setOriginalCellPositions(new Set())
    setSelectionBox(null)
    setEditMode("place")

    // Clear export selection state if still active
    if (isSelectingForExport) {
      setIsSelectingForExport(false)
      setExportSelectionBox(null)
    }
  }

  const handleImportComplete = (presets: Record<string, Array<{ x: number; y: number }>>) => {
    setCustomPresets(prev => ({ ...prev, ...presets }))
    const presetNames = Object.keys(presets)
    if (presetNames.length > 0) {
      showToast(`${presetNames.length === 1 ? presetNames[0] : `${presetNames.length} patterns`} imported successfully!`)
    }
  }

  const handleStartExport = () => {
    setEditMode("select")
    setIsSelectingForExport(true)
  }

  const [showPresets, setShowPresets] = useState(false);

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

      {/* Export Selection Mode Indicator */}
      {isSelectingForExport && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 glass-card border border-orange-500/50 rounded-lg px-4 py-2 bg-orange-500/20 backdrop-blur-sm">
          <span className="text-orange-400 font-medium">Export Selection Mode - Drag to select cells for export</span>
        </div>
      )}

      {/* Top Center - Status */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
        <h2 className="font-[family-name:var(--font-playfair)] text-lg md:text-2xl font-bold text-foreground">MORG&apos;S GAME OF LIFE</h2>
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

      {/* Top Right - Help */}
      <div className="absolute top-4 right-4 z-30">
        <div className="relative">
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
                    <span className="text-gray-300">F</span>
                    <span className="text-white">Toggle FPS Counter</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Escape</span>
                    <span className="text-white">Cancel Selection/Preset</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">E / Shift</span>
                    <span className="text-white">Toggle Place/Select Mode</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Select Mode</span>
                    <span className="text-white">Drag to select cells, click inside to move</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Selection Area</span>
                    <span className="text-white">Click anywhere inside to drag selection</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Floating Buttons</span>
                    <span className="text-white">Delete (✕), rotate (↻), mirror (↔/↕), duplicate (⧉)</span>
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
                          showToast(`"${templateName}" pattern loaded!`)
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
                            showToast(`"${presetName}" pattern loaded!`)
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
                            showToast(`"${name.trim()}" saved as custom preset!`)
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

      <WebGLRenderer
        cells={grid.getAllCells()}
        blueprintCells={blueprintCells}
        selectionBox={isSelectingForExport ? exportSelectionBox : (persistentSelection ? persistentSelection.box : selectionBox)}
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
        className={`w-full h-full ${isKeyboardPanning ? "cursor-none" : cursorOnCell ? "cursor-pointer" : "cursor-crosshair"}`}
        isKeyboardPanning={isKeyboardPanning}
        cursorOnCell={cursorOnCell}
        gridUpdateKey={gridUpdateCounter}
        persistentSelection={persistentSelection}
        isSelectingForExport={isSelectingForExport}
      />

      {/* Floating Mirror Controls - appear above persistent selection */}
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

      <ImportExportModal
        isVisible={showImportExport}
        onClose={() => {
          setShowImportExport(false)
          // Don't clear tempPreset or export selection state when closing during export selection
          // Only clear export selection state if it's still active and we're not in the middle of a selection
          if (isSelectingForExport && tempPreset.length === 0) {
            setIsSelectingForExport(false)
            setExportSelectionBox(null)
            setEditMode("place")
          }
        }}
        tempPreset={tempPreset}
        onExportComplete={handleExportComplete}
        onImportComplete={handleImportComplete}
        onStartExport={handleStartExport}
      />
    </main>
  );
}
