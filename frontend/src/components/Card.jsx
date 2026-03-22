export default function Card({ children, className = '' }) {
  return (
    <div
      className={
        'bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl transition-transform duration-200 hover:scale-[1.01] ' +
        className
      }
    >
      {children}
    </div>
  )
}
