import type { StorageAdapter, AppConfig, CloudflareBindings } from '../../shared/types'
import { KVStorageAdapter } from './kv'
import { WorkerPostgresStorageAdapter } from './postgres'
import { DOStorageAdapter } from './do'

export class WorkerStorageFactory {
  static async create(config: AppConfig, bindings: CloudflareBindings): Promise<StorageAdapter> {
    switch (config.cacheType) {
      case 'kv':
        if (!bindings || !bindings.EDGE_SYNC_KV) {
          throw new Error('Cloudflare KV binding is required when using KV storage')
        }
        return new KVStorageAdapter(bindings.EDGE_SYNC_KV, config.cachePrefix, config.cacheTtl)

      case 'postgres':
        if (!bindings?.HYPERDRIVE) {
          throw new Error('HYPERDRIVE binding is required when using PostgreSQL storage')
        }
        const adapter = new WorkerPostgresStorageAdapter(
          bindings.HYPERDRIVE,
          config.cachePrefix,
          config.cacheTtl
        )
        await adapter.connect()
        return adapter

      case 'do':
        if (!bindings?.EDGE_SYNC_DO) {
          throw new Error('Durable Objects binding is required when using DO storage')
        }
        const doAdapter = new DOStorageAdapter(
          bindings.EDGE_SYNC_DO,
          config.cachePrefix,
          config.cacheTtl
        )
        await doAdapter.connect()
        return doAdapter

      default:
        throw new Error(`Unsupported cache type for Cloudflare Workers: ${config.cacheType}`)
    }
  }
}

// 导出存储适配器
export { KVStorageAdapter }
export { WorkerPostgresStorageAdapter }
export { DOStorageAdapter }
export { BaseStorageAdapter } from './base'
