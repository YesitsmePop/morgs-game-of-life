// lib/gpu-compute.ts - WebGL 2.0 GPU-accelerated Game of Life computation

export interface GPUComputeResult {
  newGrid: Set<string>
  born: string[]
  died: string[]
  stats: {
    computationTime: number
    memoryUsage: number
  }
}

/**
 * GPU-accelerated Game of Life computation using WebGL 2.0 compute shaders
 */
export class GPUCompute {
  private gl: WebGL2RenderingContext | null = null
  private computeProgram: WebGLProgram | null = null
  private renderProgram: WebGLProgram | null = null
  private width: number
  private height: number

  // Textures for ping-pong rendering
  private textures: WebGLTexture[] = []
  private framebuffers: WebGLFramebuffer[] = []
  private currentBuffer: number = 0

  // Quad for rendering
  private quadVAO: WebGLVertexArrayObject | null = null
  private quadBuffer: WebGLBuffer | null = null

  constructor(width: number = 8192, height: number = 8192) {
    this.width = width
    this.height = height

    // Create offscreen canvas for WebGL context
    const canvas = new OffscreenCanvas(width, height)
    const gl = canvas.getContext('webgl2')
    if (!gl) {
      throw new Error('WebGL2 not supported')
    }
    this.gl = gl

    this.initialize()
  }

  private initialize() {
    const gl = this.gl
    if (!gl) return

    // Vertex shader for full-screen quad
    const vertexShaderSource = `#version 300 es
      precision highp float;

      layout(location = 0) in vec2 a_position;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `

    // Fragment shader for Game of Life computation
    const computeFragmentShaderSource = `#version 300 es
      precision highp float;
      precision highp sampler2D;

      uniform sampler2D u_currentState;
      uniform vec2 u_resolution;
      uniform int u_mode; // 0 = classic, 1 = prime

      out vec4 outColor;

      // Check if a number is prime
      bool isPrime(int n) {
        if (n < 2) return false;
        if (n == 2) return true;
        if (n % 2 == 0) return false;
        for (int i = 3; i * i <= n; i += 2) {
          if (n % i == 0) return false;
        }
        return true;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        ivec2 coord = ivec2(gl_FragCoord.xy);

        // Count live neighbors
        int liveNeighbors = 0;
        bool currentAlive = false;

        for (int dy = -1; dy <= 1; dy++) {
          for (int dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) {
              ivec2 currentCoord = coord;
              vec4 currentPixel = texelFetch(u_currentState, currentCoord, 0);
              currentAlive = currentPixel.r > 0.5;
              continue;
            }

            ivec2 neighborCoord = coord + ivec2(dx, dy);
            vec4 neighborPixel = texelFetch(u_currentState, neighborCoord, 0);
            if (neighborPixel.r > 0.5) {
              liveNeighbors++;
            }
          }
        }

        // Apply Game of Life rules
        bool shouldBeAlive = false;

        if (u_mode == 0) {
          // Classic mode
          if (currentAlive) {
            shouldBeAlive = liveNeighbors == 2 || liveNeighbors == 3;
          } else {
            shouldBeAlive = liveNeighbors == 3;
          }
        } else {
          // Prime mode
          if (currentAlive) {
            shouldBeAlive = liveNeighbors == 6 || liveNeighbors == 7;
          } else {
            shouldBeAlive = isPrime(liveNeighbors);
          }
        }

        // Output result
        float result = shouldBeAlive ? 1.0 : 0.0;
        outColor = vec4(result, result, result, 1.0);
      }
    `

    // Create compute shader program
    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource)
    const computeFragmentShader = this.createShader(gl.FRAGMENT_SHADER, computeFragmentShaderSource)

    if (vertexShader && computeFragmentShader) {
      this.computeProgram = this.createProgram(vertexShader, computeFragmentShader)
    }

    // Setup textures and framebuffers for ping-pong rendering
    this.setupPingPongTextures()

