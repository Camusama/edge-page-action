import type {
  StorageAdapter,
  PageState,
  FrontendAction,
  SSEMessage,
  ConnectionManager,
} from '../types'

export class SyncService {
  constructor(private storage: StorageAdapter, private connectionManager: ConnectionManager) {}

  // 更新页面状态
  async updatePageState(chatbotId: string, state: PageState): Promise<void> {
    if (!chatbotId) {
      throw new Error('chatbotId is required')
    }

    // 添加时间戳
    state.timestamp = Date.now()
    state.chatbotId = chatbotId

    // 保存到存储
    await this.storage.setPageState(chatbotId, state)

    console.log(`Page state updated for chatbot: ${chatbotId}`)
  }

  // 获取页面状态
  async getPageState(chatbotId: string): Promise<PageState | null> {
    if (!chatbotId) {
      throw new Error('chatbotId is required')
    }

    return await this.storage.getPageState(chatbotId)
  }

  // 删除页面状态
  async deletePageState(chatbotId: string): Promise<void> {
    if (!chatbotId) {
      throw new Error('chatbotId is required')
    }

    await this.storage.deletePageState(chatbotId)
    console.log(`Page state deleted for chatbot: ${chatbotId}`)
  }

  // 检查页面状态是否存在
  async hasPageState(chatbotId: string): Promise<boolean> {
    if (!chatbotId) {
      return false
    }

    const state = await this.storage.getPageState(chatbotId)
    return state !== null
  }

  // 推送前端 Action
  async pushAction(chatbotId: string, action: FrontendAction): Promise<boolean> {
    if (!chatbotId) {
      throw new Error('chatbotId is required')
    }

    console.log(`SyncService: Pushing action to chatbot: ${chatbotId}`, action)
    console.log(`SyncService: Connection manager type: ${this.connectionManager.constructor.name}`)
    console.log(`SyncService: Total connections: ${this.connectionManager.getConnectionCount()}`)
    console.log(
      `SyncService: Available chatbot IDs: ${this.connectionManager.getAllChatbotIds().join(', ')}`
    )

    // 添加时间戳
    action.timestamp = Date.now()

    // 检查是否是 Cloudflare Workers 环境
    const isCloudflareWorkers =
      this.connectionManager.constructor.name === 'WebSocketConnectionManager'

    console.log(`Environment detection: ${isCloudflareWorkers ? 'Cloudflare Workers' : 'Node.js'}`)
    console.log(`Connection manager: ${this.connectionManager.constructor.name}`)

    if (isCloudflareWorkers) {
      // 在 Cloudflare Workers 中，只使用 KV 队列，完全避免跨请求 I/O 问题
      console.log('Cloudflare Workers detected - using KV-based action queuing only')
      console.log('Skipping WebSocket send to avoid cross-request I/O error')

      try {
        await this.addActionForChatbot(chatbotId, action)
        console.log(`✅ Action successfully queued in KV for chatbot: ${chatbotId}`)
        console.log(`📡 Action will be delivered via polling mechanism`)

        // 在 Cloudflare Workers 中，不尝试直接发送 WebSocket 消息
        // 因为这会导致跨请求 I/O 错误
        // 所有 Actions 都通过 KV 存储 + 轮询机制传递

        return true
      } catch (error) {
        console.error(`❌ Failed to queue action for chatbot: ${chatbotId}`, error)
        return false
      }
    } else {
      // Node.js 环境，使用传统的直接发送方式
      const message: SSEMessage = {
        type: 'action',
        data: action,
        timestamp: action.timestamp,
      }

      // 发送到指定连接
      const sent = this.connectionManager.sendToConnection(chatbotId, message)

      if (sent) {
        console.log(`Action pushed to chatbot: ${chatbotId}`, action)
      } else {
        console.warn(`Failed to push action to chatbot: ${chatbotId} (connection not found)`)

        // 尝试添加到队列（如果支持）
        try {
          await this.addActionForChatbot(chatbotId, action)
          console.log(`Action queued for chatbot: ${chatbotId}`)
        } catch (error) {
          console.error(`Failed to queue action for chatbot: ${chatbotId}`, error)
        }
      }

      return sent
    }
  }

  // 广播 Action 到所有连接
  async broadcastAction(action: FrontendAction): Promise<void> {
    action.timestamp = Date.now()

    // 检查是否是 Cloudflare Workers 环境
    const isCloudflareWorkers =
      this.connectionManager.constructor.name === 'WebSocketConnectionManager'

    if (isCloudflareWorkers) {
      console.log('Cloudflare Workers detected - broadcast not supported due to I/O isolation')
      console.log('Broadcast actions are not supported in Cloudflare Workers environment')
      console.log('Consider using individual action sending instead')
      return
    }

    const message: SSEMessage = {
      type: 'action',
      data: action,
      timestamp: action.timestamp,
    }

    this.connectionManager.sendToAll(message)
    console.log('Action broadcasted to all connections:', action)
  }

  // 获取连接统计信息
  getConnectionStats() {
    return {
      totalConnections: this.connectionManager.getConnectionCount(),
      connections: this.connectionManager.getConnectionInfo(),
    }
  }

  // 验证页面状态数据
  validatePageState(state: any): PageState {
    if (!state || typeof state !== 'object') {
      throw new Error('Invalid page state: must be an object')
    }

    if (!state.url || typeof state.url !== 'string') {
      throw new Error('Invalid page state: url is required and must be a string')
    }

    if (!state.title || typeof state.title !== 'string') {
      throw new Error('Invalid page state: title is required and must be a string')
    }

    return {
      url: state.url,
      title: state.title,
      timestamp: state.timestamp || Date.now(),
      chatbotId: state.chatbotId,
      inputs: state.inputs || {},
      forms: state.forms || {},
      scrollPosition: state.scrollPosition,
      viewport: state.viewport,
      metadata: state.metadata,
      customData: state.customData,
    }
  }

  // 验证前端 Action
  validateAction(action: any): FrontendAction {
    if (!action || typeof action !== 'object') {
      throw new Error('Invalid action: must be an object')
    }

    const validTypes = ['navigate', 'click', 'input', 'scroll', 'custom']
    if (!action.type || !validTypes.includes(action.type)) {
      throw new Error(`Invalid action type: must be one of ${validTypes.join(', ')}`)
    }

    return {
      type: action.type,
      target: action.target,
      payload: action.payload,
      timestamp: action.timestamp || Date.now(),
    }
  }

  /**
   * 获取指定 chatbot 的待处理 Actions（用于轮询）
   */
  async getActionsForChatbot(chatbotId: string): Promise<any[]> {
    try {
      // 检查存储是否支持 Action 队列
      if (typeof (this.storage as any).getAndClearActionQueue === 'function') {
        return await (this.storage as any).getAndClearActionQueue(chatbotId)
      }

      // 如果不支持，返回空数组
      return []
    } catch (error) {
      console.error('Failed to get actions for chatbot:', error)
      return []
    }
  }

  /**
   * 为指定 chatbot 添加 Action 到队列（用于轮询）
   */
  async addActionForChatbot(chatbotId: string, action: FrontendAction): Promise<void> {
    try {
      // 检查存储是否支持 Action 队列
      if (typeof (this.storage as any).addActionToQueue === 'function') {
        await (this.storage as any).addActionToQueue(chatbotId, action)
      }
    } catch (error) {
      console.error('Failed to add action for chatbot:', error)
    }
  }
}
