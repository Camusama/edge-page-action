import { BaseStorageAdapter } from './base'

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
    
    if (value === null) {
      return null
    }

    try {
      const wrappedValue = JSON.parse(value)
      
      // 检查是否过期（双重保险）
      if (wrappedValue.timestamp && wrappedValue.ttl) {
        const expirationTime = wrappedValue.timestamp + (wrappedValue.ttl * 1000)
        if (Date.now() > expirationTime) {
          // 数据已过期，删除并返回 null
          await this.delete(key)
          return null
        }
      }
      
      return wrappedValue.data
    } catch (error) {
      console.error('Error parsing JSON from KV:', error)
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
    const value = await this.get(key)
    return value !== null
  }

  /**
   * 列出所有键（用于调试）
   */
  async listKeys(prefix?: string): Promise<string[]> {
    const listPrefix = prefix ? this.getKey(prefix) : this.prefix
    const result = await this.kv.list({ prefix: listPrefix })
    return result.keys.map(key => key.name.replace(`${this.prefix}:`, ''))
  }

  /**
   * 获取 KV 存储统计信息
   */
  async getStats(): Promise<any> {
    try {
      // 获取所有键的列表
      const allKeys = await this.listKeys()
      
      return {
        totalKeys: allKeys.length,
        prefix: this.prefix,
        ttl: this.ttl,
        keys: allKeys.slice(0, 10), // 只返回前10个键作为示例
      }
    } catch (error) {
      console.error('Error getting KV stats:', error)
      return {
        totalKeys: 0,
        prefix: this.prefix,
        ttl: this.ttl,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * 批量获取数据
   */
  async mget(keys: string[]): Promise<any[]> {
    const promises = keys.map(key => this.get(key))
    return await Promise.all(promises)
  }

  /**
   * 批量设置数据
   */
  async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void> {
    const promises = Object.entries(keyValuePairs).map(([key, value]) => 
      this.set(key, value, ttl)
    )
    await Promise.all(promises)
  }

  /**
   * 清空所有数据（谨慎使用）
   */
  async clear(): Promise<void> {
    const keys = await this.listKeys()
    const promises = keys.map(key => this.delete(key))
    await Promise.all(promises)
  }

  /**
   * Action 队列支持（用于轮询模式）
   */
  async addActionToQueue(chatbotId: string, action: any): Promise<void> {
    const queueKey = `action_queue:${chatbotId}`
    const existingQueue = await this.get(queueKey) || []
    
    existingQueue.push({
      ...action,
      queuedAt: Date.now()
    })
    
    // 限制队列长度，避免无限增长
    if (existingQueue.length > 100) {
      existingQueue.splice(0, existingQueue.length - 100)
    }
    
    await this.set(queueKey, existingQueue, 300) // 5分钟过期
  }

  /**
   * 获取并清空 Action 队列
   */
  async getAndClearActionQueue(chatbotId: string): Promise<any[]> {
    const queueKey = `action_queue:${chatbotId}`
    const queue = await this.get(queueKey) || []
    
    if (queue.length > 0) {
      await this.delete(queueKey)
    }
    
    return queue
  }
}
