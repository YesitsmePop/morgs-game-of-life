import { SpatialGrid } from './spatial-grid'
import { PatternCache } from './pattern-cache'

type Mode = "classic" | "prime"

const isPrime = (n: number): boolean => {
  if (n < 2) return false
  if (n === 2) return true
  if (n % 2 === 0) return false
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false
  }
  return true
}

const countNeighbors = (grid: SpatialGrid, x: number, y: number): number => {
  let count = 0
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue
      if (grid.has(x + dx, y + dy)) count++
    }
  }
  return count
}

export const nextGenerationOptimized = (grid: SpatialGrid, mode: Mode, patternCache?: PatternCache): SpatialGrid => {
  const newGrid = grid.copy()
  newGrid.clear()
  const checked = new Set<string>()

  // Get all active chunks
  const activeChunks = grid.getActiveChunks()

  for (const chunkKey of activeChunks) {
    const chunkCells = grid.getChunkCells(chunkKey)

    // Check all cells in this chunk and neighboring chunks
    const [chunkX, chunkY] = chunkKey.split(',').map(Number)
    const neighborChunks = grid.getNeighborChunks(chunkX * 16, chunkY * 16)

    for (const neighborChunk of neighborChunks) {
      const neighborCells = grid.getChunkCells(neighborChunk)

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

            const neighbors = countNeighbors(grid, nx, ny)
            const isAlive = grid.has(nx, ny)

            if (mode === "classic") {
              if (isAlive) {
                if (neighbors === 2 || neighbors === 3) {
                  newGrid.add(nx, ny)
                }
              } else {
                if (neighbors === 3) {
                  newGrid.add(nx, ny)
                }
              }
            } else {
              if (isAlive) {
                if (neighbors === 6 || neighbors === 7) {
                  newGrid.add(nx, ny)
                }
              } else {
                if (isPrime(neighbors)) {
                  newGrid.add(nx, ny)
                }
              }
            }
          }
        }
      }
    }
  }

  return newGrid
}
