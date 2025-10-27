"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, Upload } from "lucide-react"
import { loadPresetsFromFileObject, exportPresetToText } from "@/lib/preset-parser"

interface ImportExportModalProps {
  isVisible: boolean
  onClose: () => void
  tempPreset: Array<{ x: number; y: number }>
  onExportComplete: () => void
  onImportComplete: (presets: Record<string, Array<{ x: number; y: number }>>) => void
  onStartExport: () => void
  showToast: (message: string, type?: 'success' | 'error') => void
}

export function ImportExportModal({
  isVisible,
  onClose,
  tempPreset,
  onExportComplete,
  onImportComplete,
  onStartExport,
  showToast
}: ImportExportModalProps) {
  const [exportName, setExportName] = useState("")
  const [isSelectingMode, setIsSelectingMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    if (!exportName.trim() || tempPreset.length === 0) return

    const content = exportPresetToText(exportName.trim(), tempPreset)

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportName.trim()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    onExportComplete()
    setExportName("")
    setIsSelectingMode(false)
    onClose()
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const presets = await loadPresetsFromFileObject(file)

      if (Object.keys(presets).length > 0) {
        onImportComplete(presets)
        onClose()
      } else {
        showToast("No valid patterns found in the file", "error")
      }
    } catch (error) {
      showToast("Failed to read file", "error")
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClose = () => {
    setExportName("")
    setIsSelectingMode(false)
    onClose()
  }

  if (!isVisible) return null

  return (
    <Dialog open={isVisible} onOpenChange={undefined}>
      <DialogContent className="glass-card border-electric-blue/50 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground text-center">
            Import / Export Patterns
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Import patterns from files or export selected cells as custom presets.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Import Side */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Import</h3>
            <div>
              <Label htmlFor="import-file" className="text-foreground">Choose .txt file</Label>
              <Input
                ref={fileInputRef}
                id="import-file"
                type="file"
                accept=".txt"
                onChange={handleImport}
                className="glass-card border-electric-blue/50 text-foreground my-4"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Select a .txt file containing pattern data in the format used by presets.
            </p>
          </div>

          {/* Export Side */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Export</h3>
            <div>
              <Label htmlFor="export-name" className="text-foreground">Pattern Name</Label>
              <Input
                id="export-name"
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
                placeholder="Enter pattern name"
                className="glass-card border-electric-blue/50 text-foreground my-4"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Cells selected: {tempPreset.length}
            </div>
            <div className="flex flex-col gap-2">
              {tempPreset.length === 0 ? (
                <Button
                  onClick={() => {
                    setIsSelectingMode(true);
                    onStartExport();
                    onClose();
                  }}
                  className="glass-card border-violet/50 hover:border-violet"
                >
                  Select Cells
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    onClick={handleExport}
                    disabled={!exportName.trim()}
                    className="glass-card border-electric-blue/50 hover:border-electric-blue"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button
                    onClick={() => {
                      setIsSelectingMode(false);
                      onClose();
                    }}
                    variant="outline"
                    className="glass-card border-muted-foreground/50 hover:border-muted-foreground"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleClose}
            variant="outline"
            className="glass-card border-muted-foreground/50 hover:border-muted-foreground"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
