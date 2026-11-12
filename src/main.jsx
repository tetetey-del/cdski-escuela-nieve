import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Si se publicó una versión nueva mientras la app estaba abierta, una pantalla
// puede pedir un archivo que ya no existe: se recarga una vez para traer la versión nueva.
window.addEventListener('vite:preloadError', (e) => {
  if (!sessionStorage.getItem('recargada-por-version')) {
    e.preventDefault()
    sessionStorage.setItem('recargada-por-version', '1')
    window.location.reload()
  }
})
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('recargada-por-version'), 10000))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
