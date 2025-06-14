import { Hono } from 'hono'
import type { CloudflareBindings } from '../../shared/types'

/**
 * Cloudflare Workers 静态文件服务 - 重构版本
 *
 * 完全重构的 Worker 模式测试文件
 * - 默认关闭轮询功能
 * - 优化的用户界面和交互体验
 * - 更好的错误处理和状态管理
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
    <title>Edge Sync State 测试仪表板 - Worker 模式重构版</title>
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
      <p>Worker 模式重构版 <span class="environment-badge">POLLING DISABLED</span></p>
      <p style="margin-top: 10px; font-size: 14px; color: rgba(255,255,255,0.8);">
        💡 完全重构的 Worker 模式，默认关闭轮询，按需启用
      </p>
    </div>

    <div class="dashboard">
      <!-- ChatBot ID 管理卡片 -->
      <div class="card">
        <h3 class="card-title">
          🔗 ChatBot ID 管理
          <div class="status-indicator" id="statusIndicator"></div>
        </h3>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value" id="availableIds">0</div>
            <div class="stat-label">可用 ID 数量</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="currentIdType">默认生成</div>
            <div class="stat-label">当前 ID 类型</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="pollingStatus">已禁用</div>
            <div class="stat-label">Action 轮询</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="pollingCount">0</div>
            <div class="stat-label">轮询次数</div>
          </div>
        </div>
        <div class="input-group">
          <label>从存储选择 ChatBot ID:</label>
          <div class="flex-row">
            <select id="chatbotIdSelect">
              <option value="">从存储键中选择 ChatBot ID</option>
            </select>
            <button class="btn small" onclick="refreshChatbotIds()">🔄 刷新</button>
          </div>
          <div class="flex-row">
            <input type="text" id="chatbotIdInput" placeholder="或手动输入新的 ChatBot ID" />
            <button class="btn small success" onclick="applyChatbotId()">✅ 选择</button>
            <button class="btn small warning" onclick="generateRandomId()">🎲 随机</button>
          </div>
          <div class="chatbot-id-info">
            <strong>当前选择的 ID:</strong> <span id="currentChatbotId" class="chatbot-id-current"></span>
            <div id="chatbotIdStats" style="margin-top: 6px; font-size: 12px; color: #666;"></div>
          </div>
        </div>
        <div class="button-row">
          <button class="btn success" onclick="selectChatbotId()">✅ 确认选择</button>
          <button class="btn" onclick="previewChatbotData()">👁️ 预览数据</button>
          <button class="btn warning" onclick="testChatbotConnection()">🧪 测试连接</button>
          <button class="btn small danger" onclick="clearSavedId()">🗑️ 清除本地</button>
        </div>
        <div class="button-row">
          <button class="btn warning" onclick="enableActionPolling()">⚡ 启用轮询</button>
          <button class="btn danger" onclick="disableActionPolling()">🛑 禁用轮询</button>
          <button class="btn" onclick="toggleActionPolling()">🔀 切换轮询</button>
          <button class="btn small" onclick="checkPollingStatus()">📊 轮询状态</button>
        </div>
        <div class="button-row">
          <button class="btn" onclick="checkQueuedActions()">🔍 检查队列</button>
          <button class="btn small" onclick="clearActionQueue()">🗑️ 清空队列</button>
          <button class="btn small warning" onclick="resetPollingSystem()">🔄 重置系统</button>
        </div>
      </div>

      <!-- 存储监控卡片 -->
      <div class="card">
        <h3 class="card-title">💾 存储监控</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value" id="kvKeysCount">0</div>
            <div class="stat-label">存储记录数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="kvPrefix">-</div>
            <div class="stat-label">键前缀</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="kvTtl">-</div>
            <div class="stat-label">默认 TTL</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="kvLastUpdate">-</div>
            <div class="stat-label">最后更新</div>
          </div>
        </div>
        <div class="button-row">
          <button class="btn" onclick="getAllStorageKeys()">🗂 获取所有键</button>
          <button class="btn" onclick="getStorageStats()">📊 存储统计</button>
          <button class="btn" onclick="testStorage()">🔧 测试存储</button>
          <button class="btn warning" onclick="clearAllStorageData()">🗑️ 清空数据</button>
        </div>
        <div id="kvKeysDisplay" class="response-display" style="max-height: 300px; overflow-y: auto;"></div>
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
          <textarea id="actionPayload" rows="2">{"url": "/monitor/esxi", "message": "Cloudflare Workers 测试"}</textarea>
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
      let isPollingEnabled = false // 默认关闭轮询
      let pollingDisabledByDefault = true // 标记默认禁用状态

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
      log('🌐 Worker 模式测试仪表板已加载 (重构版)', 'success')
      log('📍 服务器地址: ' + SERVER_URL, 'info')
      log('⚠️ 轮询功能默认已禁用，需要手动启用', 'warning')

      // 检查是否加载了保存的 ChatBot ID
      const savedId = loadSavedChatbotId()
      if (savedId && savedId === CHATBOT_ID) {
        log('💾 已加载保存的 ChatBot ID: ' + CHATBOT_ID, 'info')
      } else {
        log('🆕 使用新生成的 ChatBot ID: ' + CHATBOT_ID, 'info')
      }

      // 日志功能
      function log(message, type = 'info') {
        const container = document.getElementById('logContainer')
        const timestamp = new Date().toLocaleTimeString()
        const entry = document.createElement('div')
        entry.className = 'log-entry ' + type
        entry.innerHTML = '<span style="color: #888;">[' + timestamp + ']</span> ' + message

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
        log('自动滚动已' + (autoScroll ? '开启' : '关闭'), 'info')
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

        statsElement.innerHTML = '📏 长度: ' + idLength + ' 字符 | 🏷️ 类型: ' + idType + ' | ⏰ 设置时间: ' + new Date().toLocaleTimeString()
      }

      function generateRandomId() {
        const timestamp = Date.now()
        const random = Math.random().toString(36).substring(2, 8)
        const newId = 'bot_' + timestamp + '_' + random
        document.getElementById('chatbotIdInput').value = newId
        log('🎲 生成随机 ID: ' + newId, 'info')
      }

      function clearSavedId() {
        clearSavedChatbotId()
        log('🗑️ 已清除保存的 ChatBot ID', 'info')
      }

      function applyChatbotId() {
        const inputElement = document.getElementById('chatbotIdInput')
        const selectElement = document.getElementById('chatbotIdSelect')
        let newId = ''

        if (selectElement.value) {
          newId = selectElement.value
          log('📋 选择了现有 ID: ' + newId, 'info')
        } else if (inputElement.value.trim()) {
          newId = inputElement.value.trim()
          log('✏️ 输入了新 ID: ' + newId, 'info')
        } else {
          log('❌ 请选择或输入一个 ChatBot ID', 'error')
          return
        }

        if (newId === CHATBOT_ID) {
          log('⚠️ 新 ID 与当前 ID 相同', 'warning')
          return
        }

        const oldId = CHATBOT_ID
        CHATBOT_ID = newId
        updateCurrentChatbotIdDisplay()

        // 保存到本地存储
        saveChatbotId(CHATBOT_ID)

        // 清空输入框和选择框
        inputElement.value = ''
        selectElement.value = ''

        log('✅ ChatBot ID 已更新: ' + oldId + ' → ' + newId, 'success')
        log('💾 ID 已保存到本地存储', 'info')
        log('💡 现在可以重新建立连接', 'info')
      }

      function selectChatbotId() {
        applyChatbotId()
      }

      function refreshChatbotIds() {
        getAllStorageKeys()
      }

      function previewChatbotData() {
        log('🔍 预览 ChatBot ID: ' + CHATBOT_ID + ' 的数据...', 'info')
        getPageState()
        checkQueuedActions()
      }

      function testChatbotConnection() {
        log('🧪 测试 ChatBot ID: ' + CHATBOT_ID + ' 的连接...', 'info')
        checkConnectionStatus()
      }

      // 获取所有存储键
      async function getAllStorageKeys() {
        log('🔍 获取所有存储键...', 'info')

        try {
          const result = await apiCall('/api/storage/stats')

          if (result.success && result.data.data) {
            const data = result.data.data
            const keys = data.keys || []

            // 更新统计信息
            document.getElementById('kvKeysCount').textContent = data.totalKeys || keys.length
            document.getElementById('kvPrefix').textContent = data.prefix || 'edge-sync'
            document.getElementById('kvTtl').textContent = data.ttl ? data.ttl + 's' : '3600s'
            document.getElementById('kvLastUpdate').textContent = new Date().toLocaleTimeString()

            // 显示键列表
            const keysDisplay = document.getElementById('kvKeysDisplay')
            if (keys.length > 0) {
              let keysHtml = '<strong>存储键列表:</strong><br>'

              // 按类型分组显示
              const pageStateKeys = keys.filter(key => key.startsWith('page_state:'))
              const actionQueueKeys = keys.filter(key => key.startsWith('action_queue:'))
              const otherKeys = keys.filter(key => !key.startsWith('page_state:') && !key.startsWith('action_queue:'))

              if (pageStateKeys.length > 0) {
                keysHtml += '<br><strong>📄 页面状态键 (' + pageStateKeys.length + '):</strong><br>'
                pageStateKeys.forEach(key => {
                  const chatbotId = key.replace('page_state:', '')
                  keysHtml += '<span style="font-family: monospace; color: #2196f3; margin-left: 10px;">' + key + '</span> → ChatBot: <strong>' + chatbotId + '</strong><br>'
                })
              }

              if (actionQueueKeys.length > 0) {
                keysHtml += '<br><strong>⚡ Action 队列键 (' + actionQueueKeys.length + '):</strong><br>'
                actionQueueKeys.forEach(key => {
                  const chatbotId = key.replace('action_queue:', '')
                  keysHtml += '<span style="font-family: monospace; color: #ff9800; margin-left: 10px;">' + key + '</span> → ChatBot: <strong>' + chatbotId + '</strong><br>'
                })
              }

              if (otherKeys.length > 0) {
                keysHtml += '<br><strong>🔧 其他键 (' + otherKeys.length + '):</strong><br>'
                otherKeys.forEach(key => {
                  keysHtml += '<span style="font-family: monospace; color: #666; margin-left: 10px;">' + key + '</span><br>'
                })
              }

              keysDisplay.innerHTML = keysHtml
              keysDisplay.style.display = 'block'

              log('✅ 获取到 ' + keys.length + ' 个存储键', 'success')

              // 更新 ChatBot ID 选择框
              const selectElement = document.getElementById('chatbotIdSelect')
              selectElement.innerHTML = '<option value="">从存储键中选择 ChatBot ID</option>'

              const chatbotIds = new Set()
              pageStateKeys.forEach(key => {
                const id = key.replace('page_state:', '')
                chatbotIds.add(id)
              })
              actionQueueKeys.forEach(key => {
                const id = key.replace('action_queue:', '')
                chatbotIds.add(id)
              })

              Array.from(chatbotIds).sort().forEach(id => {
                const option = document.createElement('option')
                option.value = id
                option.textContent = id
                selectElement.appendChild(option)
              })

              document.getElementById('availableIds').textContent = chatbotIds.size
              log('✅ 从存储找到 ' + chatbotIds.size + ' 个 ChatBot ID', 'success')
            } else {
              keysDisplay.innerHTML = '<strong>📭 存储为空</strong>'
              keysDisplay.style.display = 'block'
              log('📭 存储中没有数据', 'info')
            }
          } else {
            log('❌ 获取存储键失败', 'error')
          }

          showResponse('systemResponse', result)
        } catch (error) {
          log('❌ 获取存储键错误: ' + error.message, 'error')
        }
      }

      // 获取存储统计信息
      async function getStorageStats() {
        log('📊 获取存储统计信息...', 'info')

        try {
          const result = await apiCall('/api/storage/stats')

          if (result.success && result.data.data) {
            const data = result.data.data

            // 更新统计信息显示
            document.getElementById('kvKeysCount').textContent = data.totalKeys || 0
            document.getElementById('kvPrefix').textContent = data.prefix || 'edge-sync'
            document.getElementById('kvTtl').textContent = data.ttl ? data.ttl + 's' : '3600s'
            document.getElementById('kvLastUpdate').textContent = new Date().toLocaleTimeString()

            log('✅ 存储统计信息获取成功', 'success')
            log('📊 总键数: ' + (data.totalKeys || 0), 'info')
            log('🏷️ 键前缀: ' + (data.prefix || 'edge-sync'), 'info')
            log('⏰ 默认 TTL: ' + (data.ttl || 3600) + 's', 'info')
          } else {
            log('❌ 获取存储统计信息失败', 'error')
          }

          showResponse('systemResponse', result)
        } catch (error) {
          log('❌ 获取存储统计信息错误: ' + error.message, 'error')
        }
      }

      // 测试存储
      async function testStorage() {
        log('🔧 测试存储连接...', 'info')

        try {
          const testKey = 'test_' + Date.now()
          const testValue = { test: true, timestamp: Date.now() }

          // 测试写入
          const writeResult = await apiCall('/api/state/' + CHATBOT_ID, {
            method: 'POST',
            body: JSON.stringify({
              url: 'https://test.example.com',
              title: '存储测试页面',
              customData: testValue
            })
          })

          if (writeResult.success) {
            log('✅ 存储写入测试成功', 'success')

            // 测试读取
            const readResult = await apiCall('/api/state/' + CHATBOT_ID)
            if (readResult.success) {
              log('✅ 存储读取测试成功', 'success')
              log('✅ 存储连接正常', 'success')
            } else {
              log('❌ 存储读取测试失败', 'error')
            }
          } else {
            log('❌ 存储写入测试失败', 'error')
          }

          showResponse('systemResponse', writeResult)
        } catch (error) {
          log('❌ 存储测试失败: ' + error.message, 'error')
        }
      }

      // 清空所有存储数据
      async function clearAllStorageData() {
        if (!confirm('⚠️ 确定要清空所有存储数据吗？此操作不可撤销！')) {
          return
        }

        log('🗑️ 清空所有存储数据...', 'warning')

        try {
          const result = await apiCall('/api/storage/clear', {
            method: 'DELETE'
          })

          if (result.success) {
            log('✅ 存储数据已清空', 'success')
            // 刷新统计信息
            getStorageStats()
          } else {
            log('❌ 清空存储数据失败', 'error')
          }

          showResponse('systemResponse', result)
        } catch (error) {
          log('❌ 清空存储失败: ' + error.message, 'error')
        }
    } catch (error) {
        log(\`❌ 从 KV 存储获取键失败: \${error.message}\`, 'error')
    }
}

      // 连接管理
      function updateConnectionStatus(connected) {
        const indicator = document.getElementById('statusIndicator')
        const status = document.getElementById('connectionStatus')

        if (connected) {
          indicator.classList.add('connected')
          if (status) status.textContent = '在线'
          connectionStartTime = Date.now()
          startConnectionTimer()
        } else {
          indicator.classList.remove('connected')
          if (status) status.textContent = '离线'
          stopConnectionTimer()
          const timeElement = document.getElementById('connectionTime')
          if (timeElement) timeElement.textContent = '0s'
        }
      }

      function startConnectionTimer() {
        connectionTimer = setInterval(() => {
          if (connectionStartTime) {
            const elapsed = Math.floor((Date.now() - connectionStartTime) / 1000)
            const timeElement = document.getElementById('connectionTime')
            if (timeElement) timeElement.textContent = formatTime(elapsed)
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
          return hours + 'h ' + minutes + 'm ' + secs + 's'
        } else if (minutes > 0) {
          return minutes + 'm ' + secs + 's'
        } else {
          return secs + 's'
        }
      }

      // API 调用函数
      async function apiCall(endpoint, options = {}) {
        try {
          const response = await fetch(SERVER_URL + endpoint, {
            headers: {
              'Content-Type': 'application/json',
              ...options.headers
            },
            ...options
          })

          const data = await response.json()
          return { success: response.ok, data, status: response.status }
        } catch (error) {
          log('API 调用失败: ' + error.message, 'error')
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
        log('🤖 使用 ChatBot ID: ' + CHATBOT_ID, 'info')
        const wsUrl = WS_URL + '/ws/connect/' + CHATBOT_ID
        log('🌐 连接地址: ' + wsUrl, 'info')

        websocket = new WebSocket(wsUrl)

        websocket.onopen = function(event) {
          log('✅ WebSocket 连接成功', 'success')
          updateConnectionStatus(true)
        }

        websocket.onmessage = function(event) {
          try {
            const message = JSON.parse(event.data)
            log('📨 收到 WebSocket 消息: ' + message.type, 'info')

            if (message.type === 'action') {
              log('🎯 通过 WebSocket 收到 Action: ' + JSON.stringify(message.data), 'success')
              handleReceivedAction(message.data)
            } else if (message.type === 'welcome') {
              log('🎉 WebSocket 连接欢迎消息', 'success')
              // 如果欢迎消息提示检查队列，立即执行一次轮询
              if (message.data && message.data.checkQueue) {
                log('🔍 检查队列中的待处理 Actions...', 'info')
                setTimeout(() => {
                  checkQueuedActions()
                }, 500) // 延迟500ms确保连接稳定
              }
            } else if (message.type === 'heartbeat') {
              log('💓 收到心跳', 'info')
              // 回复心跳
              websocket.send(JSON.stringify({
                type: 'heartbeat',
                data: { timestamp: Date.now() },
                timestamp: Date.now()
              }))
            } else if (message.type === 'pong') {
              log('🏓 收到 pong 响应', 'info')
            }
          } catch (error) {
            log('消息解析错误: ' + error.message, 'error')
          }
        }

        websocket.onclose = function(event) {
          log('❌ WebSocket 连接关闭: ' + event.code, 'warning')
          updateConnectionStatus(false)
        }

        websocket.onerror = function(error) {
          log('❌ WebSocket 错误: ' + error, 'error')
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

        log('🔍 WebSocket 状态: ' + state + ' (' + websocket.readyState + ')', 'info')
        log('🤖 当前 ChatBot ID: ' + CHATBOT_ID, 'info')

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
              log('✅ 服务器端找到连接: ' + CHATBOT_ID, 'success')
            } else {
              log('❌ 服务器端未找到连接: ' + CHATBOT_ID, 'error')
              log('📋 服务器端连接列表: ' + connections.map(c => c.chatbotId).join(', '), 'info')
            }
          }
        } catch (error) {
          log('❌ 检查服务器连接状态失败: ' + error.message, 'error')
        }
      }

      // 页面状态管理
      async function updatePageState() {
        const url = document.getElementById('pageUrl').value
        const title = document.getElementById('pageTitle').value
        let customData = {}

        try {
          customData = JSON.parse(document.getElementById('customData').value)
        } catch (error) {
          log('❌ 自定义数据 JSON 格式错误', 'error')
          return
        }

        log('💾 更新页面状态: ' + CHATBOT_ID, 'info')

        try {
          const result = await apiCall('/api/state/' + CHATBOT_ID, {
            method: 'POST',
            body: JSON.stringify({ url, title, customData })
          })

          if (result.success) {
            log('✅ 页面状态更新成功', 'success')
          } else {
            log('❌ 页面状态更新失败', 'error')
          }

          showResponse('pageStateResponse', result)
        } catch (error) {
          log('❌ 更新页面状态错误: ' + error.message, 'error')
        }
      }

      async function getPageState() {
        log('📖 获取页面状态: ' + CHATBOT_ID, 'info')

        try {
          const result = await apiCall('/api/state/' + CHATBOT_ID)

          if (result.success && result.data.data) {
            const data = result.data.data
            log('✅ 页面状态获取成功', 'success')
            log('📄 URL: ' + data.url, 'info')
            log('📝 标题: ' + data.title, 'info')
            log('📊 自定义数据: ' + JSON.stringify(data.customData), 'info')

            // 填充表单
            document.getElementById('pageUrl').value = data.url || ''
            document.getElementById('pageTitle').value = data.title || ''
            document.getElementById('customData').value = JSON.stringify(data.customData || {}, null, 2)
          } else {
            log('❌ 页面状态获取失败或不存在', 'error')
          }

          showResponse('pageStateResponse', result)
        } catch (error) {
          log('❌ 获取页面状态错误: ' + error.message, 'error')
        }
      }

      async function deletePageState() {
        if (!confirm('确定要删除 ChatBot ID "' + CHATBOT_ID + '" 的页面状态吗？')) {
          return
        }

        log('🗑️ 删除页面状态: ' + CHATBOT_ID, 'warning')

        try {
          const result = await apiCall('/api/state/' + CHATBOT_ID, {
            method: 'DELETE'
          })

          if (result.success) {
            log('✅ 页面状态删除成功', 'success')
          } else {
            log('❌ 页面状态删除失败', 'error')
          }

          showResponse('pageStateResponse', result)
        } catch (error) {
          log('❌ 删除页面状态错误: ' + error.message, 'error')
        }
      }

      // Action 推送
      async function sendCustomAction() {
        const type = document.getElementById('actionType').value
        const target = document.getElementById('actionTarget').value
        let payload = {}

        try {
          payload = JSON.parse(document.getElementById('actionPayload').value)
        } catch (error) {
          log('❌ Action 数据 JSON 格式错误', 'error')
          return
        }

        const action = {
          type,
          target,
          payload,
          timestamp: Date.now()
        }

        log('🚀 发送 Action 到 ' + CHATBOT_ID + ': ' + type, 'info')

        try {
          const result = await apiCall('/api/action/' + CHATBOT_ID, {
            method: 'POST',
            body: JSON.stringify(action)
          })

          if (result.success) {
            log('✅ Action 发送成功', 'success')
          } else {
            log('❌ Action 发送失败', 'error')
          }

          showResponse('actionResponse', result)
        } catch (error) {
          log('❌ 发送 Action 错误: ' + error.message, 'error')
        }
      }

      async function sendQuickActions() {
        log('⚡ 发送快速测试 Actions 到 ' + CHATBOT_ID, 'info')

        const quickActions = [
          {
            type: 'navigate',
            target: 'window',
            payload: { url: '/monitor/esxi' },
            timestamp: Date.now()
          },
          {
            type: 'click',
            target: '#cloudflare-test',
            payload: { message: 'Cloudflare Workers 测试点击' },
            timestamp: Date.now() + 1000
          },
          {
            type: 'input',
            target: 'input[type="text"]',
            payload: { value: 'Cloudflare Workers 输入测试' },
            timestamp: Date.now() + 2000
          }
        ]

        for (const action of quickActions) {
          try {
            const result = await apiCall('/api/action/' + CHATBOT_ID, {
              method: 'POST',
              body: JSON.stringify(action)
            })

            if (result.success) {
              log('✅ 快速 Action 发送成功: ' + action.type, 'success')
            } else {
              log('❌ 快速 Action 发送失败: ' + action.type, 'error')
            }
          } catch (error) {
            log('❌ 发送快速 Action 错误: ' + error.message, 'error')
          }

          // 延迟一下避免过快发送
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }

      function broadcastAction() {
        log('❌ 广播功能在 Cloudflare Workers 中不支持', 'error')
      }

      // Action 轮询管理
      function enableActionPolling() {
        if (isPollingEnabled) {
          log('⚠️ Action 轮询已经启用', 'warning')
          return
        }

        pollingDisabledByDefault = false
        isPollingEnabled = true
        pollingDisabledByDefault = false
        document.getElementById('pollingStatus').textContent = '已启用'
        log('⚡ Action 轮询已启用', 'success')

        // 立即执行一次检查
        checkQueuedActions()

        // 设置定时轮询
        actionPollingInterval = setInterval(() => {
          if (isPollingEnabled) {
            checkQueuedActions()
          }
        }, 3000) // 每3秒轮询一次
      }

      function disableActionPolling() {
        if (!isPollingEnabled) {
          log('⚠️ Action 轮询已经禁用', 'warning')
          return
        }

        isPollingEnabled = false
        document.getElementById('pollingStatus').textContent = '已禁用'
        log('🛑 Action 轮询已禁用', 'info')

        if (actionPollingInterval) {
          clearInterval(actionPollingInterval)
          actionPollingInterval = null
        }
      }

      function toggleActionPolling() {
        if (isPollingEnabled) {
          disableActionPolling()
        } else {
          enableActionPolling()
        }
      }

      function checkPollingStatus() {
        log('📊 轮询状态: ' + (isPollingEnabled ? '已启用' : '已禁用'), 'info')
        log('🔄 轮询间隔: 3秒', 'info')
        log('📈 轮询次数: ' + document.getElementById('pollingCount').textContent, 'info')
        log('⚙️ 默认状态: ' + (pollingDisabledByDefault ? '禁用' : '启用'), 'info')
      }

      function resetPollingSystem() {
        disableActionPolling()
        document.getElementById('pollingCount').textContent = '0'
        pollingDisabledByDefault = true
        log('🔄 轮询系统已重置', 'info')
      }

      // 检查队列中的 Actions
      async function checkQueuedActions() {
        try {
          const result = await apiCall('/api/action/' + CHATBOT_ID)

          if (result.success && result.data.data && result.data.data.length > 0) {
            const actions = result.data.data
            log('🔍 发现 ' + actions.length + ' 个待处理 Action', 'success')

            actions.forEach((action, index) => {
              log('📋 Action ' + (index + 1) + ': ' + action.type + ' - ' + JSON.stringify(action.payload), 'info')
              handleReceivedAction(action)
            })
          } else {
            // 只在手动检查时显示无 Action 的消息
            if (!isPollingEnabled) {
              log('📭 队列中没有待处理的 Action', 'info')
            }
          }

          // 更新轮询计数
          if (isPollingEnabled) {
            const currentCount = parseInt(document.getElementById('pollingCount').textContent) || 0
            document.getElementById('pollingCount').textContent = currentCount + 1
          }

        } catch (error) {
          log('❌ 检查队列 Action 错误: ' + error.message, 'error')
        }
      }

      async function clearActionQueue() {
        if (!confirm('确定要清空 ChatBot ID "' + CHATBOT_ID + '" 的 Action 队列吗？')) {
          return
        }

        log('🗑️ 清空 Action 队列: ' + CHATBOT_ID, 'warning')

        try {
          const result = await apiCall('/api/action/' + CHATBOT_ID, {
            method: 'DELETE'
          })

          if (result.success) {
            log('✅ Action 队列已清空', 'success')
          } else {
            log('❌ 清空 Action 队列失败', 'error')
          }
        } catch (error) {
          log('❌ 清空 Action 队列错误: ' + error.message, 'error')
        }
      }

      // 处理接收到的 Action
      function handleReceivedAction(action) {
        log('🎯 处理 Action: ' + action.type, 'success')
        log('📋 目标: ' + action.target, 'info')
        log('📊 数据: ' + JSON.stringify(action.payload), 'info')

        // 这里可以添加实际的 Action 处理逻辑
        // 例如：模拟点击、导航、输入等操作

        switch (action.type) {
          case 'navigate':
            log('🧭 模拟导航到: ' + action.payload.url, 'info')
            break
          case 'click':
            log('👆 模拟点击元素: ' + action.target, 'info')
            break
          case 'input':
            log('⌨️ 模拟输入: ' + action.payload.value, 'info')
            break
          case 'scroll':
            log('📜 模拟滚动', 'info')
            break
          default:
            log('🔧 自定义 Action: ' + action.type, 'info')
        }
      }

      // 显示响应函数
      function showResponse(elementId, result) {
        const element = document.getElementById(elementId)
        if (!element) return

        let html = '<strong>响应结果:</strong><br>'
        html += '<strong>状态:</strong> ' + (result.success ? '✅ 成功' : '❌ 失败') + '<br>'

        if (result.status) {
          html += '<strong>HTTP 状态:</strong> ' + result.status + '<br>'
        }

        if (result.data) {
          html += '<strong>数据:</strong><br>'
          html += '<pre style="background: #f5f5f5; padding: 8px; border-radius: 4px; font-size: 11px; overflow-x: auto;">' + JSON.stringify(result.data, null, 2) + '</pre>'
        }

        if (result.error) {
          html += '<strong>错误:</strong> ' + result.error + '<br>'
        }

        element.innerHTML = html
        element.style.display = 'block'
      }

      // 页面加载完成后的初始化
      document.addEventListener('DOMContentLoaded', function() {
        // 自动刷新存储键列表
        setTimeout(() => {
          getAllStorageKeys()
        }, 1000)

        // 显示当前环境信息
        log('🌍 当前环境: Cloudflare Workers', 'info')
        log('💾 存储类型: KV Storage', 'info')
        log('🔧 模式: Worker 重构版', 'info')
      })
    </script>
  </body>
</html>`
export function createStaticRoutesForWorker() {
  const app = new Hono<{ Bindings: CloudflareBindings }>()

  // 静态文件路由
  app.get('/', c => {
    return c.html(TEST_DASHBOARD_HTML)
  })

  app.get('/test-dashboard.html', c => {
    return c.html(TEST_DASHBOARD_HTML)
  })

  // 健康检查
  app.get('/health', c => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: 'cloudflare-workers',
      version: '2.0.0-worker-refactor',
    })
  })

  return app
}
