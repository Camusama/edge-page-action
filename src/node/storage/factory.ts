import type { StorageAdapter, AppConfig } from '../../shared/types'
import { RedisStorageAdapter } from './redis'
import { PostgresStorageAdapter } from './postgres'

export class NodeStorageFactory {
  static async create(config: AppConfig): Promise<StorageAdapter> {
    switch (config.cacheType) {
      case 'redis':
        if (!config.redisUrl) {
          throw new Error('Redis URL is required when using Redis storage')
        }
        return new RedisStorageAdapter(config.redisUrl, config.cachePrefix, config.cacheTtl)

      case 'postgres':
        if (!config.postgresUrl) {
          throw new Error('PostgreSQL URL is required when using PostgreSQL storage')
        }
        const adapter = new PostgresStorageAdapter(config.postgresUrl, config.cachePrefix, config.cacheTtl)
        await adapter.connect()
        return adapter

      default:
        throw new Error(`Unsupported cache type for Node.js: ${config.cacheType}`)
    }
  }
}

// 导出存储适配器
export { RedisStorageAdapter }
export { PostgresStorageAdapter }
export { BaseStorageAdapter } from './base'
