"use client"

import type React from "react"

import { useRef, useEffect, useCallback } from "react"

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
  onMouseLeave?: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onWheel?: (e: React.WheelEvent<HTMLCanvasElement>) => void
  onContextMenu?: (e: React.MouseEvent<HTMLCanvasElement>) => void
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
  className?: string
  isKeyboardPanning: boolean
  cursorOnCell: boolean
}

const CELL_SIZE = 20

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
  canvasRef: externalCanvasRef
}: WebGLRendererProps) {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = externalCanvasRef || internalCanvasRef
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null)
  const instanceBufferRef = useRef<WebGLBuffer | null>(null)
  const gridProgramRef = useRef<WebGLProgram | null>(null)
  const gridVaoRef = useRef<WebGLVertexArrayObject | null>(null)

  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl2')
    if (!gl) {
      console.error('WebGL2 not supported')
      return
    }

    glRef.current = gl

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

        // Create rounded rectangle effect for regular cells
        vec2 center = vec2(0.5, 0.5);
        vec2 dist = abs(v_texCoord - center);
        float radius = 0.3;

        if (dist.x > 0.4 || dist.y > 0.4) {
          discard;
        }

        // Special case for white (hue = 360 with different logic)
        vec3 color;
        if (abs(v_hue - 360.0) < 0.1) {
          color = vec3(0.9, 0.9, 0.95); // White cells
        } else {
          color = hslToRgb(v_hue, 0.7, 0.6);
        }

        // Inner highlight
        if (dist.x < 0.2 && dist.y < 0.2) {
          if (abs(v_hue - 360.0) < 0.1) {
            color = vec3(0.95, 0.95, 1.0);
          } else {
            color = hslToRgb(v_hue, 0.6, 0.8);
          }
        }

        outColor = vec4(color, 1.0);
      }
    `

    // Create shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)
    if (!vertexShader) return
    gl.shaderSource(vertexShader, vertexShaderSource)
    gl.compileShader(vertexShader)

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
    if (!fragmentShader) return
    gl.shaderSource(fragmentShader, fragmentShaderSource)
    gl.compileShader(fragmentShader)

    // Create program
    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

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

    const gridFragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
    if (!gridFragmentShader) return
    gl.shaderSource(gridFragmentShader, `#version 300 es
      precision highp float;
      out vec4 outColor;
      void main() {
        outColor = vec4(0.1, 0.15, 0.25, 0.1);
      }
    `)
    gl.compileShader(gridFragmentShader)

    const gridProgram = gl.createProgram()
    if (!gridProgram) return
    gl.attachShader(gridProgram, gridVertexShader)
    gl.attachShader(gridProgram, gridFragmentShader)
    gl.linkProgram(gridProgram)
    gridProgramRef.current = gridProgram

    const gridVao = gl.createVertexArray()
    if (!gridVao) return
    gl.bindVertexArray(gridVao)
    gridVaoRef.current = gridVao

  }, [])

  const render = useCallback(() => {
    const gl = glRef.current
    const program = programRef.current
    const vao = vaoRef.current
    const gridProgram = gridProgramRef.current
    const gridVao = gridVaoRef.current

    if (!gl || !program || !vao || !gridProgram || !gridVao) return

    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Enable blending for transparency
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const cellSize = CELL_SIZE * zoom
    const startX = Math.floor(-panX / cellSize) - 1
    const startY = Math.floor(-panY / cellSize) - 1
    const endX = Math.ceil((width - panX) / cellSize) + 1
    const endY = Math.ceil((height - panY) / cellSize) + 1

    const instanceData: number[] = []

    // Add regular cells
    cells.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number)
      if (x >= startX && x <= endX && y >= startY && y <= endY) {
        instanceData.push(x, y, hue)
      }
    })

    // Add blueprint cells
    blueprintCells.forEach(cell => {
      if (cell.x >= startX && cell.x <= endX && cell.y >= startY && cell.y <= endY) {
        instanceData.push(cell.x, cell.y, cell.isBlueprint ? 180 : hue)
      }
    })

    // Add selection box as filled transparent rectangle if selection is active
    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.endX)
      const maxX = Math.max(selectionBox.startX, selectionBox.endX)
      const minY = Math.min(selectionBox.startY, selectionBox.endY)
      const maxY = Math.max(selectionBox.startY, selectionBox.endY)

      // Draw filled selection rectangle with transparency
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          if (x >= startX && x <= endX && y >= startY && y <= endY) {
            // Check if this cell is already in the grid (don't overwrite existing cells)
            const cellKey = `${x},${y}`
            if (!cells.has(cellKey) && !selectedCells.has(cellKey)) {
              instanceData.push(x, y, 240) // Blue color for selection fill
            }
          }
        }
      }

      // Draw handle at bottom-right corner
      const handleX = maxX + 0.5
      const handleY = maxY + 0.5
      if (handleX >= startX && handleX <= endX && handleY >= startY && handleY <= endY) {
        instanceData.push(handleX, handleY, 180) // Cyan color for handle
      }
    }

    if (instanceData.length > 0) {
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBufferRef.current)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instanceData), gl.DYNAMIC_DRAW)

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
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceData.length / 3)
    }

    // Draw grid if enabled
    if (showGrid) {
      gl.useProgram(gridProgram)
      gl.bindVertexArray(gridVao)

      const resolutionLoc = gl.getUniformLocation(gridProgram, 'u_resolution')
      gl.uniform2f(resolutionLoc, width, height)

      // Generate grid lines
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
        const gridBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridLines), gl.DYNAMIC_DRAW)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

        gl.drawArrays(gl.LINES, 0, gridLines.length / 2)

        gl.deleteBuffer(gridBuffer)
      }
    }

  }, [cells, blueprintCells, selectionBox, selectedCells, panX, panY, zoom, hue, showGrid, width, height])

  useEffect(() => {
    render()
  }, [render])

  return (
    <canvas
      ref={canvasRef}
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
