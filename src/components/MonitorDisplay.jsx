import React, { useRef, useEffect, useMemo } from 'react';
import { useSerialPort } from '../hooks/useSerialPort';

export function MonitorDisplay() {
  const { output, clearOutput, filter } = useSerialPort();
  const monitorRef = useRef(null);

  const filteredOutput = useMemo(() => {
    if (!filter) {
      return output;
    }
    try {
      const regex = new RegExp(filter, 'i');
      return output.filter(line => regex.test(line));
    } catch (e) {
      console.warn('Invalid regex:', e);
      return output;
    }
  }, [output, filter]);

  // filteredOutputが変更されたときにスクロール
  useEffect(() => {
    if (monitorRef.current) {
      monitorRef.current.scrollTop = monitorRef.current.scrollHeight;
    }
  }, [filteredOutput]);

  const renderHighlightedText = (text, searchPattern) => {
    if (!searchPattern) {
      return text;
    }

    try {
      const regex = new RegExp(`(${searchPattern})`, 'gi');
      const parts = text.split(regex);

      return parts.map((part, index) => {
        if (regex.test(part)) {
          return <mark key={index}>{part}</mark>;
        }
        return part;
      });
    } catch (e) {
      return text;
    }
  };

  const displayContent = filteredOutput.length > 0
    ? filteredOutput.map((line, lineIndex) => (
        <span key={lineIndex}>
          {renderHighlightedText(line, filter)}
        </span>
      ))
    : (output.length > 0 && filter ? 'No matching logs.' : 'Waiting for data...');

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
          {displayContent}
        </pre>
      </div>
    </div>
  );
}
