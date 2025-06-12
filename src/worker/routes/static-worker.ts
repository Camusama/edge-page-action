import { Hono } from 'hono'

/**
 * Cloudflare Workers 静态文件服务
 *
 * 由于 Cloudflare Workers 不支持文件系统 API，
 * 我们将静态文件内容直接嵌入到代码中
 */

// 读取 test-dashboard.html 内容并嵌入
const TEST_DASHBOARD_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Edge Sync State 完整测试仪表板 - Cloudflare Workers</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        padding: 20px;
      }
      .header {
        text-align: center;
        color: white;
        margin-bottom: 30px;
      }
      .header h1 {
        font-size: 2.5em;
        margin-bottom: 10px;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
      }
      .dashboard {
        max-width: 1400px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 20px;
      }
      .card {
        background: rgba(255, 255, 255, 0.95);
        border-radius: 15px;
        padding: 25px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.3);
      }
      .card-title {
        color: #333;
        border-bottom: 3px solid #2196f3;
        padding-bottom: 10px;
        margin-bottom: 20px;
        font-size: 1.3em;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .status-indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #f44336;
        animation: pulse 2s infinite;
      }
      .status-indicator.connected {
        background: #4caf50;
      }
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 15px;
        margin: 15px 0;
      }
      .stat-item {
        background: linear-gradient(135deg, #e3f2fd, #bbdefb);
        padding: 15px;
        border-radius: 10px;
        text-align: center;
        border: 1px solid #90caf9;
      }
      .stat-value {
        font-size: 1.5em;
        font-weight: bold;
        color: #1976d2;
      }
      .stat-label {
        font-size: 0.85em;
        color: #666;
        margin-top: 5px;
      }
      .btn {
        background: linear-gradient(135deg, #2196f3, #1976d2);
        color: white;
        border: none;
        padding: 10px 16px;
        border-radius: 8px;
        cursor: pointer;
        margin: 4px;
        font-weight: 500;
        transition: all 0.3s ease;
        font-size: 14px;
      }
      .btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(33, 150, 243, 0.4);
      }
      .btn.success { background: linear-gradient(135deg, #4caf50, #45a049); }
      .btn.danger { background: linear-gradient(135deg, #f44336, #d32f2f); }
      .btn.warning { background: linear-gradient(135deg, #ff9800, #f57c00); }
      .btn.small { padding: 6px 12px; font-size: 12px; }
      .input-group { margin: 10px 0; }
      .input-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
        color: #333;
      }
      input, textarea, select {
        width: 100%;
        padding: 10px;
        border: 2px solid #e0e0e0;
        border-radius: 6px;
        font-size: 14px;
        transition: border-color 0.3s ease;
      }
      input:focus, textarea:focus, select:focus {
        outline: none;
        border-color: #2196f3;
        box-shadow: 0 0 10px rgba(33, 150, 243, 0.2);
      }
      .log-container {
        background: #1a1a1a;
        border-radius: 8px;
        padding: 15px;
        height: 300px;
        overflow-y: auto;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        line-height: 1.4;
        border: 2px solid #333;
      }
      .log-entry { margin-bottom: 5px; padding: 2px 0; }
      .log-entry.info { color: #00ff00; }
      .log-entry.success { color: #4caf50; }
      .log-entry.error { color: #f44336; }
      .log-entry.warning { color: #ff9800; }
      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 15px 0;
      }
      .full-width { grid-column: 1 / -1; }
      .response-display {
        margin-top: 10px;
        padding: 10px;
        background: #f0f8ff;
        border-radius: 6px;
        border-left: 4px solid #2196f3;
        font-size: 13px;
        display: none;
      }
      .environment-badge {
        background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        color: white;
        padding: 5px 10px;
        border-radius: 15px;
        font-size: 0.8em;
        font-weight: bold;
        margin-left: 10px;
        animation: glow 2s ease-in-out infinite alternate;
      }
      @keyframes glow {
        from { box-shadow: 0 0 5px #ff6b6b; }
        to { box-shadow: 0 0 20px #ff6b6b, 0 0 30px #ff6b6b; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>🚀 Edge Sync State 测试仪表板</h1>
      <p>Cloudflare Workers + KV 存储模式 <span class="environment-badge">EDGE COMPUTING</span></p>
    </div>

    <div class="dashboard">
      <!-- 连接状态卡片 -->
      <div class="card">
        <h3 class="card-title">
          🔗 连接状态
          <div class="status-indicator" id="statusIndicator"></div>
        </h3>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value" id="connectionStatus">离线</div>
            <div class="stat-label">连接状态</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="connectionTime">0s</div>
            <div class="stat-label">连接时长</div>
          </div>
        </div>
        <div class="input-group">
          <label>ChatBot ID:</label>
          <input type="text" id="chatbotIdDisplay" readonly />
        </div>
        <div class="button-row">
          <button class="btn success" onclick="connect()">🔌 连接</button>
          <button class="btn danger" onclick="disconnect()">❌ 断开</button>
          <button class="btn warning" onclick="testConnection()">🧪 测试</button>
        </div>
      </div>

      <!-- 系统监控卡片 -->
      <div class="card">
        <h3 class="card-title">📊 系统监控</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value" id="serverHealth">-</div>
            <div class="stat-label">服务器状态</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="totalConnections">0</div>
            <div class="stat-label">总连接数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="serverEnvironment">-</div>
            <div class="stat-label">运行环境</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="cacheType">-</div>
            <div class="stat-label">存储类型</div>
          </div>
        </div>
        <div class="button-row">
          <button class="btn" onclick="getHealthCheck()">❤️ 健康检查</button>
          <button class="btn" onclick="getSystemStatus()">📈 系统状态</button>
          <button class="btn" onclick="testKVStorage()">🔧 测试 KV</button>
        </div>
        <div id="systemResponse" class="response-display"></div>
      </div>

      <!-- 页面状态管理卡片 -->
      <div class="card">
        <h3 class="card-title">📄 页面状态管理</h3>
        <div class="input-group">
          <label>页面URL:</label>
          <input type="text" id="pageUrl" value="https://example.com/cloudflare-kv-test" />
        </div>
        <div class="input-group">
          <label>页面标题:</label>
          <input type="text" id="pageTitle" value="Cloudflare Workers + KV 测试页面" />
        </div>
        <div class="input-group">
          <label>自定义数据 (JSON):</label>
          <textarea id="customData" rows="3">{"environment": "cloudflare-workers", "storage": "kv", "test": true}</textarea>
        </div>
        <div class="button-row">
          <button class="btn success" onclick="updatePageState()">💾 更新状态</button>
          <button class="btn" onclick="getPageState()">📖 获取状态</button>
          <button class="btn danger" onclick="deletePageState()">🗑️ 删除状态</button>
        </div>
        <div id="pageStateResponse" class="response-display"></div>
      </div>

      <!-- Action 推送测试卡片 -->
      <div class="card">
        <h3 class="card-title">⚡ Action 推送测试</h3>
        <div class="input-group">
          <label>Action 类型:</label>
          <select id="actionType">
            <option value="navigate">🧭 导航 (Navigate)</option>
            <option value="click">👆 点击 (Click)</option>
            <option value="input">⌨️ 输入 (Input)</option>
            <option value="scroll">📜 滚动 (Scroll)</option>
            <option value="custom">🔧 自定义 (Custom)</option>
          </select>
        </div>
        <div class="input-group">
          <label>目标元素 (CSS选择器):</label>
          <input type="text" id="actionTarget" value="#cloudflare-test" />
        </div>
        <div class="input-group">
          <label>Action 数据 (JSON):</label>
          <textarea id="actionPayload" rows="2">{"url": "https://workers.cloudflare.com", "message": "Cloudflare Workers 测试"}</textarea>
        </div>
        <div class="button-row">
          <button class="btn success" onclick="sendCustomAction()">🚀 发送 Action</button>
          <button class="btn warning" onclick="sendQuickActions()">⚡ 快速测试</button>
          <button class="btn" onclick="broadcastAction()">📢 广播</button>
        </div>
        <div id="actionResponse" class="response-display"></div>
      </div>

      <!-- 实时日志卡片 -->
      <div class="card full-width">
        <h3 class="card-title">📝 实时日志</h3>
        <div class="button-row">
          <button class="btn small" onclick="clearLog()">🗑️ 清空日志</button>
          <button class="btn small" onclick="toggleAutoScroll()">📜 自动滚动</button>
          <button class="btn small" onclick="filterLogs('all')">全部</button>
          <button class="btn small success" onclick="filterLogs('success')">成功</button>
          <button class="btn small danger" onclick="filterLogs('error')">错误</button>
          <button class="btn small warning" onclick="filterLogs('warning')">警告</button>
        </div>
        <div id="logContainer" class="log-container"></div>
      </div>
    </div>

    <script>
      // 全局变量 - 自动检测当前环境
      const SERVER_URL = window.location.origin
      const WS_URL = SERVER_URL.replace('http://', 'ws://').replace('https://', 'wss://')
      let CHATBOT_ID = 'dashboard_' + Date.now()
      let websocket = null
      let connectionStartTime = null
      let connectionTimer = null
      let autoScroll = true
      let logFilter = 'all'

      // 初始化
      document.getElementById('chatbotIdDisplay').value = CHATBOT_ID
      log('🌐 Cloudflare Workers 测试仪表板已加载', 'success')
      log('📍 服务器地址: ' + SERVER_URL, 'info')

      // 日志功能
      function log(message, type = 'info') {
        const container = document.getElementById('logContainer')
        const timestamp = new Date().toLocaleTimeString()
        const entry = document.createElement('div')
        entry.className = \`log-entry \${type}\`
        entry.innerHTML = \`<span style="color: #888;">[\${timestamp}]</span> \${message}\`

        if (logFilter === 'all' || logFilter === type) {
          entry.style.display = 'block'
        } else {
          entry.style.display = 'none'
        }

        container.appendChild(entry)

        if (autoScroll) {
          container.scrollTop = container.scrollHeight
        }
      }

      function clearLog() {
        document.getElementById('logContainer').innerHTML = ''
      }

      function toggleAutoScroll() {
        autoScroll = !autoScroll
        log(\`自动滚动已\${autoScroll ? '开启' : '关闭'}\`, 'info')
      }

      function filterLogs(type) {
        logFilter = type
        const entries = document.querySelectorAll('.log-entry')
        entries.forEach(entry => {
          if (type === 'all' || entry.classList.contains(type)) {
            entry.style.display = 'block'
          } else {
            entry.style.display = 'none'
          }
        })
      }

      // 连接管理
      function updateConnectionStatus(connected) {
        const indicator = document.getElementById('statusIndicator')
        const status = document.getElementById('connectionStatus')

        if (connected) {
          indicator.classList.add('connected')
          status.textContent = '在线'
          connectionStartTime = Date.now()
          startConnectionTimer()
        } else {
          indicator.classList.remove('connected')
          status.textContent = '离线'
          stopConnectionTimer()
          document.getElementById('connectionTime').textContent = '0s'
        }
      }

      function startConnectionTimer() {
        connectionTimer = setInterval(() => {
          if (connectionStartTime) {
            const elapsed = Math.floor((Date.now() - connectionStartTime) / 1000)
            document.getElementById('connectionTime').textContent = formatTime(elapsed)
          }
        }, 1000)
      }

      function stopConnectionTimer() {
        if (connectionTimer) {
          clearInterval(connectionTimer)
          connectionTimer = null
        }
      }

      function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60

        if (hours > 0) {
          return \`\${hours}h \${minutes}m \${secs}s\`
        } else if (minutes > 0) {
          return \`\${minutes}m \${secs}s\`
        } else {
          return \`\${secs}s\`
        }
      }

      // API 调用函数
      async function apiCall(endpoint, options = {}) {
        try {
          const response = await fetch(\`\${SERVER_URL}\${endpoint}\`, {
            headers: {
              'Content-Type': 'application/json',
              ...options.headers
            },
            ...options
          })

          const data = await response.json()
          return { success: response.ok, data, status: response.status }
        } catch (error) {
          log(\`API 调用失败: \${error.message}\`, 'error')
          return { success: false, error: error.message }
        }
      }

      // WebSocket 连接
      function connect() {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
          log('⚠️ 已经连接，请先断开', 'warning')
          return
        }

        log('🔌 正在连接 WebSocket...', 'info')
        const wsUrl = \`\${WS_URL}/ws/connect/\${CHATBOT_ID}\`
        log(\`连接地址: \${wsUrl}\`, 'info')

        websocket = new WebSocket(wsUrl)

        websocket.onopen = function(event) {
          log('✅ WebSocket 连接成功', 'success')
          updateConnectionStatus(true)
        }

        websocket.onmessage = function(event) {
          try {
            const message = JSON.parse(event.data)
            log(\`📨 收到消息: \${message.type}\`, 'info')

            if (message.type === 'action') {
              log(\`🎯 收到 Action: \${JSON.stringify(message.data)}\`, 'success')
            }
          } catch (error) {
            log(\`消息解析错误: \${error.message}\`, 'error')
          }
        }

        websocket.onclose = function(event) {
          log(\`❌ WebSocket 连接关闭: \${event.code}\`, 'warning')
          updateConnectionStatus(false)
        }

        websocket.onerror = function(error) {
          log(\`❌ WebSocket 错误: \${error}\`, 'error')
          updateConnectionStatus(false)
        }
      }

      function disconnect() {
        if (websocket) {
          websocket.close()
          websocket = null
          log('🔌 WebSocket 连接已断开', 'info')
          updateConnectionStatus(false)
        } else {
          log('⚠️ 没有活跃的连接', 'warning')
        }
      }

      function testConnection() {
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
          log('❌ 请先建立连接', 'error')
          return
        }

        const testMessage = {
          type: 'ping',
          data: { message: 'WebSocket 测试消息', timestamp: Date.now() },
          timestamp: Date.now()
        }

        websocket.send(JSON.stringify(testMessage))
        log('🧪 发送测试消息', 'info')
      }

      // 健康检查
      async function getHealthCheck() {
        log('🔍 执行健康检查...', 'info')
        const result = await apiCall('/api/health')

        if (result.success) {
          document.getElementById('serverHealth').textContent = '正常'
          log('✅ 服务器健康状态正常', 'success')
        } else {
          document.getElementById('serverHealth').textContent = '异常'
          log('❌ 服务器健康检查失败', 'error')
        }

        showResponse('systemResponse', result)
      }

      // 系统状态
      async function getSystemStatus() {
        log('📊 获取系统状态...', 'info')
        const result = await apiCall('/admin/status')

        if (result.success && result.data.data) {
          const data = result.data.data
          const totalConnections = data.connections?.totalConnections || data.connections?.total || 0
          document.getElementById('totalConnections').textContent = totalConnections
          document.getElementById('serverEnvironment').textContent = data.environment || 'Unknown'

          // 获取根路径信息来显示缓存类型
          const rootResult = await apiCall('/')
          if (rootResult.success && rootResult.data.config) {
            document.getElementById('cacheType').textContent = rootResult.data.config.cacheType || 'Unknown'
          }

          log('✅ 系统状态获取成功', 'success')
        } else {
          log('❌ 系统状态获取失败', 'error')
        }

        showResponse('systemResponse', result)
      }

      // 测试 KV 存储
      async function testKVStorage() {
        log('🔧 测试 KV 存储...', 'info')

        // 测试设置和获取数据
        const testValue = { message: 'KV 存储测试', timestamp: Date.now() }

        // 设置测试数据
        const setResult = await apiCall(\`/api/state/\${CHATBOT_ID}\`, {
          method: 'POST',
          body: JSON.stringify({
            url: 'https://kv-test.example.com',
            title: 'KV 存储测试',
            timestamp: Date.now(),
            customData: testValue
          })
        })

        if (setResult.success) {
          log('✅ KV 数据写入成功', 'success')

          // 获取测试数据
          const getResult = await apiCall(\`/api/state/\${CHATBOT_ID}\`)

          if (getResult.success && getResult.data.data) {
            log('✅ KV 数据读取成功', 'success')
            log(\`📄 读取的数据: \${JSON.stringify(getResult.data.data.customData)}\`, 'info')
          } else {
            log('❌ KV 数据读取失败', 'error')
          }
        } else {
          log('❌ KV 数据写入失败', 'error')
        }

        showResponse('systemResponse', setResult)
      }

      // 页面状态管理
      async function updatePageState() {
        const url = document.getElementById('pageUrl').value
        const title = document.getElementById('pageTitle').value
        const customDataText = document.getElementById('customData').value

        try {
          const customData = JSON.parse(customDataText)

          log('💾 更新页面状态...', 'info')

          const result = await apiCall(\`/api/state/\${CHATBOT_ID}\`, {
            method: 'POST',
            body: JSON.stringify({
              url,
              title,
              timestamp: Date.now(),
              customData
            })
          })

          if (result.success) {
            log('✅ 页面状态更新成功', 'success')
          } else {
            log('❌ 页面状态更新失败', 'error')
          }

          showResponse('pageStateResponse', result)
        } catch (error) {
          log(\`❌ 自定义数据 JSON 格式错误: \${error.message}\`, 'error')
        }
      }

      async function getPageState() {
        log('📖 获取页面状态...', 'info')

        const result = await apiCall(\`/api/state/\${CHATBOT_ID}\`)

        if (result.success) {
          if (result.data.data) {
            log('✅ 页面状态获取成功', 'success')
            log(\`📄 状态数据: \${JSON.stringify(result.data.data, null, 2)}\`, 'info')
          } else {
            log('ℹ️ 没有找到页面状态数据', 'warning')
          }
        } else {
          log('❌ 页面状态获取失败', 'error')
        }

        showResponse('pageStateResponse', result)
      }

      async function deletePageState() {
        log('🗑️ 删除页面状态...', 'info')

        const result = await apiCall(\`/api/state/\${CHATBOT_ID}\`, {
          method: 'DELETE'
        })

        if (result.success) {
          log('✅ 页面状态删除成功', 'success')
        } else {
          log('❌ 页面状态删除失败', 'error')
        }

        showResponse('pageStateResponse', result)
      }

      // Action 推送
      async function sendCustomAction() {
        const type = document.getElementById('actionType').value
        const target = document.getElementById('actionTarget').value
        const payloadText = document.getElementById('actionPayload').value

        try {
          const payload = JSON.parse(payloadText)

          log(\`🚀 发送 \${type} Action...\`, 'info')

          const result = await apiCall(\`/api/action/\${CHATBOT_ID}\`, {
            method: 'POST',
            body: JSON.stringify({
              type,
              target,
              payload
            })
          })

          if (result.success) {
            log(\`✅ Action 发送成功: \${type}\`, 'success')
          } else {
            log(\`❌ Action 发送失败: \${type}\`, 'error')
          }

          showResponse('actionResponse', result)
        } catch (error) {
          log(\`❌ Action 数据 JSON 格式错误: \${error.message}\`, 'error')
        }
      }

      async function sendQuickActions() {
        log('⚡ 发送快速测试 Actions...', 'info')

        const actions = [
          { type: 'navigate', payload: { url: 'https://workers.cloudflare.com' } },
          { type: 'click', target: '#test-button', payload: { message: '点击测试' } },
          { type: 'input', target: '#test-input', payload: { value: 'Cloudflare Workers 测试' } }
        ]

        for (const action of actions) {
          const result = await apiCall(\`/api/action/\${CHATBOT_ID}\`, {
            method: 'POST',
            body: JSON.stringify(action)
          })

          if (result.success) {
            log(\`✅ 快速 Action 发送成功: \${action.type}\`, 'success')
          } else {
            log(\`❌ 快速 Action 发送失败: \${action.type}\`, 'error')
          }
        }
      }

      async function broadcastAction() {
        const type = document.getElementById('actionType').value
        const target = document.getElementById('actionTarget').value
        const payloadText = document.getElementById('actionPayload').value

        try {
          const payload = JSON.parse(payloadText)

          log(\`📢 广播 \${type} Action...\`, 'info')

          const result = await apiCall('/api/action/broadcast', {
            method: 'POST',
            body: JSON.stringify({
              type,
              target,
              payload
            })
          })

          if (result.success) {
            log(\`✅ Action 广播成功: \${type}\`, 'success')
          } else {
            log(\`❌ Action 广播失败: \${type}\`, 'error')
          }

          showResponse('actionResponse', result)
        } catch (error) {
          log(\`❌ Action 数据 JSON 格式错误: \${error.message}\`, 'error')
        }
      }

      // 显示响应
      function showResponse(elementId, result) {
        const element = document.getElementById(elementId)
        element.style.display = 'block'
        element.innerHTML = \`
          <strong>响应状态:</strong> \${result.success ? '成功' : '失败'}<br>
          <strong>状态码:</strong> \${result.status || 'N/A'}<br>
          <strong>响应数据:</strong><br>
          <pre>\${JSON.stringify(result.data || result.error, null, 2)}</pre>
        \`
      }

      // 页面加载完成后自动执行
      window.addEventListener('load', () => {
        log('🎉 页面加载完成，可以开始测试', 'success')

        // 自动执行健康检查
        setTimeout(() => {
          getHealthCheck()
          getSystemStatus()
        }, 1000)
      })
    </script>
  </body>
</html>`

export function createStaticRoutesForWorker() {
  const staticApp = new Hono()

  // 根路径返回测试仪表板
  staticApp.get('/', c => {
    return c.html(TEST_DASHBOARD_HTML)
  })

  // 测试仪表板路径
  staticApp.get('/test-dashboard.html', c => {
    return c.html(TEST_DASHBOARD_HTML)
  })

  // 健康检查
  staticApp.get('/health', c => {
    return c.json({
      success: true,
      data: {
        service: 'Static File Server',
        environment: 'Cloudflare Workers',
        status: 'healthy',
      },
      timestamp: Date.now(),
    })
  })

  return staticApp
}
