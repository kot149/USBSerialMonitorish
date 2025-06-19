import React, { useState, useEffect, createContext, useContext, useRef } from 'react'
import { useLocalStorage } from './useLocalStorage'

const SerialPortContext = createContext(null)

export function SerialPortProvider({ children }) {
  const [ports, setPorts] = useState([])
  const [selectedPort, setSelectedPort] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [baudRate, setBaudRate] = useLocalStorage('serialMonitor_baudRate', 9600)
  const [reader, setReader] = useState(null)
  const [output, setOutput] = useState([])
  const [filter, setFilter] = useLocalStorage('serialMonitor_filter', '')
  const [maxLogLines, setMaxLogLines] = useLocalStorage('serialMonitor_maxLogLines', 1000)
  const maxLogLinesRef = useRef(maxLogLines)
  
  // Update ref when maxLogLines changes
  useEffect(() => {
    maxLogLinesRef.current = maxLogLines
  }, [maxLogLines])
  
  const [autoReconnect] = useState(true)
  const [reconnectDelay] = useState(2000)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [reconnectTimeoutId, setReconnectTimeoutId] = useState(null)
  const [isReconnectCancelled, setIsReconnectCancelled] = useState(false)

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

    setIsReconnectCancelled(false);

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
        if (err !== undefined && !err.message.includes('device has been lost')) {
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
              if (combined.length > maxLogLinesRef.current) {
                return combined.slice(combined.length - maxLogLinesRef.current);
              }
              return combined;
            });
          }

        } catch (err) {
          if (!isCancelled) {
            if (!err.message.includes('device has been lost')) {
              console.error("Read error:", err);
            }
            setError("Connection lost. Attempting to reconnect...");
            setIsConnected(false);
            setIsReconnecting(true);
            setIsReconnectCancelled(false);

            // Clean up current connection - ignore errors for lost devices
            try {
              if (reader) {
                const currentReader = reader;
                setReader(null);
                await currentReader.cancel();
              }
            } catch (cleanupError) {
              // Ignore cleanup errors when device is lost
              if (!cleanupError.message.includes('device has been lost')) {
                console.warn('Cleanup error:', cleanupError);
              }
            }

            const timeoutId = setTimeout(() => {
              attemptReconnect();
            }, reconnectDelay);
            setReconnectTimeoutId(timeoutId);
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
           if (newOutput.length > maxLogLinesRef.current) {
            return newOutput.slice(newOutput.length - maxLogLinesRef.current);
          }
          return newOutput;
        });
      }
      if (reader) {
        reader.cancel().catch(e => {
          if (e !== undefined && !e.message.includes('device has been lost')) {
            console.error("Failed to cancel reader on cleanup", e);
          }
        });
      }
    };
  }, [reader]);

  const disconnect = async () => {
    setIsConnected(false);
    setIsReconnectCancelled(true);

    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      setReconnectTimeoutId(null);
    }

    if (reader) {
        const currentReader = reader;
        setReader(null);
        try {
            await currentReader.cancel();
        } catch (err) {
            console.warn('Error canceling reader:', err);
        }
    }

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

  const attemptReconnect = async () => {
    if (isReconnecting || isReconnectCancelled) return;

    setIsReconnecting(true);
    setError('Reconnecting...');
    setReconnectTimeoutId(null);

    try {
      // First, properly clean up existing connection
      if (reader) {
        try {
          const currentReader = reader;
          setReader(null);
          await currentReader.cancel();
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (cancelError) {
          if (!cancelError.message.includes('device has been lost')) {
            console.warn('Error canceling reader:', cancelError);
          }
        }
      }

      // Refresh the ports list to get updated port objects
      const availablePorts = await navigator.serial.getPorts();

      if (availablePorts.length === 0) {
        console.log('No devices available, waiting for reconnection...');
        if (!isReconnectCancelled) {
          const timeoutId = setTimeout(() => {
            attemptReconnect();
          }, reconnectDelay);
          setReconnectTimeoutId(timeoutId);
        }
        return;
      }

      // Try to find the exact same device by vendor/product/serial ID
      let targetPort = null;
      let originalInfo = null;

      if (selectedPort) {
        try {
          originalInfo = selectedPort.getInfo();
          targetPort = availablePorts.find(port => {
            const info = port.getInfo();
            // Match by vendor ID, product ID, and serial number if available
            const vendorMatch = info.usbVendorId === originalInfo.usbVendorId;
            const productMatch = info.usbProductId === originalInfo.usbProductId;
            const serialMatch = !originalInfo.usbSerialNumber ||
                               info.usbSerialNumber === originalInfo.usbSerialNumber;

            return vendorMatch && productMatch && serialMatch;
          });
        } catch (infoError) {
          console.warn('Error getting original port info:', infoError);
        }
      }

      if (!targetPort) {
        const deviceDesc = originalInfo ?
          `device (VID:${originalInfo.usbVendorId?.toString(16)}, PID:${originalInfo.usbProductId?.toString(16)})` :
          'original device';
        console.log(`Waiting for ${deviceDesc} to reconnect...`);
        setError(`Waiting for ${deviceDesc} to reconnect...`);
        if (!isReconnectCancelled) {
          const timeoutId = setTimeout(() => {
            attemptReconnect();
          }, reconnectDelay);
          setReconnectTimeoutId(timeoutId);
        }
        return;
      }

      // Update the selected port to the new port object
      setSelectedPort(targetPort);

      // Check if port is already open and close it if necessary
      try {
        if (targetPort.readable || targetPort.writable) {
          // Port is already open, try to close it
          try {
            await targetPort.close();
            await new Promise(resolve => setTimeout(resolve, 300));
          } catch (closeError) {
            if (!closeError.message.includes('device has been lost') &&
                !closeError.message.includes('Cannot cancel a locked stream')) {
              console.warn('Error closing port during reconnect:', closeError);
            }
            // If we can't close it, wait a bit and try to use it as-is
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } catch (stateError) {
        console.warn('Error checking port state:', stateError);
      }

      // Try to open the port
      if (!targetPort.readable && !targetPort.writable) {
        await targetPort.open({ baudRate: parseInt(baudRate) || 9600 });
      } else {
        console.log('Port is already open, reusing connection');
      }

      setBaudRate(baudRate);
      setIsConnected(true);
      setError(null);

      const textDecoder = new TextDecoderStream();
      targetPort.readable.pipeTo(textDecoder.writable).catch(err => {
        if (err !== undefined && !err.message.includes('device has been lost')) {
          console.warn('PipeTo error:', err);
        }
      });
      const newReader = textDecoder.readable.getReader();
      setReader(newReader);

      setIsReconnecting(false);
      setIsReconnectCancelled(false);
      setReconnectTimeoutId(null);

    } catch (err) {
      console.error('Reconnect attempt failed:', err);
      if (!isReconnectCancelled) {
        const timeoutId = setTimeout(() => {
          attemptReconnect();
        }, reconnectDelay);
        setReconnectTimeoutId(timeoutId);
      }
    }
  };

  const cancelReconnect = () => {
    setIsReconnectCancelled(true);
    setIsReconnecting(false);

    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      setReconnectTimeoutId(null);
    }

    setError('Reconnection cancelled');
    setTimeout(() => {
      setError(null);
    }, 2000);
  };

  const clearOutput = () => {
    setOutput([])
  }

  useEffect(() => {
    listPorts()

    const handleConnect = (e) => {
      listPorts()
      // If we're trying to reconnect and a new device is connected, try to reconnect
      if (!isConnected && !isReconnecting && !isReconnectCancelled) {
        console.log('Device connected, attempting reconnect...');
        setIsReconnectCancelled(false);
        const timeoutId = setTimeout(() => {
          attemptReconnect();
        }, 500);
        setReconnectTimeoutId(timeoutId);
      }
    }
    const handleDisconnect = async (e) => {
      if(selectedPort === e.port) {
        setIsConnected(false);
        setIsReconnecting(true);
        setIsReconnectCancelled(false);

        // Clean up current connection
        try {
          if (reader) {
            const currentReader = reader;
            setReader(null);
            await currentReader.cancel();
          }
        } catch (cleanupError) {
          // Ignore cleanup errors when device is lost
          if (!cleanupError.message.includes('device has been lost')) {
            console.warn('Cleanup error on disconnect:', cleanupError);
          }
        }

        const timeoutId = setTimeout(() => {
          attemptReconnect();
        }, reconnectDelay);
        setReconnectTimeoutId(timeoutId);
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
    setBaudRate,
    output,
    clearOutput,
    selectPort: setSelectedPort,
    filter,
    setFilter,
    maxLogLines,
    setMaxLogLines,
    isReconnecting,
    cancelReconnect,
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
