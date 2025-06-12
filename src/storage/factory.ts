import type { StorageAdapter, AppConfig } from '../types'
import { RedisStorageAdapter } from './redis'

export class StorageFactory {
  static create(config: AppConfig): StorageAdapter {
    switch (config.cacheType) {
      case 'redis':
        if (!config.redisUrl) {
          throw new Error('Redis URL is required when using Redis storage')
        }
        return new RedisStorageAdapter(
          config.redisUrl,
          config.cachePrefix,
          config.cacheTtl
        )
      
      case 'durable-objects':
        // TODO: 实现 Cloudflare Durable Objects 存储
        throw new Error('Durable Objects storage not implemented yet')
      
      default:
        throw new Error(`Unsupported cache type: ${config.cacheType}`)
    }
  }
}

// 导出存储适配器
export { RedisStorageAdapter }
export { BaseStorageAdapter } from './base'
