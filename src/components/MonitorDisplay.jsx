import React, { useRef, useEffect, useMemo } from 'react';
import { useSerialPort } from '../hooks/useSerialPort';

export function MonitorDisplay() {
  const { output, clearOutput, filter } = useSerialPort();
  const monitorRef = useRef(null);

  // useMemoを使用してフィルタリングされた出力を計算
  const filteredOutput = useMemo(() => {
    if (!filter) {
      return output;
    }
    try {
      // 大文字小文字を区別しない正規表現
      const regex = new RegExp(filter, 'i');
      return output.filter(line => regex.test(line));
    } catch (e) {
      console.warn('Invalid regex:', e);
      // 無効な正規表現の場合はフィルタリングしない
      return output;
    }
  }, [output, filter]);

  // filteredOutputが変更されたときにスクロール
  useEffect(() => {
    if (monitorRef.current) {
      monitorRef.current.scrollTop = monitorRef.current.scrollHeight;
    }
  }, [filteredOutput]);

  // 表示するテキストを作成
  const displayText = filteredOutput.length > 0
    ? filteredOutput.join('') // 配列の各行を結合
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
          {displayText}
        </pre>
      </div>
    </div>
  );
}