    // Setup quad for rendering
    this.setupQuad()
  }

  private createShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl
    if (!gl) return null

    const shader = gl.createShader(type)
    if (!shader) return null

    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader)
      console.error('Shader compilation error:', error)
      gl.deleteShader(shader)
      return null
    }

    return shader
  }

  private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
    const gl = this.gl
    if (!gl) return null

    const program = gl.createProgram()
    if (!program) return null

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program)
      console.error('Program linking error:', error)
      gl.deleteProgram(program)
      return null
    }

    return program
  }

  private setupPingPongTextures() {
    const gl = this.gl
    if (!gl) return

    // Create two textures for ping-pong rendering
    for (let i = 0; i < 2; i++) {
      const texture = gl.createTexture()
      if (texture) {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        this.textures.push(texture)
      }

      const framebuffer = gl.createFramebuffer()
      if (framebuffer) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
        this.framebuffers.push(framebuffer)
      }
    }
  }

  private setupQuad() {
    const gl = this.gl
    if (!gl) return

    // Create VAO for quad
    this.quadVAO = gl.createVertexArray()
    gl.bindVertexArray(this.quadVAO)

    // Create buffer for quad vertices
    this.quadBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ]), gl.STATIC_DRAW)

    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  }

  /**
   * Load initial pattern into GPU texture
   */
  loadPattern(cells: Set<string>): void {
    const gl = this.gl
    if (!gl || this.textures.length === 0) return

    // Create image data
    const imageData = new Uint8Array(this.width * this.height * 4)

    cells.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number)
      if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
        const index = (y * this.width + x) * 4
        imageData[index] = 255     // R
        imageData[index + 1] = 255 // G
        imageData[index + 2] = 255 // B
        imageData[index + 3] = 255 // A
      }
    })

    // Upload to texture
    gl.bindTexture(gl.TEXTURE_2D, this.textures[0])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData)

    this.currentBuffer = 0
  }

  /**
   * Perform one GPU-accelerated generation step
   */
  step(mode: 'classic' | 'prime' = 'classic'): GPUComputeResult {
    const gl = this.gl
    if (!gl || !this.computeProgram || !this.quadVAO) {
      throw new Error('GPU compute not properly initialized')
    }

    const startTime = performance.now()

    // Set up for rendering to the alternate framebuffer
    const targetBuffer = 1 - this.currentBuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[targetBuffer])
    gl.viewport(0, 0, this.width, this.height)

    // Clear the target buffer
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Use compute program
    gl.useProgram(this.computeProgram)

    // Set uniforms
    const currentStateLocation = gl.getUniformLocation(this.computeProgram, 'u_currentState')
    const resolutionLocation = gl.getUniformLocation(this.computeProgram, 'u_resolution')
    const modeLocation = gl.getUniformLocation(this.computeProgram, 'u_mode')

    gl.uniform1i(currentStateLocation, 0) // Texture unit 0
    gl.uniform2f(resolutionLocation, this.width, this.height)
    gl.uniform1i(modeLocation, mode === 'classic' ? 0 : 1)

    // Bind current state texture
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.currentBuffer])

    // Render full-screen quad
    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // Swap buffers
    this.currentBuffer = targetBuffer

    const computationTime = performance.now() - startTime

    // Read back results and extract changes
    return this.extractChanges(computationTime)
  }

  private extractChanges(computationTime: number): GPUComputeResult {
    const gl = this.gl
    if (!gl) {
      throw new Error('WebGL context not available')
    }

    // Read back the current texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[this.currentBuffer])
    const pixels = new Uint8Array(this.width * this.height * 4)
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    // Extract live cells and changes
    const newGrid = new Set<string>()
    const born: string[] = []
    const died: string[] = []

    // For simplicity, we'll rebuild the entire grid
    // In a production system, you'd track changes more efficiently
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = (y * this.width + x) * 4
        const isAlive = pixels[index] > 128 // Threshold for "alive"

        if (isAlive) {
          newGrid.add(`${x},${y}`)
        }
      }
    }

    return {
      newGrid,
      born,
      died,
      stats: {
        computationTime,
        memoryUsage: this.width * this.height * 4 // RGBA bytes
      }
    }
  }

  /**
   * Get current pattern from GPU
   */
  getCurrentPattern(): Set<string> {
    const result = this.extractChanges(0)
    return result.newGrid
  }

  /**
   * Get GPU statistics
   */
  getStats(): { width: number; height: number; memoryUsage: number } {
    return {
      width: this.width,
      height: this.height,
      memoryUsage: this.width * this.height * 4 // RGBA bytes
    }
  }

  /**
   * Cleanup GPU resources
   */
  destroy(): void {
    const gl = this.gl
    if (!gl) return

    // Clean up textures
    this.textures.forEach(texture => {
      if (texture) gl.deleteTexture(texture)
    })
    this.textures = []

    // Clean up framebuffers
    this.framebuffers.forEach(framebuffer => {
      if (framebuffer) gl.deleteFramebuffer(framebuffer)
    })
    this.framebuffers = []

    // Clean up programs and shaders
    if (this.computeProgram) {
      gl.deleteProgram(this.computeProgram)
      this.computeProgram = null
    }

    // Clean up buffers
    if (this.quadBuffer) {
      gl.deleteBuffer(this.quadBuffer)
      this.quadBuffer = null
    }

    if (this.quadVAO) {
      gl.deleteVertexArray(this.quadVAO)
      this.quadVAO = null
    }
  }
}
