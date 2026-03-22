const LEVEL_COLORS = {
  beginner: 'bg-green-100 text-green-800 border-green-200',
  intermediate: 'bg-blue-100 text-blue-800 border-blue-200',
  advanced: 'bg-orange-100 text-orange-800 border-orange-200',
  master: 'bg-purple-100 text-purple-800 border-purple-200',
}

export default function LevelBadge({ level }) {
  const normalized = level ? String(level).toLowerCase() : 'beginner'
  const styles = LEVEL_COLORS[normalized] || LEVEL_COLORS.beginner

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles}`}
      title={level}
    >
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  )
}
