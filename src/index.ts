import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from './config'
import { StorageFactory } from './storage/factory'
import { SSEConnectionManager } from './connection/sse-manager'
import { SyncService } from './services/sync-service'
import { createApiRoutes } from './routes/api'
import { createSSERoutes } from './routes/sse'
import { createAdminRoutes } from './routes/admin'
import { createOpenAPIRoute } from './routes/openapi'

const app = new Hono()

app.use(
  '*',
  cors({
    origin: config.corsOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
  })
)

// 初始化存储和服务
let storage: any
let connectionManager: SSEConnectionManager
let syncService: SyncService

async function initializeServices() {
  try {
    // 创建存储适配器
    storage = StorageFactory.create(config)

    // 如果是 Redis，需要连接
    if (storage.connect) {
      await storage.connect()
      console.log('Storage connected successfully')
    }

    // 创建连接管理器
    connectionManager = new SSEConnectionManager()

    // 创建同步服务
    syncService = new SyncService(storage, connectionManager)

    console.log('All services initialized successfully')
  } catch (error) {
    console.error('Failed to initialize services:', error)
    throw error
  }
}

// 根路由
app.get('/', c => {
  return c.json({
    name: 'Edge Sync State Server',
    version: '1.0.0',
    status: 'running',
    timestamp: Date.now(),
    config: {
      cacheType: config.cacheType,
      cachePrefix: config.cachePrefix,
      cacheTtl: config.cacheTtl,
    },
  })
})

// 初始化中间件
app.use('*', async (_, next) => {
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

// 动态挂载 SSE 路由
app.use('/sse/*', async c => {
  if (!connectionManager) {
    await initializeServices()
  }
  const sseRoutes = createSSERoutes(connectionManager, config.corsOrigins)

  // 创建新的请求，去掉 /sse 前缀
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/sse/, '') || '/'
  const newRequest = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  })

  const response = await sseRoutes.fetch(newRequest, c.env || {})
  return response
})

// 动态挂载管理路由
app.use('/admin/*', async c => {
  if (!syncService || !connectionManager) {
    await initializeServices()
  }
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

// 错误处理
app.onError((err, c) => {
  console.error('Application error:', err)
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
