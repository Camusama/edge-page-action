import { BaseStorageAdapter } from './base'
import type { PageState, CloudflareBindings } from '../types'

/**
 * Cloudflare Durable Objects 存储适配器
 * 
 * 这个适配器将存储操作委托给 Durable Objects
 * 每个存储操作都会通过 HTTP 请求与 Durable Object 通信
 */
export class DurableObjectsStorageAdapter extends BaseStorageAdapter {
  private durableObject: DurableObjectNamespace
  private objectId: DurableObjectId

  constructor(
    bindings: CloudflareBindings,
    prefix: string = 'edge-sync',
    ttl: number = 3600,
    objectName: string = 'default'
  ) {
    super(prefix, ttl)
    
    this.durableObject = bindings.EDGE_SYNC_DO
    
    // 使用固定的对象名称创建 ID，这样所有请求都会路由到同一个实例
    // 在生产环境中，你可能想要基于某些逻辑（如地理位置）来分片
    this.objectId = this.durableObject.idFromName(objectName)
  }

  /**
   * 获取 Durable Object 实例
   */
  private getObjectStub(): DurableObjectStub {
    return this.durableObject.get(this.objectId)
  }

  /**
   * 向 Durable Object 发送请求
   */
  private async sendRequest(path: string, options: RequestInit = {}): Promise<any> {
    const stub = this.getObjectStub()
    const url = `https://fake-host${path}`
    
    const response = await stub.fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Durable Object request failed: ${response.status} ${errorText}`)
    }

    return await response.json()
  }

  /**
   * 设置数据
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.sendRequest('/set', {
      method: 'POST',
      body: JSON.stringify({
        key,
        value,
        ttl: ttl || this.ttl
      })
    })
  }

  /**
   * 获取数据
   */
  async get(key: string): Promise<any> {
    const response = await this.sendRequest(`/get?key=${encodeURIComponent(key)}`)
    return response.value
  }

  /**
   * 删除数据
   */
  async delete(key: string): Promise<void> {
    await this.sendRequest(`/delete?key=${encodeURIComponent(key)}`, {
      method: 'DELETE'
    })
  }

  /**
   * 检查数据是否存在
   */
  async exists(key: string): Promise<boolean> {
    const response = await this.sendRequest(`/exists?key=${encodeURIComponent(key)}`)
    return response.exists
  }

  /**
   * 设置页面状态
   */
  async setPageState(chatbotId: string, state: PageState): Promise<void> {
    await this.sendRequest('/page-state', {
      method: 'POST',
      body: JSON.stringify({
        chatbotId,
        state,
        ttl: this.ttl
      })
    })
  }

  /**
   * 获取页面状态
   */
  async getPageState(chatbotId: string): Promise<PageState | null> {
    const response = await this.sendRequest(`/page-state?chatbotId=${encodeURIComponent(chatbotId)}`)
    return response.state
  }

  /**
   * 删除页面状态
   */
  async deletePageState(chatbotId: string): Promise<void> {
    await this.sendRequest(`/page-state?chatbotId=${encodeURIComponent(chatbotId)}`, {
      method: 'DELETE'
    })
  }

  /**
   * 获取连接状态（用于调试和监控）
   */
  isConnected(): boolean {
    // Durable Objects 不需要显式连接
    return true
  }

  /**
   * 清理过期数据
   * 这个方法可以被定时任务调用
   */
  async cleanup(): Promise<void> {
    try {
      await this.sendRequest('/cleanup', {
        method: 'POST'
      })
    } catch (error) {
      console.error('Failed to cleanup expired data:', error)
    }
  }

  /**
   * 获取存储统计信息（可选功能）
   */
  async getStats(): Promise<{ totalKeys: number; memoryUsage?: number }> {
    try {
      const response = await this.sendRequest('/stats')
      return response
    } catch (error) {
      console.warn('Failed to get storage stats:', error)
      return { totalKeys: 0 }
    }
  }

  /**
   * 批量操作支持（可选功能）
   */
  async batchSet(items: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    try {
      await this.sendRequest('/batch-set', {
        method: 'POST',
        body: JSON.stringify({ items })
      })
    } catch (error) {
      // 如果批量操作不支持，回退到单个操作
      console.warn('Batch set not supported, falling back to individual operations')
      for (const item of items) {
        await this.set(item.key, item.value, item.ttl)
      }
    }
  }

  /**
   * 批量获取支持（可选功能）
   */
  async batchGet(keys: string[]): Promise<Record<string, any>> {
    try {
      const response = await this.sendRequest('/batch-get', {
        method: 'POST',
        body: JSON.stringify({ keys })
      })
      return response.values
    } catch (error) {
      // 如果批量操作不支持，回退到单个操作
      console.warn('Batch get not supported, falling back to individual operations')
      const result: Record<string, any> = {}
      for (const key of keys) {
        try {
          result[key] = await this.get(key)
        } catch (err) {
          result[key] = null
        }
      }
      return result
    }
  }
}
