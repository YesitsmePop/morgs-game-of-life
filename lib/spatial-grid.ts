import { PatternCache } from './pattern-cache'
import { cellKey, parseCellKey, getNeighbors } from './cell-utils'
import { MultiWorkerManager, WorkerTask, WorkerResult } from './multi-worker-manager'
import { GPUCompute, GPUComputeResult } from './gpu-compute'

export class SpatialGrid {
  private chunks: Map<string, Set<string>> = new Map()
  private chunkSize = 16
  private patternCache?: PatternCache
  private multiWorkerManager?: MultiWorkerManager
  private gpuCompute?: GPUCompute
  private generation = 0

  constructor(usePatternCache: boolean = false, useParallelProcessing: boolean = false, useGPUCompute: boolean = false) {
    if (usePatternCache) {
      this.patternCache = new PatternCache()
    }
    if (useParallelProcessing) {
      // Use number of CPU cores minus 1, minimum 2, maximum 8
      const workerCount = Math.min(8, Math.max(2, navigator.hardwareConcurrency - 1))
      this.multiWorkerManager = new MultiWorkerManager(workerCount)
    }
    if (useGPUCompute) {
      try {
        this.gpuCompute = new GPUCompute(8192, 8192)
      } catch (error) {
        console.warn('GPU compute not available:', error)
      }
    }
  }

  private getChunkKey(x: number, y: number): string {
    const chunkX = Math.floor(x / this.chunkSize)
    const chunkY = Math.floor(y / this.chunkSize)
    return `${chunkX},${chunkY}`
  }

  add(x: number, y: number): void {
    const key = cellKey(x, y)
    const chunkKey = this.getChunkKey(x, y)
    if (!this.chunks.has(chunkKey)) {
      this.chunks.set(chunkKey, new Set())
    }
    this.chunks.get(chunkKey)!.add(key)
  }

  remove(x: number, y: number): void {
    const key = cellKey(x, y)
    const chunkKey = this.getChunkKey(x, y)
    const chunk = this.chunks.get(chunkKey)
    if (chunk) {
      chunk.delete(key)
      if (chunk.size === 0) {
        this.chunks.delete(chunkKey)
      }
    }
  }

  has(x: number, y: number): boolean {
    const key = cellKey(x, y)
    const chunkKey = this.getChunkKey(x, y)
    const chunk = this.chunks.get(chunkKey)
    return chunk ? chunk.has(key) : false
  }

  getAllCells(): Set<string> {
    const allCells = new Set<string>()
    for (const chunk of this.chunks.values()) {
      for (const cell of chunk) {
        allCells.add(cell)
      }
    }
    return allCells
  }

  getActiveChunks(): string[] {
    return Array.from(this.chunks.keys())
  }

  getChunkCells(chunkKey: string): Set<string> {
    return this.chunks.get(chunkKey) || new Set()
  }

  reset(): void {
    this.chunks.clear()
    this.generation = 0
    if (this.patternCache) {
      this.patternCache.clear()
    }
    if (this.gpuCompute) {
      this.gpuCompute.destroy()
      try {
        this.gpuCompute = new GPUCompute(8192, 8192)
      } catch (error) {
        console.warn('Failed to reinitialize GPU compute:', error)
      }
    }
  }

