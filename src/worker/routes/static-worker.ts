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
    <title>Edge Sync State 测试仪表板 - RESTful API + 轮询模式</title>
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
      .chatbot-id-info {
        margin-top: 8px;
        padding: 8px;
        background: linear-gradient(135deg, #f0f8ff, #e3f2fd);
        border-radius: 6px;
        border-left: 4px solid #2196f3;
        font-size: 13px;
      }
      .chatbot-id-current {
        font-family: 'Courier New', monospace;
        color: #1976d2;
        font-weight: bold;
        background: rgba(33, 150, 243, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
      }
      .flex-row {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }
      .flex-row > * {
        flex: 1;
      }
      .flex-row .btn {
        flex: none;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>🚀 Edge Sync State 测试仪表板</h1>
      <p>RESTful API + 轮询模式 <span class="environment-badge">NO WEBSOCKET</span></p>
      <p style="margin-top: 10px; font-size: 14px; color: rgba(255,255,255,0.8);">
        💡 纯 RESTful API + 轮询架构，更简单、更可靠
      </p>
    </div>

    <div class="dashboard">
      <!-- 连接状态卡片 -->
      <div class="card">
        <h3 class="card-title">
          🔗 服务状态
          <div class="status-indicator" id="statusIndicator"></div>
        </h3>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value" id="serviceStatus">未启动</div>
            <div class="stat-label">服务状态</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="serviceTime">0s</div>
            <div class="stat-label">运行时长</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="pollingStatus">未启动</div>
            <div class="stat-label">Action 轮询</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="pollingCount">0</div>
            <div class="stat-label">轮询次数</div>
          </div>
        </div>
        <div class="input-group">
          <label>ChatBot ID 管理:</label>
          <div class="flex-row">
            <select id="chatbotIdSelect">
              <option value="">选择现有的 ChatBot ID</option>
            </select>
            <button class="btn small" onclick="refreshChatbotIds()">🔄 刷新</button>
          </div>
          <div class="flex-row">
            <input type="text" id="chatbotIdInput" placeholder="或输入新的 ChatBot ID" />
            <button class="btn small success" onclick="applyChatbotId()">✅ 应用</button>
            <button class="btn small warning" onclick="generateRandomId()">🎲 随机</button>
            <button class="btn small danger" onclick="clearSavedId()">🗑️ 清除</button>
          </div>
          <div class="chatbot-id-info">
            <strong>当前 ID:</strong> <span id="currentChatbotId" class="chatbot-id-current"></span>
            <div id="chatbotIdStats" style="margin-top: 6px; font-size: 12px; color: #666;"></div>
          </div>
        </div>
        <div class="button-row">
          <button class="btn success" onclick="startService()">� 启动服务</button>
          <button class="btn danger" onclick="stopService()">🛑 停止服务</button>
          <button class="btn warning" onclick="testService()">🧪 测试服务</button>
          <button class="btn small" onclick="checkServiceStatus()">🔍 状态</button>
        </div>
        <div class="button-row">
          <button class="btn success" onclick="startActionPolling()">🔄 启动轮询</button>
          <button class="btn danger" onclick="stopActionPolling()">🛑 停止轮询</button>
          <button class="btn warning" onclick="toggleActionPolling()">🔀 切换轮询</button>
          <button class="btn small" onclick="checkPollingStatus()">📊 轮询状态</button>
        </div>
        <div class="button-row">
          <button class="btn" onclick="checkQueuedActions()">🔍 检查队列</button>
          <button class="btn small" onclick="clearActionQueue()">🗑️ 清空队列</button>
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
        <div style="margin-bottom: 15px; padding: 8px; background: rgba(76, 175, 80, 0.1); border-radius: 4px; border-left: 3px solid #4caf50; font-size: 13px;">
          <strong>🤖 当前操作的 ChatBot ID:</strong> <span id="pageStateChatbotId" style="font-family: monospace; color: #2e7d32; font-weight: bold;"></span>
        </div>
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
        <div style="margin-bottom: 15px; padding: 8px; background: rgba(255, 152, 0, 0.1); border-radius: 4px; border-left: 3px solid #ff9800; font-size: 13px;">
          <strong>🎯 目标 ChatBot ID:</strong> <span id="actionChatbotId" style="font-family: monospace; color: #e65100; font-weight: bold;"></span>
        </div>
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
          <button class="btn" onclick="broadcastAction()" disabled title="广播在 Cloudflare Workers 中不支持">📢 广播 (不支持)</button>
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
      let CHATBOT_ID = loadSavedChatbotId() || 'dashboard_' + Date.now()
      let websocket = null
      let connectionStartTime = null
      let connectionTimer = null
      let autoScroll = true
      let logFilter = 'all'
      let actionPollingInterval = null
      let isPollingEnabled = false

      // ChatBot ID 持久化功能
      function saveChatbotId(id) {
        try {
          localStorage.setItem('edge-sync-chatbot-id', id)
          localStorage.setItem('edge-sync-chatbot-id-timestamp', Date.now().toString())
        } catch (error) {
          console.warn('无法保存 ChatBot ID 到本地存储:', error)
        }
      }

      function loadSavedChatbotId() {
        try {
          const savedId = localStorage.getItem('edge-sync-chatbot-id')
          const timestamp = localStorage.getItem('edge-sync-chatbot-id-timestamp')

          // 如果保存的 ID 超过 24 小时，则不使用
          if (savedId && timestamp) {
            const age = Date.now() - parseInt(timestamp)
            if (age < 24 * 60 * 60 * 1000) { // 24小时
              return savedId
            }
          }
        } catch (error) {
          console.warn('无法从本地存储加载 ChatBot ID:', error)
        }
        return null
      }

      function clearSavedChatbotId() {
        try {
          localStorage.removeItem('edge-sync-chatbot-id')
          localStorage.removeItem('edge-sync-chatbot-id-timestamp')
        } catch (error) {
          console.warn('无法清除保存的 ChatBot ID:', error)
        }
      }

      // 初始化
      updateCurrentChatbotIdDisplay()
      log('🌐 Cloudflare Workers 测试仪表板已加载', 'success')
      log('📍 服务器地址: ' + SERVER_URL, 'info')

      // 检查是否加载了保存的 ChatBot ID
      const savedId = loadSavedChatbotId()
      if (savedId && savedId === CHATBOT_ID) {
        log(\`💾 已加载保存的 ChatBot ID: \${CHATBOT_ID}\`, 'info')
      } else {
        log(\`🆕 使用新生成的 ChatBot ID: \${CHATBOT_ID}\`, 'info')
      }

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

      // ChatBot ID 管理功能
      function updateCurrentChatbotIdDisplay() {
        document.getElementById('currentChatbotId').textContent = CHATBOT_ID

        // 更新页面状态管理区域的显示
        const pageStateElement = document.getElementById('pageStateChatbotId')
        if (pageStateElement) {
          pageStateElement.textContent = CHATBOT_ID
        }

        // 更新 Action 推送区域的显示
        const actionElement = document.getElementById('actionChatbotId')
        if (actionElement) {
          actionElement.textContent = CHATBOT_ID
        }

        // 显示 ID 统计信息
        const statsElement = document.getElementById('chatbotIdStats')
        const idLength = CHATBOT_ID.length
        const idType = CHATBOT_ID.startsWith('bot_') ? '随机生成' :
                      CHATBOT_ID.startsWith('dashboard_') ? '默认生成' : '自定义'

        statsElement.innerHTML = \`
          📏 长度: \${idLength} 字符 | 🏷️ 类型: \${idType} |
          ⏰ 设置时间: \${new Date().toLocaleTimeString()}
        \`
      }

      function generateRandomId() {
        const timestamp = Date.now()
        const random = Math.random().toString(36).substring(2, 8)
        const newId = \`bot_\${timestamp}_\${random}\`
        document.getElementById('chatbotIdInput').value = newId
        log(\`🎲 生成随机 ID: \${newId}\`, 'info')
      }

      function clearSavedId() {
        clearSavedChatbotId()
        log('🗑️ 已清除保存的 ChatBot ID', 'info')
        log('💡 下次刷新页面将生成新的 ID', 'info')
      }

      // 验证 ChatBot ID 是否有效
      function validateChatbotId() {
        if (!CHATBOT_ID || CHATBOT_ID.trim() === '') {
          log('❌ ChatBot ID 不能为空，请先设置一个有效的 ID', 'error')
          return false
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(CHATBOT_ID)) {
          log('❌ ChatBot ID 格式无效，只能包含字母、数字、下划线和连字符', 'error')
          return false
        }

        return true
      }

      function applyChatbotId() {
        const selectElement = document.getElementById('chatbotIdSelect')
        const inputElement = document.getElementById('chatbotIdInput')

        let newId = ''

        // 优先使用选择的 ID
        if (selectElement.value) {
          newId = selectElement.value
          log(\`📋 选择了现有 ID: \${newId}\`, 'info')
        } else if (inputElement.value.trim()) {
          newId = inputElement.value.trim()
          log(\`✏️ 输入了新 ID: \${newId}\`, 'info')
        } else {
          log('❌ 请选择或输入一个 ChatBot ID', 'error')
          return
        }

        // 验证 ID 格式
        if (!/^[a-zA-Z0-9_-]+$/.test(newId)) {
          log('❌ ChatBot ID 只能包含字母、数字、下划线和连字符', 'error')
          return
        }

        // 如果连接已建立，需要先断开
        if (websocket && websocket.readyState === WebSocket.OPEN) {
          log('⚠️ 检测到活跃连接，将先断开连接', 'warning')
          disconnect()
        }

        // 更新全局 ID
        const oldId = CHATBOT_ID
        CHATBOT_ID = newId
        updateCurrentChatbotIdDisplay()

        // 保存到本地存储
        saveChatbotId(newId)

        // 清空输入框
        inputElement.value = ''
        selectElement.value = ''

        log(\`✅ ChatBot ID 已更新: \${oldId} → \${newId}\`, 'success')
        log('💾 ID 已保存到本地存储', 'info')
        log('💡 现在可以重新建立连接', 'info')
      }

      async function refreshChatbotIds() {
        log('🔄 正在获取现有的 ChatBot ID...', 'info')

        try {
          // 获取连接统计信息
          const result = await apiCall('/admin/connections')

          if (result.success && result.data.data && result.data.data.connections) {
            const connections = result.data.data.connections
            const chatbotIds = connections.map(conn => conn.chatbotId).filter(Boolean)

            // 更新下拉列表
            const selectElement = document.getElementById('chatbotIdSelect')

            // 清空现有选项（保留默认选项）
            selectElement.innerHTML = '<option value="">选择现有的 ChatBot ID</option>'

            if (chatbotIds.length > 0) {
              // 去重并排序
              const uniqueIds = [...new Set(chatbotIds)].sort()

              uniqueIds.forEach(id => {
                const option = document.createElement('option')
                option.value = id
                option.textContent = \`\${id} \${id === CHATBOT_ID ? '(当前)' : ''}\`
                selectElement.appendChild(option)
              })

              log(\`✅ 找到 \${uniqueIds.length} 个活跃的 ChatBot ID\`, 'success')
            } else {
              log('ℹ️ 当前没有活跃的连接', 'info')
            }
          } else {
            log('⚠️ 无法获取连接信息', 'warning')
          }

          // 同时尝试获取 WebSocket 连接信息
          const wsResult = await apiCall('/ws/connections')
          if (wsResult.success && wsResult.data.data && wsResult.data.data.connections) {
            const wsConnections = wsResult.data.data.connections
            const wsChatbotIds = wsConnections.map(conn => conn.chatbotId).filter(Boolean)

            if (wsChatbotIds.length > 0) {
              log(\`📡 WebSocket 连接: \${wsChatbotIds.length} 个\`, 'info')
            }
          }

        } catch (error) {
          log(\`❌ 获取 ChatBot ID 失败: \${error.message}\`, 'error')
        }
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

        if (!CHATBOT_ID || CHATBOT_ID.trim() === '') {
          log('❌ 请先设置 ChatBot ID', 'error')
          return
        }

        log('🔌 正在连接 WebSocket...', 'info')
        log(\`🤖 使用 ChatBot ID: \${CHATBOT_ID}\`, 'info')
        const wsUrl = \`\${WS_URL}/ws/connect/\${CHATBOT_ID}\`
        log(\`🌐 连接地址: \${wsUrl}\`, 'info')

        websocket = new WebSocket(wsUrl)

        websocket.onopen = function(event) {
          log('✅ WebSocket 连接成功', 'success')
          updateConnectionStatus(true)
        }

        websocket.onmessage = function(event) {
          try {
            const message = JSON.parse(event.data)
            log(\`📨 收到 WebSocket 消息: \${message.type}\`, 'info')

            if (message.type === 'action') {
              log(\`🎯 通过 WebSocket 收到 Action: \${JSON.stringify(message.data)}\`, 'success')
              handleReceivedAction(message.data)
            } else if (message.type === 'welcome') {
              log(\`🎉 WebSocket 连接欢迎消息\`, 'success')
              // 如果欢迎消息提示检查队列，立即执行一次轮询
              if (message.data && message.data.checkQueue) {
                log(\`🔍 检查队列中的待处理 Actions...\`, 'info')
                setTimeout(() => {
                  checkQueuedActions()
                }, 500) // 延迟500ms确保连接稳定
              }
            } else if (message.type === 'heartbeat') {
              log(\`💓 收到心跳\`, 'info')
              // 回复心跳
              websocket.send(JSON.stringify({
                type: 'heartbeat',
                data: { timestamp: Date.now() },
                timestamp: Date.now()
              }))
            } else if (message.type === 'pong') {
              log(\`🏓 收到 pong 响应\`, 'info')
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

      function checkConnectionStatus() {
        if (!websocket) {
          log('❌ WebSocket 对象不存在', 'error')
          return
        }

        const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']
        const state = states[websocket.readyState] || 'UNKNOWN'

        log(\`🔍 WebSocket 状态: \${state} (\${websocket.readyState})\`, 'info')
        log(\`🤖 当前 ChatBot ID: \${CHATBOT_ID}\`, 'info')

        // 检查服务器端连接状态
        checkServerConnectionStatus()
      }

      async function checkServerConnectionStatus() {
        try {
          const result = await apiCall('/ws/connections')
          if (result.success && result.data.data) {
            const connections = result.data.data.connections
            const myConnection = connections.find(conn => conn.chatbotId === CHATBOT_ID)

            if (myConnection) {
              log(\`✅ 服务器端找到连接: \${CHATBOT_ID}\`, 'success')
            } else {
              log(\`❌ 服务器端未找到连接: \${CHATBOT_ID}\`, 'error')
              log(\`📋 服务器端连接列表: \${connections.map(c => c.chatbotId).join(', ')}\`, 'info')
            }
          }
        } catch (error) {
          log(\`❌ 检查服务器连接状态失败: \${error.message}\`, 'error')
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
        if (!validateChatbotId()) {
          return
        }

        const url = document.getElementById('pageUrl').value
        const title = document.getElementById('pageTitle').value
        const customDataText = document.getElementById('customData').value

        try {
          const customData = JSON.parse(customDataText)

          log('💾 更新页面状态...', 'info')
          log(\`🤖 使用 ChatBot ID: \${CHATBOT_ID}\`, 'info')

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
        if (!validateChatbotId()) {
          return
        }

        log('📖 获取页面状态...', 'info')
        log(\`🤖 使用 ChatBot ID: \${CHATBOT_ID}\`, 'info')

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
        if (!validateChatbotId()) {
          return
        }

        log('🗑️ 删除页面状态...', 'info')
        log(\`🤖 使用 ChatBot ID: \${CHATBOT_ID}\`, 'info')

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
        if (!validateChatbotId()) {
          return
        }

        const type = document.getElementById('actionType').value
        const target = document.getElementById('actionTarget').value
        const payloadText = document.getElementById('actionPayload').value

        try {
          const payload = JSON.parse(payloadText)

          log(\`🚀 发送 \${type} Action...\`, 'info')
          log(\`🤖 目标 ChatBot ID: \${CHATBOT_ID}\`, 'info')

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
        if (!validateChatbotId()) {
          return
        }

        log('⚡ 发送快速测试 Actions...', 'info')
        log(\`🤖 目标 ChatBot ID: \${CHATBOT_ID}\`, 'info')

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
        log('⚠️ 广播功能在 Cloudflare Workers 环境中不支持', 'warning')
        log('💡 这是由于 Cloudflare Workers 的 I/O 隔离限制', 'info')
        log('🔄 请使用单独的 Action 发送功能', 'info')

        // 仍然尝试调用 API，但会收到不支持的响应
        const type = document.getElementById('actionType').value
        const target = document.getElementById('actionTarget').value
        const payloadText = document.getElementById('actionPayload').value

        try {
          const payload = JSON.parse(payloadText)

          log(\`📢 尝试广播 \${type} Action (预期会失败)...\`, 'warning')

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

      // Action 轮询功能
      let pollingCount = 0

      async function startActionPolling() {
        if (isPollingEnabled) {
          log('⚠️ Action 轮询已经启动', 'warning')
          return
        }

        if (!validateChatbotId()) {
          return
        }

        isPollingEnabled = true
        pollingCount = 0
        updatePollingStatus()

        log('🔄 启动 Action 轮询...', 'info')
        log(\`🤖 轮询 ChatBot ID: \${CHATBOT_ID}\`, 'info')

        actionPollingInterval = setInterval(async () => {
          try {
            pollingCount++
            updatePollingStatus()

            const result = await apiCall(\`/api/action/\${CHATBOT_ID}/poll\`)

            if (result.success && result.data && result.data.actions) {
              const actions = result.data.actions

              if (actions.length > 0) {
                log(\`📨 轮询到 \${actions.length} 个 Action\`, 'success')

                actions.forEach(action => {
                  log(\`🎯 收到 Action: \${action.type}\`, 'success')
                  log(\`📋 目标: \${action.target || 'N/A'}\`, 'info')
                  log(\`📦 数据: \${JSON.stringify(action.payload || {})}\`, 'info')
                  log(\`⏰ 时间: \${new Date(action.timestamp || action.queuedAt).toLocaleTimeString()}\`, 'info')

                  // 这里可以添加实际的 Action 处理逻辑
                  // 例如：执行导航、点击、输入等操作
                  handleReceivedAction(action)
                })
              }
            } else if (result.success) {
              // 轮询成功但没有 actions，这是正常的
              // log('🔄 轮询完成，暂无新 Actions', 'info')
            } else {
              log(\`❌ 轮询失败: \${result.error || 'Unknown error'}\`, 'error')
            }
          } catch (error) {
            console.error('Action polling error:', error)
            log(\`❌ 轮询错误: \${error.message}\`, 'error')
          }
        }, 2000) // 每2秒轮询一次

        log('✅ Action 轮询已启动 (每2秒)', 'success')
      }

      function updatePollingStatus() {
        const statusElement = document.getElementById('pollingStatus')
        const countElement = document.getElementById('pollingCount')

        if (statusElement) {
          statusElement.textContent = isPollingEnabled ? '运行中' : '已停止'
        }

        if (countElement) {
          countElement.textContent = pollingCount.toString()
        }
      }

      function stopActionPolling() {
        if (!isPollingEnabled) {
          log('⚠️ Action 轮询未启动', 'warning')
          return
        }

        if (actionPollingInterval) {
          clearInterval(actionPollingInterval)
          actionPollingInterval = null
        }

        isPollingEnabled = false
        updatePollingStatus()
        log('🛑 Action 轮询已停止', 'info')
      }

      function toggleActionPolling() {
        if (isPollingEnabled) {
          stopActionPolling()
        } else {
          startActionPolling()
        }
      }

      function checkPollingStatus() {
        log(\`📊 Action 轮询状态: \${isPollingEnabled ? '运行中' : '已停止'}\`, 'info')
        log(\`🤖 当前 ChatBot ID: \${CHATBOT_ID}\`, 'info')
        log(\`⏱️ 轮询间隔: 2秒\`, 'info')

        if (isPollingEnabled) {
          log('💡 轮询模式适用于 Cloudflare Workers 环境', 'info')
          log('📡 Actions 将通过 KV 存储 + 轮询方式接收', 'info')
        } else {
          log('💡 可以启动轮询来接收 Actions', 'info')
        }
      }

      // 检查队列中的 Actions（单次检查）
      async function checkQueuedActions() {
        try {
          log('🔍 检查队列中的 Actions...', 'info')
          const result = await apiCall(\`/api/action/\${CHATBOT_ID}/poll\`)

          if (result.success && result.data && result.data.actions) {
            const actions = result.data.actions

            if (actions.length > 0) {
              log(\`📨 从队列中获取到 \${actions.length} 个 Action\`, 'success')

              actions.forEach(action => {
                log(\`🎯 队列中的 Action: \${action.type}\`, 'success')
                handleReceivedAction(action)
              })
            } else {
              log('📭 队列为空', 'info')
            }
          } else {
            log(\`❌ 检查队列失败: \${result.error || 'Unknown error'}\`, 'error')
          }
        } catch (error) {
          log(\`❌ 检查队列错误: \${error.message}\`, 'error')
        }
      }

      // 清空 Action 队列
      async function clearActionQueue() {
        try {
          log('🗑️ 清空 Action 队列...', 'info')
          // 调用轮询 API 来清空队列
          const result = await apiCall(\`/api/action/\${CHATBOT_ID}/poll\`)

          if (result.success && result.data && result.data.actions) {
            const clearedCount = result.data.actions.length
            if (clearedCount > 0) {
              log(\`🗑️ 已清空 \${clearedCount} 个待处理的 Actions\`, 'success')
            } else {
              log('📭 队列已经为空', 'info')
            }
          } else {
            log(\`❌ 清空队列失败: \${result.error || 'Unknown error'}\`, 'error')
          }
        } catch (error) {
          log(\`❌ 清空队列错误: \${error.message}\`, 'error')
        }
      }

      // 处理接收到的 Action
      function handleReceivedAction(action) {
        log(\`🎯 处理 Action: \${action.type}\`, 'success')

        switch (action.type) {
          case 'navigate':
            if (action.payload && action.payload.url) {
              log(\`🧭 导航到: \${action.payload.url}\`, 'success')
              // 在实际应用中，这里会执行页面导航
              // window.location.href = action.payload.url
            }
            break

          case 'click':
            if (action.target) {
              log(\`👆 点击元素: \${action.target}\`, 'success')
              // 在实际应用中，这里会执行点击操作
              // document.querySelector(action.target)?.click()
            }
            break

          case 'input':
            if (action.target && action.payload && action.payload.value) {
              log(\`⌨️ 输入到 \${action.target}: \${action.payload.value}\`, 'success')
              // 在实际应用中，这里会执行输入操作
              // const element = document.querySelector(action.target)
              // if (element) element.value = action.payload.value
            }
            break

          case 'scroll':
            log(\`📜 滚动操作\`, 'success')
            // 在实际应用中，这里会执行滚动操作
            break

          default:
            log(\`🔧 自定义 Action: \${action.type}\`, 'info')
            log(\`📦 Action 数据: \${JSON.stringify(action)}\`, 'info')
            break
        }

        // 显示 Action 处理完成
        log(\`✅ Action 处理完成: \${action.type}\`, 'success')
      }

      // 页面加载完成后自动执行
      window.addEventListener('load', () => {
        log('🎉 页面加载完成，可以开始测试', 'success')
        log('💡 在 Cloudflare Workers 环境中，建议使用 Action 轮询模式', 'info')

        // 自动执行健康检查和获取现有 ChatBot ID
        setTimeout(() => {
          getHealthCheck()
          getSystemStatus()
          refreshChatbotIds()

          // 自动启动 Action 轮询
          startActionPolling()
        }, 1000)

        // 定期刷新 ChatBot ID 列表（每30秒）
        setInterval(() => {
          refreshChatbotIds()
        }, 30000)
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
