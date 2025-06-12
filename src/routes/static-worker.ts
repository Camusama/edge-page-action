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
      <p>Cloudflare Workers + Durable Objects 模式 <span class="environment-badge">EDGE COMPUTING</span></p>
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
          <button class="btn" onclick="testDurableObjects()">🔧 测试 DO</button>
        </div>
        <div id="systemResponse" class="response-display"></div>
      </div>

      <!-- 页面状态管理卡片 -->
      <div class="card">
        <h3 class="card-title">📄 页面状态管理</h3>
        <div class="input-group">
          <label>页面URL:</label>
          <input type="text" id="pageUrl" value="https://example.com/cloudflare-test" />
        </div>
        <div class="input-group">
          <label>页面标题:</label>
          <input type="text" id="pageTitle" value="Cloudflare Workers 测试页面" />
        </div>
        <div class="input-group">
          <label>自定义数据 (JSON):</label>
          <textarea id="customData" rows="3">{"environment": "cloudflare-workers", "storage": "durable-objects", "test": true}</textarea>
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
      let CHATBOT_ID = 'dashboard_' + Date.now()
      let eventSource = null
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
          document.getElementById('totalConnections').textContent = data.connections?.total || 0
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

      // 测试 Durable Objects
      async function testDurableObjects() {
        log('🔧 测试 Durable Objects...', 'info')

        // 测试设置和获取数据
        const testKey = 'test_' + Date.now()
        const testValue = { message: 'Durable Objects 测试', timestamp: Date.now() }

        // 设置测试数据
        const setResult = await apiCall(\`/api/state/\${CHATBOT_ID}\`, {
          method: 'POST',
          body: JSON.stringify({
            url: 'https://test.example.com',
            title: 'DO 测试',
            timestamp: Date.now(),
            chatbotId: CHATBOT_ID,
            customData: testValue
          })
        })

        if (setResult.success) {
          log('✅ Durable Objects 写入测试成功', 'success')

          // 读取测试数据
          const getResult = await apiCall(\`/api/state/\${CHATBOT_ID}\`)
          if (getResult.success) {
            log('✅ Durable Objects 读取测试成功', 'success')
          } else {
            log('❌ Durable Objects 读取测试失败', 'error')
          }
        } else {
          log('❌ Durable Objects 写入测试失败', 'error')
        }

        showResponse('systemResponse', setResult)
      }

      // 页面状态管理
      async function updatePageState() {
        const url = document.getElementById('pageUrl').value
        const title = document.getElementById('pageTitle').value
        const customDataText = document.getElementById('customData').value

        let customData
        try {
          customData = JSON.parse(customDataText)
        } catch (error) {
          log('❌ 自定义数据 JSON 格式错误', 'error')
          return
        }

        log('💾 更新页面状态...', 'info')

        const result = await apiCall(\`/api/state/\${CHATBOT_ID}\`, {
          method: 'POST',
          body: JSON.stringify({
            url,
            title,
            timestamp: Date.now(),
            chatbotId: CHATBOT_ID,
            customData
          })
        })

        if (result.success) {
          log('✅ 页面状态更新成功', 'success')
        } else {
          log('❌ 页面状态更新失败', 'error')
        }

        showResponse('pageStateResponse', result)
      }

      async function getPageState() {
        log('📖 获取页面状态...', 'info')

        const result = await apiCall(\`/api/state/\${CHATBOT_ID}\`)

        if (result.success && result.data.data) {
          const state = result.data.data
          document.getElementById('pageUrl').value = state.url || ''
          document.getElementById('pageTitle').value = state.title || ''
          if (state.customData) {
            document.getElementById('customData').value = JSON.stringify(state.customData, null, 2)
          }
          log('✅ 页面状态获取成功', 'success')
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
          // 清空表单
          document.getElementById('pageUrl').value = 'https://example.com/cloudflare-test'
          document.getElementById('pageTitle').value = 'Cloudflare Workers 测试页面'
          document.getElementById('customData').value = '{"environment": "cloudflare-workers", "storage": "durable-objects", "test": true}'
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

        let payload
        try {
          payload = JSON.parse(payloadText)
        } catch (error) {
          log('❌ Action 数据 JSON 格式错误', 'error')
          return
        }

        log(\`🚀 发送 \${type} Action...\`, 'info')

        const result = await apiCall(\`/api/action/\${CHATBOT_ID}\`, {
          method: 'POST',
          body: JSON.stringify({
            type,
            target,
            payload,
            timestamp: Date.now()
          })
        })

        if (result.success) {
          log(\`✅ \${type} Action 发送成功\`, 'success')
        } else {
          log(\`❌ \${type} Action 发送失败\`, 'error')
        }

        showResponse('actionResponse', result)
      }

      async function sendQuickActions() {
        log('⚡ 发送快速测试 Actions...', 'info')

        const actions = [
          { type: 'navigate', target: 'window', payload: { url: 'https://workers.cloudflare.com' } },
          { type: 'click', target: '#test-button', payload: { message: '点击测试' } },
          { type: 'input', target: '#test-input', payload: { value: 'Cloudflare Workers 测试' } }
        ]

        for (const action of actions) {
          const result = await apiCall(\`/api/action/\${CHATBOT_ID}\`, {
            method: 'POST',
            body: JSON.stringify({
              ...action,
              timestamp: Date.now()
            })
          })

          if (result.success) {
            log(\`✅ \${action.type} Action 发送成功\`, 'success')
          } else {
            log(\`❌ \${action.type} Action 发送失败\`, 'error')
          }

          // 短暂延迟
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      async function broadcastAction() {
        log('📢 广播 Action...', 'info')

        const result = await apiCall('/api/action/broadcast', {
          method: 'POST',
          body: JSON.stringify({
            type: 'broadcast',
            target: 'all',
            payload: {
              message: 'Cloudflare Workers 广播测试',
              timestamp: Date.now(),
              from: CHATBOT_ID
            },
            timestamp: Date.now()
          })
        })

        if (result.success) {
          log('✅ 广播 Action 发送成功', 'success')
        } else {
          log('❌ 广播 Action 发送失败', 'error')
        }

        showResponse('actionResponse', result)
      }

      // 连接功能（SSE 在 Cloudflare Workers 中可能有限制）
      function connect() {
        log('🔌 尝试建立 SSE 连接...', 'info')
        log('ℹ️ 注意：Cloudflare Workers 对 SSE 的支持可能有限制', 'warning')

        try {
          eventSource = new EventSource(\`\${SERVER_URL}/sse/connect/\${CHATBOT_ID}\`)

          eventSource.onopen = () => {
            log('✅ SSE 连接已建立', 'success')
            updateConnectionStatus(true)
          }

          eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data)
            log(\`📨 收到消息: \${JSON.stringify(data)}\`, 'info')
          }

          eventSource.onerror = (error) => {
            log('❌ SSE 连接错误', 'error')
            updateConnectionStatus(false)
          }
        } catch (error) {
          log(\`❌ SSE 连接失败: \${error.message}\`, 'error')
        }
      }

      function disconnect() {
        if (eventSource) {
          eventSource.close()
          eventSource = null
          log('❌ SSE 连接已断开', 'warning')
          updateConnectionStatus(false)
        }
      }

      function testConnection() {
        log('🧪 测试连接...', 'info')
        getHealthCheck()
      }

      // 工具函数
      function showResponse(elementId, result) {
        const element = document.getElementById(elementId)
        if (element) {
          element.innerHTML = \`<pre>\${JSON.stringify(result, null, 2)}</pre>\`
          element.style.display = 'block'
          setTimeout(() => {
            element.style.display = 'none'
          }, 10000) // 10秒后自动隐藏
        }
      }

      // 页面加载完成后自动检查服务器状态
      window.addEventListener('load', () => {
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

  // MIME 类型映射
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
  }

  // 静态文件服务
  staticApp.get('/*', c => {
    try {
      let requestPath = c.req.path

      // 如果是根路径或测试仪表板，返回嵌入的 HTML
      if (requestPath === '/' || requestPath === '' || requestPath === '/test-dashboard.html') {
        return c.html(TEST_DASHBOARD_HTML)
      }

      // 其他路径返回 404
      return c.text(
        'File not found - Only test dashboard is available in Cloudflare Workers mode',
        404
      )
    } catch (error) {
      console.error('Static file serve error:', error)
      return c.text('Internal server error', 500)
    }
  })

  return staticApp
}
