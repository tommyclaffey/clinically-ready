import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './App'
import { AuthProvider } from './auth'
import { restartDemoIfRefreshed } from './lib/demoRestart'
import { watchErrors } from './lib/errors'
import './styles/app.css'

const mount = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

watchErrors() // Nov 19: browser errors reach the server's error log
void restartDemoIfRefreshed().finally(mount)
