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
- [x] Modify WebGL renderer to render persistent selection box as filled blue transparent rectangle
- [x] Add handle circle rendering in WebGL renderer (no knobs, only floating buttons)
- [x] Update simulation selection logic to keep selectionBox after drag completion
- [x] Add handle detection and dragging logic in simulation
- [x] Implement movement of selected cells when dragging handle (click anywhere in selection area)
- [x] Add deselection on click outside selection area
- [x] Remove blue knob and allow dragging by clicking anywhere in selection area
- [x] Replace yellow/green knobs with floating mirror buttons above selection
- [x] Replace red rotate knob with floating rotate button
- [x] Improve selection cropping to use actual cell bounds instead of drag box
- [x] Add purple duplicate button to create copy of selection to the right
- [x] Test the new selection functionality
- [x] Add rotation functionality (90-degree increments)
- [x] Add mirroring functionality (horizontal and vertical)
- [x] Apply transformations when placing cells back to grid
