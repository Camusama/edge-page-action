/**
 * Cloudflare Workers + WebSocket + KV 入口文件
 *
 * 这个文件专门为 Cloudflare Workers 环境设计，
 * 避免导入任何 Node.js 相关的模块
 */

import { Hono } from 'hono'
import { loadConfig } from '../shared/config'
import { WorkerStorageFactory } from './storage/factory'
import { SyncService } from '../shared/services/sync-service'
import { createApiRoutes } from '../shared/routes/api'
import { createAdminRoutes } from '../shared/routes/admin'
import { createOpenAPIRoute } from '../shared/routes/openapi'
import { createStaticRoutesForWorker } from './routes/static-worker'
import type { CloudflareBindings } from '../shared/types'

// 创建 Hono 应用，支持 Cloudflare Workers 类型
const app = new Hono<{ Bindings: CloudflareBindings }>()

// 动态 CORS 中间件 - 根据环境变量配置
app.use('*', async (c, next) => {
  const config = loadConfig(c.env)
  const corsOrigins = config.corsOrigins || ['*']

  // 设置 CORS 头
  const origin = c.req.header('Origin')
  const allowedOrigins = corsOrigins.includes('*') ? ['*'] : corsOrigins

  console.log(`CORS: Request from origin: ${origin}`)
  console.log(`CORS: Allowed origins: ${corsOrigins.join(', ')}`)

  // 设置 Access-Control-Allow-Origin
  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    const allowOrigin = allowedOrigins.includes('*') ? '*' : origin
    c.header('Access-Control-Allow-Origin', allowOrigin)
    console.log(`CORS: Set Access-Control-Allow-Origin to: ${allowOrigin}`)
  } else if (allowedOrigins.includes('*')) {
    c.header('Access-Control-Allow-Origin', '*')
    console.log('CORS: Set Access-Control-Allow-Origin to: *')
  }

  // 设置其他 CORS 头
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  c.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Cache-Control, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version'
  )
  c.header('Access-Control-Max-Age', '86400')

  // 处理 OPTIONS 预检请求 - 确保 CORS 头已设置
  if (c.req.method === 'OPTIONS') {
    console.log('CORS: Handling OPTIONS preflight request')
    console.log('CORS: Headers set:', {
      'Access-Control-Allow-Origin': c.res.headers.get('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': c.res.headers.get('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': c.res.headers.get('Access-Control-Allow-Headers'),
    })

    // 创建响应并确保 CORS 头被包含
    const response = new Response(null, { status: 204 })

    // 手动复制 CORS 头到响应
    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      const allowOrigin = allowedOrigins.includes('*') ? '*' : origin
      response.headers.set('Access-Control-Allow-Origin', allowOrigin)
    } else if (allowedOrigins.includes('*')) {
      response.headers.set('Access-Control-Allow-Origin', '*')
    }

    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Cache-Control, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version'
    )
    response.headers.set('Access-Control-Max-Age', '86400')

    return response
  }

  await next()
})

// 认证中间件 - 验证 Authorization 头部
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader

  // 如果配置了 SECRET，则验证 token
  if (c.env.SECRET) {
    try {
      const secret = await c.env.SECRET.get()
      if (token !== secret) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
    } catch (error) {
      console.error('Failed to get secret:', error)
      // 在开发环境中，如果密钥服务不可用，允许通过但记录警告
      if (process.env.NODE_ENV === 'development' || c.env.ENVIRONMENT === 'development') {
        console.warn(
          '⚠️ Development mode: Skipping authentication due to secret service unavailable'
        )
        return next()
      }
      return c.json({ error: 'Authentication service unavailable' }, 503)
    }
  } else {
    // 如果没有配置 SECRET，在开发环境中允许通过
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Development mode: No SECRET configured, skipping authentication')
      return next()
    }
  }

  return next()
}

// 初始化存储和服务
let storage: any
let syncService: SyncService
let currentConfig: any

async function initializeServices(env: CloudflareBindings) {
  try {
    // 根据环境加载配置
    currentConfig = loadConfig(env)

    // 创建存储适配器（根据配置决定使用 KV 还是 PostgreSQL）
    storage = await WorkerStorageFactory.create(currentConfig, env)

    // 创建同步服务（不需要连接管理器）
    syncService = new SyncService(storage)

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
      cacheType: config.cacheType,
      cachePrefix: config.cachePrefix,
      cacheTtl: config.cacheTtl,
      corsOrigins: config.corsOrigins,
    },
  })
})

// CORS 测试端点
app.get('/cors-test', async c => {
  const config = currentConfig || loadConfig(c.env)
  return c.json({
    message: 'CORS test endpoint',
    corsOrigins: config.corsOrigins,
    requestOrigin: c.req.header('Origin'),
    timestamp: Date.now(),
  })
})

// 重复的 CORS 中间件已移除，使用上面的动态 CORS 中间件

// 初始化中间件
app.use('*', async (c, next) => {
  if (!syncService) {
    await initializeServices(c.env)
  }
  await next()
})

// 动态挂载 API 路由
app.use('/api/*', authMiddleware, async c => {
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

// WebSocket 功能已移除，改为纯 RESTful API 架构

// 动态挂载管理路由
app.use('/admin/*', authMiddleware, async c => {
  if (!syncService) {
    await initializeServices(c.env)
  }
  const config = currentConfig || loadConfig(c.env)
  const adminRoutes = createAdminRoutes(syncService, null, config.corsOrigins)

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

// 导出 Durable Object 类
export { EdgeSyncDurableObject } from './storage/do'

export default app
