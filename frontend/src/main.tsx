import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n.ts'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing root element')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
