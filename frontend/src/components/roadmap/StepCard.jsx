import { memo } from 'react'
import LevelBadge from './LevelBadge'
import ProgressBar from './ProgressBar'

const STATUS_STYLES = {
  locked: 'bg-gray-800/40 border-gray-700 cursor-not-allowed opacity-75',
  available: 'bg-blue-600/10 border-blue-500/20 hover:border-blue-400/40',
  inProgress: 'bg-amber-600/10 border-amber-500/20 hover:border-amber-400/40',
  completed: 'bg-green-600/10 border-green-500/20 hover:border-green-400/40',
}

function getStatus(step, isLocked) {
  if (isLocked) return 'locked'
  const progress = step?.progress ?? 0
  if (progress >= 100) return 'completed'
  if (progress > 0) return 'inProgress'
  return 'available'
}

function StepCard({ step, isSelected, isLocked, onClick }) {
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
        <LevelBadge level={step.level || 'beginner'} />
        {step.aiContentGenerated && (
          <span className="text-xs text-gray-300" title="Content generated">✓</span>
        )}
      </div>
      <h4 className="font-medium text-white truncate mb-2" title={step?.title || 'Untitled Step'}>
        {step?.title || 'Untitled Step'}
      </h4>
      <p className="text-xs text-gray-400 line-clamp-2 mb-2">{step?.description || 'No description available'}</p>
      <ProgressBar progress={step.progress} />
      <p className="text-xs text-gray-300 mt-2">
        {status === 'completed' ? 'Completed' : status === 'inProgress' ? 'In progress' : 'Not started'}
      </p>
    </button>
  )
}

export default memo(StepCard)
