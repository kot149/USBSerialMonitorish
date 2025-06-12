import React, { useRef, useEffect } from 'react'
import { useSerialPort } from '../hooks/useSerialPort'

export function MonitorDisplay() {
  const { output, clearOutput } = useSerialPort();
  const monitorRef = useRef(null);

  useEffect(() => {
    if (monitorRef.current) {
      monitorRef.current.scrollTop = monitorRef.current.scrollHeight;
    }
  }, [output]);

  // outputは文字列の配列なので、単純に結合して表示
  const displayText = output.length === 0 
    ? 'Waiting for data...' 
    : output.join('');

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
  );
}