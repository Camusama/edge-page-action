/**
 * WebSocket 连接管理器 (Cloudflare Workers 专用)
 *
 * 在 Cloudflare Workers 中，WebSocket 比 SSE 更适合实时通信
 */

import type { SSEMessage } from '../types'

interface WebSocketConnection {
  chatbotId: string
  websocket: WebSocket
  connectedAt: number
  lastPing: number
}

export class WebSocketConnectionManager {
  private connections: Map<string, WebSocketConnection> = new Map()
  private pingInterval: number = 30000 // 30秒心跳

  constructor() {
    console.log('WebSocket Connection Manager initialized for Cloudflare Workers')
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

    // 发送欢迎消息
    this.sendToConnection(chatbotId, {
      type: 'welcome',
      data: {
        message: 'WebSocket connection established',
        chatbotId,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    })

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
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
    }

    // 处理不同类型的消息
    switch (data.type) {
      case 'ping':
        this.sendToConnection(chatbotId, {
          type: 'pong',
          data: { timestamp: Date.now() },
          timestamp: Date.now(),
        })
        break

      case 'heartbeat':
        // 心跳响应
        break

      default:
        console.log(`Unknown message type: ${data.type}`)
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
      if (now - connection.lastPing > this.pingInterval * 2) {
        // 超时，关闭连接
        console.log(`WebSocket heartbeat timeout for ${connection.chatbotId}`)
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
      } catch (error) {
        console.error(`Heartbeat send error for ${connection.chatbotId}:`, error)
        this.removeConnection(connection.chatbotId)
        clearInterval(heartbeatTimer)
      }
    }, this.pingInterval)
  }

  /**
   * 发送消息到指定连接
   */
  sendToConnection(chatbotId: string, message: SSEMessage): boolean {
    const connection = this.connections.get(chatbotId)
    if (!connection) {
      return false
    }

    try {
      connection.websocket.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error(`Failed to send message to ${chatbotId}:`, error)
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

  // ===== SSEConnectionManager 兼容接口 =====

  /**
   * 发送消息到所有连接 (兼容 SSE 接口)
   */
  sendToAll(message: SSEMessage): number {
    return this.broadcast(message)
  }

  /**
   * 获取连接数量 (兼容 SSE 接口)
   */
  getConnectionCount(): number {
    return this.connections.size
  }

  /**
   * 获取连接信息 (兼容 SSE 接口)
   */
  getConnectionInfo(): Array<{ chatbotId: string; connectedAt: number; type: string }> {
    return Array.from(this.connections.values()).map(conn => ({
      chatbotId: conn.chatbotId,
      connectedAt: conn.connectedAt,
      type: 'websocket',
    }))
  }

  /**
   * 添加连接 (兼容 SSE 接口 - WebSocket 中通过 handleUpgrade 处理)
   */
  addConnection(chatbotId: string, response: any): void {
    // WebSocket 连接通过 handleUpgrade 方法处理
    // 这个方法保留用于接口兼容性
    console.log(`addConnection called for ${chatbotId} - use handleUpgrade for WebSocket`)
  }

  /**
   * 心跳间隔 (兼容 SSE 接口)
   */
  get heartbeatInterval(): number {
    return this.pingInterval
  }

  /**
   * 格式化 SSE 消息 (兼容 SSE 接口)
   */
  formatSSEMessage(message: SSEMessage): string {
    // WebSocket 使用 JSON 格式，不需要 SSE 格式化
    return JSON.stringify(message)
  }
}
