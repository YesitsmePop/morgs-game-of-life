"use client"

import type React from "react"
import { useRef, useEffect, useCallback } from "react"

interface CellData {
  x: number
  y: number
  hue: number
}

interface WebGLRendererProps {
  cells: Set<string>
  blueprintCells?: Array<{ x: number; y: number; isBlueprint: boolean }>
  selectionBox?: { startX: number; startY: number; endX: number; endY: number } | null
  selectedCells?: Set<string>
  panX: number
  panY: number
  zoom: number
  hue: number
  showGrid: boolean
  width: number
  height: number
  onClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onMouseDown?: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onMouseMove?: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onMouseUp?: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onWheel?: (e: React.WheelEvent<HTMLCanvasElement>) => void
  onContextMenu?: (e: React.MouseEvent<HTMLCanvasElement>) => void
canvasRef?: React.RefObject<HTMLCanvasElement | null> | ((instance: HTMLCanvasElement | null) => void)
  className?: string
  isKeyboardPanning: boolean
  cursorOnCell: boolean
  gridUpdateKey?: number
  persistentSelection?: {
    box: { startX: number; startY: number; endX: number; endY: number }
    cells: Array<{ x: number; y: number }>
    rotation: number
    mirrorHorizontal: boolean
    mirrorVertical: boolean
  } | null
  isSelectingForExport?: boolean
}

const CELL_SIZE = 20

import { cellKey } from "@/lib/cell-utils"

