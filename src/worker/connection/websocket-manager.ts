/**
 * WebSocket 连接管理器 (Cloudflare Workers 专用)
 *
 * 注意：由于 Cloudflare Workers 的 I/O 隔离限制，
 * WebSocket 对象不能跨请求上下文使用。
 * 此管理器主要用于单个请求生命周期内的 WebSocket 处理。
 */

import type { SSEMessage, ConnectionManager, ConnectionInfo } from '../../shared/types'

// Cloudflare Workers 特有的类型扩展
declare global {
  interface ResponseInit {
    webSocket?: WebSocket
  }
}

interface WebSocketConnection {
  chatbotId: string
  websocket: WebSocket
  connectedAt: number
  lastPing: number
}

export class WebSocketConnectionManager implements ConnectionManager {
  // 注意：这个 Map 只在单个请求生命周期内有效
  // 不能用于跨请求的连接管理
  private connections: Map<string, WebSocketConnection> = new Map()
  private pingInterval: number = 30000 // 30秒心跳

  constructor() {
    console.log('WebSocket Connection Manager initialized for Cloudflare Workers')
    console.log(
      'WARNING: WebSocket connections cannot persist across request contexts in Cloudflare Workers'
    )
  }

  /**
   * 处理 WebSocket 升级请求
   */
  handleUpgrade(request: Request, chatbotId: string): Response {
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 })
    }

    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)

    // 接受 WebSocket 连接
    server.accept()

    // 设置连接信息
    const connection: WebSocketConnection = {
      chatbotId,
      websocket: server,
      connectedAt: Date.now(),
      lastPing: Date.now(),
    }

    // 移除旧连接（如果存在）
    this.removeConnection(chatbotId)

    // 添加新连接
    this.connections.set(chatbotId, connection)

    // 设置事件处理器
    this.setupWebSocketHandlers(connection)

    console.log(`WebSocket connection established for chatbot: ${chatbotId}`)
    console.log(`Total connections: ${this.connections.size}`)
    console.log(`All connected chatbot IDs: ${Array.from(this.connections.keys()).join(', ')}`)

    // 发送欢迎消息
    this.sendToConnection(chatbotId, {
      type: 'welcome',
      data: {
        message: 'WebSocket connection established',
        chatbotId,
        timestamp: Date.now(),
        // 提示客户端检查队列中的 Actions
        checkQueue: true,
      },
      timestamp: Date.now(),
    })

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket })
  }

  /**
   * 设置 WebSocket 事件处理器
   */
  private setupWebSocketHandlers(connection: WebSocketConnection) {
    const { websocket, chatbotId } = connection

    websocket.addEventListener('message', event => {
      try {
        const data = JSON.parse(event.data as string)
        this.handleMessage(chatbotId, data)
      } catch (error) {
        console.error(`WebSocket message parse error for ${chatbotId}:`, error)
      }
    })

    websocket.addEventListener('close', event => {
      console.log(`WebSocket closed for chatbot: ${chatbotId}, code: ${event.code}`)
      this.removeConnection(chatbotId)
    })

    websocket.addEventListener('error', event => {
      console.error(`WebSocket error for chatbot: ${chatbotId}:`, event)
      this.removeConnection(chatbotId)
    })

    // 启动心跳
    this.startHeartbeat(connection)
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(chatbotId: string, data: any) {
    console.log(`WebSocket message from ${chatbotId}:`, data)

    // 更新最后活跃时间
    const connection = this.connections.get(chatbotId)
    if (connection) {
      connection.lastPing = Date.now()
      console.log(`Updated lastPing for ${chatbotId} to ${connection.lastPing}`)
    }

    // 处理不同类型的消息
    switch (data.type) {
      case 'ping':
        console.log(`Received ping from ${chatbotId}, sending pong`)
        this.sendToConnection(chatbotId, {
          type: 'pong',
          data: { timestamp: Date.now() },
          timestamp: Date.now(),
        })
        break

      case 'heartbeat':
        console.log(`Received heartbeat from ${chatbotId}`)
        // 心跳响应
        break

      case 'pong':
        console.log(`Received pong from ${chatbotId}`)
        break

      default:
        console.log(`Unknown message type from ${chatbotId}: ${data.type}`)
    }
  }

  /**
   * 启动心跳机制
   */
  private startHeartbeat(connection: WebSocketConnection) {
    const heartbeatTimer = setInterval(() => {
      if (!this.connections.has(connection.chatbotId)) {
        clearInterval(heartbeatTimer)
        return
      }

      const now = Date.now()
      // 增加超时时间，避免过早断开连接
      if (now - connection.lastPing > this.pingInterval * 3) {
        // 超时，关闭连接
        console.log(`WebSocket heartbeat timeout for ${connection.chatbotId}`)
        this.removeConnection(connection.chatbotId)
        clearInterval(heartbeatTimer)
        return
      }

      // 检查 WebSocket 状态
      if (connection.websocket.readyState !== WebSocket.OPEN) {
        console.log(`WebSocket not open for ${connection.chatbotId}, removing connection`)
        this.removeConnection(connection.chatbotId)
        clearInterval(heartbeatTimer)
        return
      }

      // 发送心跳
      try {
        connection.websocket.send(
          JSON.stringify({
            type: 'heartbeat',
            data: { timestamp: now },
            timestamp: now,
          })
        )
        console.log(`Heartbeat sent to ${connection.chatbotId}`)
      } catch (error) {
        console.error(`Heartbeat send error for ${connection.chatbotId}:`, error)
        this.removeConnection(connection.chatbotId)
        clearInterval(heartbeatTimer)
      }
    }, this.pingInterval)
  }

  /**
   * 发送消息到指定连接
   *
   * 注意：由于 Cloudflare Workers 的 I/O 隔离限制，
   * 此方法只能在 WebSocket 连接的同一请求上下文中使用。
   * 跨请求的消息发送应该使用 KV 存储 + 轮询机制。
   */
  sendToConnection(chatbotId: string, message: SSEMessage): boolean {
    console.log(`Attempting to send message to chatbot: ${chatbotId}`)
    console.log(
      `Available connections in current context: ${Array.from(this.connections.keys()).join(', ')}`
    )

    const connection = this.connections.get(chatbotId)
    if (!connection) {
      console.warn(`No connection found for chatbot: ${chatbotId} in current request context`)
      console.warn('This is expected in Cloudflare Workers due to I/O isolation')
      console.warn('Messages should be queued in KV storage for polling-based delivery')
      return false
    }

    // 检查 WebSocket 状态
    const wsState = connection.websocket.readyState
    console.log(
      `WebSocket state for ${chatbotId}: ${wsState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`
    )

    if (wsState !== WebSocket.OPEN) {
      console.warn(`WebSocket not open for ${chatbotId}, state: ${wsState}`)
      this.removeConnection(chatbotId)
      return false
    }

    try {
      const messageStr = JSON.stringify(message)
      console.log(`Sending message to ${chatbotId}:`, messageStr)
      connection.websocket.send(messageStr)
      console.log(`Message sent successfully to ${chatbotId}`)
      return true
    } catch (error) {
      console.error(`Failed to send message to ${chatbotId}:`, error)
      // 检查是否是跨请求 I/O 错误
      if (error instanceof Error && error.message.includes('I/O objects')) {
        console.error('Cross-request I/O error detected - this is a Cloudflare Workers limitation')
        console.error('Consider using KV storage + polling for cross-request messaging')
      }
      this.removeConnection(chatbotId)
      return false
    }
  }

  /**
   * 广播消息到所有连接
   */
  broadcast(message: SSEMessage, excludeChatbotId?: string): number {
    let sentCount = 0
    const deadConnections: string[] = []

    for (const [chatbotId, connection] of this.connections) {
      if (excludeChatbotId && chatbotId === excludeChatbotId) {
        continue
      }

      try {
        connection.websocket.send(JSON.stringify(message))
        sentCount++
      } catch (error) {
        console.error(`Failed to broadcast to ${chatbotId}:`, error)
        deadConnections.push(chatbotId)
      }
    }

    // 清理死连接
    deadConnections.forEach(chatbotId => this.removeConnection(chatbotId))

    return sentCount
  }

  /**
   * 移除连接
   */
  removeConnection(chatbotId: string): void {
    const connection = this.connections.get(chatbotId)
    if (connection) {
      try {
        connection.websocket.close()
      } catch (error) {
        // 忽略关闭错误
      }
      this.connections.delete(chatbotId)
      console.log(`WebSocket connection removed for chatbot: ${chatbotId}`)
      console.log(`Remaining connections: ${this.connections.size}`)
    }
  }

  /**
   * 获取连接统计
   */
  getStats() {
    const now = Date.now()
    const connections = Array.from(this.connections.values())

    return {
      total: connections.length,
      chatbotIds: Array.from(this.connections.keys()),
      averageUptime:
        connections.length > 0
          ? Math.round(
              connections.reduce((sum, conn) => sum + (now - conn.connectedAt), 0) /
                connections.length /
                1000
            )
          : 0,
      oldestConnection:
        connections.length > 0
          ? Math.round((now - Math.min(...connections.map(conn => conn.connectedAt))) / 1000)
          : 0,
    }
  }

  /**
   * 检查连接是否存在
   */
  hasConnection(chatbotId: string): boolean {
    return this.connections.has(chatbotId)
  }

  /**
   * 获取所有连接的 chatbotId
   */
  getAllChatbotIds(): string[] {
    return Array.from(this.connections.keys())
  }

  /**
   * 清理所有连接
   */
  destroy(): void {
    console.log('Destroying all WebSocket connections...')
    for (const chatbotId of this.connections.keys()) {
      this.removeConnection(chatbotId)
    }
  }

  // ===== ConnectionManager 接口实现 =====

  /**
   * 发送消息到所有连接 (兼容接口)
   */
  sendToAll(message: SSEMessage): number {
    return this.broadcast(message)
  }

  /**
   * 获取连接数量 (兼容接口)
   */
  getConnectionCount(): number {
    return this.connections.size
  }

  /**
   * 获取连接信息 (兼容接口)
   */
  getConnectionInfo(): ConnectionInfo[] {
    return Array.from(this.connections.values()).map(conn => ({
      chatbotId: conn.chatbotId,
      connectedAt: conn.connectedAt,
      lastActivity: conn.lastPing,
      type: 'websocket',
    }))
  }

  /**
   * 添加连接 (兼容接口 - WebSocket 中通过 handleUpgrade 处理)
   */
  addConnection(chatbotId: string, _response: any): void {
    // WebSocket 连接通过 handleUpgrade 方法处理
    // 这个方法保留用于接口兼容性
    console.log(`addConnection called for ${chatbotId} - use handleUpgrade for WebSocket`)
  }

  /**
   * 心跳间隔 (兼容接口)
   */
  get heartbeatInterval(): number {
    return this.pingInterval
  }

  /**
   * 格式化 SSE 消息 (兼容接口)
   */
  formatSSEMessage(message: SSEMessage): string {
    // WebSocket 使用 JSON 格式，不需要 SSE 格式化
    return JSON.stringify(message)
  }
}
