import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import app from './index'
import { loadConfig } from '../shared/config'
import { createStaticRoutes } from './routes/static'

const config = loadConfig()
const port = config.port || 3050

// 创建包装应用，添加静态文件服务
const serverApp = new Hono()

// 首先是 API 路由（优先匹配）
serverApp.route('/', app)

// 然后是静态文件服务（兜底）
serverApp.route('/', createStaticRoutes())

console.log(`Starting Edge Sync State Server (Node.js)...`)
console.log(`Configuration:`)
console.log(`- Cache Type: ${config.cacheType}`)
console.log(`- Cache Prefix: ${config.cachePrefix}`)
console.log(`- Cache TTL: ${config.cacheTtl}s`)
console.log(`- Port: ${port}`)
console.log(`- CORS Origins: ${config.corsOrigins.join(', ')}`)

if (config.cacheType === 'redis' && config.redisUrl) {
  console.log(`- Redis URL: ${config.redisUrl}`)
}

serve({
  fetch: serverApp.fetch,
  port,
})

console.log(`🚀 Server is running on http://localhost:${port}`)
console.log(`📊 Health check: http://localhost:${port}/api/health`)
console.log(`🔗 SSE endpoint: http://localhost:${port}/sse/connect/{chatbotId}`)
console.log(`🌐 Test dashboard: http://localhost:${port}/test-dashboard.html`)
console.log(`📡 API endpoints:`)
console.log(`   GET  /api/state/{chatbotId}     - Get page state`)
console.log(`   POST /api/state/{chatbotId}     - Update page state`)
console.log(`   POST /api/action/{chatbotId}    - Push action to frontend`)
console.log(`📊 Admin endpoints:`)
console.log(`   GET  /admin/status              - System status`)
console.log(`   GET  /admin/connections         - Active connections`)
console.log(`📋 OpenAPI Schema:`)
console.log(
  `   GET  http://localhost:${port}/openapi/schema.json       - OpenAPI 3.1.0 Schema (JSON)`
)
console.log(
  `   GET  http://localhost:${port}/openapi/schema.yaml       - OpenAPI 3.1.0 Schema (YAML)`
)
