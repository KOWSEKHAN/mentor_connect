export default function Card({children, className=''}) {
  return <div className={'bg-white rounded-2xl shadow p-4 '+className}>{children}</div>
}