  getNeighborChunks(x: number, y: number): string[] {
    const chunks: string[] = []
    const chunkX = Math.floor(x / this.chunkSize)
    const chunkY = Math.floor(y / this.chunkSize)

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        chunks.push(`${chunkX + dx},${chunkY + dy}`)
      }
    }

    return chunks
  }

  copy(): SpatialGrid {
    const newGrid = new SpatialGrid(!!this.patternCache, !!this.multiWorkerManager, !!this.gpuCompute)
    for (const [chunkKey, chunk] of this.chunks) {
      newGrid.chunks.set(chunkKey, new Set(chunk))
    }
    newGrid.generation = this.generation
    return newGrid
  }

  /**
   * Get the current generation number
   */
  getGeneration(): number {
    return this.generation
  }

  /**
   * Get pattern cache statistics (if enabled)
   */
  getCacheStats(): any {
    return this.patternCache?.getStats() || null
  }

  /**
   * Get multi-worker statistics (if enabled)
   */
  getWorkerStats(): any {
    return this.multiWorkerManager ? {
      workerCount: this.multiWorkerManager.getWorkerCount(),
      isProcessing: this.multiWorkerManager.isProcessing(),
      queueSize: this.multiWorkerManager.getQueueSize()
    } : null
  }

  /**
   * Get GPU compute statistics (if enabled)
   */
  getGPUStats(): any {
    return this.gpuCompute?.getStats() || null
  }

  /**
   * GPU-accelerated next generation for massive patterns
   */
  async nextGenerationGPU(mode: 'classic' | 'prime' = 'classic'): Promise<{ born: string[], died: string[] }> {
    if (!this.gpuCompute) {
      throw new Error('GPU compute not enabled')
    }

    const allCells = this.getAllCells()

    if (allCells.size < 100000) {
      // Use standard algorithm for smaller patterns
      return this.nextGenerationStandard(mode)
    }

    // Load pattern into GPU and compute
    this.gpuCompute.loadPattern(allCells)
    const result = this.gpuCompute.step(mode)

    // Update grid with GPU results
    this.chunks.clear()
    result.newGrid.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number)
      this.add(x, y)
    })

    this.generation++
    return { born: result.born, died: result.died }
  }

  /**
   * Use parallel processing for massive patterns
   */
  async nextGenerationParallel(mode: 'classic' | 'prime' = 'classic'): Promise<{ born: string[], died: string[] }> {
    if (!this.multiWorkerManager) {
      throw new Error('Multi-worker manager not enabled')
    }

    const allCells = this.getAllCells()

    if (allCells.size < 50000) {
      // Use standard algorithm for smaller patterns
      return this.nextGenerationStandard(mode)
    }

    // Split pattern into chunks for parallel processing
    const tasks = this.splitPatternForParallel(allCells, mode)

    if (tasks.length === 0) {
      return this.nextGenerationStandard(mode)
    }

    // Process in parallel
    return new Promise((resolve, reject) => {
      this.multiWorkerManager!.processTasks(tasks, (results) => {
        // Combine results from all workers
        const born: string[] = []
        const died: string[] = []

        results.forEach(result => {
          born.push(...result.born)
          died.push(...result.died)
        })

        // Apply changes to main grid
        this.applyParallelResults(results)

        resolve({ born, died })
      })
    })
  }

  /**
   * Standard next generation calculation
   */
  nextGenerationStandard(mode: 'classic' | 'prime' = 'classic'): { born: string[], died: string[] } {
    const newGrid = this.copy()
    newGrid.reset()
    const checked = new Set<string>()
    const born: string[] = []
    const died: string[] = []

    // Get all active chunks
    const activeChunks = this.getActiveChunks()

    for (const chunkKey of activeChunks) {
      const chunkCells = this.getChunkCells(chunkKey)

      // Check all cells in this chunk and neighboring chunks
      const [chunkX, chunkY] = chunkKey.split(',').map(Number)
      const neighborChunks = this.getNeighborChunks(chunkX * 16, chunkY * 16)

      for (const neighborChunk of neighborChunks) {
        const neighborCells = this.getChunkCells(neighborChunk)

        // Check all cells in neighboring chunks
        for (const cellKey of neighborCells) {
          const [x, y] = cellKey.split(',').map(Number)

          // Check 3x3 neighborhood around each cell
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const nx = x + dx
              const ny = y + dy
              const nKey = `${nx},${ny}`

              if (checked.has(nKey)) continue
              checked.add(nKey)

              const neighbors = this.countNeighbors(nx, ny)
              const wasAlive = this.has(nx, ny)
              let shouldBeAlive = false

              if (mode === "classic") {
                if (wasAlive) {
                  shouldBeAlive = neighbors === 2 || neighbors === 3
                } else {
                  shouldBeAlive = neighbors === 3
                }
              } else {
                // Prime mode - custom rules
                if (wasAlive) {
                  shouldBeAlive = neighbors === 6 || neighbors === 7
                } else {
                  shouldBeAlive = this.isPrime(neighbors)
                }
              }

              if (shouldBeAlive) {
                newGrid.add(nx, ny)
                if (!wasAlive) {
                  born.push(nKey)
                }
              } else {
                if (wasAlive) {
                  died.push(nKey)
                }
              }
            }
          }
        }
      }
    }

    // Update the grid
    this.chunks = newGrid.chunks
    this.generation++

    return { born, died }
  }

  private countNeighbors(x: number, y: number): number {
    let count = 0
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue
        if (this.has(x + dx, y + dy)) count++
      }
    }
    return count
  }

  private isPrime(n: number): boolean {
    if (n < 2) return false
    if (n === 2) return true
    if (n % 2 === 0) return false
    for (let i = 3; i <= Math.sqrt(n); i += 2) {
      if (n % i === 0) return false
    }
    return true
  }

  private splitPatternForParallel(cells: Set<string>, mode: 'classic' | 'prime'): WorkerTask[] {
    if (!this.multiWorkerManager || cells.size < 50000) {
      return []
    }

    // Find pattern bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    cells.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    })

    const width = maxX - minX + 1
    const height = maxY - minY + 1
    const workerCount = this.multiWorkerManager.getWorkerCount()

    // Split into roughly equal chunks
    const tasks: WorkerTask[] = []
    const chunkWidth = Math.ceil(width / Math.sqrt(workerCount))
    const chunkHeight = Math.ceil(height / Math.sqrt(workerCount))

    for (let chunkY = 0; chunkY < workerCount; chunkY++) {
      for (let chunkX = 0; chunkX < workerCount; chunkX++) {
        if (tasks.length >= workerCount) break

        const chunkMinX = minX + chunkX * chunkWidth
        const chunkMinY = minY + chunkY * chunkHeight
        const chunkMaxX = Math.min(maxX, chunkMinX + chunkWidth - 1)
        const chunkMaxY = Math.min(maxY, chunkMinY + chunkHeight - 1)

        // Collect cells in this chunk
        const chunkCells = new Set<string>()
        cells.forEach(cellKey => {
          const [x, y] = cellKey.split(',').map(Number)
          if (x >= chunkMinX && x <= chunkMaxX && y >= chunkMinY && y <= chunkMaxY) {
            chunkCells.add(cellKey)
          }
        })

        if (chunkCells.size > 0) {
          tasks.push({
            id: tasks.length,
            cells: chunkCells,
            bounds: { minX: chunkMinX, maxX: chunkMaxX, minY: chunkMinY, maxY: chunkMaxY },
            mode
          })
        }
      }
    }

    return tasks
  }

  private applyParallelResults(results: WorkerResult[]): void {
    // Apply all changes from parallel workers
    results.forEach(result => {
      result.born.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number)
        this.add(x, y)
      })

      result.died.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number)
        this.remove(x, y)
      })
    })

    this.generation++
  }
}
