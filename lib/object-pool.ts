export class ObjectPool<T> {
  private available: T[] = []
  private createFn: () => T
  private resetFn?: (obj: T) => void
  private maxSize: number

  constructor(createFn: () => T, resetFn?: (obj: T) => void, initialSize = 10, maxSize = 100) {
    this.createFn = createFn
    this.resetFn = resetFn
    this.maxSize = maxSize

    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.available.push(this.createFn())
    }
  }

  acquire(): T {
    const obj = this.available.pop()
    if (obj) {
      return obj
    }
    // Pool exhausted, create new one
    return this.createFn()
  }

  release(obj: T): void {
    if (this.available.length < this.maxSize) {
      if (this.resetFn) {
        this.resetFn(obj)
      }
      this.available.push(obj)
    }
    // If pool is full, let object be garbage collected
  }

  size(): number {
    return this.available.length
  }

  clear(): void {
    this.available.length = 0
  }
}
