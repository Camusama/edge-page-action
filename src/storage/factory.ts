import type { StorageAdapter, AppConfig, CloudflareBindings } from '../types'
import { KVStorageAdapter } from './kv'
import { isCloudflareWorkers } from '../config'

export class StorageFactory {
  static async create(config: AppConfig, bindings?: CloudflareBindings): Promise<StorageAdapter> {
    switch (config.cacheType) {
      case 'redis':
        if (isCloudflareWorkers()) {
          throw new Error('Redis storage is not supported in Cloudflare Workers environment')
        }
        if (!config.redisUrl) {
          throw new Error('Redis URL is required when using Redis storage')
        }
        // 动态导入 Redis 适配器（仅在 Node.js 环境中）
        const { RedisStorageAdapter } = await import('./redis')
        return new RedisStorageAdapter(config.redisUrl, config.cachePrefix, config.cacheTtl)

      case 'kv':
        if (!bindings || !bindings.EDGE_SYNC_KV) {
          throw new Error('Cloudflare KV binding is required when using KV storage')
        }
        return new KVStorageAdapter(bindings.EDGE_SYNC_KV, config.cachePrefix, config.cacheTtl)

      default:
        throw new Error(`Unsupported cache type: ${config.cacheType}`)
    }
  }
}

// 导出存储适配器
export { KVStorageAdapter }
export { BaseStorageAdapter } from './base'

// Redis 适配器仅在 Node.js 环境中可用，通过动态导入使用
