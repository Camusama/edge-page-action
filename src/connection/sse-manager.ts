import type { ConnectionManager, SSEMessage, ConnectionInfo } from '../types'

export interface SSEConnection {
  chatbotId: string
  response: Response
  controller: ReadableStreamDefaultController
  connectedAt: number
  lastActivity: number
}

export class SSEConnectionManager implements ConnectionManager {
  private connections: Map<string, SSEConnection> = new Map()
  private heartbeatInterval: number = 30000 // 30 seconds
  private heartbeatTimer?: NodeJS.Timeout

  constructor() {
    this.startHeartbeat()
  }

  addConnection(chatbotId: string, connection: SSEConnection): void {
    // 如果已存在连接，先关闭旧连接
    if (this.connections.has(chatbotId)) {
      this.removeConnection(chatbotId)
    }

    this.connections.set(chatbotId, connection)
    console.log(`SSE connection added for chatbot: ${chatbotId}`)

    // 发送连接确认消息
    this.sendToConnection(chatbotId, {
      type: 'ping',
      data: { message: 'Connected successfully' },
      timestamp: Date.now(),
    })
  }

  removeConnection(chatbotId: string): void {
    const connection = this.connections.get(chatbotId)
    if (connection) {
      try {
        // 关闭 SSE 流
        connection.controller.close()
      } catch (error) {
        console.error('Error closing SSE connection:', error)
      }

      this.connections.delete(chatbotId)
      console.log(`SSE connection removed for chatbot: ${chatbotId}`)
    }
  }

  sendToConnection(chatbotId: string, message: SSEMessage): boolean {
    const connection = this.connections.get(chatbotId)
    if (!connection) {
      return false
    }

    try {
      const sseData = this.formatSSEMessage(message)
      connection.controller.enqueue(new TextEncoder().encode(sseData))
      connection.lastActivity = Date.now()
      return true
    } catch (error) {
      console.error(`Error sending message to ${chatbotId}:`, error)
      // 连接出错，移除连接
      this.removeConnection(chatbotId)
      return false
    }
  }

  sendToAll(message: SSEMessage): number {
    const chatbotIds = Array.from(this.connections.keys())
    let sentCount = 0
    chatbotIds.forEach(chatbotId => {
      if (this.sendToConnection(chatbotId, message)) {
        sentCount++
      }
    })
    return sentCount
  }

  broadcast(message: SSEMessage, excludeChatbotId?: string): number {
    const chatbotIds = Array.from(this.connections.keys())
    let sentCount = 0
    chatbotIds.forEach(chatbotId => {
      if (excludeChatbotId && chatbotId === excludeChatbotId) {
        return
      }
      if (this.sendToConnection(chatbotId, message)) {
        sentCount++
      }
    })
    return sentCount
  }

  hasConnection(chatbotId: string): boolean {
    return this.connections.has(chatbotId)
  }

  getAllChatbotIds(): string[] {
    return Array.from(this.connections.keys())
  }

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

  getConnectionCount(): number {
    return this.connections.size
  }

  getConnectionInfo(): ConnectionInfo[] {
    return Array.from(this.connections.values()).map(conn => ({
      chatbotId: conn.chatbotId,
      connectedAt: conn.connectedAt,
      lastActivity: conn.lastActivity,
    }))
  }

  formatSSEMessage(message: SSEMessage): string {
    const data = JSON.stringify(message)
    return `data: ${data}\n\n`
  }

  get heartbeatInterval(): number {
    return this.heartbeatInterval
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      const heartbeatMessage: SSEMessage = {
        type: 'ping',
        timestamp: now,
      }

      // 发送心跳并检查连接状态
      const chatbotIds = Array.from(this.connections.keys())
      chatbotIds.forEach(chatbotId => {
        const connection = this.connections.get(chatbotId)
        if (connection) {
          // 检查连接是否超时（5分钟无活动）
          if (now - connection.lastActivity > 300000) {
            console.log(`Removing inactive connection: ${chatbotId}`)
            this.removeConnection(chatbotId)
          } else {
            this.sendToConnection(chatbotId, heartbeatMessage)
          }
        }
      })
    }, this.heartbeatInterval)
  }

  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    // 关闭所有连接
    const chatbotIds = Array.from(this.connections.keys())
    chatbotIds.forEach(chatbotId => {
      this.removeConnection(chatbotId)
    })
  }
}
