import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { WebSocketConnectionManager } from '../connection/websocket-manager'

/**
 * WebSocket 路由 (Cloudflare Workers 专用)
 */
export function createWebSocketRoutes(connectionManager: WebSocketConnectionManager, corsOrigins: string[]) {
  const wsApp = new Hono()

  // CORS 中间件
  wsApp.use(
    '*',
    cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Upgrade', 'Connection', 'Sec-WebSocket-Key', 'Sec-WebSocket-Version'],
    })
  )

  /**
   * WebSocket 连接端点
   * GET /ws/connect/:chatbotId
   */
  wsApp.get('/connect/:chatbotId', async (c) => {
    const chatbotId = c.req.param('chatbotId')
    
    if (!chatbotId) {
      return c.json({ 
        success: false, 
        error: 'ChatBot ID is required' 
      }, 400)
    }

    try {
      // 检查是否是 WebSocket 升级请求
      const upgradeHeader = c.req.header('upgrade')
      if (upgradeHeader?.toLowerCase() !== 'websocket') {
        return c.json({
          success: false,
          error: 'This endpoint requires WebSocket upgrade',
          info: {
            endpoint: `/ws/connect/${chatbotId}`,
            protocol: 'WebSocket',
            example: 'new WebSocket("ws://localhost:8787/ws/connect/your-chatbot-id")'
          }
        }, 426)
      }

      // 处理 WebSocket 升级
      const response = connectionManager.handleUpgrade(c.req.raw, chatbotId)
      return response

    } catch (error) {
      console.error('WebSocket connection error:', error)
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 500)
    }
  })

  /**
   * 获取连接状态
   * GET /ws/status
   */
  wsApp.get('/status', (c) => {
    try {
      const stats = connectionManager.getStats()
      
      return c.json({
        success: true,
        data: {
          type: 'websocket',
          ...stats,
          endpoint: '/ws/connect/:chatbotId',
          protocol: 'WebSocket'
        },
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('WebSocket status error:', error)
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 500)
    }
  })

  /**
   * 获取连接列表
   * GET /ws/connections
   */
  wsApp.get('/connections', (c) => {
    try {
      const chatbotIds = connectionManager.getAllChatbotIds()
      
      return c.json({
        success: true,
        data: {
          connections: chatbotIds.map(id => ({
            chatbotId: id,
            connected: true,
            type: 'websocket'
          })),
          total: chatbotIds.length
        },
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('WebSocket connections list error:', error)
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 500)
    }
  })

  /**
   * 断开指定连接
   * DELETE /ws/disconnect/:chatbotId
   */
  wsApp.delete('/disconnect/:chatbotId', (c) => {
    const chatbotId = c.req.param('chatbotId')
    
    if (!chatbotId) {
      return c.json({ 
        success: false, 
        error: 'ChatBot ID is required' 
      }, 400)
    }

    try {
      const wasConnected = connectionManager.hasConnection(chatbotId)
      connectionManager.removeConnection(chatbotId)
      
      return c.json({
        success: true,
        data: {
          chatbotId,
          wasConnected,
          message: wasConnected ? 'Connection removed' : 'Connection not found'
        },
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('WebSocket disconnect error:', error)
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 500)
    }
  })

  /**
   * 发送测试消息
   * POST /ws/test/:chatbotId
   */
  wsApp.post('/test/:chatbotId', async (c) => {
    const chatbotId = c.req.param('chatbotId')
    
    if (!chatbotId) {
      return c.json({ 
        success: false, 
        error: 'ChatBot ID is required' 
      }, 400)
    }

    try {
      const body = await c.req.json()
      const message = body.message || 'WebSocket test message'
      
      const sent = connectionManager.sendToConnection(chatbotId, {
        type: 'test',
        data: {
          message,
          timestamp: Date.now(),
          from: 'server'
        },
        timestamp: Date.now()
      })
      
      return c.json({
        success: true,
        data: {
          chatbotId,
          sent,
          message: sent ? 'Test message sent' : 'Connection not found'
        },
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('WebSocket test message error:', error)
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 500)
    }
  })

  /**
   * 广播消息
   * POST /ws/broadcast
   */
  wsApp.post('/broadcast', async (c) => {
    try {
      const body = await c.req.json()
      const message = body.message || 'Broadcast message'
      const excludeChatbotId = body.excludeChatbotId
      
      const sentCount = connectionManager.broadcast({
        type: 'broadcast',
        data: {
          message,
          timestamp: Date.now(),
          from: 'server'
        },
        timestamp: Date.now()
      }, excludeChatbotId)
      
      return c.json({
        success: true,
        data: {
          sentCount,
          message: `Broadcast sent to ${sentCount} connections`
        },
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('WebSocket broadcast error:', error)
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 500)
    }
  })

  /**
   * 健康检查
   * GET /ws/health
   */
  wsApp.get('/health', (c) => {
    return c.json({
      success: true,
      data: {
        service: 'WebSocket Connection Manager',
        status: 'healthy',
        type: 'websocket',
        environment: 'Cloudflare Workers'
      },
      timestamp: Date.now()
    })
  })

  return wsApp
}
