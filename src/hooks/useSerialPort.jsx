import React, { useState, useEffect, createContext, useContext } from 'react'

// 1. Contextの作成
const SerialPortContext = createContext(null)

// 2. Providerコンポーネントの作成とロジックの集約
export function SerialPortProvider({ children }) {
  const [ports, setPorts] = useState([])
  const [selectedPort, setSelectedPort] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [baudRate, setBaudRate] = useState(9600)
  const [reader, setReader] = useState(null)
  const [output, setOutput] = useState([])
  const [filter, setFilter] = useState('') // フィルタ用のstate

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
      await selectedPort.open({ baudRate: parseInt(selectedBaudRate) || 9600 })
      setBaudRate(selectedBaudRate)
      setIsConnected(true)
      setError(null)

      const textDecoder = new TextDecoderStream()
      selectedPort.readable.pipeTo(textDecoder.writable)
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

    // ANSIエスケープシーケンスを削除するための正規表現
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

          let newlineIndex;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex + 1);
            buffer = buffer.slice(newlineIndex + 1);
            
            // 制御文字を削除してからstateを更新
            const cleanedLine = stripAnsi(line);
            setOutput((prev) => [...prev, cleanedLine]);
          }
        } catch (err) {
          if (!isCancelled) {
            setError("Failed to read from port.");
            disconnect();
          }
          break;
        }
      }
    };

    readLoop();

    return () => {
      isCancelled = true;
      if (buffer.length > 0) {
        // クリーンアップ時も同様に制御文字を削除
        const cleanedBuffer = stripAnsi(buffer);
        setOutput((prev) => [...prev, cleanedBuffer]);
      }
      if (reader) {
        reader.cancel().catch(e => console.error("Failed to cancel reader on cleanup", e));
      }
    };
  }, [reader]);

  const disconnect = async () => {
    if (reader) {
        try {
            await reader.cancel();
        } catch (err) {
            console.warn('Error canceling reader:', err);
        } finally {
            setReader(null);
        }
    }
    
    if (selectedPort?.readable) {
        try {
            await selectedPort.close();
        } catch (err) {
            console.warn('Error closing port:', err);
        }
    }
    
    setIsConnected(false);
    setError(null);
  }


  const clearOutput = () => {
    setOutput([])
  }

  useEffect(() => {
    listPorts()
    
    const handleConnect = (e) => {
      console.log('port connected', e.port)
      listPorts()
    }
    const handleDisconnect = (e) => {
      console.log('port disconnected', e.port)
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

  const value = {
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
    filter,
    setFilter,
  }

  return <SerialPortContext.Provider value={value}>{children}</SerialPortContext.Provider>
}

// 3. Contextを使用するためのカスタムフック
export const useSerialPort = () => {
  const context = useContext(SerialPortContext)
  if (!context) {
    throw new Error('useSerialPort must be used within a SerialPortProvider')
  }
  return context
}
