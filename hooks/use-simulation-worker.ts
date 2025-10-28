// handles the game of life sim

import { useState, useEffect, useRef, useCallback } from 'react'
import { ObjectPool } from '@/lib/object-pool'
import { QuadtreeGrid } from '@/lib/quadtree-grid'
import { cellKey, parseCellKey, cellKeysToPositions } from "@/lib/cell-utils"

// current sim state
interface SimulationState {
  grid: QuadtreeGrid           // Current grid state
  isRunning: boolean           // Whether simulation is active
  speed: number                // Simulation speed in milliseconds
  cellCount?: number           // Number of live cells
  generation?: number          // Current generation count
  currentAlgorithm?: string    // Active simulation algorithm
  performanceStats?: any       // Performance metrics
  ruleset?: {                  // Custom ruleset configuration
    type: 'classic' | 'custom' | 'prime'
    survival: number[]
    birth: number[]
  }
}

// update from worker
interface GridUpdate {
  born: string[]              // Cell keys that were born
  died: string[]              // Cell keys that died
  timestamp: number           // When the update occurred
  speed?: number              // Current simulation speed
  algorithm?: string          // Active algorithm
  stats?: any                 // Performance statistics
}

// main hook
export function useSimulationWorker() {
  // set up state
  const [state, setState] = useState<SimulationState & { ruleset: any }>({
    grid: new QuadtreeGrid(),     // Empty grid to start
    isRunning: false,            // Simulation starts paused
    speed: 1000,                 // Default to 1 second per generation
    cellCount: 0,                // No cells initially
    generation: 0,               // Start at generation 0
    currentAlgorithm: 'spatial', // Default algorithm
    performanceStats: {},        // Empty stats object
    ruleset: {                   // Default ruleset
      type: 'classic',
      survival: [2, 3],
      birth: [3]
    }
  })

  // refs
  const workerRef = useRef<Worker | null>(null)         // Web Worker instance
  const pendingUpdatesRef = useRef<GridUpdate[]>([])    // Queue of pending updates

  // grid pool for perf
  const gridPool = new ObjectPool(
    () => new QuadtreeGrid(),    // Factory function to create new grids
    (grid) => grid.clear(),      // Reset function to clean up grids before reuse
    5,                           // Initial pool size
    20                           // Maximum number of grids to keep in the pool
  )

  // Initialize worker
  useEffect(() => {
    // Use JavaScript worker for both development and production in Next.js
    const workerUrl = '/simulation-worker.js'

    workerRef.current = new Worker(workerUrl, { type: 'classic' })

    workerRef.current.onmessage = (event: MessageEvent) => {
      const { type, data } = event.data

      switch (type) {
        case 'GRID_UPDATE':
          // Handle diff updates from worker
          handleGridUpdate(data)
          break

        case 'STATE_UPDATE':
          setState(prev => ({
            ...prev,
            isRunning: data.isRunning,
            speed: data.speed,
            cellCount: data.cellCount || 0,
            generation: data.generation || 0,
            currentAlgorithm: data.currentAlgorithm || 'spatial',
            performanceStats: data.performanceStats || {}
          }))
          break
      }
    }

    workerRef.current.onerror = (error: ErrorEvent) => {
      console.error('Worker error:', error.message || error, {
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno
      })
    }

    // Initialize the worker
    workerRef.current.postMessage({ type: 'INIT' })

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
      }
    }
  }, [])

  // Batch grid updates to avoid too many re-renders - optimized for high speed
  const handleGridUpdate = useCallback((update: GridUpdate) => {
    const isHighSpeed = update.speed && update.speed < 100

    if (isHighSpeed) {
      // Process immediately for high speed updates
      setState(prev => {
        const newGrid = prev.grid.copy()

        update.died.forEach((cellKey: string) => {
          const pos = parseCellKey(cellKey)
          newGrid.remove(pos.x, pos.y)
        })

        update.born.forEach((cellKey: string) => {
          const pos = parseCellKey(cellKey)
          newGrid.add(pos.x, pos.y)
        })

        return {
          ...prev,
          grid: newGrid
        }
      })
      return
    }

    // Batch updates for normal speeds
    pendingUpdatesRef.current.push(update)

    // Process updates in batches to avoid excessive re-renders
    setTimeout(() => {
      if (pendingUpdatesRef.current.length > 0) {
        const updates = pendingUpdatesRef.current
        pendingUpdatesRef.current = []

        setState(prev => {
          const newGrid = prev.grid.copy()

          // Apply all updates
          updates.forEach(update => {
            update.died.forEach((cellKey: string) => {
              const pos = parseCellKey(cellKey)
              newGrid.remove(pos.x, pos.y)
            })

            update.born.forEach((cellKey: string) => {
              const pos = parseCellKey(cellKey)
              newGrid.add(pos.x, pos.y)
            })
          })

          return {
            ...prev,
            grid: newGrid
          }
        })
      }
    }, 16) // ~60fps batching for normal speeds
  }, [])

  // Control functions
  const startSimulation = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'START' })
      // Don't update local state immediately - wait for worker confirmation
    }
  }, [])

  const stopSimulation = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'STOP' })
      // Don't update local state immediately - wait for worker confirmation
    }
  }, [])

  const resetSimulation = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'RESET' })
      setState(prev => ({
        ...prev,
        grid: new QuadtreeGrid(),
        isRunning: false
      }))
    }
  }, [])

  const setSpeed = useCallback((speedSlider: number) => {
    // Use the same calculation as the main component for consistency
    // Formula: speed = 1000 / (1 + 39 * (speedSlider / 100))
    const speedLevel = 1 + 39 * (speedSlider / 100)
    const interval = Math.round(1000 / speedLevel)

    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'SET_SPEED', data: { speed: interval } })
      // Don't update local state immediately - wait for worker confirmation
    }
  }, [])

  const setLightspeed = useCallback(() => {
    // Lightspeed mode: set to minimum possible interval (1ms for max speed)
    const lightspeedInterval = 1
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'SET_SPEED', data: { speed: lightspeedInterval } })
      // Don't update local state immediately - wait for worker confirmation
    }
  }, [])

  const loadPreset = useCallback((cells: Array<{ x: number; y: number }>) => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'LOAD_PRESET', data: { cells } })
      const newGrid = new QuadtreeGrid()
      cells.forEach(cell => {
        newGrid.add(cell.x, cell.y)
      })
      setState(prev => ({ ...prev, grid: newGrid }))
    }
  }, [])

  const updateGrid = useCallback((cellsToAdd: Array<{ x: number; y: number }>, cellsToRemove: Array<{ x: number; y: number }>) => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'UPDATE_GRID',
        data: { cellsToAdd, cellsToRemove }
      })

      setState(prev => {
        const newGrid = prev.grid.copy()
        cellsToRemove.forEach(cell => {
          newGrid.remove(cell.x, cell.y)
        })
        cellsToAdd.forEach(cell => {
          newGrid.add(cell.x, cell.y)
        })
        return { ...prev, grid: newGrid }
      })
    }
  }, [])

  const getState = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'GET_STATE' })
    }
    return state
  }, [state])

  const setMode = useCallback((mode: string) => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'SET_MODE', data: { mode } });
    }
  }, [])

  const setRuleset = useCallback((ruleset: { type: 'classic' | 'custom' | 'prime'; survival: number[]; birth: number[] }) => {
    if (workerRef.current) {
      workerRef.current.postMessage({ 
        type: 'SET_RULESET', 
        data: { ruleset } 
      });
      // Update local state immediately for responsive UI
      setState(prev => ({
        ...prev,
        ruleset: { 
          type: ruleset.type,
          survival: ruleset.survival,
          birth: ruleset.birth
        }
      }));
    }
  }, [])

  return {
    // State
    grid: state.grid,
    isRunning: state.isRunning,
    speed: state.speed,
    cellCount: state.cellCount,
    generation: state.generation,
    currentAlgorithm: state.currentAlgorithm,
    performanceStats: state.performanceStats,
    ruleset: state.ruleset,
    workerRef,
    startSimulation,
    stopSimulation,
    resetSimulation,
    setSpeed,
    setMode,
    setRuleset,
    setLightspeed,
    loadPreset,
    updateGrid,
    getState
  }
}
