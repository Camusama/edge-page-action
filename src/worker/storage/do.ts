import { BaseStorageAdapter } from './base'
import type { CloudflareBindings } from '../../shared/types'
import { DurableObject } from 'cloudflare:workers'

// 数据接口定义
export interface EdgeSyncData {
  id: string
  type: 'page' | 'action' | 'config'
  data: any
  timestamp: number
  version: number
  metadata?: Record<string, any>
}

// 操作类型
export type EdgeSyncOperation =
  | { type: 'set'; key: string; value: EdgeSyncData }
  | { type: 'get'; key: string }
  | { type: 'delete'; key: string }
  | { type: 'list'; prefix?: string; limit?: number }
  | { type: 'sync'; data: EdgeSyncData[] }
  | { type: 'clear' }

// 响应类型
export interface EdgeSyncResponse {
  success: boolean
  data?: any
  error?: string
  timestamp: number
}

/**
 * Durable Objects 存储适配器
 *
 * 使用 Cloudflare Durable Objects 提供强一致性的存储服务
 */
export class DOStorageAdapter extends BaseStorageAdapter {
  private doBinding: any
  private connected: boolean = false

  constructor(doBinding: any, prefix: string = 'edge-sync', ttl: number = 3600) {
    super(prefix, ttl)
    this.doBinding = doBinding
  }

  async connect(): Promise<void> {
    try {
      console.log('Connecting to Durable Objects...')
      this.connected = true
      console.log('Durable Objects connected successfully')
    } catch (error) {
      console.error('Failed to connect to Durable Objects:', error)
      this.connected = false
      throw error
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect()
    }
  }

  private getDurableObjectStub(key: string) {
    // 使用 key 作为 Durable Object 的 ID
    const id = this.doBinding.idFromName(key)
    return this.doBinding.get(id)
  }

  private async executeOperation(operation: EdgeSyncOperation): Promise<EdgeSyncResponse> {
    const stub = this.getDurableObjectStub('default')
    const response = await stub.fetch('http://do/operation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation),
    })
    return await response.json()
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.ensureConnected()

    const fullKey = this.getKey(key)
    const finalTtl = ttl || this.ttl
    const expiresAt = finalTtl > 0 ? Date.now() + finalTtl * 1000 : null

    const edgeSyncData: EdgeSyncData = {
      id: fullKey,
      type: 'page',
      data: value,
      timestamp: Date.now(),
      version: 1,
      metadata: { expiresAt },
    }

    const result = await this.executeOperation({
      type: 'set',
      key: fullKey,
      value: edgeSyncData,
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to set value')
    }
  }

  async get(key: string): Promise<any> {
    await this.ensureConnected()

    const fullKey = this.getKey(key)
    const result = await this.executeOperation({
      type: 'get',
      key: fullKey,
    })

    if (!result.success) {
      return null
    }

    const edgeSyncData = result.data as EdgeSyncData
    if (!edgeSyncData) {
      return null
    }

    // 检查是否过期
    if (edgeSyncData.metadata?.expiresAt && Date.now() > edgeSyncData.metadata.expiresAt) {
      await this.delete(key)
      return null
    }

    return edgeSyncData.data
  }