export function WebGLRenderer({
  cells,
  blueprintCells = [],
  selectionBox,
  selectedCells = new Set(),
  panX,
  panY,
  zoom,
  hue,
  showGrid,
  width,
  height,
  onClick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  onContextMenu,
  canvasRef: externalCanvasRef,
  gridUpdateKey = 0,
  persistentSelection,
  isSelectingForExport = false
}: WebGLRendererProps) {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Handle external ref
  useEffect(() => {
    if (externalCanvasRef) {
      if (typeof externalCanvasRef === 'function') {
        externalCanvasRef(internalCanvasRef.current)
      } else if (externalCanvasRef.current !== internalCanvasRef.current) {
        (externalCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = internalCanvasRef.current
      }
    }
  }, [externalCanvasRef])
  
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null)
  const instanceBufferRef = useRef<WebGLBuffer | null>(null)
  const gridProgramRef = useRef<WebGLProgram | null>(null)
  const gridVaoRef = useRef<WebGLVertexArrayObject | null>(null)

  // Cached cell data for efficient rendering
  const cellDataRef = useRef<CellData[]>([])
  const lastCellsRef = useRef<Set<string>>(new Set())
  const lastViewBoundsRef = useRef({ startX: 0, startY: 0, endX: 0, endY: 0, width: 0, height: 0, zoom: 0 })

  // Cached grid buffers
  const gridBufferRef = useRef<WebGLBuffer | null>(null)
  const boundaryBufferRef = useRef<WebGLBuffer | null>(null)
  const lastGridVisibleRef = useRef<boolean>(false)

  // Initialize WebGL
  useEffect(() => {
    const canvas = internalCanvasRef.current
    if (!canvas) {
      console.log('Canvas not ready for WebGL initialization')
      return
    }

    console.log('Initializing WebGL context...')
    const gl = canvas.getContext('webgl2')
    if (!gl) {
      console.error('WebGL2 not supported')
      return
    }

    glRef.current = gl

    // Check for WebGL errors
    const error = gl.getError()
    if (error !== gl.NO_ERROR) {
      console.error('WebGL error during initialization:', error)
    }

    // Vertex shader for instanced cells
    const vertexShaderSource = `#version 300 es
      layout(location = 0) in vec2 a_position;
      layout(location = 1) in vec2 a_instancePosition;
      layout(location = 2) in float a_hue;

      uniform vec2 u_resolution;
      uniform vec2 u_pan;
      uniform float u_zoom;
      uniform float u_cellSize;

      out vec2 v_texCoord;
      out float v_hue;

      void main() {
        vec2 position = a_position * u_cellSize * u_zoom + a_instancePosition * u_cellSize * u_zoom + u_pan;
        vec2 clipSpace = (position / u_resolution) * 2.0 - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);

        v_texCoord = a_position;
        v_hue = a_hue;
      }
    `

    // Fragment shader for cells
    const fragmentShaderSource = `#version 300 es
      precision highp float;

      in vec2 v_texCoord;
      in float v_hue;

      out vec4 outColor;

      vec3 hslToRgb(float h, float s, float l) {
        float c = (1.0 - abs(2.0 * l - 1.0)) * s;
        float x = c * (1.0 - abs(mod(h / 60.0, 2.0) - 1.0));
        float m = l - c / 2.0;
        vec3 rgb = vec3(0.0);
        if (h >= 0.0 && h < 60.0) {
          rgb = vec3(c, x, 0.0);
        } else if (h >= 60.0 && h < 120.0) {
          rgb = vec3(x, c, 0.0);
        } else if (h >= 120.0 && h < 180.0) {
          rgb = vec3(0.0, c, x);
        } else if (h >= 180.0 && h < 240.0) {
          rgb = vec3(0.0, x, c);
        } else if (h >= 240.0 && h < 300.0) {
          rgb = vec3(x, 0.0, c);
        } else if (h >= 300.0 && h < 360.0) {
          rgb = vec3(c, 0.0, x);
        }
        return rgb + m;
      }

      void main() {
        // Special handling for selection fill (hue = 240) - make it transparent
        if (abs(v_hue - 240.0) < 0.1) {
          outColor = vec4(0.3, 0.5, 0.8, 0.3); // Blue transparent fill
          return;
        }

        // Special case for white (hue = 360 with different logic)
        vec3 color;
        if (abs(v_hue - 360.0) < 0.1) {
          color = vec3(0.9, 0.9, 0.95); // White cells
        } else {
          color = hslToRgb(v_hue, 0.7, 0.6);
        }

        outColor = vec4(color, 1.0);
      }
    `

    // Create shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)
    if (!vertexShader) return
    gl.shaderSource(vertexShader, vertexShaderSource)
    gl.compileShader(vertexShader)

    // Check for vertex shader compilation errors
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(vertexShader)
      console.error('Cell vertex shader compilation error:', error)
      return
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
    if (!fragmentShader) return
    gl.shaderSource(fragmentShader, fragmentShaderSource)
    gl.compileShader(fragmentShader)

    // Check for fragment shader compilation errors
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fragmentShader)
      console.error('Cell fragment shader compilation error:', error)
      return
    }

    // Create program
    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    // Check for program linking errors
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program)
      console.error('Cell program linking error:', error)
      return
    }

    console.log('Cell shaders compiled successfully')
    programRef.current = program

    // Create VAO
    const vao = gl.createVertexArray()
    if (!vao) return
    gl.bindVertexArray(vao)
    vaoRef.current = vao

    // Create vertex buffer for quad
    const vertexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1
    ]), gl.STATIC_DRAW)

    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    // Create instance buffer
    const instanceBuffer = gl.createBuffer()
    instanceBufferRef.current = instanceBuffer

    // Grid shader setup
    const gridVertexShader = gl.createShader(gl.VERTEX_SHADER)
    if (!gridVertexShader) return
    gl.shaderSource(gridVertexShader, `#version 300 es
      layout(location = 0) in vec2 a_position;
      uniform vec2 u_resolution;
      void main() {
        vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
      }
    `)
    gl.compileShader(gridVertexShader)

    // Check for vertex shader compilation errors
    if (!gl.getShaderParameter(gridVertexShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(gridVertexShader)
      console.error('Grid vertex shader compilation error:', error)
      return
    }

    const gridFragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
    if (!gridFragmentShader) return
    gl.shaderSource(gridFragmentShader, `#version 300 es
      precision highp float;
      out vec4 outColor;
      void main() {
        outColor = vec4(1.0, 1.0, 1.0, 0.3);
      }
    `)
    gl.compileShader(gridFragmentShader)

    // Check for fragment shader compilation errors
    if (!gl.getShaderParameter(gridFragmentShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(gridFragmentShader)
      console.error('Grid fragment shader compilation error:', error)
      return
    }

    const gridProgram = gl.createProgram()
    if (!gridProgram) return
    gl.attachShader(gridProgram, gridVertexShader)
    gl.attachShader(gridProgram, gridFragmentShader)
    gl.linkProgram(gridProgram)

    // Check for program linking errors
    if (!gl.getProgramParameter(gridProgram, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(gridProgram)
      console.error('Grid program linking error:', error)
      return
    }

    console.log('Grid shaders compiled successfully')
    gridProgramRef.current = gridProgram

    const gridVao = gl.createVertexArray()
    if (!gridVao) return
    gl.bindVertexArray(gridVao)
    gridVaoRef.current = gridVao

  }, [])

  // Update cached cell data when cells or other props change
  useEffect(() => {
    const cellSize = CELL_SIZE * zoom
    // Calculate viewport bounds more generously to ensure all visible cells are included
    const startX = Math.floor((-panX) / cellSize) - 3
    const startY = Math.floor((-panY) / cellSize) - 3
    const endX = Math.ceil((width - panX) / cellSize) + 3
    const endY = Math.ceil((height - panY) / cellSize) + 3

    const cellData: CellData[] = []

    // Add blueprint cells (preset preview) with translucent blue color
    blueprintCells.forEach(cell => {
      if (cell.x >= startX && cell.x <= endX && cell.y >= startY && cell.y <= endY) {
        cellData.push({ x: cell.x, y: cell.y, hue: 240 }) // Translucent blue for preset preview
      }
    })

    // Add regular cells efficiently
    cells.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number)
      if (x >= startX && x <= endX && y >= startY && y <= endY) {
        cellData.push({ x, y, hue })
      }
    })

    // Add persistent selection cells
    if (persistentSelection) {
      persistentSelection.cells.forEach(cell => {
        let transformedX = persistentSelection.box.startX + cell.x
        let transformedY = persistentSelection.box.startY + cell.y

        // Apply rotation
        if (persistentSelection.rotation !== 0) {
          const centerX = (Math.min(persistentSelection.box.startX, persistentSelection.box.endX) +
                          Math.max(persistentSelection.box.startX, persistentSelection.box.endX)) / 2
          const centerY = (Math.min(persistentSelection.box.startY, persistentSelection.box.endY) +
                          Math.max(persistentSelection.box.startY, persistentSelection.box.endY)) / 2

          const cos = Math.cos(persistentSelection.rotation * Math.PI / 180)
          const sin = Math.sin(persistentSelection.rotation * Math.PI / 180)

          const relX = transformedX - centerX
          const relY = transformedY - centerY

          transformedX = centerX + relX * cos - relY * sin
          transformedY = centerY + relX * sin + relY * cos
        }

        // Apply mirroring
        if (persistentSelection.mirrorHorizontal) {
          const minX = Math.min(persistentSelection.box.startX, persistentSelection.box.endX)
          const maxX = Math.max(persistentSelection.box.startX, persistentSelection.box.endX)
          transformedX = minX + maxX - transformedX
        }

        if (persistentSelection.mirrorVertical) {
          const minY = Math.min(persistentSelection.box.startY, persistentSelection.box.endY)
          const maxY = Math.max(persistentSelection.box.startY, persistentSelection.box.endY)
          transformedY = minY + maxY - transformedY
        }

        if (transformedX >= startX && transformedX <= endX && transformedY >= startY && transformedY <= endY) {
          cellData.push({ x: transformedX, y: transformedY, hue: 180 }) // Cyan for persistent selection cells
        }
      })
    }

    // Add selection box fill efficiently
    if (selectionBox) {
      const cellSize = CELL_SIZE * zoom

      // Detect if coordinates are pixel-based (large values) or grid-based (small values)
      const isPixelCoordinates = Math.max(
        Math.abs(selectionBox.startX),
        Math.abs(selectionBox.startY),
        Math.abs(selectionBox.endX),
        Math.abs(selectionBox.endY)
      ) > 1000

      if (isPixelCoordinates) {
        // Pixel coordinates - convert to grid coordinates for rendering
        const minPixelX = Math.min(selectionBox.startX, selectionBox.endX)
        const maxPixelX = Math.max(selectionBox.startX, selectionBox.endX)
        const minPixelY = Math.min(selectionBox.startY, selectionBox.endY)
        const maxPixelY = Math.max(selectionBox.startY, selectionBox.endY)

        // Convert pixel bounds to grid bounds
        const minX = Math.floor((minPixelX - panX) / cellSize)
        const maxX = Math.ceil((maxPixelX - panX) / cellSize)
        const minY = Math.floor((minPixelY - panY) / cellSize)
        const maxY = Math.ceil((maxPixelY - panY) / cellSize)

        console.log('Pixel selection bounds:', { minPixelX, maxPixelX, minPixelY, maxPixelY })
        console.log('Grid selection bounds:', { minX, maxX, minY, maxY })

        // Pre-calculate selection bounds
        const selStartX = Math.max(startX, minX)
        const selStartY = Math.max(startY, minY)
        const selEndX = Math.min(endX, maxX)
        const selEndY = Math.min(endY, maxY)

        // Use different color for export selection (orange) vs regular selection (blue)
        const selectionHue = isSelectingForExport ? 30 : 240

        for (let x = selStartX; x <= selEndX; x++) {
          for (let y = selStartY; y <= selEndY; y++) {
            const cellKey = `${x},${y}`
            if (!cells.has(cellKey) && !selectedCells.has(cellKey)) {
              cellData.push({ x, y, hue: selectionHue })
            }
          }
        }
      } else {
        // Grid coordinates
        const minX = Math.min(selectionBox.startX, selectionBox.endX)
        const maxX = Math.max(selectionBox.startX, selectionBox.endX)
        const minY = Math.min(selectionBox.startY, selectionBox.endY)
        const maxY = Math.max(selectionBox.startY, selectionBox.endY)

        // Pre-calculate selection bounds
        const selStartX = Math.max(startX, minX)
        const selStartY = Math.max(startY, minY)
        const selEndX = Math.min(endX, maxX)
        const selEndY = Math.min(endY, maxY)

        for (let x = selStartX; x <= selEndX; x++) {
          for (let y = selStartY; y <= selEndY; y++) {
            const cellKey = `${x},${y}`
            if (!cells.has(cellKey) && !selectedCells.has(cellKey)) {
              cellData.push({ x, y, hue: 240 }) // Blue for regular selection fill
            }
          }
        }
      }
    }

    cellDataRef.current = cellData
    lastCellsRef.current = cells
  }, [cells, blueprintCells, selectionBox, selectedCells, panX, panY, zoom, hue, width, height, persistentSelection, isSelectingForExport])

  const render = useCallback(() => {
    const gl = glRef.current
    const program = programRef.current
    const vao = vaoRef.current
    const gridProgram = gridProgramRef.current
    const gridVao = gridVaoRef.current

    if (!gl || !program || !vao || !gridProgram || !gridVao) return

    gl.viewport(0, 0, width, height)
    gl.clearColor(0.05, 0.05, 0.05, 1.0) // Dark gray background for better contrast
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Enable blending for transparency
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const cellData = cellDataRef.current

    if (cellData.length > 0) {
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBufferRef.current)

      // Reuse existing buffer if possible
      const neededSize = cellData.length * 3 * 4 // 3 floats * 4 bytes each
      if (instanceBufferRef.current && gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) >= neededSize) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(cellData.flatMap(c => [c.x, c.y, c.hue])))
      } else {
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cellData.flatMap(c => [c.x, c.y, c.hue])), gl.DYNAMIC_DRAW)
      }

      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 12, 0) // position
      gl.vertexAttribDivisor(1, 1)

      gl.enableVertexAttribArray(2)
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 12, 8) // hue
      gl.vertexAttribDivisor(2, 1)

      // Use cell program
      gl.useProgram(program)

      // Set uniforms
      const resolutionLoc = gl.getUniformLocation(program, 'u_resolution')
      const panLoc = gl.getUniformLocation(program, 'u_pan')
      const zoomLoc = gl.getUniformLocation(program, 'u_zoom')
      const cellSizeLoc = gl.getUniformLocation(program, 'u_cellSize')

      gl.uniform2f(resolutionLoc, width, height)
      gl.uniform2f(panLoc, panX, panY)
      gl.uniform1f(zoomLoc, zoom)
      gl.uniform1f(cellSizeLoc, CELL_SIZE)

      // Draw instances
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cellData.length)
    }

    // Draw grid if enabled
    if (showGrid) {
      renderGrid(gl, gridProgram, gridVao)
    }

  }, [width, height, panX, panY, zoom, showGrid, cells, blueprintCells, selectionBox, selectedCells, hue, persistentSelection, isSelectingForExport])

  useEffect(() => {
    render()
  }, [render])

  // Optimized grid rendering with caching
  const renderGrid = useCallback((gl: WebGL2RenderingContext, gridProgram: WebGLProgram, gridVao: WebGLVertexArrayObject) => {
    gl.useProgram(gridProgram)
    gl.bindVertexArray(gridVao)

    const cellSize = CELL_SIZE * zoom
    // Calculate viewport bounds more generously to ensure all visible cells are included
    const startX = Math.floor((-panX) / cellSize) - 3
    const startY = Math.floor((-panY) / cellSize) - 3
    const endX = Math.ceil((width - panX) / cellSize) + 3
    const endY = Math.ceil((height - panY) / cellSize) + 3

    // Generate grid lines only if view changed
    const gridLines: number[] = []

    // Vertical lines
    for (let x = startX; x <= endX; x++) {
      const screenX = x * cellSize + panX
      if (screenX >= 0 && screenX <= width) {
        gridLines.push(screenX, 0, screenX, height)
      }
    }

    // Horizontal lines
    for (let y = startY; y <= endY; y++) {
      const screenY = y * cellSize + panY
      if (screenY >= 0 && screenY <= height) {
        gridLines.push(0, screenY, width, screenY)
      }
    }

    if (gridLines.length > 0) {
      // Reuse buffer if it exists
      let gridBuffer = gridBufferRef.current
      if (!gridBuffer) {
        gridBuffer = gl.createBuffer()
        gridBufferRef.current = gridBuffer
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridLines), gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

      // Make grid lines thicker and more visible
      gl.lineWidth(1.5)
      gl.drawArrays(gl.LINES, 0, gridLines.length / 2)
      gl.lineWidth(1) // Reset line width
    }

    // Draw cached boundary lines
    renderBoundaries(gl, gridProgram, gridVao)
  }, [panX, panY, zoom, width, height])

  // Optimized boundary rendering with caching
  const renderBoundaries = useCallback((gl: WebGL2RenderingContext, gridProgram: WebGLProgram, gridVao: WebGLVertexArrayObject) => {
    const cellSize = CELL_SIZE * zoom

    const gridBounds = [
      // Left boundary
      -4096 * cellSize + panX, 0,
      -4096 * cellSize + panX, height,
      // Right boundary
      4096 * cellSize + panX, 0,
      4096 * cellSize + panX, height,
      // Top boundary
      0, -4096 * cellSize + panY,
      width, -4096 * cellSize + panY,
      // Bottom boundary
      0, 4096 * cellSize + panY,
      width, 4096 * cellSize + panY
    ]

    if (gridBounds.length > 0) {
      // Reuse buffer if it exists
      let boundaryBuffer = boundaryBufferRef.current
      if (!boundaryBuffer) {
        boundaryBuffer = gl.createBuffer()
        boundaryBufferRef.current = boundaryBuffer
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, boundaryBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridBounds), gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

      // Draw thicker lines for boundaries
      gl.lineWidth(3)
      gl.drawArrays(gl.LINES, 0, gridBounds.length / 2)
      gl.lineWidth(1) // Reset line width
    }
  }, [panX, panY, zoom, width, height])

  useEffect(() => {
    render()
  }, [render, gridUpdateKey])

  return (
    <canvas
      ref={internalCanvasRef}
      width={width}
      height={height}
      className="absolute inset-0 w-full h-full"
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
    />
  )
}
