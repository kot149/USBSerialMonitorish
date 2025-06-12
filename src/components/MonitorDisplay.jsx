import React, { useRef, useEffect } from 'react'
import { useSerialPort } from '../hooks/useSerialPort'

export function MonitorDisplay() {
  const { output, clearOutput, isConnected } = useSerialPort()
  const monitorRef = useRef(null)

  useEffect(() => {
    console.log('Output updated:', output) // デバッグログ
    if (monitorRef.current) {
      monitorRef.current.scrollTop = monitorRef.current.scrollHeight
    }
  }, [output])

  const displayText = output.length === 0 
    ? 'Waiting for data...' 
    : output.map((text, i) => (
        <span key={i} className="monitor-line">{text}</span>
      ))

  return (
    <div className="monitor-display">
      <div className="monitor-header">
        <h2>Monitor Output</h2>
        <div className="monitor-controls">
          <button onClick={clearOutput} className="clear-btn">Clear</button>
        </div>
      </div>
      <div className="monitor-content" ref={monitorRef}>
        <pre className="monitor-text">
          {displayText}
        </pre>
      </div>
    </div>
  )
}
