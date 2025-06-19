import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { SerialPortProvider } from './hooks/useSerialPort'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SerialPortProvider>
      <App />
    </SerialPortProvider>
  </React.StrictMode>
)