// lib/pattern-cache.ts - Pattern memoization for small configurations
import { cellKey, parseCellKey, packCoordinate } from './cell-utils'

export interface CachedPattern {
  input: Set<string>
  output: Set<string>
  generation: number
}

/**
 * Pattern cache for memoizing small pattern evolution results
 * Significantly speeds up patterns that repeat frequently
 */
export class PatternCache {
  private cache: Map<string, CachedPattern> = new Map()
  private maxPatternSize = 16 // Only cache small patterns
  private maxCacheSize = 10000 // Maximum number of cached patterns

  /**
   * Generate a consistent key for a set of cells
   */
  private getPatternKey(cells: Set<string>): string {
    // Sort cells by coordinates for consistent key
    const sortedCells = Array.from(cells).sort()
    return sortedCells.join(';')
  }

  /**
   * Get cached result for a pattern
   */
  get(cells: Set<string>): Set<string> | null {
    if (cells.size > this.maxPatternSize) {
      return null // Don't cache large patterns
    }

    const key = this.getPatternKey(cells)
    const cached = this.cache.get(key)

    return cached ? cached.output : null
  }

  /**
   * Cache a pattern evolution result
   */
  set(cells: Set<string>, result: Set<string>, generation: number = 0): void {
    if (cells.size > this.maxPatternSize) {
      return // Don't cache large patterns
    }

    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry (simple LRU)
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }

    const key = this.getPatternKey(cells)
    this.cache.set(key, {
      input: new Set(cells),
      output: new Set(result),
      generation
    })
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hitRate: number; entries: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need hit/miss tracking to calculate
      entries: this.cache.size
    }
  }

  /**
   * Get all cached patterns for debugging
   */
  getAllPatterns(): CachedPattern[] {
    return Array.from(this.cache.values())
  }
}
