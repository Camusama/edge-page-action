import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { SSEConnectionManager, SSEConnection } from '../connection/sse-manager'

export function createSSERoutes(connectionManager: SSEConnectionManager, corsOrigins: string[]) {
  const sse = new Hono()

  // CORS 中间件
  sse.use(
    '*',
    cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Cache-Control'],
    })
  )

  // 服务检查中间件
  sse.use('*', async (c, next) => {
    if (!connectionManager) {
      return c.text('Service not initialized', 500)
    }
    await next()
  })

  // SSE 连接端点
  sse.get('/connect/:chatbotId', async c => {
    const chatbotId = c.req.param('chatbotId')

    if (!chatbotId) {
      return c.text('chatbotId is required', 400)
    }

    // 设置 SSE 响应头
    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('Connection', 'keep-alive')
    c.header('Access-Control-Allow-Origin', '*')
    c.header('Access-Control-Allow-Headers', 'Cache-Control')

    // 创建可读流
    const stream = new ReadableStream({
      start(controller) {
        const connection: SSEConnection = {
          chatbotId,
          response: c.res,
          controller,
          connectedAt: Date.now(),
          lastActivity: Date.now(),
        }

        // 添加连接到管理器
        connectionManager.addConnection(chatbotId, connection)

        // 发送初始连接消息
        const welcomeMessage = `data: ${JSON.stringify({
          type: 'connected',
          data: { chatbotId, message: 'SSE connection established' },
          timestamp: Date.now(),
        })}\n\n`

        controller.enqueue(new TextEncoder().encode(welcomeMessage))
      },

      cancel() {
        // 连接关闭时清理
        connectionManager.removeConnection(chatbotId)
        console.log(`SSE connection cancelled for chatbot: ${chatbotId}`)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    })
  })

  // 获取活跃连接列表
  sse.get('/connections', c => {
    const connections = connectionManager.getConnectionInfo()
    return c.json({
      success: true,
      data: {
        count: connectionManager.getConnectionCount(),
        connections,
      },
      timestamp: Date.now(),
    })
  })

  return sse
}
