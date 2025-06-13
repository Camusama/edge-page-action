import type { StorageAdapter, PageState, FrontendAction } from '../types'

export class SyncService {
  constructor(private storage: StorageAdapter) {}

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

    // 添加时间戳
    action.timestamp = Date.now()

    // 现在只使用 KV 队列机制，不再依赖 WebSocket
    console.log('Using KV-based action queuing (WebSocket removed)')

    try {
      await this.addActionForChatbot(chatbotId, action)
      console.log(`✅ Action successfully queued in KV for chatbot: ${chatbotId}`)
      console.log(`📡 Action will be delivered via polling mechanism`)
      return true
    } catch (error) {
      console.error(`❌ Failed to queue action for chatbot: ${chatbotId}`, error)
      return false
    }
  }

  // 广播 Action 到所有连接
  async broadcastAction(action: FrontendAction): Promise<void> {
    action.timestamp = Date.now()

    console.log('Broadcast not supported - WebSocket functionality removed')
    console.log('Consider using individual action sending instead')
    console.log('Action:', action)
  }

  // 获取连接统计信息
  getConnectionStats() {
    return {
      totalConnections: 0,
      connections: [],
      note: 'WebSocket functionality removed - using polling-based architecture',
    }
  }

  // 验证页面状态数据 - 支持任意嵌套 JSON，与 RESTful API 保持一致
  validatePageState(state: any): PageState {
    if (!state || typeof state !== 'object') {
      throw new Error('Invalid page state: must be an object')
    }

    // 检查是否为空对象
    if (Object.keys(state).length === 0) {
      throw new Error('Invalid page state: cannot be empty')
    }

    // 检查 JSON 序列化是否正常（防止循环引用等问题）
    try {
      JSON.stringify(state)
    } catch (error) {
      throw new Error('Invalid page state: contains invalid JSON structure')
    }

    // 可选：检查数据大小限制（防止过大的数据）
    const dataSize = JSON.stringify(state).length
    if (dataSize > 1024 * 1024) {
      // 1MB 限制
      throw new Error(`Page state too large: ${dataSize} bytes`)
    }

    // 返回原始状态数据，保持完整性
    return {
      ...state,
      timestamp: state.timestamp || Date.now(),
    } as PageState
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
