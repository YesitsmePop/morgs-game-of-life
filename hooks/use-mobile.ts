import * as React from 'react'

// mobile breakpoint in pixels
const MOBILE_BREAKPOINT = 768

// check if mobile
// TODO: maybe make this more robust later
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>()

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    
    // update state on resize
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    
    // set up listener
    mql.addEventListener('change', onChange, { passive: true })
    onChange() // initial check
    
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile // force boolean
}
