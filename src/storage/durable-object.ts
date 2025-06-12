import type { PageState } from '../types'

// Cloudflare Workers 类型定义
interface DurableObjectState {
  storage: DurableObjectStorage
  id: DurableObjectId
  waitUntil(promise: Promise<any>): void
}

interface DurableObjectStorage {
  get(key: string): Promise<any>
  put(key: string, value: any): Promise<void>
  delete(key: string): Promise<boolean>
  list(options?: { prefix?: string; limit?: number }): Promise<Map<string, any>>
}

interface DurableObjectId {
  toString(): string
  equals(other: DurableObjectId): boolean
}

// 包装的数据结构
interface StoredValue {
  data: any
  timestamp: number
  ttl: number
}

// 请求体类型
interface SetRequest {
  key: string
  value: any
  ttl?: number
}

interface PageStateRequest {
  chatbotId: string
  state: PageState
  ttl?: number
}

interface BatchSetRequest {
  items: Array<{ key: string; value: any; ttl?: number }>
}

interface BatchGetRequest {
  keys: string[]
}

/**
 * Edge Sync State Durable Object
 *
 * 这个 Durable Object 负责存储和管理页面状态数据
 * 每个实例对应一个唯一的存储空间，支持 TTL 过期机制
 */
export class EdgeSyncStateDO {
  private storage: DurableObjectStorage
  private env: any

  constructor(state: DurableObjectState, env: any) {
    this.storage = state.storage
    this.env = env
  }

