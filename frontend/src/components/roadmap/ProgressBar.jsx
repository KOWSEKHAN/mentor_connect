export default function ProgressBar({ progress = 0 }) {
  const value = Math.min(100, Math.max(0, Number(progress)))

  return (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div
        className="h-full bg-blue-600 rounded-full transition-all duration-300"
        style={{ width: `${value}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  )
}
