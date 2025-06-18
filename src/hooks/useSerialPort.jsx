import React, { useState, useEffect, createContext, useContext } from 'react'

const SerialPortContext = createContext(null)

export function SerialPortProvider({ children }) {
  const [ports, setPorts] = useState([])
  const [selectedPort, setSelectedPort] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [baudRate, setBaudRate] = useState(() => {
    const saved = localStorage.getItem('serialMonitor_baudRate')
    return saved ? parseInt(saved) : 9600
  })
  const [reader, setReader] = useState(null)
  const [output, setOutput] = useState([])
  const [filter, setFilter] = useState(() => {
    return localStorage.getItem('serialMonitor_filter') || ''
  })
  const [maxLogLines, setMaxLogLines] = useState(() => {
    const saved = localStorage.getItem('serialMonitor_maxLogLines')
    return saved ? parseInt(saved) : 1000
  })

  const listPorts = async () => {
    if (!('serial' in navigator)) {
      setError('Web Serial API is not supported in this browser')
      return
    }
    try {
      const availablePorts = await navigator.serial.getPorts()
      setPorts(availablePorts.filter(port => {
        const info = port.getInfo()
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
      if (selectedPort.readable && selectedPort.readable.locked) {
        await disconnect()
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      await selectedPort.open({ baudRate: parseInt(selectedBaudRate) || 9600 })
      setBaudRate(selectedBaudRate)
      setIsConnected(true)
      setError(null)
      const textDecoder = new TextDecoderStream()
      selectedPort.readable.pipeTo(textDecoder.writable).catch(err => {
        if (err !== undefined) {
          console.warn('PipeTo error:', err)
        }
      })
      const reader = textDecoder.readable.getReader()
      setReader(reader)
    } catch (err) {
      setError(`Failed to connect: ${err.message}`)
      console.error('Connection error:', err)
    }
  }

  useEffect(() => {
    if (!reader) {
      return;
    }

    let isCancelled = false;
    let buffer = '';

    const stripAnsi = (str) => {
      // eslint-disable-next-line no-control-regex
      const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
      return str.replace(ansiRegex, '');
    };

    const readLoop = async () => {
      while (!isCancelled) {
        try {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += value;

          // ★ 新しい行をまとめて処理するロジックに変更
          const newLines = [];
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex + 1);
            buffer = buffer.slice(newlineIndex + 1);
            const cleanedLine = stripAnsi(line);
            newLines.push(cleanedLine);
          }

          if (newLines.length > 0) {
            setOutput((prev) => {
              const combined = [...prev, ...newLines];
              if (combined.length > maxLogLines) {
                // 配列の末尾からmaxLogLines個の要素をスライスして返す
                return combined.slice(combined.length - maxLogLines);
              }
              return combined;
            });
          }

        } catch (err) {
          if (!isCancelled) {
            setError("Failed to read from port.");
            disconnect().catch(console.error);
          }
          break;
        }
      }
    };

    readLoop();

    return () => {
      isCancelled = true;
      if (buffer.length > 0) {
        const cleanedBuffer = stripAnsi(buffer);
        setOutput((prev) => {
          const newOutput = [...prev, cleanedBuffer];
           if (newOutput.length > maxLogLines) {
            return newOutput.slice(newOutput.length - maxLogLines);
          }
          return newOutput;
        });
      }
      if (reader) {
        reader.cancel().catch(e => {
          if (e !== undefined) {
            console.error("Failed to cancel reader on cleanup", e);
          }
        });
      }
    };
  }, [reader, maxLogLines]); // 依存配列にmaxLogLinesを追加

  const disconnect = async () => {
    setIsConnected(false);
    
    if (reader) {
        const currentReader = reader;
        setReader(null);
        try {
            await currentReader.cancel();
        } catch (err) {
            console.warn('Error canceling reader:', err);
        }
    }
    
    // 少し待ってからポートを閉じる
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (selectedPort) {
        try {
            await selectedPort.close();
        } catch (err) {
            console.warn('Error closing port:', err);
        }
    }
    
    setError(null);
  }

  const clearOutput = () => {
    setOutput([])
  }

  useEffect(() => {
    listPorts()
    
    const handleConnect = (e) => {
      listPorts()
    }
    const handleDisconnect = (e) => {
      if(selectedPort === e.port) {
        disconnect()
      }
      listPorts()
    }

    navigator.serial.addEventListener('connect', handleConnect)
    navigator.serial.addEventListener('disconnect', handleDisconnect)

    return () => {
      navigator.serial.removeEventListener('connect', handleConnect)
      navigator.serial.removeEventListener('disconnect', handleDisconnect)
    }
  }, [selectedPort])

  const setBaudRateWithStorage = (value) => {
    setBaudRate(value)
    localStorage.setItem('serialMonitor_baudRate', value)
  }

  const setFilterWithStorage = (value) => {
    setFilter(value)
    localStorage.setItem('serialMonitor_filter', value)
  }

  const setMaxLogLinesWithStorage = (value) => {
    setMaxLogLines(value)
    localStorage.setItem('serialMonitor_maxLogLines', value)
  }

  const value = {
    ports,
    selectedPort,
    isConnected,
    error,
    requestPort,
    connect,
    disconnect,
    baudRate,
    setBaudRate: setBaudRateWithStorage,
    output,
    clearOutput,
    selectPort: setSelectedPort,
    filter,
    setFilter: setFilterWithStorage,
    maxLogLines,
    setMaxLogLines: setMaxLogLinesWithStorage,
  }

  return <SerialPortContext.Provider value={value}>{children}</SerialPortContext.Provider>
}

export const useSerialPort = () => {
  const context = useContext(SerialPortContext)
  if (!context) {
    throw new Error('useSerialPort must be used within a SerialPortProvider')
  }
  return context
}
