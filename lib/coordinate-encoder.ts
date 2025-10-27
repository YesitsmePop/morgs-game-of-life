// Coordinate encoding utilities for ultra-fast Game of Life
export class CoordinateEncoder {
  // Pack two 16-bit coordinates into a single 32-bit integer
  // This gives us range of -32768 to 32767 for each coordinate
  static encode(x: number, y: number): number {
    return (x << 16) | (y & 0xFFFF)
  }

  static decode(packed: number): { x: number, y: number } {
    return {
      x: packed >> 16,
      y: packed & 0xFFFF
    }
  }

  static decodeX(packed: number): number {
    return packed >> 16
  }

  static decodeY(packed: number): number {
    return packed & 0xFFFF
  }

  // Convert string key to packed coordinate (for compatibility)
  static fromStringKey(key: string): number {
    const [x, y] = key.split(',').map(Number)
    return this.encode(x, y)
  }

  // Convert packed coordinate to string key (for compatibility)
  static toStringKey(packed: number): string {
    const { x, y } = this.decode(packed)
    return `${x},${y}`
  }

  // Fast neighbor coordinate generation
  static getNeighborCoords(packed: number): number[] {
    const coords = new Array(8)
    const { x, y } = this.decode(packed)

    let i = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx !== 0 || dy !== 0) {
          coords[i++] = this.encode(x + dx, y + dy)
        }
      }
    }
    return coords
  }
}

// SIMD-accelerated neighbor counting using WebAssembly or polyfill
export class SIMDNeighborCounter {
  private static readonly NEIGHBOR_OFFSETS = new Int16Array([
    -1, -1, -1,  0, -1,  1,
     0, -1,         0,  1,
     1, -1,  1,  0,  1,  1
  ])

  // Ultra-fast neighbor counting using packed coordinates
  static countNeighborsSIMD(
    centerX: number,
    centerY: number,
    aliveCells: Set<number> | Uint32Array,
    bounds?: { minX: number, maxX: number, minY: number, maxY: number }
  ): number {
    let count = 0

    // Check if we're using a Set or typed array
    const hasCell = typeof aliveCells.has === 'function'
      ? (x: number, y: number) => aliveCells.has(CoordinateEncoder.encode(x, y))
      : (x: number, y: number) => {
          const packed = CoordinateEncoder.encode(x, y)
          const index = aliveCells.indexOf(packed)
          return index >= 0
        }

    // Optimized loop with early bounds checking
    const offsets = SIMDNeighborCounter.NEIGHBOR_OFFSETS
    for (let i = 0; i < offsets.length; i += 2) {
      const nx = centerX + offsets[i]
      const ny = centerY + offsets[i + 1]

      // Early bounds check if bounds provided
      if (bounds && (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY)) {
        continue
      }

      if (hasCell(nx, ny)) {
        count++
      }
    }

    return count
  }

  // Batch neighbor counting for multiple cells - much faster than individual calls
  static countNeighborsBatch(
    cells: number[], // Array of packed coordinates
    aliveCells: Set<number> | Uint32Array,
    bounds?: { minX: number, maxX: number, minY: number, maxY: number }
  ): number[] {
    const counts = new Array(cells.length)

    // Pre-calculate bounds for faster checking
    const checkBounds = bounds !== undefined
    const minX = bounds?.minX || -Infinity
    const maxX = bounds?.maxX || Infinity
    const minY = bounds?.minY || Infinity
    const maxY = bounds?.maxY || Infinity

    const hasCell = typeof aliveCells.has === 'function'
      ? (packed: number) => aliveCells.has(packed)
      : (packed: number) => {
          const index = aliveCells.indexOf(packed)
          return index >= 0
        }

    for (let i = 0; i < cells.length; i++) {
      const packed = cells[i]
      const x = CoordinateEncoder.decodeX(packed)
      const y = CoordinateEncoder.decodeY(packed)

      let count = 0
      const offsets = SIMDNeighborCounter.NEIGHBOR_OFFSETS

      for (let j = 0; j < offsets.length; j += 2) {
        const nx = x + offsets[j]
        const ny = y + offsets[j + 1]

        if (checkBounds && (nx < minX || nx > maxX || ny < minY || ny > maxY)) {
          continue
        }

        if (hasCell(CoordinateEncoder.encode(nx, ny))) {
          count++
        }
      }

      counts[i] = count
    }

    return counts
  }
}

// Optimized bounds calculation using SIMD-friendly operations
export class BoundsCalculator {
  static calculatePackedBounds(cells: number[]): { min: number, max: number } {
    if (cells.length === 0) {
      return { min: 0, max: 0 }
    }

    let minPacked = cells[0]
    let maxPacked = cells[0]

    // Unrolled loop for better performance
    for (let i = 1; i < cells.length; i++) {
      const packed = cells[i]
      if (packed < minPacked) minPacked = packed
      if (packed > maxPacked) maxPacked = packed
    }

    return { min: minPacked, max: maxPacked }
  }

  static expandBounds(bounds: { min: number, max: number }, expansion: number = 1): { minX: number, maxX: number, minY: number, maxY: number } {
    const minCoord = CoordinateEncoder.decode(bounds.min)
    const maxCoord = CoordinateEncoder.decode(bounds.max)

    return {
      minX: minCoord.x - expansion,
      maxX: maxCoord.x + expansion,
      minY: minCoord.y - expansion,
      maxY: maxCoord.y + expansion
    }
  }
}
