'use client'

/**
 * Toast notification system inspired by react-hot-toast
 * Provides a simple way to display temporary notifications to users
 */
import * as React from 'react'
import type { ToastActionElement, ToastProps } from '@/components/ui/toast'

// Maximum number of toasts to show at once
const TOAST_LIMIT = 1
// Delay before automatically removing a toast (in milliseconds)
const TOAST_REMOVE_DELAY = 1000000

/**
 * Extended toast properties that include both base ToastProps and additional fields
 */
type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

// Action types for the toast reducer
const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const

// Counter for generating unique toast IDs
let count = 0

/**
 * Generates a unique ID for each toast
 * @returns {string} A unique string ID
 */
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

// Type definitions for the toast system
type ActionType = typeof actionTypes

/**
 * Union type of all possible toast actions
 */
type Action =
  | {
      type: ActionType['ADD_TOAST']
      toast: ToasterToast
    }
  | {
      type: ActionType['UPDATE_TOAST']
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType['DISMISS_TOAST']
      toastId?: ToasterToast['id']
    }
  | {
      type: ActionType['REMOVE_TOAST']
      toastId?: ToasterToast['id']
    }

// toast state type
interface State {
  toasts: ToasterToast[]
}

// Map to store timeouts for auto-dismissing toasts
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Adds a toast to the removal queue with a delay
 * @param {string} toastId - The ID of the toast to remove
 */
const addToRemoveQueue = (toastId: string) => {
  // Skip if already in queue
  if (toastTimeouts.has(toastId)) {
    return
  }

  // init stater delay
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: 'REMOVE_TOAST',
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

/**
 * Reducer function to manage toast state
 * @param {State} state - Current state
 * @param {Action} action - Action to process
 * @returns {State} New state
 */
export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    // Add a new toast
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    // Update an existing toast
    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    // Dismiss a specific toast or all toasts
    case 'DISMISS_TOAST': {
      const { toastId } = action

      // Handle auto-dismissal for specific toast or all toasts
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    
    // Remove a toast completely
    case 'REMOVE_TOAST':
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

// Store registered state change listeners
const listeners: Array<(state: State) => void> = []

// In-memory state store
let memoryState: State = { toasts: [] }

// handles toast state updates
function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

/**
 * Type for creating new toasts (omits the id as it's generated automatically)
 */
type Toast = Omit<ToasterToast, 'id'>

/**
 * Creates and displays a new toast notification
 * @param {Toast} props - Toast properties
 * @returns {Object} Methods to interact with the toast
 */
function toast({ ...props }: Toast) {
  const id = genId()

  // Helper to update this toast
  const update = (props: ToasterToast) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    })
  
  // Helper to dismiss this toast
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id })

  // Add the new toast
  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update: (props: ToasterToast) =>
      dispatch({
        type: 'UPDATE_TOAST',
        toast: { ...props, id },
      }),
  }
}

// main toast hook
function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  // refs unmount
  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,               // Function to create new toasts
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }), // Function to dismiss toasts
  }
}

export { useToast, toast }
