"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ToggleGroupContext {
  value: string
  onValueChange: (value: string) => void
}

const ToggleGroupContext = React.createContext<ToggleGroupContext | undefined>(undefined)

const useToggleGroup = () => {
  const context = React.useContext(ToggleGroupContext)
  if (!context) {
    throw new Error("ToggleGroupItem must be used within ToggleGroup")
  }
  return context
}

interface ToggleGroupProps {
  type: "single" | "multiple"
  value: string | string[]
  onValueChange: (value: string | string[]) => void
  children: React.ReactNode
  className?: string
}

const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ type, value, onValueChange, children, className }, ref) => {
    const handleItemClick = (itemValue: string) => {
      if (type === "single") {
        onValueChange(itemValue)
      } else {
        const currentValues = Array.isArray(value) ? value : [value]
        const newValues = currentValues.includes(itemValue)
          ? currentValues.filter((v) => v !== itemValue)
          : [...currentValues, itemValue]
        onValueChange(newValues)
      }
    }

    const currentValue = Array.isArray(value) ? value : [value]

    return (
      <ToggleGroupContext.Provider
        value={{
          value: currentValue[0] || "",
          onValueChange: handleItemClick,
        }}
      >
        <div
          ref={ref}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-border bg-background p-1",
            className
          )}
          role="group"
        >
          {children}
        </div>
      </ToggleGroupContext.Provider>
    )
  }
)
ToggleGroup.displayName = "ToggleGroup"

interface ToggleGroupItemProps {
  value: string
  "aria-label"?: string
  title?: string
  children: React.ReactNode
  className?: string
}

const ToggleGroupItem = React.forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  ({ value, "aria-label": ariaLabel, title, children, className }, ref) => {
    const { value: groupValue, onValueChange } = useToggleGroup()
    const isActive = groupValue === value

    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onValueChange(value)}
        aria-label={ariaLabel}
        title={title}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          "hover:bg-muted hover:text-foreground",
          isActive
            ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
            : "text-muted-foreground",
          className
        )}
      >
        {children}
      </button>
    )
  }
)
ToggleGroupItem.displayName = "ToggleGroupItem"

export { ToggleGroup, ToggleGroupItem }
