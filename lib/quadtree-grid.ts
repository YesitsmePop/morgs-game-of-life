interface QuadtreeNode {
  x: number
  y: number
  width: number
  height: number
  cells: Set<string>
  children: QuadtreeNode[] | null
  level: number
  isLeaf: boolean
}

export class QuadtreeGrid {
  private root: QuadtreeNode
  private maxLevel: number
  private maxCellsPerNode: number

  constructor(minX = -512, minY = -512, maxX = 512, maxY = 512, maxLevel = 6, maxCellsPerNode = 8) {
    this.maxLevel = maxLevel
    this.maxCellsPerNode = maxCellsPerNode

    this.root = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      cells: new Set(),
      children: null,
      level: 0,
      isLeaf: true
    }
  }

  private getNodeKey(x: number, y: number): string {
    return `${Math.floor(x)},${Math.floor(y)}`
  }

  private shouldSubdivide(node: QuadtreeNode): boolean {
    return node.level < this.maxLevel && node.cells.size > this.maxCellsPerNode
  }

  private subdivide(node: QuadtreeNode): void {
    if (!node.isLeaf || node.children) return

    node.isLeaf = false
    node.children = []

    const halfWidth = node.width / 2
    const halfHeight = node.height / 2

    // Create 4 child nodes (NW, NE, SW, SE)
    const childrenData = [
      { x: node.x, y: node.y, width: halfWidth, height: halfHeight },           // NW
      { x: node.x + halfWidth, y: node.y, width: halfWidth, height: halfHeight }, // NE
      { x: node.x, y: node.y + halfHeight, width: halfWidth, height: halfHeight }, // SW
      { x: node.x + halfWidth, y: node.y + halfHeight, width: halfWidth, height: halfHeight } // SE
    ]

    for (let i = 0; i < 4; i++) {
      const child = childrenData[i]
      const childNode: QuadtreeNode = {
        x: child.x,
        y: child.y,
        width: child.width,
        height: child.height,
        cells: new Set(),
        children: null,
        level: node.level + 1,
        isLeaf: true
      }
      node.children.push(childNode)

      // Redistribute cells to appropriate child nodes
      node.cells.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number)
        if (this.pointInNode(x, y, childNode)) {
          childNode.cells.add(cellKey)
        }
      })
    }

    node.cells.clear()
  }

  private pointInNode(x: number, y: number, node: QuadtreeNode): boolean {
    return x >= node.x && x < node.x + node.width &&
           y >= node.y && y < node.y + node.height
  }

  private merge(node: QuadtreeNode): void {
    if (node.isLeaf || !node.children) return

    let totalCells = 0
    for (const child of node.children) {
      if (!child.isLeaf) return // Can't merge if children have children
      totalCells += child.cells.size
    }

    if (totalCells <= this.maxCellsPerNode) {
      // Merge children back into parent
      for (const child of node.children) {
        child.cells.forEach(cellKey => {
          node.cells.add(cellKey)
        })
      }
      node.children = null
      node.isLeaf = true
    }
  }

  add(x: number, y: number): void {
    const key = this.getNodeKey(x, y)
    let node = this.root

    // Traverse to leaf node that contains this point
    while (!node.isLeaf && node.children) {
      let foundChild = false
      for (const child of node.children) {
        if (this.pointInNode(x, y, child)) {
          node = child
          foundChild = true
          break
        }
      }
      if (!foundChild) break
    }

    node.cells.add(key)

    if (this.shouldSubdivide(node)) {
      this.subdivide(node)
    }
  }

  remove(x: number, y: number): void {
    const key = this.getNodeKey(x, y)
    this.removeFromNode(key, this.root)
  }

  private removeFromNode(key: string, node: QuadtreeNode): boolean {
    if (node.cells.has(key)) {
      node.cells.delete(key)

      // Try to merge if we have children
      if (node.children) {
        this.merge(node)
      }

      return true
    }

    if (node.children) {
      for (const child of node.children) {
        if (this.removeFromNode(key, child)) {
          this.merge(node)
          return true
        }
      }
    }

    return false
  }

  has(x: number, y: number): boolean {
    const key = this.getNodeKey(x, y)
    return this.hasInNode(key, this.root)
  }

  private hasInNode(key: string, node: QuadtreeNode): boolean {
    if (node.cells.has(key)) {
      return true
    }

    if (node.children) {
      for (const child of node.children) {
        if (this.pointInNode(parseInt(key.split(',')[0]), parseInt(key.split(',')[1]), child)) {
          return this.hasInNode(key, child)
        }
      }
    }

    return false
  }

  getAllCells(): Set<string> {
    const allCells = new Set<string>()
    this.collectCells(this.root, allCells)
    return allCells
  }

  private collectCells(node: QuadtreeNode, cells: Set<string>): void {
    node.cells.forEach(cell => cells.add(cell))

    if (node.children) {
      for (const child of node.children) {
        this.collectCells(child, cells)
      }
    }
  }

  getNeighborNodes(x: number, y: number): QuadtreeNode[] {
    const nodes: QuadtreeNode[] = []
    this.collectNeighborNodes(x, y, this.root, nodes)
    return nodes
  }

  private collectNeighborNodes(x: number, y: number, node: QuadtreeNode, nodes: QuadtreeNode[]): void {
    // Simple bounds check - if node doesn't intersect with 3x3 area around (x,y), skip it
    if (node.x + node.width < x - 1 || node.x > x + 1 ||
        node.y + node.height < y - 1 || node.y > y + 1) {
      return
    }

    // If this node has cells or subdivided children, include it
    if (node.cells.size > 0) {
      nodes.push(node)
    }

    // Check children if they exist
    if (node.children) {
      for (const child of node.children) {
        this.collectNeighborNodes(x, y, child, nodes)
      }
    }
  }

  getActiveNodes(): QuadtreeNode[] {
    const nodes: QuadtreeNode[] = []
    this.collectActiveNodes(this.root, nodes)
    return nodes
  }

  private collectActiveNodes(node: QuadtreeNode, nodes: QuadtreeNode[]): void {
    if (node.cells.size > 0 || (node.children && node.children.length > 0)) {
      nodes.push(node)
    }

    if (node.children) {
      for (const child of node.children) {
        this.collectActiveNodes(child, nodes)
      }
    }
  }

  clear(): void {
    this.root.cells.clear()
    this.root.children = null
    this.root.isLeaf = true
  }

  copy(): QuadtreeGrid {
    const newGrid = new QuadtreeGrid(this.root.x, this.root.y, this.root.x + this.root.width, this.root.y + this.root.height, this.maxLevel, this.maxCellsPerNode)
    this.copyNode(this.root, newGrid.root)
    return newGrid
  }

  private copyNode(source: QuadtreeNode, target: QuadtreeNode): void {
    target.cells = new Set(source.cells)

    if (source.children) {
      target.children = []
      target.isLeaf = false

      for (const sourceChild of source.children) {
        const targetChild: QuadtreeNode = {
          x: sourceChild.x,
          y: sourceChild.y,
          width: sourceChild.width,
          height: sourceChild.height,
          cells: new Set(),
          children: null,
          level: sourceChild.level,
          isLeaf: true
        }
        target.children.push(targetChild)
        this.copyNode(sourceChild, targetChild)
      }
    }
  }

  // Get statistics for debugging
  getStats(): { totalNodes: number, totalCells: number, maxDepth: number } {
    let totalNodes = 0
    let totalCells = 0
    let maxDepth = 0

    const traverse = (node: QuadtreeNode, depth: number) => {
      totalNodes++
      totalCells += node.cells.size
      maxDepth = Math.max(maxDepth, depth)

      if (node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1)
        }
      }
    }

    traverse(this.root, 0)
    return { totalNodes, totalCells, maxDepth }
  }
}
