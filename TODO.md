# Game of Life Optimization TODO

## Phase 1: Core Infrastructure
- [x] Create `lib/spatial-grid.ts` - Implement chunk-based spatial partitioning
- [x] Create `lib/pattern-cache.ts` - Add pattern memoization for small configurations
- [x] Create `components/webgl-renderer.tsx` - WebGL2 instanced rendering component

## Phase 2: Algorithm Optimization
- [x] Modify `nextGeneration` function to use spatial partitioning (O(active_chunks) instead of O(n))
- [x] Integrate pattern caching into evolution logic

## Phase 3: Rendering Optimization
- [x] Update simulation.tsx to use WebGL renderer instead of Canvas 2D
- [x] Reduce MIN_ZOOM from 0.5 to 0.01 for extreme zoom out capability

## Phase 4: Integration & Testing
- [x] Refactor simulation.tsx to use new SpatialGrid class
- [x] Preserve all existing features (presets, selection, controls, color cycling)
- [x] Test with large patterns (thousands of cells) for performance gains
- [x] Benchmark before/after performance improvements
- [x] Ensure compatibility with all existing functionality

## Phase 5: Cleanup
- [x] Remove old Canvas 2D rendering code
- [x] Optimize memory usage and cleanup unused references
- [x] Final performance testing and optimization

## Restore Optimized Version
- [ ] Refactor simulation.tsx to use SpatialGrid, PatternCache, nextGenerationOptimized
- [ ] Replace Canvas 2D with WebGLRenderer component
- [ ] Set MIN_ZOOM to 0.01 for extended zoom capability
- [ ] Add import/export button in bottom left
- [ ] Integrate ImportExport modal for custom presets
- [ ] Add "Custom" tab in presets dropdown for imported presets
- [ ] Update all grid operations to use SpatialGrid methods
- [ ] Test WebGL rendering, performance, import/export, extended zoom

## Selection Tool Implementation
- [ ] Modify WebGL renderer to render persistent selection box as filled blue transparent rectangle
- [ ] Add handle circle rendering in WebGL renderer
- [ ] Update simulation selection logic to keep selectionBox after drag completion
- [ ] Add handle detection and dragging logic in simulation
- [ ] Implement movement of selected cells when dragging handle
- [ ] Add deselection on click outside selection area
- [ ] Remove magenta selected cells rendering
- [ ] Test the new selection functionality
