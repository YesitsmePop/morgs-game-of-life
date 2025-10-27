// lib/cell-utils.ts - Centralized cell coordinate utilities
export interface CellPosition {
  x: number
  y: number
}

export interface PackedCoordinate {
  packed: number
  x: number
  y: number
}

/**
 * Generate a consistent cell key for any coordinate
 */
export function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

/**
 * Parse a cell key back to coordinates
 */
export function parseCellKey(key: string): CellPosition {
  const [x, y] = key.split(',').map(Number)
  return { x, y }
}

/**
 * Pack two 16-bit coordinates into a single 32-bit integer for efficient storage
 * Range: -32768 to 32767 for each coordinate
 */
export function packCoordinate(x: number, y: number): number {
  return (x << 16) | (y & 0xFFFF)
}

/**
 * Unpack a 32-bit integer back to coordinates
 */
export function unpackCoordinate(packed: number): CellPosition {
  return {
    x: packed >> 16,
    y: packed & 0xFFFF
  }
}

/**
 * Get packed coordinate object
 */
export function getPackedCoordinate(x: number, y: number): PackedCoordinate {
  const packed = packCoordinate(x, y)
  return { packed, x, y }
}

/**
 * Check if a coordinate is within grid bounds
 */
export function isValidCoordinate(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) &&
         x >= -8192 && x <= 8192 && y >= -8192 && y <= 8192
}

/**
 * Get all 8 neighbors of a cell (packed coordinates)
 */
export function getPackedNeighbors(packed: number): number[] {
  const { x, y } = unpackCoordinate(packed)
  const neighbors: number[] = []

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx !== 0 || dy !== 0) {
        neighbors.push(packCoordinate(x + dx, y + dy))
      }
    }
  }
  return neighbors
}

/**
 * Get all 8 neighbors of a cell
 */
export function getNeighbors(x: number, y: number): CellPosition[] {
  const neighbors: CellPosition[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx !== 0 || dy !== 0) {
        neighbors.push({ x: x + dx, y: y + dy })
      }
    }
  }
  return neighbors
}

/**
 * Calculate Manhattan distance between two cells
 */
export function manhattanDistance(a: CellPosition, b: CellPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/**
 * Calculate Euclidean distance between two cells
 */
export function euclideanDistance(a: CellPosition, b: CellPosition): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/**
 * Convert a set of cell keys to coordinate arrays
 */
export function cellKeysToPositions(cellKeys: Set<string>): CellPosition[] {
  return Array.from(cellKeys).map(parseCellKey)
}

/**
 * Convert coordinate arrays to cell keys
 */
export function positionsToCellKeys(positions: CellPosition[]): Set<string> {
  return new Set(positions.map(pos => cellKey(pos.x, pos.y)))
}

/**
 * Convert packed coordinates to positions
 */
export function packedCoordinatesToPositions(packedCoords: number[]): CellPosition[] {
  return packedCoords.map(unpackCoordinate)
}

/**
 * Convert positions to packed coordinates
 */
export function positionsToPackedCoordinates(positions: CellPosition[]): number[] {
  return positions.map(pos => packCoordinate(pos.x, pos.y))
}
