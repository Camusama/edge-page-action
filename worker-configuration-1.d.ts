// Cloudflare Workers 环境类型定义

import { EdgeSyncDurableObject } from './src/worker/storage/do'

// 扩展全局环境类型
declare global {
  interface Env {
    // KV 命名空间
    EDGE_SYNC_KV: KVNamespace

    // Hyperdrive 绑定
    HYPERDRIVE?: Hyperdrive

    // Durable Objects 绑定
    EDGE_SYNC_DO: DurableObjectNamespace<EdgeSyncDurableObject>

    // 环境变量
    CACHE_TYPE?: string
    CACHE_PREFIX?: string
    CACHE_TTL?: string
    CORS_ORIGINS?: string
    REDIS_URL?: string
    PG_DATABASE_URL?: string
  }
}

export {}
