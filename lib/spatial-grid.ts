export class SpatialGrid {
  private chunks: Map<string, Set<string>> = new Map()
  private chunkSize = 16

  private getChunkKey(x: number, y: number): string {
    const chunkX = Math.floor(x / this.chunkSize)
    const chunkY = Math.floor(y / this.chunkSize)
    return `${chunkX},${chunkY}`
  }

  add(x: number, y: number): void {
    const key = `${x},${y}`
    const chunkKey = this.getChunkKey(x, y)
    if (!this.chunks.has(chunkKey)) {
      this.chunks.set(chunkKey, new Set())
    }
    this.chunks.get(chunkKey)!.add(key)
  }

  remove(x: number, y: number): void {
    const key = `${x},${y}`
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
    const key = `${x},${y}`
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

  clear(): void {
    this.chunks.clear()
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
    const newGrid = new SpatialGrid()
    for (const [chunkKey, chunk] of this.chunks) {
      newGrid.chunks.set(chunkKey, new Set(chunk))
    }
    return newGrid
  }
}
