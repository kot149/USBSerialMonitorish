import React from 'react'
import { useSerialPort } from '../hooks/useSerialPort'

export function ControlPanel() {
  const { 
    ports, 
    requestPort, 
    isConnected, 
    error, 
    connect, 
    disconnect, 
    selectPort, 
    selectedPort,
    baudRate,
    setBaudRate,
    filter,
    setFilter,
    maxLogLines,
    setMaxLogLines
  } = useSerialPort()

  const handleConnectionToggle = () => {
    if (isConnected) {
      disconnect().catch(err => console.error('Disconnect error:', err))
    } else {
      connect(baudRate).catch(err => console.error('Connect error:', err))
    }
  }

  const handlePortChange = (event) => {
    const portIndex = parseInt(event.target.value, 10)
    if (!isNaN(portIndex) && ports[portIndex]) {
        selectPort(ports[portIndex])
    }
  }

  return (
    <div className="control-panel">
      <h2>Connection Settings</h2>
      <div className="settings-group">
        <div className="port-selection">
          <label>
            Port
            <div className="port-select-group">
              <select 
                onChange={handlePortChange}
                value={selectedPort ? ports.indexOf(selectedPort) : -1}
                disabled={isConnected}
              >
                <option value={-1}>Select a port...</option>
                {ports.map((port, index) => {
                  const info = port.getInfo();
                  return (
                    <option key={index} value={index}>
                      {info.usbVendorId ?
                        `USB Device (VID: ${info.usbVendorId.toString(16)})` :
                        `Port ${index + 1}`}
                    </option>
                  )
                })}
              </select>
              <button 
                onClick={requestPort} 
                className="request-port-btn"
                disabled={isConnected}
              >
                Select Port
              </button>
            </div>
          </label>
        </div>

        <label>
          Baud Rate
          <select 
            value={baudRate}
            onChange={(e) => setBaudRate(e.target.value)}
            disabled={isConnected}
          >
            <option value="9600">9600</option>
            <option value="115200">115200</option>
            <option value="57600">57600</option>
            <option value="38400">38400</option>
            <option value="19200">19200</option>
            <option value="14400">14400</option>
            <option value="4800">4800</option>
            <option value="2400">2400</option>
          </select>
        </label>

        <button 
          className={`connect-btn ${isConnected ? 'connected' : ''}`}
          onClick={handleConnectionToggle}
          disabled={!selectedPort}
        >
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      <div className="settings-group" style={{ marginTop: '1.5rem' }}>
        <label>
            Filter (Regex)
            <div className="filter-container">
              <input
                type="text"
                placeholder="e.g., ^ERROR"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                disabled={!isConnected}
                className="filter-input-with-clear"
              />
              {filter && (
                <button
                  onClick={() => setFilter('')}
                  className="filter-clear-btn"
                  title="Clear filter"
                >
                  ×
                </button>
              )}
            </div>
        </label>
        {/* ★ ログ行数制限の入力フィールドを追加 */}
        <label style={{ marginTop: '1rem' }}> 
            Log limit (lines)
            <input
              type="number"
              value={maxLogLines}
              onChange={(e) => setMaxLogLines(Number(e.target.value))}
              min="1"
            />
        </label>
      </div>

      {error && <div className="error-message">{error}</div>}
    </div>
  )
}
