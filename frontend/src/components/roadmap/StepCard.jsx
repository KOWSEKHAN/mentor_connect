import LevelBadge from './LevelBadge'
import ProgressBar from './ProgressBar'

const STATUS_STYLES = {
  locked: 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-75',
  available: 'bg-blue-50 border-blue-200 hover:border-blue-400',
  inProgress: 'bg-amber-50 border-amber-300 hover:border-amber-400',
  completed: 'bg-green-50 border-green-200 hover:border-green-400',
}

function getStatus(step, isLocked) {
  if (isLocked) return 'locked'
  const progress = step?.progress ?? 0
  if (progress >= 100) return 'completed'
  if (progress > 0) return 'inProgress'
  return 'available'
}

export default function StepCard({ step, isSelected, isLocked, onClick }) {
  if (!step) return null

  const status = getStatus(step, isLocked)
  const base =
    'flex-shrink-0 w-56 snap-center rounded-xl border-2 p-4 transition-all duration-200 ' +
    STATUS_STYLES[status]
  const selected = isSelected ? 'ring-2 ring-offset-2 ring-blue-500' : ''

  return (
    <button
      type="button"
      onClick={() => !isLocked && onClick?.(step)}
      disabled={isLocked}
      className={`${base} ${selected} text-left`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <LevelBadge level={step.level} />
        {step.aiContentGenerated && (
          <span className="text-xs text-gray-500" title="Content generated">✓</span>
        )}
      </div>
      <h4 className="font-medium text-gray-900 truncate mb-2" title={step.title}>
        {step.title}
      </h4>
      <ProgressBar progress={step.progress} />
      <p className="text-xs text-gray-500 mt-2">
        {status === 'completed' ? 'Completed' : status === 'inProgress' ? 'In progress' : 'Not started'}
      </p>
    </button>
  )
}
