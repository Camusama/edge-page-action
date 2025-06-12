// 页面状态数据结构
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

// SSE 消息类型
export interface SSEMessage {
  type: 'action' | 'ping' | 'error'
  data?: any
  timestamp: number
}

// 连接管理接口
export interface ConnectionManager {
  addConnection(chatbotId: string, connection: any): void
  removeConnection(chatbotId: string): void
  sendToConnection(chatbotId: string, message: SSEMessage): boolean
  sendToAll(message: SSEMessage): void
  getConnectionCount(): number
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

// 环境变量配置
export interface AppConfig {
  cacheType: 'redis' | 'kv'
  redisUrl?: string
  cachePrefix: string
  cacheTtl: number
  port?: number
  corsOrigins: string[]
}

// Cloudflare 环境绑定
export interface CloudflareBindings {
  EDGE_SYNC_KV: KVNamespace
}

// API 响应格式
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  timestamp: number
}

// 连接状态
export interface ConnectionInfo {
  chatbotId: string
  connectedAt: number
  lastActivity: number
}
