import React from 'react'
import { useSerialPort } from '../hooks/useSerialPort'

export function ControlPanel() {
  const { ports, requestPort, isConnected, error, connect, disconnect, selectPort, selectedPort } = useSerialPort()
  const [selectedBaudRate, setSelectedBaudRate] = React.useState('9600')

  const handleConnectionToggle = async () => {
    try {
      if (isConnected) {
        await disconnect()
      } else {
        await connect(selectedBaudRate)
      }
    } catch (err) {
      console.error('Connection toggle error:', err)
    }
  }

  const handlePortChange = (event) => {
    const portIndex = parseInt(event.target.value)
    selectPort(ports[portIndex])
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
                value={ports.indexOf(selectedPort)}
                disabled={isConnected}
              >
                <option value={-1}>Select a port...</option>
                {ports.map((port, index) => (
                  <option key={index} value={index}>
                    {port.getInfo().usbVendorId ?
                      `USB Device (VID:${port.getInfo().usbVendorId.toString(16)})` :
                      `Port ${index + 1}`}
                  </option>
                ))}
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
          {error && <div className="error-message">{error}</div>}
        </div>

        <label>
          Baud Rate
          <select 
            value={selectedBaudRate}
            onChange={(e) => setSelectedBaudRate(e.target.value)}
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
        >
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
    </div>
  )
}
