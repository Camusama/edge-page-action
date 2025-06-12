import { BaseStorageAdapter } from './base'
import type { PageState } from '../types'

/**
 * Cloudflare KV 存储适配器
 * 
 * 使用 Cloudflare KV 存储来管理页面状态和缓存数据
 * KV 存储比 Durable Objects 更简单，更适合缓存场景
 */
export class KVStorageAdapter extends BaseStorageAdapter {
  private kv: KVNamespace

  constructor(
    kv: KVNamespace,
    prefix: string = 'edge-sync',
    ttl: number = 3600
  ) {
    super(prefix, ttl)
    this.kv = kv
  }

  /**
   * 生成带前缀的键名
   */
  private getKey(key: string): string {
    return `${this.prefix}:${key}`
  }

  /**
   * 设置数据
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const fullKey = this.getKey(key)
    const expirationTtl = ttl || this.ttl
    
    const wrappedValue = {
      data: value,
      timestamp: Date.now(),
      ttl: expirationTtl
    }

    // KV 的 expirationTtl 是从现在开始的秒数
    await this.kv.put(fullKey, JSON.stringify(wrappedValue), {
      expirationTtl
    })
  }

  /**
   * 获取数据
   */
  async get(key: string): Promise<any> {
    const fullKey = this.getKey(key)
    const value = await this.kv.get(fullKey, 'text')
    
    if (!value) {
      return null
    }

    try {
      const parsed = JSON.parse(value)
      
      // 检查是否过期（双重保险，虽然 KV 会自动过期）
      if (this.isExpired(parsed)) {
        await this.kv.delete(fullKey)
        return null
      }

      return parsed.data
    } catch (error) {
      console.error('Failed to parse KV value:', error)
      return null
    }
  }

  /**
   * 删除数据
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key)
    await this.kv.delete(fullKey)
  }

  /**
   * 检查数据是否存在
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.getKey(key)
    const value = await this.kv.get(fullKey, 'text')
    
    if (!value) {
      return false
    }

    try {
      const parsed = JSON.parse(value)
      
      // 检查是否过期
      if (this.isExpired(parsed)) {
        await this.kv.delete(fullKey)
        return false
      }

      return true
    } catch (error) {
      return false
    }
  }

  /**
   * 设置页面状态
   */
  async setPageState(chatbotId: string, state: PageState): Promise<void> {
    const key = `page:${chatbotId}`
    await this.set(key, state)
  }

  /**
   * 获取页面状态
   */
  async getPageState(chatbotId: string): Promise<PageState | null> {
    const key = `page:${chatbotId}`
    return await this.get(key)
  }

  /**
   * 删除页面状态
   */
  async deletePageState(chatbotId: string): Promise<void> {
    const key = `page:${chatbotId}`
    await this.delete(key)
  }

  /**
   * 获取连接状态（用于调试和监控）
   */
  isConnected(): boolean {
    // KV 不需要显式连接
    return true
  }

  /**
   * 检查数据是否过期
   */
  private isExpired(value: any): boolean {
    if (!value || !value.ttl || value.ttl <= 0) {
      return false
    }

    const now = Date.now()
    const expirationTime = value.timestamp + (value.ttl * 1000)
    return now > expirationTime
  }

  /**
   * 批量设置（KV 不支持真正的批量操作，但可以并发执行）
   */
  async batchSet(items: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const promises = items.map(item => this.set(item.key, item.value, item.ttl))
    await Promise.all(promises)
  }

  /**
   * 批量获取（KV 不支持真正的批量操作，但可以并发执行）
   */
  async batchGet(keys: string[]): Promise<Record<string, any>> {
    const promises = keys.map(async key => {
      const value = await this.get(key)
      return { key, value }
    })
    
    const results = await Promise.all(promises)
    const record: Record<string, any> = {}
    
    results.forEach(({ key, value }) => {
      record[key] = value
    })
    
    return record
  }

  /**
   * 列出所有键（KV 有限制，仅用于调试）
   */
  async listKeys(prefix?: string): Promise<string[]> {
    try {
      const listPrefix = prefix ? `${this.prefix}:${prefix}` : this.prefix
      const result = await this.kv.list({ prefix: listPrefix, limit: 1000 })
      
      return result.keys.map(key => 
        key.name.replace(`${this.prefix}:`, '')
      )
    } catch (error) {
      console.error('Failed to list KV keys:', error)
      return []
    }
  }

  /**
   * 获取存储统计信息
   */
  async getStats(): Promise<{ totalKeys: number; prefix: string }> {
    try {
      const keys = await this.listKeys()
      return {
        totalKeys: keys.length,
        prefix: this.prefix
      }
    } catch (error) {
      console.warn('Failed to get KV stats:', error)
      return {
        totalKeys: 0,
        prefix: this.prefix
      }
    }
  }

  /**
   * 清理过期数据（KV 会自动清理，这个方法主要用于手动清理）
   */
  async cleanup(): Promise<number> {
    try {
      const keys = await this.listKeys()
      let cleanedCount = 0
      
      // 检查每个键是否过期
      for (const key of keys) {
        const exists = await this.exists(key)
        if (!exists) {
          cleanedCount++
        }
      }
      
      console.log(`KV cleanup completed, ${cleanedCount} expired entries removed`)
      return cleanedCount
    } catch (error) {
      console.error('KV cleanup failed:', error)
      return 0
    }
  }

  /**
   * 设置 Action 队列（用于轮询模式）
   */
  async setActionQueue(chatbotId: string, actions: any[]): Promise<void> {
    const key = `actions:${chatbotId}`
    await this.set(key, actions, 300) // 5分钟过期
  }

  /**
   * 获取并清空 Action 队列
   */
  async getAndClearActionQueue(chatbotId: string): Promise<any[]> {
    const key = `actions:${chatbotId}`
    const actions = await this.get(key) || []
    
    // 清空队列
    await this.delete(key)
    
    return actions
  }

  /**
   * 添加 Action 到队列
   */
  async addActionToQueue(chatbotId: string, action: any): Promise<void> {
    const key = `actions:${chatbotId}`
    const existingActions = await this.get(key) || []
    
    existingActions.push({
      ...action,
      queuedAt: Date.now()
    })
    
    // 限制队列长度，避免无限增长
    const maxQueueSize = 100
    if (existingActions.length > maxQueueSize) {
      existingActions.splice(0, existingActions.length - maxQueueSize)
    }
    
    await this.set(key, existingActions, 300) // 5分钟过期
  }
}
