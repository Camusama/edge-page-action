/**
 * Node.js + SSE + Redis 入口文件
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { loadConfig } from '../shared/config'
import { NodeStorageFactory } from './storage/factory'
import { SSEConnectionManager } from './connection/sse-manager'
import { SyncService } from '../shared/services/sync-service'
import { createApiRoutes } from '../shared/routes/api'
import { createSSERoutes } from './routes/sse'
import { createAdminRoutes } from '../shared/routes/admin'
import { createOpenAPIRoute } from '../shared/routes/openapi'

// 创建 Hono 应用
const app = new Hono()

// 初始化存储和服务
let storage: any
let connectionManager: SSEConnectionManager
let syncService: SyncService
let currentConfig: any

async function initializeServices() {
  try {
    // 加载配置
    currentConfig = loadConfig()

    // 设置 CORS
    app.use(
      '*',
      cors({
        origin: currentConfig.corsOrigins,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
      })
    )

    // 创建存储适配器
    storage = await NodeStorageFactory.create(currentConfig)

    // 如果是 Redis，需要连接
    if (storage.connect) {
      await storage.connect()
      console.log('Storage connected successfully')
    }

    // 创建连接管理器
    connectionManager = new SSEConnectionManager()

    // 创建同步服务
    syncService = new SyncService(storage, connectionManager)

    console.log('All Node.js services initialized successfully')
    console.log(`Cache type: ${currentConfig.cacheType}`)
    console.log(`Cache prefix: ${currentConfig.cachePrefix}`)
    console.log(`Cache TTL: ${currentConfig.cacheTtl}s`)
  } catch (error) {
    console.error('Failed to initialize Node.js services:', error)
    throw error
  }
}

// 根路由
app.get('/', c => {
  const config = currentConfig || loadConfig()
  return c.json({
    name: 'Edge Sync State Server',
    version: '1.0.0',
    status: 'running',
    environment: 'Node.js',
    timestamp: Date.now(),
    config: {
      cacheType: config.cacheType,
      cachePrefix: config.cachePrefix,
      cacheTtl: config.cacheTtl,
    },
  })
})

// 初始化中间件
app.use('*', async (c, next) => {
  if (!syncService) {
    await initializeServices()
  }
  await next()
})

// 动态挂载 API 路由
app.use('/api/*', async c => {
  if (!syncService) {
    await initializeServices()
  }
  const config = currentConfig || loadConfig()
  const apiRoutes = createApiRoutes(syncService, config.corsOrigins)

  // 创建新的请求，去掉 /api 前缀
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/api/, '') || '/'
  const newRequest = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  const response = await apiRoutes.fetch(newRequest, {})
  return response
})

// 动态挂载 SSE 路由
app.use('/sse/*', async c => {
  if (!connectionManager) {
    await initializeServices()
  }
  const config = currentConfig || loadConfig()
  const sseRoutes = createSSERoutes(connectionManager, config.corsOrigins)

  // 创建新的请求，去掉 /sse 前缀
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/sse/, '') || '/'
  const newRequest = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  const response = await sseRoutes.fetch(newRequest, {})
  return response
})

// 动态挂载管理路由
app.use('/admin/*', async c => {
  if (!syncService || !connectionManager) {
    await initializeServices()
  }
  const config = currentConfig || loadConfig()
  const adminRoutes = createAdminRoutes(syncService, connectionManager, config.corsOrigins)

  // 创建新的请求，去掉 /admin 前缀
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/admin/, '') || '/'
  const newRequest = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  const response = await adminRoutes.fetch(newRequest, {})
  return response
})

app.use('/openapi/*', async c => {
  const config = currentConfig || loadConfig()
  const openApiRoutes = createOpenAPIRoute(config.corsOrigins)

  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/openapi/, '') || '/'
  const newRequest = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  const response = await openApiRoutes.fetch(newRequest, {})
  return response
})

// 错误处理
app.onError((err, c) => {
  console.error('Node.js application error:', err)
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

// 优雅关闭处理
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...')

  if (connectionManager) {
    connectionManager.destroy()
  }

  if (storage && storage.disconnect) {
    await storage.disconnect()
  }

  process.exit(0)
})

export default app
