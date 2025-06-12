import type { StorageAdapter, AppConfig } from '../../shared/types'
import { RedisStorageAdapter } from './redis'

export class NodeStorageFactory {
  static async create(config: AppConfig): Promise<StorageAdapter> {
    switch (config.cacheType) {
      case 'redis':
        if (!config.redisUrl) {
          throw new Error('Redis URL is required when using Redis storage')
        }
        return new RedisStorageAdapter(config.redisUrl, config.cachePrefix, config.cacheTtl)

      default:
        throw new Error(`Unsupported cache type for Node.js: ${config.cacheType}`)
    }
  }
}

// 导出存储适配器
export { RedisStorageAdapter }
export { BaseStorageAdapter } from './base'
