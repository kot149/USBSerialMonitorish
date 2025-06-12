import React, { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react'

const SerialPortContext = createContext(null)

export function SerialPortProvider({ children }) {
  const [ports, setPorts] = useState([])
  const [selectedPort, setSelectedPort] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [baudRate, setBaudRate] = useState(9600) // Default baud rate
  const [reader, setReader] = useState(null)
  const [output, setOutput] = useState([])
  const [filter, setFilter] = useState('')
  const [maxLogLines, setMaxLogLines] = useState(1000)

  // Use a ref to store the reader so it can be accessed in the cleanup function without stale closure issues
  const readerRef = useRef(reader);
  useEffect(() => {
    readerRef.current = reader;
  }, [reader]);

  // Use a ref to store the selectedPort so it can be accessed in cleanup/disconnect without stale closure issues
  const selectedPortRef = useRef(selectedPort);
  useEffect(() => {
    selectedPortRef.current = selectedPort;
  }, [selectedPort]);

  /**
   * Lists available serial ports.
   */
  const listPorts = useCallback(async () => {
    if (!('serial' in navigator)) {
      setError('Web Serial API is not supported in this browser');
      return;
    }
    try {
      const availablePorts = await navigator.serial.getPorts();
      setPorts(availablePorts.filter(port => {
        const info = port.getInfo();
        return !info.usbVendorId || (info.usbVendorId && !info.bluetoothServiceClassId);
      }));
    } catch (err) {
      setError('Failed to list serial ports');
      console.error('Failed to get ports:', err);
    }
  }, []);

  /**
   * Requests a new serial port from the user.
   */
  const requestPort = useCallback(async () => {
    setError(null); // Clear any previous errors
    if (!('serial' in navigator)) {
      setError('Web Serial API is not supported');
      return;
    }
    try {
      // Request a new port from the user
      const port = await navigator.serial.requestPort();
      // Add the new port to the list if it's not already there
      setPorts(prev => {
        if (!prev.some(p => p === port)) {
            return [...prev, port];
        }
        return prev;
      });
      setSelectedPort(port); // Set the newly selected port
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setError('No compatible serial port selected');
      } else {
        setError('Failed to access serial port');
      }
      console.error('Failed to request port:', err);
    }
  }, []);

  /**
   * Disconnects from the currently selected serial port.
   */
  const disconnect = useCallback(async () => {
    setError(null); // Clear any previous errors
    setIsConnected(false); // Immediately update UI state to disconnected

    let currentReader = readerRef.current;
    let currentPort = selectedPortRef.current;

    // 1. Cancel the reader to stop incoming data
    if (currentReader) {
      console.log('Attempting to cancel reader...');
      try {
        await currentReader.cancel();
        console.log('Reader cancelled.');
      } catch (err) {
        console.warn('Error cancelling reader:', err);
        // This can happen if the stream is already locked by another reader or already errored.
        // We still proceed to close the port in such cases.
      } finally {
        setReader(null); // Ensure reader state is null regardless of cancellation success
      }
    }

    // 2. Close the serial port itself
    if (currentPort) {
      console.log('Attempting to close port...');
      try {
        // If the readable stream is still active and not locked by the reader (which was just cancelled),
        // we might need to cancel the stream itself.
        if (currentPort.readable && currentPort.readable.active) {
            console.log('Cancelling readable stream...');
            try {
                await currentPort.readable.cancel();
                console.log('Readable stream cancelled.');
            } catch (err) {
                console.warn('Error cancelling readable stream:', err);
            }
        }
        // Ensure writable stream is closed
        if (currentPort.writable && currentPort.writable.active) {
            console.log('Closing writable stream...');
            try {
                await currentPort.writable.close();
                console.log('Writable stream closed.');
            } catch (err) {
                console.warn('Error closing writable stream:', err);
            }
        }

        // Close the port after ensuring streams are handled
        if (currentPort.close) {
            await currentPort.close();
            console.log('Port closed successfully.');
        }
      } catch (err) {
        console.error('Error closing port:', err);
        setError(`Failed to close port: ${err.message}`);
      }
    } else {
      console.warn('No selectedPort found to close.');
    }
    
    // Always clear the selected port from state after disconnection attempt
    setSelectedPort(null); 
  }, []); // Dependencies: none, as we use refs for dynamic values inside

  /**
   * Connects to the selected serial port.
   * @param {string} selectedBaudRate - The baud rate for the connection.
   */
  const connect = useCallback(async (selectedBaudRate) => {
    if (!selectedPortRef.current) { // Use ref for current port
      setError('No port selected');
      return;
    }
    try {
      await selectedPortRef.current.open({ baudRate: parseInt(selectedBaudRate) || 9600 });
      setBaudRate(selectedBaudRate);
      setIsConnected(true);
      setError(null);
      
      // Setup TextDecoderStream to handle incoming data
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = selectedPortRef.current.readable.pipeTo(textDecoder.writable);
      const newReader = textDecoder.readable.getReader();
      setReader(newReader); // Update reader state for readLoop to use

      // Handle stream closure for cleanup
      readableStreamClosed.catch((err) => {
          if (isConnected) { // Only report error if we are supposed to be connected
              console.error('Readable stream pipe error:', err);
              setError(`Stream error: ${err.message}`);
              disconnect(); // Auto-disconnect on stream error
          }
      });

    } catch (err) {
      setError(`Failed to connect: ${err.message}`);
      console.error('Connection error:', err);
      // Ensure state is clean on connection failure
      setIsConnected(false);
      setReader(null);
      setSelectedPort(null); // Clear selected port if connection fails
    }
  }, [disconnect]); // Dependencies: disconnect function for auto-disconnect on stream errors

  // Effect for reading data from the serial port
  useEffect(() => {
    let isCancelledReadLoop = false; // Flag for this specific read loop instance
    let buffer = ''; // Buffer to accumulate partial lines

    const stripAnsi = (str) => {
      // eslint-disable-next-line no-control-regex
      const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
      return str.replace(ansiRegex, '');
    };

    const readLoop = async () => {
      // Ensure there's an active reader before starting the loop
      if (!readerRef.current) {
        console.log('Read loop not started: no reader available.');
        return;
      }

      console.log('Read loop started.');
      try {
        while (!isCancelledReadLoop) {
          const currentReader = readerRef.current; // Get the latest reader instance
          if (!currentReader) {
            console.log('Reader became null, stopping read loop.');
            break; // Reader was set to null by disconnect or other means
          }

          const { value, done } = await currentReader.read();
          
          if (done) {
            console.log('Reader stream closed or cancelled.');
            break; // Exit loop if the stream is done
          }

          buffer += value; // Append new data to buffer

          // Process complete lines from the buffer
          const newLines = [];
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex + 1);
            buffer = buffer.slice(newlineIndex + 1);
            const cleanedLine = stripAnsi(line);
            newLines.push(cleanedLine);
          }

          // Update output state with new lines, respecting maxLogLines
          if (newLines.length > 0) {
            setOutput((prev) => {
              const combined = [...prev, ...newLines];
              if (combined.length > maxLogLines) {
                return combined.slice(combined.length - maxLogLines);
              }
              return combined;
            });
          }
        }
      } catch (err) {
        // If an error occurs and it's not due to an intentional cancellation
        if (!isCancelledReadLoop) {
          console.error('Error reading from port:', err);
          setError(`Reading error: ${err.message}`);
          // Attempt to disconnect gracefully on read error
          disconnect(); // This calls the useCallback disconnect
        } else {
            console.log('Read loop caught error during intentional cancellation:', err);
        }
      } finally {
        console.log('Read loop finished.');
        // Clean up any remaining buffer when the loop exits
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
      }
    };

    readLoop();

    // Cleanup function for this useEffect instance
    return () => {
      console.log('Read loop useEffect cleanup.');
      isCancelledReadLoop = true; // Signal this specific readLoop to stop
      // The `disconnect` function (or `readerRef.current.cancel()`) is the primary way to stop the reader.
      // We don't try to cancel the reader here if it's already being handled by `disconnect`
      // or if it's already null. This avoids redundant or conflicting calls.
    };
  }, [reader, maxLogLines, disconnect]); // Dependencies: reader, maxLogLines, and disconnect function

  /**
   * Clears the monitor output.
   */
  const clearOutput = useCallback(() => {
    setOutput([]);
  }, []);

  // Effect for handling browser-level serial port connect/disconnect events
  useEffect(() => {
    listPorts(); // Initial listing of ports on component mount

    const handleConnect = (e) => {
      console.log('Serial port connected event:', e.port);
      listPorts(); // Refresh the list of available ports
      // If the newly connected port matches our currently selected one, update status
      if (selectedPortRef.current && selectedPortRef.current === e.port) {
        setIsConnected(true);
      }
    };

    const handleDisconnect = (e) => {
      console.log('Serial port disconnected event:', e.port);
      if (selectedPortRef.current && selectedPortRef.current === e.port) {
        console.log('Our selected port was disconnected. Initiating app-level disconnect.');
        disconnect(); // Call the useCallback-wrapped disconnect function
      }
      listPorts(); // Refresh the list of available ports after any disconnection
    };

    // Add event listeners for global serial port connection/disconnection
    navigator.serial.addEventListener('connect', handleConnect);
    navigator.serial.addEventListener('disconnect', handleDisconnect);

    // Cleanup function for this useEffect
    return () => {
      console.log('Serial event listeners cleanup.');
      navigator.serial.removeEventListener('connect', handleConnect);
      navigator.serial.removeEventListener('disconnect', handleDisconnect);
    };
  }, [listPorts, disconnect]); // Dependencies: listPorts and disconnect, both are useCallback-wrapped

  // Provide the state and functions to the context consumers
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
    maxLogLines,
    setMaxLogLines,
  };

  return <SerialPortContext.Provider value={value}>{children}</SerialPortContext.Provider>;
}

export const useSerialPort = () => {
  const context = useContext(SerialPortContext);
  if (!context) {
    throw new Error('useSerialPort must be used within a SerialPortProvider');
  }
  return context;
};

