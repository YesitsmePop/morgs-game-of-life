// webgl-compute.ts - WebGL 2.0 GPU-accelerated Game of Life computation
"use client"

export class WebGLCompute {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
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
    const fragmentShaderSource = `#version 300 es
      precision highp float;

      uniform sampler2D u_currentState;
      uniform ivec2 u_gridSize;

      out vec4 fragColor;

      // Count neighbors using texture sampling
      int countNeighbors(ivec2 pos) {
        int count = 0;

        for (int dy = -1; dy <= 1; dy++) {
          for (int dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) continue;

            ivec2 neighborPos = pos + ivec2(dx, dy);

            // Handle toroidal boundaries (wrap around)
            if (neighborPos.x < 0) neighborPos.x = u_gridSize.x - 1;
            if (neighborPos.x >= u_gridSize.x) neighborPos.x = 0;
            if (neighborPos.y < 0) neighborPos.y = u_gridSize.y - 1;
            if (neighborPos.y >= u_gridSize.y) neighborPos.y = 0;

            vec4 neighbor = texelFetch(u_currentState, neighborPos, 0);
            if (neighbor.r > 0.5) count++;
          }
        }

        return count;
      }

      void main() {
        ivec2 pos = ivec2(gl_FragCoord.xy);

        // Bounds check
        if (pos.x >= u_gridSize.x || pos.y >= u_gridSize.y) {
          fragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // Sample current state
        vec4 current = texelFetch(u_currentState, pos, 0);
        bool alive = current.r > 0.5;

        // Count neighbors
        int neighbors = countNeighbors(pos);

        // Apply Conway's Game of Life rules
        bool shouldBeAlive = false;
        if (alive) {
          shouldBeAlive = neighbors == 2 || neighbors == 3;
        } else {
          shouldBeAlive = neighbors == 3;
        }

        // Write result
        fragColor = vec4(shouldBeAlive ? 1.0 : 0.0, 0.0, 0.0, 1.0);
      }
    `

    // Create shaders
    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource)

    // Create program
    this.program = this.createProgram(vertexShader, fragmentShader)

    // Setup textures and framebuffers for ping-pong rendering
    this.setupTexturesAndFramebuffers()

    // Setup full-screen quad
    this.setupQuad()
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl
    if (!gl) throw new Error('WebGL context not available')

    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`)
    }

    return shader
  }

  private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const gl = this.gl
    if (!gl) throw new Error('WebGL context not available')

    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`)
    }

    return program
  }

  private setupTexturesAndFramebuffers() {
    const gl = this.gl
    if (!gl) return

    this.textures = []
    this.framebuffers = []

    for (let i = 0; i < 2; i++) {
      // Create texture for storing grid state
      const texture = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

      // Create framebuffer
      const framebuffer = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Framebuffer not complete')
      }

      this.textures.push(texture)
      this.framebuffers.push(framebuffer)
    }
  }

  private setupQuad() {
    const gl = this.gl
    if (!gl) return

    // Create VAO for full-screen quad
    this.quadVAO = gl.createVertexArray()!
    gl.bindVertexArray(this.quadVAO)

    // Create buffer for quad vertices (full-screen triangle)
    this.quadBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       3, -1,
      -1,  3
    ]), gl.STATIC_DRAW)

    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  }

  // Initialize grid with alive cells
  initializeGrid(aliveCells: Set<string>) {
    const gl = this.gl
    if (!gl) return

    // Create initial state data
    const initialData = new Uint8Array(this.width * this.height * 4)

    aliveCells.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number)
      // Transform from QuadtreeGrid range (-4096 to +4096) to BitGrid range (0 to 8192)
      const transformedX = x + 4096
      const transformedY = y + 4096

      if (transformedX >= 0 && transformedX < this.width && transformedY >= 0 && transformedY < this.height) {
        const index = (transformedY * this.width + transformedX) * 4
        initialData[index] = 255 // Red channel = alive
        initialData[index + 1] = 0
        initialData[index + 2] = 0
        initialData[index + 3] = 255
      }
    })

    // Upload to texture
    gl.bindTexture(gl.TEXTURE_2D, this.textures[0])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, initialData)

    this.currentBuffer = 0
  }

  // Compute one generation using GPU
  step(): Set<string> {
    const gl = this.gl
    if (!gl || !this.program) throw new Error('WebGL compute not initialized')

    // Bind input texture (current state)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.currentBuffer])

    // Bind output framebuffer (next state)
    const nextBuffer = 1 - this.currentBuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[nextBuffer])
    gl.viewport(0, 0, this.width, this.height)

    // Use compute program
    gl.useProgram(this.program)

    // Set uniforms
    const gridSizeLoc = gl.getUniformLocation(this.program, 'u_gridSize')
    const currentStateLoc = gl.getUniformLocation(this.program, 'u_currentState')

    gl.uniform2i(gridSizeLoc, this.width, this.height)
    gl.uniform1i(currentStateLoc, 0)

    // Bind quad VAO and draw
    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Swap buffers
    this.currentBuffer = nextBuffer

    // Read back the result
    return this.readCurrentState()
  }

  // Read current state back to CPU
  readCurrentState(): Set<string> {
    const gl = this.gl
    if (!gl) return new Set()

    // Read pixels from current texture
    const pixels = new Uint8Array(this.width * this.height * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[this.currentBuffer])
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    const aliveCells = new Set<string>()

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = (y * this.width + x) * 4
        if (pixels[index] > 128) { // Alive if red channel > 128
          // Transform back from BitGrid range (0 to 8192) to QuadtreeGrid range (-4096 to +4096)
          const originalX = x - 4096
          const originalY = y - 4096
          aliveCells.add(`${originalX},${originalY}`)
        }
      }
    }

    return aliveCells
  }

  // Cleanup
  cleanup() {
    const gl = this.gl
    if (!gl) return

    if (this.program) gl.deleteProgram(this.program)

    this.framebuffers.forEach(fb => gl.deleteFramebuffer(fb))
    this.textures.forEach(tex => gl.deleteTexture(tex))

    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO)
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer)

    this.framebuffers = []
    this.textures = []
  }
}
