// WebGL 2.0 GPU compute for massive patterns

// Object Pool
class ObjectPool {
  constructor(createFn, resetFn, initialSize = 10, maxSize = 100) {
    this.available = [];
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;

    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.available.push(this.createFn());
    }
  }

  acquire() {
    const obj = this.available.pop();
    if (obj) {
      return obj;
    }
    // Pool exhausted, create new one
    return this.createFn();
  }

  release(obj) {
    if (this.available.length < this.maxSize) {
      if (this.resetFn) {
        this.resetFn(obj);
      }
      this.available.push(obj);
    }
    // If pool is full, let object be garbage collected
  }

  size() {
    return this.available.length;
  }

  clear() {
    this.available.length = 0;
  }
}

// Quadtree Grid
class QuadtreeGrid {
  constructor(minX = -1024, minY = -1024, maxX = 1024, maxY = 1024, maxLevel = 6, maxCellsPerNode = 8) {
    this.maxLevel = maxLevel;
    this.maxCellsPerNode = maxCellsPerNode;

    this.root = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      cells: new Set(),
      children: null,
      level: 0,
      isLeaf: true
    };
  }

  getNodeKey(x, y) {
    return `${Math.floor(x)},${Math.floor(y)}`;
  }

  shouldSubdivide(node) {
    return node.level < this.maxLevel && node.cells.size > this.maxCellsPerNode;
  }

  subdivide(node) {
    if (!node.isLeaf || node.children) return;

    node.isLeaf = false;
    node.children = [];

    const halfWidth = Math.floor(node.width / 2);
    const halfHeight = Math.floor(node.height / 2);
    const secondHalfWidth = node.width - halfWidth;
    const secondHalfHeight = node.height - halfHeight;

    // Pre-calculate child boundaries for efficiency
    const childrenData = [
      { x: node.x, y: node.y, width: halfWidth, height: halfHeight },           // NW
      { x: node.x + halfWidth, y: node.y, width: secondHalfWidth, height: halfHeight }, // NE
      { x: node.x, y: node.y + halfHeight, width: halfWidth, height: secondHalfHeight }, // SW
      { x: node.x + halfWidth, y: node.y + halfHeight, width: secondHalfWidth, height: secondHalfHeight } // SE
    ];

    // Create children with minimal overhead
    for (let i = 0; i < 4; i++) {
      const child = childrenData[i];
      const childNode = {
        x: child.x,
        y: child.y,
        width: child.width,
        height: child.height,
        cells: new Set(),
        children: null,
        level: node.level + 1,
        isLeaf: true
      };
      node.children.push(childNode);

      // Redistribute cells to appropriate child nodes efficiently
      const cellsToMove = [];
      node.cells.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number);
        if (this.pointInNode(x, y, childNode)) {
          cellsToMove.push(cellKey);
        }
      });

      // Move cells in batch
      cellsToMove.forEach(cellKey => {
        node.cells.delete(cellKey);
        childNode.cells.add(cellKey);
      });
    }
  }

  pointInNode(x, y, node) {
    return x >= node.x && x < node.x + node.width &&
           y >= node.y && y < node.y + node.height;
  }

  merge(node) {
    if (node.isLeaf || !node.children) return;

    let totalCells = 0;
    let canMerge = true;

    // Check if all children are leaves and count total cells
    for (const child of node.children) {
      if (!child.isLeaf) {
        canMerge = false;
        break;
      }
      totalCells += child.cells.size;
    }

    if (canMerge && totalCells <= this.maxCellsPerNode) {
      // Collect all cells from children
      const allChildCells = new Set();
      for (const child of node.children) {
        child.cells.forEach(cellKey => allChildCells.add(cellKey));
      }

      // Move all cells to parent
      node.cells = allChildCells;
      node.children = null;
      node.isLeaf = true;
    }
  }

  add(x, y) {
    // Early bounds check to avoid unnecessary work
    if (x < this.root.x || x >= this.root.x + this.root.width ||
        y < this.root.y || y >= this.root.y + this.root.height) {
      return; // Cell is outside valid range
    }

    const key = this.getNodeKey(x, y);
    let node = this.root;

    // Optimized traversal with early termination
    const maxDepth = this.maxLevel;
    let depth = 0;

    while (!node.isLeaf && node.children && depth < maxDepth) {
      let foundChild = false;
      for (const child of node.children) {
        if (this.pointInNode(x, y, child)) {
          node = child;
          foundChild = true;
          depth++;
          break;
        }
      }
      if (!foundChild) break;
    }

    node.cells.add(key);

    if (this.shouldSubdivide(node)) {
      this.subdivide(node);
    }
  }

  remove(x, y) {
    // Early bounds check to avoid unnecessary work
    if (x < this.root.x || x >= this.root.x + this.root.width ||
        y < this.root.y || y >= this.root.y + this.root.height) {
      return; // Cell is outside valid range
    }

    const key = this.getNodeKey(x, y);
    this.removeFromNode(key, this.root);
  }

  removeFromNode(key, node) {
    if (node.cells.has(key)) {
      node.cells.delete(key);

      // Try to merge if we have children
      if (node.children) {
        this.merge(node);
      }

      return true;
    }

    if (node.children) {
      for (const child of node.children) {
        if (this.removeFromNode(key, child)) {
          this.merge(node);
          return true;
        }
      }
    }

    return false;
  }

  has(x, y) {
    // Early bounds check to avoid unnecessary work
    if (x < this.root.x || x >= this.root.x + this.root.width ||
        y < this.root.y || y >= this.root.y + this.root.height) {
      return false; // Cell is outside valid range
    }

    const key = this.getNodeKey(x, y);
    return this.hasInNode(key, this.root);
  }

  hasInNode(key, node) {
    if (node.cells.has(key)) {
      return true;
    }

    if (node.children) {
      for (const child of node.children) {
        const [nodeX, nodeY] = key.split(',').map(Number);
        if (this.pointInNode(nodeX, nodeY, child)) {
          return this.hasInNode(key, child);
        }
      }
    }

    return false;
  }

  getAllCells() {
    const allCells = new Set();

    // Use iterative approach instead of recursive for better performance
    const stack = [this.root];

    while (stack.length > 0) {
      const node = stack.pop();

      // Add cells from this node
      node.cells.forEach(cell => allCells.add(cell));

      // Add children to stack if they exist
      if (node.children) {
        stack.push(...node.children);
      }
    }

    return allCells;
  }

  clear() {
    // Use iterative approach instead of recursive for better performance
    const stack = [this.root];

    while (stack.length > 0) {
      const node = stack.pop();

      node.cells.clear();

      if (node.children) {
        stack.push(...node.children);
        node.children = null;
      }

      node.isLeaf = true;
    }
  }
}

