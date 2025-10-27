import { SpatialGrid } from './spatial-grid'
import { IntelligentGrid } from './intelligent-grid'
import { cellKey, parseCellKey, getNeighbors } from './cell-utils'

type Mode = "classic" | "prime"

interface WorkerMessage {
  type: 'INIT' | 'START' | 'STOP' | 'RESET' | 'SET_MODE' | 'SET_SPEED' | 'LOAD_PRESET' | 'UPDATE_GRID' | 'GET_STATE'
  data?: any
}

interface WorkerResponse {
  type: 'STATE_UPDATE' | 'GRID_UPDATE' | 'STATE_RESPONSE'
  data?: any
}

interface SimulationState {
  grid: IntelligentGrid
  mode: Mode
  speed: number
  isRunning: boolean
  lastUpdateTime: number
}

// Helper function to check if a number is prime
const isPrime = (n: number): boolean => {
  if (n < 2) return false
  if (n === 2) return true
  if (n % 2 === 0) return false
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false
  }
  return true
}

// Count neighbors for a cell
const countNeighbors = (grid: IntelligentGrid, x: number, y: number): number => {
  let count = 0
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue
      if (grid.has(x + dx, y + dy)) count++
    }
  }
  return count
}

// Calculate next generation with diff tracking
const nextGenerationWithDiff = (grid: IntelligentGrid, mode: Mode): { newGrid: IntelligentGrid, born: string[], died: string[] } => {
  const newGrid = new IntelligentGrid()
  const allCells = grid.getAllCells()
  const born: string[] = []
  const died: string[] = []

  allCells.forEach(cellKey => {
    const [x, y] = cellKey.split(',').map(Number)
    const neighbors = countNeighbors(grid, x, y)
    const wasAlive = grid.has(x, y)
    let shouldBeAlive = false

    if (mode === "classic") {
      if (wasAlive) {
        shouldBeAlive = neighbors === 2 || neighbors === 3
      } else {
        shouldBeAlive = neighbors === 3
      }
    } else {
      if (wasAlive) {
        shouldBeAlive = neighbors === 6 || neighbors === 7
      } else {
        shouldBeAlive = isPrime(neighbors)
      }
    }

    if (shouldBeAlive) {
      newGrid.add(x, y)
      if (!wasAlive) {
        born.push(cellKey)
      }
    } else {
      if (wasAlive) {
        died.push(cellKey)
      }
    }
  })

  return { newGrid, born, died }
}

class SimulationWorker {
  private state: SimulationState
  private animationId: number | null = null
  private port: MessagePort

  constructor(port: MessagePort) {
    this.port = port
    this.state = {
      grid: new IntelligentGrid(),
      mode: "classic",
      speed: 100, // Default speed (1000ms - 100*9.9 = 10ms interval)
      isRunning: false,
      lastUpdateTime: 0
    }

    this.port.onmessage = this.handleMessage.bind(this)
  }

  private handleMessage(event: MessageEvent<WorkerMessage>) {
    const { type, data } = event.data

    switch (type) {
      case 'INIT':
        this.sendStateUpdate()
        break

      case 'START':
        this.startSimulation()
        break

      case 'STOP':
        this.stopSimulation()
        break

      case 'RESET':
        this.resetSimulation()
        break

      case 'SET_MODE':
        this.state.mode = data.mode
        break

      case 'SET_SPEED':
        this.state.speed = data.speed
        break

      case 'LOAD_PRESET':
        this.loadPreset(data.cells)
        break

      case 'UPDATE_GRID':
        this.updateGrid(data.cellsToAdd, data.cellsToRemove)
        break

      case 'GET_STATE':
        this.sendStateUpdate()
        break
    }
  }

  private startSimulation() {
    if (this.state.isRunning) return

    this.state.isRunning = true
    this.state.lastUpdateTime = performance.now()
    this.animate()
  }

  private stopSimulation() {
    this.state.isRunning = false
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  private resetSimulation() {
    this.stopSimulation()
    this.state.grid = new IntelligentGrid()
    this.state.lastUpdateTime = 0
    this.sendStateUpdate()
  }

  private loadPreset(cells: Array<{ x: number; y: number }>) {
    this.state.grid = new IntelligentGrid()
    cells.forEach(cell => {
      this.state.grid.add(cell.x, cell.y)
    })
    this.sendStateUpdate()
  }

  private updateGrid(cellsToAdd: Array<{ x: number; y: number }>, cellsToRemove: Array<{ x: number; y: number }>) {
    cellsToRemove.forEach(cell => {
      this.state.grid.remove(cell.x, cell.y)
    })
    cellsToAdd.forEach(cell => {
      this.state.grid.add(cell.x, cell.y)
    })
    this.sendStateUpdate()
  }

  private async animate() {
    if (!this.state.isRunning) return

    const now = performance.now()
    const interval = 1000 - this.state.speed * 9.9 // Same calculation as React component

    if (now - this.state.lastUpdateTime >= interval) {
      try {
        const result = await this.state.grid.nextGeneration(this.state.mode)

        this.state.lastUpdateTime = now

        // Send only the changes to the main thread
        this.port.postMessage({
          type: 'GRID_UPDATE',
          data: {
            born: result.born,
            died: result.died,
            timestamp: now,
            algorithm: result.algorithm,
            stats: result.stats
          }
        } as WorkerResponse)
      } catch (error) {
        console.error('Animation error:', error)
      }
    }

    this.animationId = requestAnimationFrame(() => this.animate())
  }

  private sendStateUpdate() {
    const stats = this.state.grid.getPerformanceStats()

    this.port.postMessage({
      type: 'STATE_UPDATE',
      data: {
        isRunning: this.state.isRunning,
        mode: this.state.mode,
        speed: this.state.speed,
        cellCount: this.state.grid.getAllCells().size,
        generation: this.state.grid.getGeneration(),
        currentAlgorithm: stats.currentAlgorithm,
        performanceStats: stats
      }
    } as WorkerResponse)
  }
}

// Create the worker instance when the module loads
const port = self as any
new SimulationWorker(port)
