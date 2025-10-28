'use client'

import { useState, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { ChevronDown, ChevronUp, Settings, Plus, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

type Ruleset = 'classic' | 'custom' | 'prime'

type RulesetConfig = {
  type: Ruleset
  survival: number[]
  birth: number[]
}

interface RulesetPanelProps {
  onRulesetChange: (ruleset: RulesetConfig) => void
  className?: string
}

const MAX_NEIGHBORS = 8
const MIN_NEIGHBORS = 0

const MultiNodeSlider = ({
  values,
  onChange,
  min = MIN_NEIGHBORS,
  max = MAX_NEIGHBORS,
  label,
  className,
}: {
  values: number[]
  onChange: (values: number[]) => void
  min?: number
  max?: number
  label: string
  className?: string
}) => {
  const addNode = useCallback(() => {
    if (values.length < 5) { // Limit to 5 nodes max
      const newValue = Math.min(Math.max(...values, min) + 1, max)
      const newValues = [...values, newValue].sort((a, b) => a - b)
      onChange(newValues)
    }
  }, [values, min, max, onChange])

  const removeNode = useCallback((index: number) => {
    if (values.length > 1) { // Keep at least one node
      const newValues = [...values]
      newValues.splice(index, 1)
      onChange(newValues)
    }
  }, [values, onChange])

  const handleValueChange = useCallback((newValues: number[]) => {
    // Ensure values are unique and sorted
    const uniqueSorted = [...new Set(newValues)]
      .map(v => Math.min(Math.max(v, min), max))
      .sort((a, b) => a - b)
    
    // Only update if values have actually changed
    if (JSON.stringify(uniqueSorted) !== JSON.stringify(values)) {
      onChange(uniqueSorted)
    }
  }, [values, min, max, onChange])

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{label}:</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 p-0"
            onClick={addNode}
            disabled={values.length >= 5}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      
      <div className="px-2">
        <Slider
          value={values}
          onValueChange={handleValueChange}
          min={min}
          max={max}
          step={1}
          minStepsBetweenThumbs={1}
          className="w-full"
        />
      </div>
      
      <div className="flex flex-wrap gap-1 items-center justify-center min-h-6">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-1 bg-muted/50 rounded-full px-2 py-0.5 text-xs">
            <span>{value}</span>
            <button
              type="button"
              onClick={() => removeNode(index)}
              className="text-muted-foreground hover:text-foreground"
              disabled={values.length <= 1}
            >
              <Minus className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RulesetPanel({ onRulesetChange, className }: RulesetPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [ruleset, setRuleset] = useState<Ruleset>('classic')
  const [survival, setSurvival] = useState<number[]>([2, 3])
  const [birth, setBirth] = useState<number[]>([3])

  const togglePanel = () => {
    setIsOpen(!isOpen)
  }

  const handleRulesetChange = useCallback((type: Ruleset) => {
    setRuleset(type)
    if (type === 'classic') {
      onRulesetChange({ type, survival: [2, 3], birth: [3] })
    } else if (type === 'prime') {
      onRulesetChange({ type, survival: [6, 7], birth: [2, 3, 5, 7] })
    } else {
      onRulesetChange({ type, survival, birth })
    }
  }, [onRulesetChange, survival, birth])

  const handleSurvivalChange = useCallback((values: number[]) => {
    const newValues = [...new Set(values)].sort((a, b) => a - b)
    setSurvival(newValues)
    if (ruleset === 'custom') {
      onRulesetChange({ type: 'custom', survival: newValues, birth })
    }
  }, [ruleset, birth, onRulesetChange])

  const handleBirthChange = useCallback((values: number[]) => {
    const newValues = [...new Set(values)].sort((a, b) => a - b)
    setBirth(newValues)
    if (ruleset === 'custom') {
      onRulesetChange({ type: 'custom', survival, birth: newValues })
    }
  }, [ruleset, survival, onRulesetChange])

  const formatRange = (values: number[]) => {
    if (values.length === 0) return 'None'
    return values.join(', ')
  }

  return (
    <div className={cn("bg-background/80 backdrop-blur-sm border rounded-lg p-3 transition-all duration-200 overflow-visible relative", className)}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span className="text-sm font-medium">Ruleset</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={togglePanel}
        >
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className={`mt-2 space-y-4 ${isOpen ? 'block' : 'hidden'}`}>
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="group relative flex justify-end">
              <Button
                variant={ruleset === 'classic' ? 'default' : 'outline'}
                size="sm"
                className="w-full"
                onClick={() => handleRulesetChange('classic')}
              >
                Classic
              </Button>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute z-[9999] right-full w-48 p-2 mr-2 text-xs bg-popover text-popover-foreground rounded-md shadow-lg border pointer-events-none">
                Classic Conway's Game of Life rules:
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>Survives with 2-3 neighbors</li>
                  <li>Born with exactly 3 neighbors</li>
                </ul>
              </div>
            </div>
            <div className="group relative flex justify-end">
              <Button
                variant={ruleset === 'prime' ? 'default' : 'outline'}
                size="sm"
                className="w-full"
                onClick={() => handleRulesetChange('prime')}
              >
                Prime
              </Button>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute z-[9999] right-full w-48 p-2 mr-2 text-xs bg-popover text-popover-foreground rounded-md shadow-lg border pointer-events-none">
                Prime Rules:
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>Survives with 6-7 neighbors</li>
                  <li>Born with prime neighbors (2,3,5,7)</li>
                </ul>
              </div>
            </div>
            <div className="group relative flex justify-end">
              <Button
                variant={ruleset === 'custom' ? 'default' : 'outline'}
                size="sm"
                className="w-full"
                onClick={() => handleRulesetChange('custom')}
              >
                Custom
              </Button>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute z-[9999] right-full w-48 p-2 mr-2 text-xs bg-popover text-popover-foreground rounded-md shadow-lg border pointer-events-none">
                Create your own custom rules
                <div className="mt-1 text-muted-foreground">
                  Set custom survival and birth conditions
                </div>
              </div>
            </div>
          </div>
        </div>

        {ruleset === 'custom' && (
          <div className="space-y-6 py-1">
            <div className="space-y-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">Survival Rules</span>
                <span className="text-xs text-muted-foreground">
                  {formatRange(survival)} neighbors
                </span>
              </div>
              <div className="pl-1">
                <MultiNodeSlider
                  values={survival}
                  onChange={handleSurvivalChange}
                  label="Neighbors to survive"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">Birth Rules</span>
                <span className="text-xs text-muted-foreground">
                  {formatRange(birth)} neighbors
                </span>
              </div>
              <div className="pl-1">
                <MultiNodeSlider
                  values={birth}
                  onChange={handleBirthChange}
                  label="Neighbors for birth"
                />
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground pt-2 border-t">
              <p>Tip: Click + to add a rule, or drag nodes to adjust</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
