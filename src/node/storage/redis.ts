import { createClient, type RedisClientType } from 'redis'
import { BaseStorageAdapter } from './base'

export class RedisStorageAdapter extends BaseStorageAdapter {
  private client: RedisClientType
  private connected: boolean = false

  constructor(redisUrl: string, prefix: string = 'edge-sync', ttl: number = 3600) {
    super(prefix, ttl)
    
    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
      }
    })

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err)
      this.connected = false
    })

    this.client.on('connect', () => {
      console.log('Redis Client Connected')
      this.connected = true
    })

    this.client.on('disconnect', () => {
      console.log('Redis Client Disconnected')
      this.connected = false
    })
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect()
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect()
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.ensureConnected()
    const serializedValue = JSON.stringify(value)
    const finalTtl = ttl || this.ttl
    
    if (finalTtl > 0) {
      await this.client.setEx(this.getKey(key), finalTtl, serializedValue)
    } else {
      await this.client.set(this.getKey(key), serializedValue)
    }
  }

  async get(key: string): Promise<any> {
    await this.ensureConnected()
    const value = await this.client.get(this.getKey(key))
    
    if (value === null) {
      return null
    }
    
    try {
      return JSON.parse(value)
    } catch (error) {
      console.error('Error parsing JSON from Redis:', error)
      return null
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureConnected()
    await this.client.del(this.getKey(key))
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnected()
    const result = await this.client.exists(this.getKey(key))
    return result === 1
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect()
    }
  }

  // 获取所有匹配的键
  async getKeys(pattern: string): Promise<string[]> {
    await this.ensureConnected()
    const keys = await this.client.keys(this.getKey(pattern))
    return keys.map(key => key.replace(`${this.prefix}:`, ''))
  }

  // 批量获取
  async mget(keys: string[]): Promise<any[]> {
    await this.ensureConnected()
    const fullKeys = keys.map(key => this.getKey(key))
    const values = await this.client.mGet(fullKeys)
    
    return values.map(value => {
      if (value === null) return null
      try {
        return JSON.parse(value)
      } catch (error) {
        console.error('Error parsing JSON from Redis:', error)
        return null
      }
    })
  }

  // 批量设置
  async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void> {
    await this.ensureConnected()
    const finalTtl = ttl || this.ttl
    
    const pipeline = this.client.multi()
    
    for (const [key, value] of Object.entries(keyValuePairs)) {
      const serializedValue = JSON.stringify(value)
      const fullKey = this.getKey(key)
      
      if (finalTtl > 0) {
        pipeline.setEx(fullKey, finalTtl, serializedValue)
      } else {
        pipeline.set(fullKey, serializedValue)
      }
    }
    
    await pipeline.exec()
  }

  // 获取 Redis 统计信息
  async getStats(): Promise<any> {
    await this.ensureConnected()
    const info = await this.client.info()
    return {
      connected: this.connected,
      info: info
    }
  }
}