// Object pool for QuadtreeGrid objects
const gridPool = new ObjectPool(
  () => new QuadtreeGrid(),
  (grid) => grid.clear(),
  10,  // Initial pool size (increased from 5)
  30   // Max pool size (increased from 20)
);

// Prime Check
function isPrime(n) {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

// Neighbor Offsets
const NEIGHBOR_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];
const NEIGHBOR_COUNT = NEIGHBOR_OFFSETS.length;

// Optimized Game of Life - streamlined for speed
const nextGenerationOptimized = (cells, mode) => {
  const newCells = new Set();
  const aliveCells = new Set(cells);

  // Pre-calculate bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  aliveCells.forEach(cellKey => {
    const [x, y] = cellKey.split(',').map(Number);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  const bounds = {
    minX: minX - 1,
    maxX: maxX + 1,
    minY: minY - 1,
    maxY: maxY + 1
  };

  // Use Map for efficient processing with pre-allocated neighbor arrays
  const cellsToCheck = new Map();
  const neighborKeys = new Array(8);

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const cellKey = `${x},${y}`;
      cellsToCheck.set(cellKey, { x, y, isAlive: aliveCells.has(cellKey) });
    }
  }

  // Process with optimized loops
  for (const [cellKey, cellData] of cellsToCheck) {
    const { x, y } = cellData;
    const isAlive = cellData.isAlive;

    let neighbors = 0;
    for (let j = 0; j < NEIGHBOR_COUNT; j++) {
      const [dx, dy] = NEIGHBOR_OFFSETS[j];
      neighborKeys[j] = `${x + dx},${y + dy}`;
      if (aliveCells.has(neighborKeys[j])) neighbors++;
    }

    let shouldBeAlive = false;
    if (mode === "classic") {
      shouldBeAlive = isAlive ? (neighbors === 2 || neighbors === 3) : (neighbors === 3);
    } else {
      shouldBeAlive = isAlive ? (neighbors === 6 || neighbors === 7) : isPrime(neighbors);
    }

    if (shouldBeAlive) {
      newCells.add(cellKey);
    }
  }

  return newCells;
};

