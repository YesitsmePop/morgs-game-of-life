export class PatternCache {
  private cache: Map<string, Set<string>> = new Map()

  private getPatternKey(cells: Set<string>): string {
    // Sort cells by coordinates for consistent key
    const sortedCells = Array.from(cells).sort()
    return sortedCells.join(';')
  }

  get(cells: Set<string>): Set<string> | null {
    const key = this.getPatternKey(cells)
    return this.cache.get(key) || null
  }

  set(cells: Set<string>, result: Set<string>): void {
    if (cells.size <= 16) { // Only cache small patterns
      const key = this.getPatternKey(cells)
      this.cache.set(key, new Set(result))
    }
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}
