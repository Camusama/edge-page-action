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

  // 获取连接状态
  isConnected(): boolean {
    return this.connected
  }

  // 获取客户端实例（用于高级操作）
  getClient(): RedisClientType {
    return this.client
  }
}