// Ultra-fast bit-packed grid for massive patterns (100k+ cells)
class MassiveBitGrid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.rowSize = Math.ceil(width / 32);
    this.data = new Uint32Array(this.rowSize * height);
  }

  // Ultra-fast neighbor counting using bitwise operations
  countNeighborsFast(x, y) {
    let count = 0;

    // Pre-calculate bit positions for speed
    const wordIndex = y * this.rowSize + Math.floor(x / 32);
    const bitIndex = x % 32;

    // Check all 8 neighbors using fast bit operations
    const offsets = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];

    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        const nWordIndex = ny * this.rowSize + Math.floor(nx / 32);
        const nBitIndex = nx % 32;
        const mask = 1 << nBitIndex;

        if (this.data[nWordIndex] & mask) count++;
      }
    }

    return count;
  }

  // Ultra-fast next generation for massive patterns - optimized for speed
  nextGenerationMassive(mode = 'classic') {
    const newGrid = new MassiveBitGrid(this.width, this.height);

    // Track active regions for later reuse in toCells
    const activeRegions = new Set();
    let hasActiveCells = false;

    // Single pass to collect active regions and process cells
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y)) {
          hasActiveCells = true;
          activeRegions.add(`${Math.floor(x / 64)},${Math.floor(y / 64)}`);
        }
      }
    }

    // If no active cells, return empty grid immediately
    if (!hasActiveCells) {
      return newGrid;
    }

    // Process active regions with optimized loops
    activeRegions.forEach(regionKey => {
      const [blockX, blockY] = regionKey.split(',').map(Number);
      const endY = Math.min((blockY + 1) * 64, this.height);
      const endX = Math.min((blockX + 1) * 64, this.width);

      for (let by = blockY * 64; by < endY; by++) {
        for (let bx = blockX * 64; bx < endX; bx++) {
          const neighbors = this.countNeighborsFast(bx, by);
          const alive = this.get(bx, by);

          let shouldBeAlive = false;
          if (mode === "classic") {
            shouldBeAlive = alive ? (neighbors === 2 || neighbors === 3) : (neighbors === 3);
          } else {
            shouldBeAlive = alive ? (neighbors === 6 || neighbors === 7) : isPrime(neighbors);
          }

          newGrid.set(bx, by, shouldBeAlive);
        }
      }
    });

    // Store active regions for toCells optimization
    newGrid._activeRegions = activeRegions;

    return newGrid;
  }

  // Convert (x, y) coordinates to bit position
  getBitIndex(x, y) {
    const wordIndex = y * this.rowSize + Math.floor(x / 32);
    const bitIndex = x % 32;
    return { wordIndex, bitIndex };
  }

  // Set a cell to alive (1) or dead (0) - ultra fast
  set(x, y, alive) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

    const { wordIndex, bitIndex } = this.getBitIndex(x, y);
    const mask = 1 << bitIndex;

    if (alive) {
      this.data[wordIndex] |= mask;
    } else {
      this.data[wordIndex] &= ~mask;
    }
  }

  // Check if a cell is alive - ultra fast
  get(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;

    const { wordIndex, bitIndex } = this.getBitIndex(x, y);
    const mask = 1 << bitIndex;
    return (this.data[wordIndex] & mask) !== 0;
  }

  // Convert from a Set of cell coordinates - ultra-optimized
  static fromCells(cells, width = 2050, height = 2050) {
    const grid = new MassiveBitGrid(width, height);

    // Pre-calculate offset for maximum performance
    const offset = 1024;

    // Process cells in batches for better cache locality
    const cellArray = Array.from(cells);
    const batchSize = 1000;

    for (let i = 0; i < cellArray.length; i += batchSize) {
      const batch = cellArray.slice(i, i + batchSize);
      batch.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number);
        const transformedX = x + offset;
        const transformedY = y + offset;

        if (transformedX >= 0 && transformedX < width && transformedY >= 0 && transformedY < height) {
          grid.set(transformedX, transformedY, true);
        }
      });
    }

    return grid;
  }

  // Convert to a Set of cell coordinates - ultra-optimized version
  toCells() {
    const cells = new Set();

    // Use stored active regions if available (from nextGenerationMassive)
    const activeRegions = this._activeRegions;
    if (activeRegions) {
      // Process each active region efficiently
      activeRegions.forEach(regionKey => {
        const [blockX, blockY] = regionKey.split(',').map(Number);
        const endY = Math.min((blockY + 1) * 64, this.height);
        const endX = Math.min((blockX + 1) * 64, this.width);

        for (let by = blockY * 64; by < endY; by++) {
          for (let bx = blockX * 64; bx < endX; bx++) {
            if (this.get(bx, by)) {
              // Transform coordinates back from MassiveBitGrid range (0 to 2048) to QuadtreeGrid range (-1024 to +1024)
              const originalX = Math.floor(bx - 1024); // Use Math.floor for consistency
              const originalY = Math.floor(by - 1024);
              cells.add(`${originalX},${originalY}`);
            }
          }
        }
      });
    } else {
      // Fallback: scan entire grid (should rarely happen)
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          if (this.get(x, y)) {
            const originalX = Math.floor(x - 1024);
            const originalY = Math.floor(y - 1024);
            cells.add(`${originalX},${originalY}`);
          }
        }
      }
    }

    return cells;
  }

  // Get the number of alive cells - fast popcount
  getCellCount() {
    let count = 0;
    for (let i = 0; i < this.data.length; i++) {
      let word = this.data[i];
      // Fast popcount for 32-bit words
      word = word - ((word >>> 1) & 0x55555555);
      word = (word & 0x33333333) + ((word >>> 2) & 0x33333333);
      count += ((word + (word >>> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
    }
    return count;
  }

  // Clear the grid
  clear() {
    this.data.fill(0);
    // Reset active regions cache
    this._activeRegions = undefined;
  }

  // Create a copy - ultra-optimized
  copy() {
    const newGrid = new MassiveBitGrid(this.width, this.height);
    // Use fast array copy instead of set
    newGrid.data = new Uint32Array(this.data);
    return newGrid;
  }
}

// Ultra-fast Game of Life using massive bit-packed grid (100k+ cells)
const nextGenerationMassive = (cells, mode = 'classic') => {
  const cellCount = cells.size;

  // Use massive bit grid for 100k+ cells
  if (cellCount > 100000) {
    const bitGrid = MassiveBitGrid.fromCells(cells, 2050, 2050);
    const newBitGrid = bitGrid.nextGenerationMassive(mode);
    return newBitGrid.toCells();
  }

  // Fall back to ultra-fast for 20k-100k cells
  if (cellCount > 20000) {
    return nextGenerationUltraFast(cells, mode);
  }

  // Use optimized for smaller patterns
  return nextGenerationOptimized(cells, mode);
};

// Ultra-fast Game of Life - optimized for maximum speed
const nextGenerationUltraFast = (cells, mode) => {
  const newCells = new Set();
  const aliveCells = new Set(cells);

  // Pre-calculate bounds for maximum performance
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  aliveCells.forEach(cellKey => {
    const [x, y] = cellKey.split(',').map(Number);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  // Expand bounds efficiently
  const bounds = {
    minX: minX - 1,
    maxX: maxX + 1,
    minY: minY - 1,
    maxY: maxY + 1
  };

  // Pre-allocate arrays for neighbor checking to avoid repeated string creation
  const neighborKeys = new Array(8);
  const neighborOffsets = NEIGHBOR_OFFSETS;

  // Process all cells in bounds with minimal overhead
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const cellKey = `${x},${y}`;
      const isAlive = aliveCells.has(cellKey);

      // Optimized neighbor counting with pre-allocated arrays
      let neighbors = 0;
      for (let j = 0; j < NEIGHBOR_COUNT; j++) {
        const [dx, dy] = neighborOffsets[j];
        // Use pre-allocated array to avoid repeated string creation
        neighborKeys[j] = `${x + dx},${y + dy}`;
        if (aliveCells.has(neighborKeys[j])) neighbors++;
      }

      // Apply rules
      let shouldBeAlive = false;
      if (mode === "classic") {
        shouldBeAlive = isAlive ? (neighbors === 2 || neighbors === 3) : (neighbors === 3);
      } else {
        shouldBeAlive = isAlive ? (neighbors === 6 || neighbors === 7) : isPrime(neighbors);
      }

      if (shouldBeAlive) {
        newCells.add(cellKey);
      }
    }
  }

  return newCells;
};

// Simple Algorithm
const nextGenerationSimple = (cells, mode) => {
  const newCells = new Set();

  // Find bounds to optimize processing
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  cells.forEach(cellKey => {
    const [x, y] = cellKey.split(',').map(Number);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  // Expand bounds for neighbor checking
  const bounds = {
    minX: minX - 1,
    maxX: maxX + 1,
    minY: minY - 1,
    maxY: maxY + 1
  };

  // Process all cells in expanded bounds
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const neighbors = countNeighborsSimple(cells, x, y);
      const isAlive = cells.has(`${x},${y}`);

      let shouldBeAlive = false;
      if (mode === "classic") {
        shouldBeAlive = isAlive ? (neighbors === 2 || neighbors === 3) : (neighbors === 3);
      } else {
        shouldBeAlive = isAlive ? (neighbors === 6 || neighbors === 7) : isPrime(neighbors);
      }

      if (shouldBeAlive) {
        newCells.add(`${x},${y}`);
      }
    }
  }

  return newCells;
};

// Count Neighbors Simple - optimized
const countNeighborsSimple = (cells, x, y) => {
  let count = 0;
  for (let j = 0; j < NEIGHBOR_COUNT; j++) {
    const [dx, dy] = NEIGHBOR_OFFSETS[j];
    if (cells.has(`${x + dx},${y + dy}`)) count++;
  }
  return count;
};

// Next Generation With Diff
const nextGenerationWithDiff = (grid, mode) => {
  const startTime = performance.now();

  // Convert quadtree cells to set for adaptive computation
  const cells = grid.getAllCells();
  const cellCount = cells.size;

  let newCells;
  let algorithm = 'simple';

  // Select algorithm based on cell count only (removed state.speed dependency)
  if (cellCount > 50000) {
    algorithm = 'massive';
    newCells = nextGenerationMassive(cells, mode);
  } else if (cellCount > 5000) {
    algorithm = 'ultraFast';
    newCells = nextGenerationUltraFast(cells, mode);
  } else if (cellCount > 1000) {
    algorithm = 'optimized';
    newCells = nextGenerationOptimized(cells, mode);
  } else {
    algorithm = 'simple';
    newCells = nextGenerationSimple(cells, mode);
  }

  // Convert back to quadtree using pool
  const newGrid = gridPool.acquire();
  newCells.forEach(cellKey => {
    const [x, y] = cellKey.split(',').map(Number);
    newGrid.add(x, y);
  });

  // Calculate differences
  const born = [];
  const died = [];

  newCells.forEach(cellKey => {
    if (!cells.has(cellKey)) {
      born.push(cellKey);
    }
  });

  cells.forEach(cellKey => {
    if (!newCells.has(cellKey)) {
      died.push(cellKey);
    }
  });

  const totalTime = performance.now() - startTime;
  updatePerformanceStats(algorithm, totalTime, cellCount);

  return { newGrid, born, died };
};

// Performance profiling
let perfStats = {
  frameCount: 0,
  totalTime: 0,
  algorithmTimes: {
    massive: 0,
    ultraFast: 0,
    optimized: 0,
    simple: 0
  },
  algorithmCounts: {
    massive: 0,
    ultraFast: 0,
    optimized: 0,
    simple: 0
  }
};

// Performance monitoring function
function updatePerformanceStats(algorithm, time, cellCount) {
  perfStats.frameCount++;
  perfStats.totalTime += time;
  perfStats.algorithmTimes[algorithm] += time;
  perfStats.algorithmCounts[algorithm]++;

  // Log performance stats every 100 frames
  if (perfStats.frameCount % 100 === 0) {
    const avgTime = perfStats.totalTime / perfStats.frameCount;
    console.log(`Performance Stats (avg ${avgTime.toFixed(2)}ms/frame, ${cellCount} cells):`);
    Object.keys(perfStats.algorithmTimes).forEach(alg => {
      const count = perfStats.algorithmCounts[alg];
      if (count > 0) {
        const avgAlgTime = perfStats.algorithmTimes[alg] / count;
        console.log(`  ${alg}: ${count} frames, ${avgAlgTime.toFixed(2)}ms avg`);
      }
    });
  }
}

// Memory pool for massive bit grids (reduces GC pressure)
class MassiveBitGridPool {
  constructor(createFn, resetFn, initialSize = 2, maxSize = 5) {
    this.available = [];
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;

    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.available.push(this.createFn());
    }
  }

  acquire() {
    const obj = this.available.pop();
    if (obj) {
      return obj;
    }
    // Pool exhausted, create new one
    return this.createFn();
  }

  release(obj) {
    if (this.available.length < this.maxSize) {
      if (this.resetFn) {
        this.resetFn(obj);
      }
      this.available.push(obj);
    }
    // If pool is full, let object be garbage collected
  }

  size() {
    return this.available.length;
  }
}

// Massive bit grid pool for 100k+ patterns
const massiveGridPool = new MassiveBitGridPool(
  () => new MassiveBitGrid(2050, 2050),
  (grid) => grid.clear(),
  5,  // Initial pool size (increased from 2)
  10  // Max pool size (increased from 5)
);

let animationId = null;

// Batch updates for efficient rendering - simplified for reliability
const batchUpdate = (born, died) => {
  const now = performance.now();

  // Always flush immediately at high speeds to prevent visual lag
  if (state.speed < 100) {
    // Send update immediately for high speeds
    self.postMessage({
      type: 'GRID_UPDATE',
      data: {
        born: born,
        died: died,
        timestamp: now
      }
    });
    state.lastRenderTime = now;
    return;
  }

  // For slower speeds, use batching
  state.pendingUpdates.push({ born, died, timestamp: now, speed: state.speed });

  // Flush if too many updates or render interval reached
  if (state.pendingUpdates.length > 3 || now - state.lastRenderTime >= state.renderInterval) {
    flushUpdates();
  }
};

const flushUpdates = () => {
  if (state.pendingUpdates.length === 0) return;

  // Use Maps for O(1) deduplication instead of arrays
  const bornMap = new Map();
  const diedMap = new Map();
  let latestTimestamp = 0;

  // Process all updates in a single pass
  state.pendingUpdates.forEach(update => {
    latestTimestamp = Math.max(latestTimestamp, update.timestamp);

    // Add born cells to map (later timestamps override earlier ones)
    update.born.forEach(cell => bornMap.set(cell, update.timestamp));

    // Add died cells to map (later timestamps override earlier ones)
    update.died.forEach(cell => diedMap.set(cell, update.timestamp));
  });

  // Find cells that appear in both born and died maps (cancelled operations)
  const cancelledCells = new Set();
  bornMap.forEach((bornTime, cell) => {
    if (diedMap.has(cell)) {
      // Keep the one with the later timestamp
      const diedTime = diedMap.get(cell);
      if (bornTime > diedTime) {
        diedMap.delete(cell); // Remove from died, keep in born
      } else {
        bornMap.delete(cell); // Remove from born, keep in died
        cancelledCells.add(cell);
      }
    }
  });

  // Convert maps back to arrays for sending
  const finalBorn = Array.from(bornMap.keys());
  const finalDied = Array.from(diedMap.keys()).filter(cell => !cancelledCells.has(cell));

  // Send combined update to main thread
  self.postMessage({
    type: 'GRID_UPDATE',
    data: {
      born: finalBorn,
      died: finalDied,
      timestamp: latestTimestamp,
      speed: state.speed // Include speed for main thread batching decisions
    }
  });

  state.pendingUpdates = [];
  state.lastRenderTime = performance.now();
};

// Worker Message Handler
self.onmessage = function(event) {
  const { type, data } = event.data;

  switch (type) {
    case 'INIT':
      sendStateUpdate();
      break;

    case 'START':
      startSimulation();
      break;

    case 'STOP':
      stopSimulation();
      break;

    case 'RESET':
      resetSimulation();
      break;

    case 'SET_MODE':
      state.mode = data.mode;
      sendStateUpdate();
      break;

    case 'SET_SPEED':
      state.speed = data.speed;
      sendStateUpdate();
      break;

    case 'LOAD_PRESET':
      loadPreset(data.cells);
      break;

    case 'UPDATE_GRID':
      updateGrid(data.cellsToAdd, data.cellsToRemove);
      break;

    case 'GET_STATE':
      sendStateUpdate();
      break;
  }
};

// Start Simulation
function startSimulation() {
  if (state.isRunning) {
    return;
  }

  state.isRunning = true;
  state.lastUpdateTime = performance.now();
  state.lastStateUpdateTime = performance.now();
  sendStateUpdate();

  // Schedule the first animation frame
  if (!animationId) {
    animationId = requestAnimationFrame(animate);
  }
}

// Stop Simulation
function stopSimulation() {
  state.isRunning = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  sendStateUpdate();
}

// Reset Simulation
function resetSimulation() {
  stopSimulation();
  const oldGrid = state.grid;
  state.grid = gridPool.acquire();
  state.lastUpdateTime = 0;
  state.lastStateUpdateTime = 0;

  // Release old grid back to pool
  gridPool.release(oldGrid);

  sendStateUpdate();
}

// Load Preset
function loadPreset(cells) {
  const oldGrid = state.grid;
  state.grid = gridPool.acquire();

  cells.forEach(cell => {
    state.grid.add(cell.x, cell.y);
  });

  // Release old grid back to pool
  gridPool.release(oldGrid);

  sendStateUpdate();
}

// Update Grid
function updateGrid(cellsToAdd, cellsToRemove) {
  cellsToRemove.forEach(cell => {
    state.grid.remove(cell.x, cell.y);
  });
  cellsToAdd.forEach(cell => {
    state.grid.add(cell.x, cell.y);
  });
  sendStateUpdate();
}

// Animate - optimized for high speed performance
function animate() {
  // Check isRunning immediately to prevent race conditions
  if (!state.isRunning) {
    return;
  }

  const now = performance.now();

  try {
    // Use the maximum speed calculation: interval = 1000 / (1 + 39 * (speedSlider / 100))
    const interval = state.speed;

    if (now - state.lastUpdateTime >= interval) {
      const startTime = performance.now();

      const oldGrid = state.grid;
      const cells = oldGrid.getAllCells();
      const cellCount = cells.size;
      const { newGrid, born, died } = nextGenerationWithDiff(oldGrid, state.mode);

      state.grid = newGrid;
      state.lastUpdateTime = now;

      // Release the old grid back to the pool
      gridPool.release(oldGrid);

      // Batch update with optimized flushing for high speed
      const shouldFlushNow = state.speed < 100 || now - state.lastRenderTime >= 16;
      if (shouldFlushNow) {
        // Immediate flush at very high speeds
        self.postMessage({
          type: 'GRID_UPDATE',
          data: {
            born: born,
            died: died,
            timestamp: now,
            speed: state.speed // Include speed for main thread to decide batching
          }
        });
        state.lastRenderTime = now;
      } else {
        // Batch update for slower speeds
        batchUpdate(born, died);
      }

      // Performance monitoring - only log at high speeds to avoid overhead
      const computationTime = performance.now() - startTime;
      if (computationTime > (state.speed < 100 ? 25 : 50)) {
        console.warn(`Slow frame: ${computationTime.toFixed(2)}ms for ${cellCount} cells`);
      }
    }

    // Send state updates at reduced frequency for high speeds
    const stateUpdateInterval = state.speed < 100 ? 100 : 200;
    if (now - state.lastStateUpdateTime >= stateUpdateInterval) {
      state.lastStateUpdateTime = now;
      sendStateUpdate();
    }

    // Schedule next frame
    if (state.isRunning) {
      animationId = requestAnimationFrame(animate);
    }
  } catch (error) {
    console.error('Animation error:', error);
    state.isRunning = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    sendStateUpdate();
  }
}

function sendStateUpdate() {
  self.postMessage({
    type: 'STATE_UPDATE',
    data: {
      isRunning: state.isRunning,
      speed: state.speed,
      cellCount: state.grid.getAllCells().size
    }
  });
}

// Worker state - optimized for high speed
let state = {
  grid: gridPool.acquire(),
  mode: 'classic',
  speed: 1000,
  isRunning: false,
  lastUpdateTime: 0,
  lastStateUpdateTime: 0,
  lastRenderTime: 0,
  pendingUpdates: [],
  renderInterval: 16, // 60fps for high speeds
  stateUpdateInterval: 100, // More frequent state updates for high speeds
};
