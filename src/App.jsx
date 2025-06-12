import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button.jsx'
import { Input } from '@/components/ui/input.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx'
import { Switch } from '@/components/ui/switch.jsx'
import { AlertCircle, Play, Square, Trash2, Filter, Usb, Download, Settings, Wifi, WifiOff } from 'lucide-react'
import './App.css'

function App() {
  const [port, setPort] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [logs, setLogs] = useState([])
  const [filteredLogs, setFilteredLogs] = useState([])
  const [filterRegex, setFilterRegex] = useState('')
  const [isFilterValid, setIsFilterValid] = useState(true)
  const [baudRate, setBaudRate] = useState('9600')
  const [error, setError] = useState('')
  const [deviceInfo, setDeviceInfo] = useState(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [timestampFormat, setTimestampFormat] = useState('time')
  const [logLevel, setLogLevel] = useState('all')
  const readerRef = useRef(null)
  const logContainerRef = useRef(null)

  // Web Serial API サポートチェック
  const isWebSerialSupported = 'serial' in navigator

  // 一般的なボーレート
  const baudRates = ['9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600']

  // フィルタリング処理
  useEffect(() => {
    let filtered = logs

    // ログレベルフィルター
    if (logLevel !== 'all') {
      filtered = filtered.filter(log => {
        const data = log.data.toLowerCase()
        switch (logLevel) {
          case 'error':
            return data.includes('error') || data.includes('err')
          case 'warning':
            return data.includes('warning') || data.includes('warn')
          case 'info':
            return data.includes('info')
          case 'debug':
            return data.includes('debug')
          default:
            return true
        }
      })
    }

    // 正規表現フィルター
    if (filterRegex) {
      try {
        const regex = new RegExp(filterRegex, 'gi')
        filtered = filtered.filter(log => regex.test(log.data))
        setIsFilterValid(true)
      } catch (e) {
        setIsFilterValid(false)
        filtered = logs
      }
    } else {
      setIsFilterValid(true)
    }

    setFilteredLogs(filtered)
  }, [logs, filterRegex, logLevel])

  // ログコンテナの自動スクロール
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [filteredLogs, autoScroll])

  // タイムスタンプフォーマット
  const formatTimestamp = (date) => {
    switch (timestampFormat) {
      case 'full':
        return date.toLocaleString()
      case 'time':
        return date.toLocaleTimeString()
      case 'ms':
        return date.toLocaleTimeString() + '.' + date.getMilliseconds().toString().padStart(3, '0')
      default:
        return date.toLocaleTimeString()
    }
  }

  // シリアルポート接続
  const connectToDevice = async () => {
    try {
      setError('')
      console.log('Requesting serial port...')
      
      // フィルターを設定（オプション）
      const filters = [
        // Arduino Uno
        { usbVendorId: 0x2341, usbProductId: 0x0043 },
        { usbVendorId: 0x2341, usbProductId: 0x0001 },
        // ESP32
        { usbVendorId: 0x10C4, usbProductId: 0xEA60 },
        // CH340
        { usbVendorId: 0x1A86, usbProductId: 0x7523 },
        // FTDI
        { usbVendorId: 0x0403, usbProductId: 0x6001 },
      ]
      
      const selectedPort = await navigator.serial.requestPort({ filters })
      console.log('Port selected:', selectedPort)
      
      await selectedPort.open({ 
        baudRate: parseInt(baudRate),
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      })
      console.log('Port opened successfully')
      
      const info = selectedPort.getInfo()
      setDeviceInfo(info)
      setPort(selectedPort)
      setIsConnected(true)
      
      // 接続イベントリスナー
      selectedPort.addEventListener('disconnect', () => {
        console.log('Device disconnected')
        setIsConnected(false)
        setPort(null)
        setDeviceInfo(null)
        if (isReading) {
          setIsReading(false)
        }
      })
      
    } catch (err) {
      console.error('Connection error:', err)
      if (err.name === 'NotFoundError') {
        setError('デバイスが選択されませんでした。')
      } else if (err.name === 'SecurityError') {
        setError('セキュリティエラー: HTTPSが必要です。')
      } else {
        setError(`接続エラー: ${err.message}`)
      }
    }
  }

  // シリアルポート切断
  const disconnectDevice = async () => {
    try {
      if (isReading) {
        await stopReading()
      }
      if (port && port.readable) {
        await port.close()
      }
      setPort(null)
      setIsConnected(false)
      setDeviceInfo(null)
      setError('')
    } catch (err) {
      console.error('Disconnect error:', err)
      setError(`切断エラー: ${err.message}`)
    }
  }

  // データ読み取り開始
  const startReading = async () => {
    if (!port || !port.readable) {
      setError('ポートが利用できません。')
      return
    }

    setIsReading(true)
    setError('')
    console.log('Starting to read data...')

    try {
      const reader = port.readable.getReader()
      readerRef.current = reader

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          console.log('Reading completed')
          break
        }

        const text = new TextDecoder().decode(value)
        const timestamp = new Date()
        
        // 改行で分割してログエントリを作成
        const lines = text.split(/\r?\n/).filter(line => line.trim())
        
        lines.forEach(line => {
          if (line.trim()) {
            setLogs(prevLogs => [...prevLogs, {
              id: Date.now() + Math.random(),
              timestamp,
              data: line.trim()
            }])
          }
        })
      }
    } catch (err) {
      console.error('Reading error:', err)
      if (err.name !== 'NetworkError' && err.name !== 'AbortError') {
        setError(`読み取りエラー: ${err.message}`)
      }
    } finally {
      if (readerRef.current) {
        try {
          readerRef.current.releaseLock()
        } catch (e) {
          console.log('Reader already released')
        }
        readerRef.current = null
      }
      setIsReading(false)
    }
  }

  // データ読み取り停止
  const stopReading = async () => {
    if (readerRef.current) {
      try {
        await readerRef.current.cancel()
        readerRef.current.releaseLock()
      } catch (e) {
        console.log('Error stopping reader:', e)
      }
      readerRef.current = null
    }
    setIsReading(false)
  }

  // ログクリア
  const clearLogs = () => {
    setLogs([])
    setFilteredLogs([])
  }

  // ログエクスポート
  const exportLogs = () => {
    const logText = filteredLogs.map(log => 
      `[${formatTimestamp(log.timestamp)}] ${log.data}`
    ).join('\n')
    
    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `serial-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // テストデータ追加（開発用）
  const addTestData = () => {
    const testMessages = [
      'INFO: System initialized',
      'ERROR: Connection failed',
      'WARNING: Low battery detected',
      'DEBUG: Processing sensor data...',
      'INFO: Task completed successfully',
      'ERROR: Memory allocation failed',
      'WARNING: Temperature threshold exceeded'
    ]
    
    testMessages.forEach((msg, index) => {
      setTimeout(() => {
        const timestamp = new Date()
        setLogs(prevLogs => [...prevLogs, {
          id: Date.now() + Math.random(),
          timestamp,
          data: msg
        }])
      }, index * 300)
    })
  }

  if (!isWebSerialSupported) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              サポートされていません
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              このブラウザはWeb Serial APIをサポートしていません。
              Chrome、Edge、またはその他のChromiumベースのブラウザをご利用ください。
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ヘッダー */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-3xl font-bold flex items-center gap-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              <Usb className="h-8 w-8 text-blue-600" />
              USB Serial Monitor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 接続設定 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="baudRate" className="text-sm font-medium">ボーレート</Label>
                <Select value={baudRate} onValueChange={setBaudRate} disabled={isConnected}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {baudRates.map(rate => (
                      <SelectItem key={rate} value={rate}>{rate}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">接続状態</Label>
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-gray-400" />
                  )}
                  <Badge variant={isConnected ? "default" : "secondary"} className="transition-all">
                    {isConnected ? "接続中" : "未接続"}
                  </Badge>
                </div>
              </div>
              
              {deviceInfo && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">デバイス情報</Label>
                  <div className="text-sm text-gray-600 font-mono">
                    VID: 0x{deviceInfo.usbVendorId?.toString(16).padStart(4, '0') || 'N/A'}<br/>
                    PID: 0x{deviceInfo.usbProductId?.toString(16).padStart(4, '0') || 'N/A'}
                  </div>
                </div>
              )}
            </div>

            {/* 接続ボタン */}
            <div className="flex gap-3 flex-wrap">
              {!isConnected ? (
                <Button onClick={connectToDevice} className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-all duration-200">
                  <Usb className="h-4 w-4 mr-2" />
                  デバイスに接続
                </Button>
              ) : (
                <Button onClick={disconnectDevice} variant="outline" className="hover:bg-red-50 hover:border-red-300 transition-all duration-200">
                  切断
                </Button>
              )}
              
              {isConnected && (
                <>
                  {!isReading ? (
                    <Button onClick={startReading} className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 transition-all duration-200">
                      <Play className="h-4 w-4 mr-2" />
                      読み取り開始
                    </Button>
                  ) : (
                    <Button onClick={stopReading} variant="outline" className="hover:bg-orange-50 hover:border-orange-300 transition-all duration-200">
                      <Square className="h-4 w-4 mr-2" />
                      読み取り停止
                    </Button>
                  )}
                </>
              )}
              
              {/* 開発用テストボタン */}
              <Button onClick={addTestData} variant="secondary" size="sm" className="transition-all duration-200">
                テストデータ追加
              </Button>
            </div>

            {/* エラー表示 */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* フィルター・設定パネル */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* フィルター設定 */}
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="h-5 w-5" />
                フィルター設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="logLevel" className="text-sm font-medium">ログレベル</Label>
                <Select value={logLevel} onValueChange={setLogLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="error">エラーのみ</SelectItem>
                    <SelectItem value="warning">警告のみ</SelectItem>
                    <SelectItem value="info">情報のみ</SelectItem>
                    <SelectItem value="debug">デバッグのみ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="filterRegex" className="text-sm font-medium">正規表現フィルター</Label>
                <Input
                  id="filterRegex"
                  value={filterRegex}
                  onChange={(e) => setFilterRegex(e.target.value)}
                  placeholder="例: ^ERROR|WARNING"
                  className={`transition-all duration-200 ${!isFilterValid ? 'border-red-500 focus:border-red-500' : 'focus:border-blue-500'}`}
                />
                {!isFilterValid && (
                  <Badge variant="destructive" className="text-xs">無効な正規表現</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 表示設定 */}
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5" />
                表示設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="timestampFormat" className="text-sm font-medium">タイムスタンプ形式</Label>
                <Select value={timestampFormat} onValueChange={setTimestampFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time">時刻のみ</SelectItem>
                    <SelectItem value="full">日時</SelectItem>
                    <SelectItem value="ms">ミリ秒付き</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="autoScroll" className="text-sm font-medium">自動スクロール</Label>
                <Switch
                  id="autoScroll"
                  checked={autoScroll}
                  onCheckedChange={setAutoScroll}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ログ表示 */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                ログ ({filteredLogs.length}/{logs.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  onClick={exportLogs} 
                  variant="outline" 
                  size="sm" 
                  disabled={filteredLogs.length === 0}
                  className="transition-all duration-200 hover:bg-blue-50 hover:border-blue-300"
                >
                  <Download className="h-4 w-4 mr-2" />
                  エクスポート
                </Button>
                <Button 
                  onClick={clearLogs} 
                  variant="outline" 
                  size="sm"
                  className="transition-all duration-200 hover:bg-red-50 hover:border-red-300"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  クリア
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div 
              ref={logContainerRef}
              className="h-96 overflow-y-auto bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg border shadow-inner"
              style={{ scrollBehavior: autoScroll ? 'smooth' : 'auto' }}
            >
              {filteredLogs.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  {logs.length === 0 ? (
                    <div className="space-y-2">
                      <div className="text-lg">📡</div>
                      <div>ログがありません</div>
                      <div className="text-xs">デバイスを接続して読み取りを開始してください</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-lg">🔍</div>
                      <div>フィルター条件に一致するログがありません</div>
                    </div>
                  )}
                </div>
              ) : (
                filteredLogs.map((log, index) => (
                  <div 
                    key={log.id} 
                    className="mb-1 hover:bg-gray-800/50 px-2 py-1 rounded transition-colors duration-150"
                  >
                    <span className="text-gray-400 text-xs">
                      [{formatTimestamp(log.timestamp)}]
                    </span>{' '}
                    <span className={
                      log.data.toLowerCase().includes('error') ? 'text-red-400' :
                      log.data.toLowerCase().includes('warning') ? 'text-yellow-400' :
                      log.data.toLowerCase().includes('info') ? 'text-blue-400' :
                      log.data.toLowerCase().includes('debug') ? 'text-purple-400' :
                      'text-green-400'
                    }>
                      {log.data}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default App

