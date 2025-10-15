"use client"

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 dark:animated-gradient animated-gradient-light" />

      <div
        className="absolute top-20 left-20 w-64 h-64 glass-card rounded-3xl opacity-30"
        style={{ animation: "float-drift 20s ease-in-out infinite" }}
      />
      <div
        className="absolute top-40 right-32 w-48 h-48 glass-card rounded-3xl opacity-20"
        style={{ animation: "float-drift-alt 25s ease-in-out infinite 2s" }}
      />
      <div
        className="absolute bottom-32 left-1/3 w-56 h-56 glass-card rounded-3xl opacity-25"
        style={{ animation: "float-drift 22s ease-in-out infinite 4s" }}
      />
      <div
        className="absolute bottom-20 right-20 w-40 h-40 glass-card rounded-3xl opacity-30"
        style={{ animation: "float-drift-alt 18s ease-in-out infinite 1s" }}
      />
    </div>
  )
}
