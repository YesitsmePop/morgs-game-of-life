// lib/preset-parser.ts - Shared utility for parsing preset files
export interface PresetCell {
  x: number
  y: number
}

export interface PresetMap {
  [presetName: string]: PresetCell[]
}

/**
 * Parse preset data from text format (used by presets.txt and imported files)
 * Format: [PresetName]
 * x1,y1
 * x2,y2
 * ...
 */
export async function parsePresetText(text: string): Promise<PresetMap> {
  const presets: PresetMap = {}
  const lines = text.split('\n')
  let currentPreset = ''

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    // Check if this is a preset header
    if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
      currentPreset = trimmedLine.slice(1, -1)
      presets[currentPreset] = []
      continue
    }

    // Parse coordinates
    if (currentPreset && trimmedLine.includes(',')) {
      const [x, y] = trimmedLine.split(',').map(Number)
      if (!isNaN(x) && !isNaN(y)) {
        presets[currentPreset].push({ x, y })
      }
    }
  }

  return presets
}

/**
 * Load presets from a file URL (for built-in presets)
 */
export async function loadPresetsFromFile(filePath: string): Promise<PresetMap> {
  try {
    const response = await fetch(filePath)
    if (!response.ok) {
      throw new Error(`Failed to load ${filePath}: ${response.statusText}`)
    }
    const text = await response.text()
    return parsePresetText(text)
  } catch (error) {
    console.error('Failed to load presets:', error)
    return {}
  }
}

/**
 * Load presets from a File object (for imported files)
 */
export async function loadPresetsFromFileObject(file: File): Promise<PresetMap> {
  try {
    const text = await file.text()
    return parsePresetText(text)
  } catch (error) {
    console.error('Failed to read file:', error)
    throw new Error('Failed to read file')
  }
}

/**
 * Export preset to text format
 */
export function exportPresetToText(name: string, cells: PresetCell[]): string {
  let content = `[${name}]\n`
  cells.forEach(cell => {
    content += `${cell.x},${cell.y}\n`
  })
  return content
}
