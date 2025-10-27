// multi-worker-manager.ts - Advanced parallel processing for massive Game of Life patterns
"use client"

export interface WorkerTask {
  id: number
  cells: Set<string>
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  mode: 'classic' | 'prime'
}

export interface WorkerResult {
  taskId: number
  newCells: Set<string>
  born: string[]
  died: string[]
}

export class MultiWorkerManager {
  private workers: Worker[] = []
  private idleWorkers: Worker[] = []
  private taskQueue: WorkerTask[] = []
  private results: Map<number, WorkerResult> = new Map()
  private nextTaskId = 0
  private onComplete?: (results: WorkerResult[]) => void
  private activeTasks = 0

  constructor(workerCount: number = 4) {
    this.initializeWorkers(workerCount)
  }

  private initializeWorkers(count: number) {
    for (let i = 0; i < count; i++) {
      const worker = new Worker('/parallel-worker.js', { type: 'classic' })
      worker.onmessage = (event) => this.handleWorkerMessage(event, worker)
      worker.onerror = (error) => this.handleWorkerError(error, worker)
      this.workers.push(worker)
      this.idleWorkers.push(worker)
    }
  }

  // Split large pattern into chunks for parallel processing
  splitPatternForWorkers(cells: Set<string>, workerCount: number): WorkerTask[] {
    if (cells.size < 50000) {
      // Small patterns don't need parallel processing
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
            mode: 'classic'
          })
        }
      }
    }

    return tasks
  }

  async processPatternParallel(cells: Set<string>, mode: 'classic' | 'prime' = 'classic'): Promise<Set<string>> {
    const cellCount = cells.size

    // Use single worker for smaller patterns
    if (cellCount < 50000) {
      const worker = this.idleWorkers.pop() || this.workers[0]
      try {
        const result = await this.processTask(worker, {
          id: this.nextTaskId++,
          cells,
          bounds: { minX: -4096, maxX: 4096, minY: -4096, maxY: 4096 },
          mode
        })
        this.idleWorkers.push(worker)
        return result.newCells
      } catch (error) {
        this.idleWorkers.push(worker)
        throw error
      }
    }

    // Split large pattern for parallel processing
    const tasks = this.splitPatternForWorkers(cells, this.workers.length)
    if (tasks.length === 0) {
      return cells // No work to do
    }

    this.activeTasks = tasks.length
    this.results.clear()

    return new Promise((resolve, reject) => {
      this.onComplete = (results) => {
        try {
          // Combine results from all workers
          const combinedCells = new Set<string>()

          results.forEach(result => {
            result.newCells.forEach(cell => combinedCells.add(cell))
          })

          resolve(combinedCells)
        } catch (error) {
          reject(error)
        }
      }

      // Start all tasks
      tasks.forEach(task => {
        const worker = this.idleWorkers.pop()
        if (worker) {
          this.processTaskAsync(worker, task)
        }
      })
    })
  }

  private async processTask(worker: Worker, task: WorkerTask): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker task ${task.id} timed out`))
      }, 5000) // 5 second timeout

      worker.onmessage = (event) => {
        clearTimeout(timeout)
        const { type, data } = event.data

        if (type === 'TASK_COMPLETE') {
          resolve(data)
        } else if (type === 'TASK_ERROR') {
          reject(new Error(data.error))
        }
      }

      worker.postMessage({
        type: 'PROCESS_TASK',
        data: task
      })
    })
  }

  private processTaskAsync(worker: Worker, task: WorkerTask) {
    worker.onmessage = (event) => {
      const { type, data } = event.data

      if (type === 'TASK_COMPLETE') {
        this.results.set(task.id, data)
        this.idleWorkers.push(worker)

        if (this.results.size === this.activeTasks && this.onComplete) {
          const results = Array.from(this.results.values())
          this.onComplete(results)
        }
      } else if (type === 'TASK_ERROR') {
        console.error(`Worker task ${task.id} failed:`, data.error)
        this.idleWorkers.push(worker)

        if (this.results.size + 1 === this.activeTasks && this.onComplete) {
          const results = Array.from(this.results.values())
          this.onComplete(results)
        }
      }
    }

    worker.postMessage({
      type: 'PROCESS_TASK',
      data: task
    })
  }

  private handleWorkerMessage(event: MessageEvent, worker: Worker) {
    // This is handled by the async methods above
  }

  private handleWorkerError(error: ErrorEvent, worker: Worker) {
    console.error('Worker error:', error)
    // Remove failed worker and continue with remaining workers
    const index = this.workers.indexOf(worker)
    if (index > -1) {
      this.workers.splice(index, 1)
    }
    const idleIndex = this.idleWorkers.indexOf(worker)
    if (idleIndex > -1) {
      this.idleWorkers.splice(idleIndex, 1)
    }
  }

  // Public API methods
  getWorkerCount(): number {
    return this.workers.length
  }

  isProcessing(): boolean {
    return this.activeTasks > 0 || this.taskQueue.length > 0
  }

  getQueueSize(): number {
    return this.taskQueue.length
  }

  processTasks(tasks: WorkerTask[], onComplete: (results: WorkerResult[]) => void): void {
    this.onComplete = onComplete
    this.activeTasks = tasks.length
    this.results.clear()

    // Start all tasks
    tasks.forEach(task => {
      const worker = this.idleWorkers.pop()
      if (worker) {
        this.processTaskAsync(worker, task)
      }
    })
  }

  // Cleanup
  terminate() {
    this.workers.forEach(worker => worker.terminate())
    this.workers = []
    this.idleWorkers = []
  }
}
