import React from 'react'
import './index.css'
import { MonitorDisplay } from './components/MonitorDisplay'
import { ControlPanel } from './components/ControlPanel'

function App() {
  return (
    <div className="container">
      <header className="header">
        <h1>USB Serial Monitor</h1>
      </header>
      <main className="main">
        <MonitorDisplay />
        <ControlPanel />
      </main>
    </div>
  )
}

export default App

