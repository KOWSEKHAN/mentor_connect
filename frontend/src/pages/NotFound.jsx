import Header from '../components/Header'
import Footer from '../components/Footer'
export default function NotFound(){
  return (
    <>
      <Header/>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white">404</h1>
          <p className="mt-2 text-slate-400">Page not found</p>
        </div>
      </div>
      <Footer/>
    </>
  )
}