  async delete(key: string): Promise<void> {
    await this.ensureConnected()

    const fullKey = this.getKey(key)
    const result = await this.executeOperation({
      type: 'delete',
      key: fullKey,
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete value')
    }
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnected()

    const value = await this.get(key)
    return value !== null
  }

  // 获取所有匹配的键
  async listKeys(pattern?: string): Promise<string[]> {
    await this.ensureConnected()

    const fullPattern = pattern ? this.getKey(pattern) : `${this.prefix}:`
    const result = await this.executeOperation({
      type: 'list',
      prefix: fullPattern,
    })

    if (!result.success) {
      return []
    }

    const edgeSyncDataList = result.data as EdgeSyncData[]
    return edgeSyncDataList.map(item => item.id.replace(`${this.prefix}:`, ''))
  }

  // 批量获取
  async mget(keys: string[]): Promise<any[]> {
    await this.ensureConnected()

    const results = await Promise.all(
      keys.map(async key => {
        try {
          return await this.get(key)
        } catch (error) {
          console.error(`Error getting key ${key}:`, error)
          return null
        }
      })
    )

    return results
  }

  // 批量设置
  async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void> {
    await this.ensureConnected()

    await Promise.all(
      Object.entries(keyValuePairs).map(async ([key, value]) => {
        try {
          await this.set(key, value, ttl)
        } catch (error) {
          console.error(`Error setting key ${key}:`, error)
        }
      })
    )
  }

  // 获取统计信息
  async getStats(): Promise<any> {
    await this.ensureConnected()

    try {
      // 由于 Durable Objects 的分布式特性，统计信息可能不完全准确
      return {
        connected: this.connected,
        prefix: this.prefix,
        ttl: this.ttl,
        type: 'durable-objects',
        note: 'Statistics are approximate due to distributed nature of Durable Objects',
      }
    } catch (error) {
      console.error('Error getting Durable Objects stats:', error)
      return {
        connected: this.connected,
        prefix: this.prefix,
        ttl: this.ttl,
        type: 'durable-objects',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Action 队列支持（用于轮询模式）
   */
  async addActionToQueue(chatbotId: string, action: any): Promise<void> {
    console.log(`Durable Objects: Adding action to queue for chatbot: ${chatbotId}`, action)

    await this.ensureConnected()

    const queueKey = `action_queue:${chatbotId}`

    // 获取现有队列
    const existingQueue = (await this.get(queueKey)) || []

    const actionWithTimestamp = {
      ...action,
      queuedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5分钟过期
    }

    // 添加到队列
    existingQueue.push(actionWithTimestamp)

    // 限制队列长度
    if (existingQueue.length > 100) {
      existingQueue.splice(0, existingQueue.length - 100)
    }

    // 保存队列
    await this.set(queueKey, existingQueue, 300) // 5分钟 TTL

    console.log(`Durable Objects: Action queue updated for ${chatbotId}`)
  }

  /**
   * 获取并清空 Action 队列
   */
  async getAndClearActionQueue(chatbotId: string): Promise<any[]> {
    console.log(`Durable Objects: Getting action queue for chatbot: ${chatbotId}`)

    await this.ensureConnected()

    const queueKey = `action_queue:${chatbotId}`
    const actions = (await this.get(queueKey)) || []

    // 过滤掉过期的 action
    const now = Date.now()
    const validActions = actions.filter(
      (action: any) => !action.expiresAt || now <= action.expiresAt
    )

    // 清空队列
    await this.delete(queueKey)

    console.log(`Durable Objects: Found ${validActions.length} actions in queue for ${chatbotId}`)
    return validActions
  }

  /**
   * 清理过期数据
   */
  async cleanup(): Promise<void> {
    await this.ensureConnected()

    try {
      // 由于 Durable Objects 的分布式特性，清理操作需要在每个对象内部处理
      console.log('Durable Objects cleanup: Cleanup is handled internally by each Durable Object')
    } catch (error) {
      console.error('Durable Objects cleanup error:', error)
    }
  }
}

// 导出类型和工具函数
export function createEdgeSyncData(
  id: string,
  type: 'page' | 'action' | 'config',
  data: any,
  metadata?: Record<string, any>
): EdgeSyncData {
  return {
    id,
    type,
    data,
    timestamp: Date.now(),
    version: 1,
    metadata,
  }
}

export function createOperation(
  type: EdgeSyncOperation['type'],
  params: Omit<EdgeSyncOperation, 'type'>
): EdgeSyncOperation {
  return { type, ...params } as EdgeSyncOperation
}

/**
 * Edge Sync Durable Object 类
 *
 * 处理单个存储分片的数据管理
 */
export class EdgeSyncDurableObject extends DurableObject<Env> {
  private storage: DurableObjectStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.storage = ctx.storage
  }

  // 处理 HTTP 请求
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const pathname = url.pathname

      // 处理不同的路径
      switch (pathname) {
        case '/operation':
          return this.handleOperation(request)
        case '/health':
          return this.handleHealth()
        case '/stats':
          return this.handleStats()
        default:
          return new Response('Not Found', { status: 404 })
      }
    } catch (error) {
      console.error('EdgeSyncDurableObject error:', error)
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  // 处理操作请求
  private async handleOperation(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const operation: EdgeSyncOperation = await request.json()
    const result = await this.executeOperation(operation)

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 执行具体操作
  private async executeOperation(operation: EdgeSyncOperation): Promise<EdgeSyncResponse> {
    const timestamp = Date.now()

    try {
      switch (operation.type) {
        case 'set':
          await this.storage.put(operation.key, operation.value)
          return {
            success: true,
            data: { key: operation.key },
            timestamp,
          }

        case 'get':
          const value = await this.storage.get<EdgeSyncData>(operation.key)
          return {
            success: true,
            data: value || null,
            timestamp,
          }

        case 'delete':
          const deleted = await this.storage.delete(operation.key)
          return {
            success: true,
            data: { deleted },
            timestamp,
          }

        case 'list':
          const listOptions: any = {}
          if (operation.prefix) {
            listOptions.prefix = operation.prefix
          }
          if (operation.limit) {
            listOptions.limit = operation.limit
          }

          const entries = await this.storage.list<EdgeSyncData>(listOptions)
          const results: EdgeSyncData[] = []
          for (const [key, value] of entries) {
            results.push(value)
          }

          return {
            success: true,
            data: results,
            timestamp,
          }

        case 'sync':
          // 批量同步数据
          const syncResults = []
          for (const item of operation.data) {
            await this.storage.put(item.id, item)
            syncResults.push(item.id)
          }

          return {
            success: true,
            data: { synced: syncResults },
            timestamp,
          }

        case 'clear':
          await this.storage.deleteAll()
          return {
            success: true,
            data: { cleared: true },
            timestamp,
          }

        default:
          return {
            success: false,
            error: 'Unknown operation type',
            timestamp,
          }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Operation failed',
        timestamp,
      }
    }
  }

  // 健康检查
  private async handleHealth(): Promise<Response> {
    return new Response(
      JSON.stringify({
        status: 'healthy',
        timestamp: Date.now(),
        version: '1.0.0',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // 统计信息
  private async handleStats(): Promise<Response> {
    try {
      const entries = await this.storage.list()
      const stats = {
        totalItems: entries.size,
        timestamp: Date.now(),
        types: {} as Record<string, number>,
      }

      // 统计不同类型的数据
      for (const [key, value] of entries) {
        if (value && typeof value === 'object' && 'type' in value) {
          const type = (value as EdgeSyncData).type
          stats.types[type] = (stats.types[type] || 0) + 1
        }
      }

      return new Response(JSON.stringify(stats), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Stats failed',
          timestamp: Date.now(),
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  // 处理 alarm 事件（可选）
  async alarm(): Promise<void> {
    // 可以在这里实现定期清理、同步等任务
    console.log('EdgeSyncDurableObject alarm triggered')
  }

  // 处理 WebSocket 消息（可选）
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      if (typeof message === 'string') {
        const operation: EdgeSyncOperation = JSON.parse(message)
        const result = await this.executeOperation(operation)
        ws.send(JSON.stringify(result))
      }
    } catch (error) {
      ws.send(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'WebSocket error',
          timestamp: Date.now(),
        })
      )
    }
  }

  // WebSocket 关闭处理
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    console.log(`WebSocket closed: ${code} ${reason} ${wasClean}`)
  }

  // WebSocket 错误处理
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error)
  }
}
