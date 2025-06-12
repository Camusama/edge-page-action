import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ApiResponse } from '../types'
import type { SyncService } from '../services/sync-service'
import type { SSEConnectionManager } from '../connection/sse-manager'

export function createAdminRoutes(
  syncService: SyncService,
  connectionManager: SSEConnectionManager,
  corsOrigins: string[]
) {
  const admin = new Hono()

  // CORS 中间件
  admin.use(
    '*',
    cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  )

  // 服务检查中间件
  admin.use('*', async (c, next) => {
    if (!syncService || !connectionManager) {
      return c.json(
        {
          success: false,
          error: 'Service not initialized',
          timestamp: Date.now(),
        },
        500
      )
    }
    await next()
  })

  // 获取系统状态
  admin.get('/status', c => {
    const stats = syncService.getConnectionStats()
    // 检测运行环境
    const isCloudflareWorkers =
      typeof globalThis.caches !== 'undefined' && typeof globalThis.WebSocketPair !== 'undefined'

    const response: ApiResponse = {
      success: true,
      data: {
        service: 'Edge Sync State Server',
        version: '1.0.0',
        environment: isCloudflareWorkers ? 'Cloudflare Workers' : 'Node.js',
        uptime: isCloudflareWorkers ? 'N/A' : process.uptime(),
        memory: isCloudflareWorkers ? 'N/A' : process.memoryUsage(),
        connections: stats,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    }
    return c.json(response)
  })

  // 获取所有活跃连接
  admin.get('/connections', c => {
    const connections = connectionManager.getConnectionInfo()
    const response: ApiResponse = {
      success: true,
      data: {
        total: connections.length,
        connections: connections.map(conn => ({
          chatbotId: conn.chatbotId,
          connectedAt: new Date(conn.connectedAt).toISOString(),
          lastActivity: new Date(conn.lastActivity).toISOString(),
          duration: Date.now() - conn.connectedAt,
        })),
      },
      timestamp: Date.now(),
    }
    return c.json(response)
  })

  // 断开指定连接
  admin.delete('/connections/:chatbotId', c => {
    const chatbotId = c.req.param('chatbotId')

    if (!chatbotId) {
      const response: ApiResponse = {
        success: false,
        error: 'chatbotId is required',
        timestamp: Date.now(),
      }
      return c.json(response, 400)
    }

    connectionManager.removeConnection(chatbotId)

    const response: ApiResponse = {
      success: true,
      data: { message: `Connection ${chatbotId} disconnected` },
      timestamp: Date.now(),
    }
    return c.json(response)
  })

  // 广播消息到所有连接
  admin.post('/broadcast', async c => {
    try {
      const body = await c.req.json()
      const { message, type = 'admin' } = body

      if (!message) {
        const response: ApiResponse = {
          success: false,
          error: 'message is required',
          timestamp: Date.now(),
        }
        return c.json(response, 400)
      }

      connectionManager.sendToAll({
        type,
        data: { message, from: 'admin' },
        timestamp: Date.now(),
      })

      const response: ApiResponse = {
        success: true,
        data: { message: 'Broadcast sent successfully' },
        timestamp: Date.now(),
      }
      return c.json(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }
      return c.json(response, 400)
    }
  })

  // 清理非活跃连接
  admin.post('/cleanup', c => {
    const before = connectionManager.getConnectionCount()

    // 这里可以添加清理逻辑，比如强制清理超时连接
    // 目前连接管理器已经有自动清理机制

    const after = connectionManager.getConnectionCount()

    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Cleanup completed',
        connectionsBefore: before,
        connectionsAfter: after,
        cleaned: before - after,
      },
      timestamp: Date.now(),
    }
    return c.json(response)
  })

  return admin
}
