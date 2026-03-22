export default function Skeleton({ className = '', lines = 1 }) {
  const base = 'animate-pulse bg-slate-700 rounded-xl'
  if (lines === 1) {
    return <div className={`${base} ${className}`} />
  }
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`${base} ${i === lines - 1 && lines > 1 ? 'w-3/4' : ''}`} />
      ))}
    </div>
  )
}
