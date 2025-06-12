import { useState, useEffect } from 'react'

export function useSerialPort() {
  const [ports, setPorts] = useState([])
  const [selectedPort, setSelectedPort] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [baudRate, setBaudRate] = useState(9600)
  const [reader, setReader] = useState(null)
  const [output, setOutput] = useState([])

  const listPorts = async () => {
    if (!('serial' in navigator)) {
      setError('Web Serial API is not supported in this browser')
      return
    }

    try {
      const availablePorts = await navigator.serial.getPorts()
      setPorts(availablePorts.filter(port => {
        const info = port.getInfo()
        // Filter out Bluetooth devices and keep only USB devices
        return !info.usbVendorId || (info.usbVendorId && !info.bluetoothServiceClassId)
      }))
    } catch (err) {
      setError('Failed to list serial ports')
      console.error('Failed to get ports:', err)
    }
  }

  const requestPort = async () => {
    setError(null)
    if (!('serial' in navigator)) {
      setError('Web Serial API is not supported')
      return
    }

    try {
      const port = await navigator.serial.requestPort()
      setPorts(prev => [...prev.filter(p => p !== port), port])
      setSelectedPort(port)
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setError('No compatible serial port selected')
      } else {
        setError('Failed to access serial port')
      }
      console.error('Failed to request port:', err)
    }
  }

  const connect = async (selectedBaudRate) => {
    if (!selectedPort) {
      setError('No port selected')
      return
    }

    try {
      await selectedPort.open({ baudRate: parseInt(selectedBaudRate) || 9600 })
      setBaudRate(selectedBaudRate)
      setIsConnected(true)
      setError(null)

      const textDecoder = new TextDecoderStream()
      const readableStreamClosed = selectedPort.readable.pipeTo(textDecoder.writable)
      const reader = textDecoder.readable.getReader()
      setReader(reader)
    } catch (err) {
      setError(`Failed to connect: ${err.message}`)
      console.error('Connection error:', err)
    }
  }

  useEffect(() => {
    let isMounted = true
    let buffer = ''

    const readLoop = async () => {
      if (!reader) return

      try {
        while (isMounted) {
          const { value, done } = await reader.read()
          if (done) break
          if (isMounted && value) {
            console.log('Received data:', value) // デバッグログ
            buffer += value
            if (buffer.includes('\n')) {
              setOutput(prev => {
                const newOutput = [...prev, buffer]
                console.log('Updated output:', newOutput) // デバッグログ
                return newOutput
              })
              buffer = ''
            }
          }
        }
      } catch (err) {
        console.error('Read error:', err)
      }
    }

    if (reader) {
      console.log('Starting read loop') // デバッグログ
      readLoop()
    }

    return () => {
      console.log('Cleaning up read loop') // デバッグログ
      isMounted = false
    }
  }, [reader])

  const disconnect = async () => {
    try {
      if (reader) {
        try {
          await reader.cancel()
        } catch (err) {
          console.warn('Error canceling reader:', err)
        }
        setReader(null)
      }
      
      if (selectedPort && selectedPort.readable) {
        try {
          await selectedPort.close()
        } catch (err) {
          console.warn('Error closing port:', err)
          // Continue with cleanup even if close fails
        }
      }
    } catch (err) {
      console.error('Disconnect error:', err)
    } finally {
      setIsConnected(false)
      setError(null)
    }
  }

  const clearOutput = () => {
    setOutput([])
  }

  useEffect(() => {
    listPorts()
  }, [])

  return {
    ports,
    selectedPort,
    isConnected,
    error,
    requestPort,
    connect,
    disconnect,
    baudRate,
    output,
    clearOutput,
    selectPort: setSelectedPort,
  }
}
