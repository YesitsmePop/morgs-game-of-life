// lib/intelligent-grid.ts - Smart grid manager that automatically selects optimal algorithms
import { SpatialGrid } from './spatial-grid'
import { QuadtreeGrid } from './quadtree-grid'
import { HashLife } from './hashlife'
import { cellKey, parseCellKey } from './cell-utils'

export interface GridResult {
  born: string[]
  died: string[]
  algorithm: string
  stats?: any
}

export interface GridCapabilities {
  hasWebGL: boolean
  hasWebWorkers: boolean
  maxWorkers: number
  hasPatternCache: boolean
  hasGPUCompute: boolean
}

/**
 * Intelligent grid manager that automatically selects the best algorithm
 * based on pattern size, available hardware, and performance requirements
 */
export class IntelligentGrid {
  private spatialGrid: SpatialGrid
  private quadtreeGrid: QuadtreeGrid
  private hashLife: HashLife
  private capabilities: GridCapabilities
  private currentAlgorithm: string = 'spatial'

  constructor() {
    // Detect hardware capabilities
    this.capabilities = this.detectCapabilities()

    // Initialize grids with appropriate optimizations
    this.spatialGrid = new SpatialGrid(
      this.capabilities.hasPatternCache,
      this.capabilities.hasWebWorkers,
      this.capabilities.hasGPUCompute
    )

    this.quadtreeGrid = new QuadtreeGrid()
    this.hashLife = new HashLife()
  }

  private detectCapabilities(): GridCapabilities {
    return {
      hasWebGL: typeof WebGL2RenderingContext !== 'undefined',
      hasWebWorkers: typeof Worker !== 'undefined',
      maxWorkers: Math.min(8, Math.max(2, navigator.hardwareConcurrency - 1)),
      hasPatternCache: true, // Always enable pattern caching
      hasGPUCompute: typeof OffscreenCanvas !== 'undefined' && typeof WebGL2RenderingContext !== 'undefined'
    }
  }

  /**
   * Add a cell to the grid
   */
  add(x: number, y: number): void {
    this.spatialGrid.add(x, y)
    this.quadtreeGrid.add(x, y)
  }

  /**
   * Remove a cell from the grid
   */
  remove(x: number, y: number): void {
    this.spatialGrid.remove(x, y)
    this.quadtreeGrid.remove(x, y)
  }

  /**
   * Check if a cell is alive
   */
  has(x: number, y: number): boolean {
    return this.spatialGrid.has(x, y)
  }

  /**
   * Get all currently alive cells
   */
  getAllCells(): Set<string> {
    return this.spatialGrid.getAllCells()
  }

  /**
   * Get current generation number
   */
  getGeneration(): number {
    return this.spatialGrid.getGeneration()
  }

  /**
   * Reset the grid
   */
  reset(): void {
    this.spatialGrid.reset()
    this.quadtreeGrid = new QuadtreeGrid()
    this.hashLife.clear()
    this.currentAlgorithm = 'spatial'
  }

  /**
   * Load a preset pattern
   */
  loadPreset(cells: Array<{ x: number; y: number }>): void {
    this.reset()
    cells.forEach(cell => {
      this.add(cell.x, cell.y)
    })
  }

  /**
   * Automatically select and run the best algorithm for the current pattern
   */
  async nextGeneration(mode: 'classic' | 'prime' = 'classic'): Promise<GridResult> {
    const cellCount = this.getAllCells().size

    let result: { born: string[], died: string[] }
    let algorithm: string
    let stats: any = {}

    // Algorithm selection based on pattern size and capabilities
    if (cellCount > 1000000 && this.capabilities.hasGPUCompute) {
      // Ultra-massive patterns: GPU compute
      algorithm = 'gpu'
      result = await this.spatialGrid.nextGenerationGPU(mode)
      stats = this.spatialGrid.getGPUStats()
    } else if (cellCount > 100000 && this.capabilities.hasWebWorkers) {
      // Very large patterns: Parallel processing
      algorithm = 'parallel'
      result = await this.spatialGrid.nextGenerationParallel(mode)
      stats = this.spatialGrid.getWorkerStats()
    } else if (cellCount > 10000) {
      // Large patterns: Pattern caching with spatial partitioning
      algorithm = 'spatial-cached'
      result = this.spatialGrid.nextGenerationStandard(mode)
      stats = this.spatialGrid.getCacheStats()
    } else if (cellCount > 1000) {
      // Medium patterns: Quadtree optimization
      algorithm = 'quadtree'
      result = this.nextGenerationQuadtree(mode)
    } else {
      // Small patterns: Standard spatial grid
      algorithm = 'spatial'
      result = this.spatialGrid.nextGenerationStandard(mode)
    }

    this.currentAlgorithm = algorithm
    return {
      born: result.born,
      died: result.died,
      algorithm,
      stats
    }
  }