  /**
   * 处理 HTTP 请求
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method
    const pathname = url.pathname

    try {
      // 路由处理
      if (method === 'GET' && pathname === '/get') {
        return this.handleGet(url.searchParams.get('key'))
      }

      if (method === 'POST' && pathname === '/set') {
        const body = (await request.json()) as SetRequest
        return this.handleSet(body.key, body.value, body.ttl)
      }

      if (method === 'DELETE' && pathname === '/delete') {
        return this.handleDelete(url.searchParams.get('key'))
      }

      if (method === 'GET' && pathname === '/exists') {
        return this.handleExists(url.searchParams.get('key'))
      }

      if (method === 'GET' && pathname === '/page-state') {
        return this.handleGetPageState(url.searchParams.get('chatbotId'))
      }

      if (method === 'POST' && pathname === '/page-state') {
        const body = (await request.json()) as PageStateRequest
        return this.handleSetPageState(body.chatbotId, body.state, body.ttl)
      }

      if (method === 'DELETE' && pathname === '/page-state') {
        return this.handleDeletePageState(url.searchParams.get('chatbotId'))
      }

      if (method === 'POST' && pathname === '/cleanup') {
        return this.handleCleanup()
      }

      if (method === 'GET' && pathname === '/stats') {
        return this.handleGetStats()
      }

      if (method === 'POST' && pathname === '/batch-set') {
        const body = (await request.json()) as BatchSetRequest
        return this.handleBatchSet(body.items)
      }

      if (method === 'POST' && pathname === '/batch-get') {
        const body = (await request.json()) as BatchGetRequest
        return this.handleBatchGet(body.keys)
      }

      return new Response('Not Found', { status: 404 })
    } catch (error) {
      console.error('Durable Object error:', error)
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  /**
   * 获取数据
   */
  private async handleGet(key: string | null): Promise<Response> {
    if (!key) {
      return new Response(JSON.stringify({ error: 'Key is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const value = (await this.storage.get(key)) as StoredValue | undefined

    // 检查是否过期
    if (value && this.isExpired(value)) {
      await this.storage.delete(key)
      return new Response(JSON.stringify({ value: null }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const actualValue = value ? value.data : null
    return new Response(JSON.stringify({ value: actualValue }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * 设置数据
   */
  private async handleSet(key: string, value: any, ttl?: number): Promise<Response> {
    if (!key) {
      return new Response(JSON.stringify({ error: 'Key is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const wrappedValue: StoredValue = {
      data: value,
      timestamp: Date.now(),
      ttl: ttl || 0,
    }

    await this.storage.put(key, wrappedValue)

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * 删除数据
   */
  private async handleDelete(key: string | null): Promise<Response> {
    if (!key) {
      return new Response(JSON.stringify({ error: 'Key is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const deleted = await this.storage.delete(key)

    return new Response(JSON.stringify({ deleted }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * 检查数据是否存在
   */
  private async handleExists(key: string | null): Promise<Response> {
    if (!key) {
      return new Response(JSON.stringify({ error: 'Key is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const value = (await this.storage.get(key)) as StoredValue | undefined
    const exists = value !== undefined && !this.isExpired(value)

    // 如果过期了，删除它
    if (value && this.isExpired(value)) {
      await this.storage.delete(key)
    }

    return new Response(JSON.stringify({ exists }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * 获取页面状态
   */
  private async handleGetPageState(chatbotId: string | null): Promise<Response> {
    if (!chatbotId) {
      return new Response(JSON.stringify({ error: 'chatbotId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const key = `page:${chatbotId}`
    const value = (await this.storage.get(key)) as StoredValue | undefined

    // 检查是否过期
    if (value && this.isExpired(value)) {
      await this.storage.delete(key)
      return new Response(JSON.stringify({ state: null }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const state = value ? value.data : null
    return new Response(JSON.stringify({ state }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * 设置页面状态
   */
  private async handleSetPageState(
    chatbotId: string,
    state: PageState,
    ttl?: number
  ): Promise<Response> {
    if (!chatbotId) {
      return new Response(JSON.stringify({ error: 'chatbotId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const key = `page:${chatbotId}`
    const wrappedValue: StoredValue = {
      data: state,
      timestamp: Date.now(),
      ttl: ttl || 0,
    }

    await this.storage.put(key, wrappedValue)

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * 删除页面状态
   */
  private async handleDeletePageState(chatbotId: string | null): Promise<Response> {
    if (!chatbotId) {
      return new Response(JSON.stringify({ error: 'chatbotId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const key = `page:${chatbotId}`
    const deleted = await this.storage.delete(key)

    return new Response(JSON.stringify({ deleted }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * 检查数据是否过期
   */
  private isExpired(value: StoredValue): boolean {
    if (!value || !value.ttl || value.ttl <= 0) {
      return false
    }

    const now = Date.now()
    const expirationTime = value.timestamp + value.ttl * 1000
    return now > expirationTime
  }

  /**
   * 处理清理请求
   */
  private async handleCleanup(): Promise<Response> {
    await this.cleanup()
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * 处理统计请求
   */
  private async handleGetStats(): Promise<Response> {
    const allData = await this.storage.list()
    const totalKeys = allData.size

    return new Response(
      JSON.stringify({
        totalKeys,
        timestamp: Date.now(),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  /**
   * 处理批量设置
   */
  private async handleBatchSet(
    items: Array<{ key: string; value: any; ttl?: number }>
  ): Promise<Response> {
    for (const item of items) {
      const wrappedValue: StoredValue = {
        data: item.value,
        timestamp: Date.now(),
        ttl: item.ttl || 0,
      }
      await this.storage.put(item.key, wrappedValue)
    }

    return new Response(JSON.stringify({ success: true, count: items.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * 处理批量获取
   */
  private async handleBatchGet(keys: string[]): Promise<Response> {
    const values: Record<string, any> = {}

    for (const key of keys) {
      const value = (await this.storage.get(key)) as StoredValue | undefined

      // 检查是否过期
      if (value && this.isExpired(value)) {
        await this.storage.delete(key)
        values[key] = null
      } else {
        values[key] = value ? value.data : null
      }
    }

    return new Response(JSON.stringify({ values }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * 清理过期数据（可以通过定时任务调用）
   */
  async cleanup(): Promise<void> {
    const allData = await this.storage.list()
    const expiredKeys: string[] = []

    for (const [key, value] of allData) {
      if (this.isExpired(value as StoredValue)) {
        expiredKeys.push(key)
      }
    }

    // 批量删除过期数据
    for (const key of expiredKeys) {
      await this.storage.delete(key)
    }

    console.log(`Cleaned up ${expiredKeys.length} expired entries`)
  }
}
