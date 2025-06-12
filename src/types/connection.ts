import type { SSEMessage } from './index'

/**
 * 通用连接管理器接口
 * 
 * 这个接口定义了连接管理器的通用方法，
 * 可以被 SSE 和 WebSocket 管理器实现
 */
export interface ConnectionManager {
  // 发送消息到指定连接
  sendToConnection(chatbotId: string, message: SSEMessage): boolean

  // 发送消息到所有连接
  sendToAll(message: SSEMessage): number

  // 广播消息（可选排除某个连接）
  broadcast(message: SSEMessage, excludeChatbotId?: string): number

  // 移除连接
  removeConnection(chatbotId: string): void

  // 获取连接数量
  getConnectionCount(): number

  // 获取连接信息
  getConnectionInfo(): Array<{ chatbotId: string; connectedAt: number; type: string }>

  // 检查连接是否存在
  hasConnection(chatbotId: string): boolean

  // 获取所有连接的 chatbotId
  getAllChatbotIds(): string[]

  // 获取统计信息
  getStats(): {
    total: number
    chatbotIds: string[]
    averageUptime: number
    oldestConnection: number
  }

  // 清理所有连接
  destroy(): void

  // 心跳间隔
  heartbeatInterval: number

  // 格式化消息（用于不同协议）
  formatSSEMessage(message: SSEMessage): string
}

/**
 * SSE 连接管理器接口（向后兼容）
 */
export interface SSEConnectionManager extends ConnectionManager {
  // 添加连接（SSE 特有）
  addConnection(chatbotId: string, response: any): void
}

/**
 * WebSocket 连接管理器接口
 */
export interface WebSocketConnectionManager extends ConnectionManager {
  // 处理 WebSocket 升级（WebSocket 特有）
  handleUpgrade(request: Request, chatbotId: string): Response
}
