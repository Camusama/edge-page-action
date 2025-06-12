/**
 * Cloudflare Workers 专用入口文件
 *
 * 这个文件专门为 Cloudflare Workers 环境设计，
 * 避免导入任何 Node.js 相关的模块
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { loadConfig } from './config'
import { KVStorageAdapter } from './storage/kv'
import { WebSocketConnectionManager } from './connection/websocket-manager'
import { SyncService } from './services/sync-service'
import { createApiRoutes } from './routes/api'
import { createWebSocketRoutes } from './routes/websocket'
import { createAdminRoutes } from './routes/admin'
import { createOpenAPIRoute } from './routes/openapi'
import { createStaticRoutesForWorker } from './routes/static-worker'
import type { CloudflareBindings } from './types'

// 创建 Hono 应用，支持 Cloudflare Workers 类型
const app = new Hono<{ Bindings: CloudflareBindings }>()

// 设置全局 CORS（在路由定义之前）
app.use(
  '*',
  cors({
    origin: ['*'], // 默认允许所有源，稍后会根据配置更新
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
  })
)

// 初始化存储和服务
let storage: KVStorageAdapter
let connectionManager: WebSocketConnectionManager
let syncService: SyncService
let currentConfig: any

async function initializeServices(env: CloudflareBindings) {
  try {
    // 根据环境加载配置
    currentConfig = loadConfig(env)

    // 强制使用 KV
    currentConfig.cacheType = 'kv'

    // 创建 KV 存储适配器
    storage = new KVStorageAdapter(
      env.EDGE_SYNC_KV,
      currentConfig.cachePrefix,
      currentConfig.cacheTtl
    )

    // 创建连接管理器
    connectionManager = new WebSocketConnectionManager()

    // 创建同步服务
    syncService = new SyncService(storage, connectionManager)

    console.log('Cloudflare Workers services initialized successfully')
    console.log(`Cache type: ${currentConfig.cacheType}`)
    console.log(`Cache prefix: ${currentConfig.cachePrefix}`)
    console.log(`Cache TTL: ${currentConfig.cacheTtl}s`)
  } catch (error) {
    console.error('Failed to initialize Cloudflare Workers services:', error)
    throw error
  }
}

// 根路由
app.get('/', c => {
  const config = currentConfig || loadConfig(c.env)
  return c.json({
    name: 'Edge Sync State Server',
    version: '1.0.0',
    status: 'running',
    environment: 'Cloudflare Workers',
    timestamp: Date.now(),
    config: {
      cacheType: 'durable-objects',
      cachePrefix: config.cachePrefix,
      cacheTtl: config.cacheTtl,
    },
  })
})

// 初始化中间件
app.use('*', async (c, next) => {
  if (!syncService) {
    await initializeServices(c.env)
  }
  await next()
})

// 动态挂载 API 路由
app.use('/api/*', async c => {
  if (!syncService) {
    await initializeServices(c.env)
  }
  const config = currentConfig || loadConfig(c.env)
  const apiRoutes = createApiRoutes(syncService, config.corsOrigins)

  // 创建新的请求，去掉 /api 前缀
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/api/, '') || '/'
  const newRequest = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  const response = await apiRoutes.fetch(newRequest, c.env || {})
  return response
})

// 动态挂载 WebSocket 路由
app.use('/ws/*', async c => {
  if (!connectionManager) {
    await initializeServices(c.env)
  }
  const config = currentConfig || loadConfig(c.env)
  const wsRoutes = createWebSocketRoutes(connectionManager, config.corsOrigins)

  // 创建新的请求，去掉 /ws 前缀
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/ws/, '') || '/'
  const newRequest = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  const response = await wsRoutes.fetch(newRequest, c.env || {})
  return response
})

// 动态挂载管理路由
app.use('/admin/*', async c => {
  if (!syncService || !connectionManager) {
    await initializeServices(c.env)
  }
  const config = currentConfig || loadConfig(c.env)
  const adminRoutes = createAdminRoutes(syncService, connectionManager, config.corsOrigins)

  // 创建新的请求，去掉 /admin 前缀
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/admin/, '') || '/'
  const newRequest = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  const response = await adminRoutes.fetch(newRequest, c.env || {})
  return response
})

app.use('/openapi/*', async c => {
  const config = currentConfig || loadConfig(c.env)
  const openApiRoutes = createOpenAPIRoute(config.corsOrigins)

  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/openapi/, '') || '/'
  const newRequest = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  const response = await openApiRoutes.fetch(newRequest, c.env || {})
  return response
})

// 静态文件路由（测试仪表板）
app.use('/dashboard/*', async c => {
  const staticRoutes = createStaticRoutesForWorker()

  // 创建新的请求，去掉 /dashboard 前缀
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/dashboard/, '') || '/'
  const newRequest = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  const response = await staticRoutes.fetch(newRequest, c.env || {})
  return response
})

// 根路径也提供测试仪表板
app.get('/test', async c => {
  const staticRoutes = createStaticRoutesForWorker()
  // 创建一个指向根路径的请求来获取测试仪表板
  const url = new URL(c.req.url)
  url.pathname = '/'
  const newRequest = new Request(url.toString(), {
    method: 'GET',
    headers: c.req.header(),
  })
  const response = await staticRoutes.fetch(newRequest, c.env || {})
  return response
})

// 错误处理
app.onError((err, c) => {
  console.error('Cloudflare Workers application error:', err)
  return c.json(
    {
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
    },
    500
  )
})

// 404 处理
app.notFound(c => {
  return c.json(
    {
      success: false,
      error: 'Not found',
      timestamp: Date.now(),
    },
    404
  )
})

export default app
