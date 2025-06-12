/**
 * 类型定义测试文件
 * 用于验证所有类型定义是否正确
 */

import type {
  KVNamespace,
  WebSocketPair,
  PageState,
  FrontendAction,
  SSEMessage,
  ConnectionManager,
  StorageAdapter,
  AppConfig,
  CloudflareBindings,
  ApiResponse,
  SystemStatus,
  ConnectionInfo
} from './index'

// 测试 KVNamespace 类型
function testKVNamespace(kv: KVNamespace) {
  // 测试 get 方法的不同重载
  kv.get('key') // Promise<string | null>
  kv.get('key', 'text') // Promise<string | null>
  kv.get('key', 'json') // Promise<any>
  kv.get('key', { type: 'text' }) // Promise<string | null>
  
  // 测试 put 方法
  kv.put('key', 'value')
  kv.put('key', 'value', { expirationTtl: 3600 })
  
  // 测试 delete 方法
  kv.delete('key')
  
  // 测试 list 方法
  kv.list()
  kv.list({ prefix: 'test:', limit: 10 })
}

// 测试 WebSocketPair 类型
function testWebSocketPair() {
  const pair = new WebSocketPair()
  const client: WebSocket = pair[0]
  const server: WebSocket = pair[1]
  
  return { client, server }
}

// 测试 PageState 类型
function testPageState(): PageState {
  return {
    url: 'https://example.com',
    title: 'Test Page',
    timestamp: Date.now(),
    chatbotId: 'test-bot',
    inputs: { name: 'John' },
    forms: { loginForm: { username: 'john' } },
    scrollPosition: { x: 0, y: 100 },
    viewport: { width: 1920, height: 1080 },
    metadata: { version: '1.0' },
    customData: { theme: 'dark' }
  }
}

// 测试 FrontendAction 类型
function testFrontendAction(): FrontendAction {
  return {
    type: 'click',
    target: '#submit-button',
    payload: { message: 'Button clicked' },
    timestamp: Date.now()
  }
}

// 测试 SSEMessage 类型
function testSSEMessage(): SSEMessage {
  return {
    type: 'action',
    data: { message: 'Test message' },
    timestamp: Date.now()
  }
}

// 测试 ConnectionManager 接口
class TestConnectionManager implements ConnectionManager {
  addConnection(chatbotId: string, connection: any): void {
    console.log(`Adding connection for ${chatbotId}`)
  }
  
  removeConnection(chatbotId: string): void {
    console.log(`Removing connection for ${chatbotId}`)
  }
  
  sendToConnection(chatbotId: string, message: SSEMessage): boolean {
    console.log(`Sending message to ${chatbotId}:`, message)
    return true
  }
  
  sendToAll(message: SSEMessage): number {
    console.log('Broadcasting message:', message)
    return 1
  }
  
  getConnectionCount(): number {
    return 1
  }
  
  hasConnection(chatbotId: string): boolean {
    return chatbotId === 'test'
  }
  
  getAllChatbotIds(): string[] {
    return ['test']
  }
  
  getConnectionInfo(): ConnectionInfo[] {
    return [{
      chatbotId: 'test',
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      type: 'test'
    }]
  }
  
  destroy(): void {
    console.log('Destroying connection manager')
  }
}

// 测试 StorageAdapter 接口
class TestStorageAdapter implements StorageAdapter {
  async set(key: string, value: any, ttl?: number): Promise<void> {
    console.log(`Setting ${key} = ${value} (TTL: ${ttl})`)
  }
  
  async get(key: string): Promise<any> {
    console.log(`Getting ${key}`)
    return null
  }
  
  async delete(key: string): Promise<void> {
    console.log(`Deleting ${key}`)
  }
  
  async exists(key: string): Promise<boolean> {
    console.log(`Checking existence of ${key}`)
    return false
  }
  
  async setPageState(chatbotId: string, state: PageState): Promise<void> {
    console.log(`Setting page state for ${chatbotId}:`, state)
  }
  
  async getPageState(chatbotId: string): Promise<PageState | null> {
    console.log(`Getting page state for ${chatbotId}`)
    return null
  }
  
  async deletePageState(chatbotId: string): Promise<void> {
    console.log(`Deleting page state for ${chatbotId}`)
  }
}

// 测试 AppConfig 类型
function testAppConfig(): AppConfig {
  return {
    port: 3000,
    cacheType: 'kv',
    cachePrefix: 'test',
    cacheTtl: 3600,
    corsOrigins: ['*'],
    redisUrl: 'redis://localhost:6379'
  }
}

// 测试 CloudflareBindings 类型
function testCloudflareBindings(): CloudflareBindings {
  return {
    EDGE_SYNC_KV: {} as KVNamespace,
    REDIS_URL: 'redis://localhost:6379',
    CACHE_PREFIX: 'test',
    CACHE_TTL: '3600',
    CORS_ORIGINS: '*'
  }
}

// 测试 ApiResponse 类型
function testApiResponse(): ApiResponse<PageState> {
  return {
    success: true,
    data: testPageState(),
    timestamp: Date.now()
  }
}

// 测试 SystemStatus 类型
function testSystemStatus(): SystemStatus {
  return {
    environment: 'test',
    connections: {
      total: 1,
      totalConnections: 1,
      chatbotIds: ['test']
    },
    storage: {
      type: 'kv',
      prefix: 'test',
      ttl: 3600
    },
    uptime: 3600,
    timestamp: Date.now()
  }
}

// 导出测试函数（防止未使用警告）
export {
  testKVNamespace,
  testWebSocketPair,
  testPageState,
  testFrontendAction,
  testSSEMessage,
  TestConnectionManager,
  TestStorageAdapter,
  testAppConfig,
  testCloudflareBindings,
  testApiResponse,
  testSystemStatus
}
