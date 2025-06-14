// 共享类型定义
// 这些类型在 Node.js 和 Cloudflare Workers 环境中都会使用

// Cloudflare KV Namespace 类型定义
export interface KVNamespace {
  get(
    key: string,
    options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }
  ): Promise<string | null>
  get(key: string, type: 'text'): Promise<string | null>
  get(key: string, type: 'json'): Promise<any>
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  get(key: string, type: 'stream'): Promise<ReadableStream | null>
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      expirationTtl?: number
      expiration?: number
      metadata?: any
    }
  ): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { limit?: number; prefix?: string; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: any }>
    list_complete: boolean
    cursor?: string
  }>
}

// Cloudflare WebSocketPair 类型定义
export interface WebSocketPair {
  0: WebSocket
  1: WebSocket
}

// 全局 WebSocketPair 构造函数
declare global {
  const WebSocketPair: {
    new (): WebSocketPair
  }

  // 扩展 Response 类型以支持 Cloudflare Workers 的 webSocket 属性
  interface ResponseInit {
    webSocket?: WebSocket
  }
}

// 页面状态接口
export interface PageState {
  url: string
  title: string
  timestamp: number
  chatbotId?: string
  inputs?: Record<string, any>
  forms?: Record<string, any>
  scrollPosition?: { x: number; y: number }
  viewport?: { width: number; height: number }
  metadata?: Record<string, any>
  customData?: Record<string, any>
}

// 前端 Action 类型
export interface FrontendAction {
  type: 'navigate' | 'click' | 'input' | 'scroll' | 'custom'
  target?: string // CSS 选择器或元素 ID
  payload?: any
  timestamp: number
}

// Action 类型定义
export type ActionType = 'navigate' | 'click' | 'input' | 'scroll' | 'custom'

export interface ActionPayload {
  type: ActionType
  target?: string
  data?: any
  timestamp: number
}

// SSE 消息接口
export interface SSEMessage {
  type:
    | 'action'
    | 'ping'
    | 'error'
    | 'connected'
    | 'welcome'
    | 'heartbeat'
    | 'pong'
    | 'test'
    | 'broadcast'
    | string
  data?: any
  timestamp: number
}

// 连接信息接口
export interface ConnectionInfo {
  chatbotId: string
  connectedAt: number
  lastActivity?: number
  type?: string
}

// 连接管理接口
export interface ConnectionManager {
  addConnection(chatbotId: string, connection: any): void
  removeConnection(chatbotId: string): void
  sendToConnection(chatbotId: string, message: SSEMessage): boolean
  sendToAll(message: SSEMessage): number
  getConnectionCount(): number
  hasConnection(chatbotId: string): boolean
  getAllChatbotIds(): string[]
  getConnectionInfo(): ConnectionInfo[]
  destroy(): void
}

// 存储接口
export interface StorageAdapter {
  set(key: string, value: any, ttl?: number): Promise<void>
  get(key: string): Promise<any>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  setPageState(chatbotId: string, state: PageState): Promise<void>
  getPageState(chatbotId: string): Promise<PageState | null>
  deletePageState(chatbotId: string): Promise<void>
}

// 应用配置接口
export interface AppConfig {
  port: number
  cacheType: 'redis' | 'kv' | 'postgres'
  cachePrefix: string
  cacheTtl: number
  corsOrigins: string[]
  redisUrl?: string
  postgresUrl?: string
}

// Cloudflare Workers 绑定接口
export interface CloudflareBindings {
  EDGE_SYNC_KV: KVNamespace
  HYPERDRIVE?: any // Hyperdrive 绑定用于 PostgreSQL 连接
  REDIS_URL?: string
  PG_DATABASE_URL?: string
  CACHE_PREFIX?: string
  CACHE_TTL?: string
  CORS_ORIGINS?: string
}

// API 响应接口
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  timestamp: number
}

// 系统状态接口
export interface SystemStatus {
  environment: string
  connections: {
    total: number
    totalConnections?: number
    chatbotIds: string[]
  }
  storage: {
    type: string
    prefix: string
    ttl: number
  }
  uptime: number
  timestamp: number
}
