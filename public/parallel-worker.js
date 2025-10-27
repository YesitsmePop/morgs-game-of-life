// parallel-worker.js - Individual worker for parallel Game of Life processing
"use client"

function isPrime(n) {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

// Precomputed neighbor offsets for faster lookup
const NEIGHBOR_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

// Ultra-fast Game of Life for worker chunks
const nextGenerationWorker = (cells, mode) => {
  const newCells = new Set();

  // Create hash map of alive cells for O(1) lookup
  const aliveCells = new Set(cells);

  // Pre-allocate neighbor coordinates array for speed
  const neighborCoords = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  // Track all positions that need to be checked
  const positionsToCheck = new Set();

  // Add all alive cells and their neighbors
  aliveCells.forEach(cellKey => {
    const [x, y] = cellKey.split(',').map(Number);
    positionsToCheck.add(cellKey);

    // Add all 8 neighbor positions
    for (let j = 0; j < neighborCoords.length; j++) {
      const [dx, dy] = neighborCoords[j];
      positionsToCheck.add(`${x + dx},${y + dy}`);
    }
  });

  // Process all positions
  positionsToCheck.forEach(cellKey => {
    const [x, y] = cellKey.split(',').map(Number);
    const isAlive = aliveCells.has(cellKey);

    // Count neighbors
    let neighbors = 0;
    for (let j = 0; j < neighborCoords.length; j++) {
      const [dx, dy] = neighborCoords[j];
      if (aliveCells.has(`${x + dx},${y + dy}`)) neighbors++;
    }

    // Apply Conway's Game of Life rules
    let shouldBeAlive = false;
    if (mode === "classic") {
      shouldBeAlive = isAlive ? (neighbors === 2 || neighbors === 3) : (neighbors === 3);
    } else {
      shouldBeAlive = isAlive ? (neighbors === 6 || neighbors === 7) : isPrime(neighbors);
    }

    if (shouldBeAlive) {
      newCells.add(cellKey);
    }
  });

  return newCells;
};

// Worker message handler
self.onmessage = function(event) {
  const { type, data } = event.data;

  switch (type) {
    case 'PROCESS_TASK':
      try {
        const { cells, mode } = data;
        const newCells = nextGenerationWorker(cells, mode);

        // Calculate differences for incremental updates
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

        self.postMessage({
          type: 'TASK_COMPLETE',
          data: {
            taskId: data.id,
            newCells,
            born,
            died
          }
        });
      } catch (error) {
        self.postMessage({
          type: 'TASK_ERROR',
          data: {
            taskId: data.id,
            error: error.message
          }
        });
      }
      break;
  }
};