  /**
   * Quadtree-based next generation (for medium patterns)
   */
  private nextGenerationQuadtree(mode: 'classic' | 'prime'): { born: string[], died: string[] } {
    const allCells = this.getAllCells()
    const born: string[] = []
    const died: string[] = []

    // Convert to quadtree format
    allCells.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number)
      this.quadtreeGrid.add(x, y)
    })

    // Use quadtree for neighbor counting and evolution
    const newGrid = this.quadtreeGrid.copy()
    newGrid.clear()

    allCells.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number)
      const neighbors = this.countQuadtreeNeighbors(x, y)
      const wasAlive = this.quadtreeGrid.has(x, y)
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
          shouldBeAlive = this.isPrimeQuadtree(neighbors)
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

    // Update quadtree grid
    this.quadtreeGrid = newGrid
    this.spatialGrid = this.convertQuadtreeToSpatial(newGrid)

    return { born, died }
  }

  private countQuadtreeNeighbors(x: number, y: number): number {
    let count = 0
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue
        if (this.quadtreeGrid.has(x + dx, y + dy)) count++
      }
    }
    return count
  }

  private isPrimeQuadtree(n: number): boolean {
    if (n < 2) return false
    if (n === 2) return true
    if (n % 2 === 0) return false
    for (let i = 3; i <= Math.sqrt(n); i += 2) {
      if (n % i === 0) return false
    }
    return true
  }

  private convertQuadtreeToSpatial(quadtree: QuadtreeGrid): SpatialGrid {
    const spatial = new SpatialGrid()
    const allCells = quadtree.getAllCells()

    allCells.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number)
      spatial.add(x, y)
    })

    return spatial
  }

  /**
   * Get performance statistics for all algorithms
   */
  getPerformanceStats(): {
    currentAlgorithm: string
    capabilities: GridCapabilities
    patternSize: number
    generation: number
    spatialStats?: any
    cacheStats?: any
    workerStats?: any
    gpuStats?: any
  } {
    return {
      currentAlgorithm: this.currentAlgorithm,
      capabilities: this.capabilities,
      patternSize: this.getAllCells().size,
      generation: this.getGeneration(),
      spatialStats: this.spatialGrid.getCacheStats(),
      cacheStats: this.spatialGrid.getCacheStats(),
      workerStats: this.spatialGrid.getWorkerStats(),
      gpuStats: this.spatialGrid.getGPUStats()
    }
  }

  /**
   * Force a specific algorithm (for testing or advanced users)
   */
  setAlgorithm(algorithm: 'spatial' | 'quadtree' | 'hashlife' | 'auto'): void {
    switch (algorithm) {
      case 'spatial':
        this.currentAlgorithm = 'spatial'
        break
      case 'quadtree':
        this.currentAlgorithm = 'quadtree'
        break
      case 'hashlife':
        this.currentAlgorithm = 'hashlife'
        break
      case 'auto':
        this.currentAlgorithm = 'auto'
        break
    }
  }

  /**
   * Get recommendations for optimal settings
   */
  getRecommendations(): {
    recommendedAlgorithm: string
    reason: string
    expectedPerformance: string
  } {
    const cellCount = this.getAllCells().size

    if (cellCount > 1000000 && this.capabilities.hasGPUCompute) {
      return {
        recommendedAlgorithm: 'gpu',
        reason: 'Ultra-massive pattern detected - GPU acceleration recommended',
        expectedPerformance: 'Excellent (GPU parallel processing)'
      }
    } else if (cellCount > 100000 && this.capabilities.hasWebWorkers) {
      return {
        recommendedAlgorithm: 'parallel',
        reason: 'Very large pattern - parallel CPU processing recommended',
        expectedPerformance: 'Very Good (Multi-core parallel processing)'
      }
    } else if (cellCount > 10000) {
      return {
        recommendedAlgorithm: 'spatial-cached',
        reason: 'Large pattern - spatial partitioning with pattern caching',
        expectedPerformance: 'Good (Cached spatial optimization)'
      }
    } else if (cellCount > 1000) {
      return {
        recommendedAlgorithm: 'quadtree',
        reason: 'Medium pattern - quadtree spatial optimization',
        expectedPerformance: 'Good (Quadtree optimization)'
      }
    } else {
      return {
        recommendedAlgorithm: 'spatial',
        reason: 'Small pattern - standard spatial grid',
        expectedPerformance: 'Excellent (No optimization overhead)'
      }
    }
  }
}
