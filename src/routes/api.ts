import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ApiResponse, PageState, FrontendAction } from '../types'
import type { SyncService } from '../services/sync-service'

export function createApiRoutes(syncService: SyncService, corsOrigins: string[]) {
  const api = new Hono()

  // CORS 中间件
  api.use(
    '*',
    cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  )

  // 服务检查中间件
  api.use('*', async (c, next) => {
    if (!syncService) {
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

  // 健康检查
  api.get('/health', c => {
    const response: ApiResponse = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: Date.now(),
        connections: syncService.getConnectionStats(),
      },
      timestamp: Date.now(),
    }
    return c.json(response)
  })

  // 获取页面状态
  api.get('/state/:chatbotId', async c => {
    try {
      const chatbotId = c.req.param('chatbotId')

      if (!chatbotId) {
        const response: ApiResponse = {
          success: false,
          error: 'chatbotId is required',
          timestamp: Date.now(),
        }
        return c.json(response, 400)
      }

      const state = await syncService.getPageState(chatbotId)

      const response: ApiResponse<PageState | null> = {
        success: true,
        data: state,
        timestamp: Date.now(),
      }

      return c.json(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }
      return c.json(response, 500)
    }
  })

  // 更新页面状态
  api.post('/state/:chatbotId', async c => {
    try {
      const chatbotId = c.req.param('chatbotId')

      if (!chatbotId) {
        const response: ApiResponse = {
          success: false,
          error: 'chatbotId is required',
          timestamp: Date.now(),
        }
        return c.json(response, 400)
      }

      const body = await c.req.json()
      const state = syncService.validatePageState(body)

      await syncService.updatePageState(chatbotId, state)

      const response: ApiResponse = {
        success: true,
        data: { message: 'Page state updated successfully' },
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

  // 删除页面状态
  api.delete('/state/:chatbotId', async c => {
    try {
      const chatbotId = c.req.param('chatbotId')

      if (!chatbotId) {
        const response: ApiResponse = {
          success: false,
          error: 'chatbotId is required',
          timestamp: Date.now(),
        }
        return c.json(response, 400)
      }

      await syncService.deletePageState(chatbotId)

      const response: ApiResponse = {
        success: true,
        data: { message: 'Page state deleted successfully' },
        timestamp: Date.now(),
      }

      return c.json(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }
      return c.json(response, 500)
    }
  })

  // 推送前端 Action
  api.post('/action/:chatbotId', async c => {
    try {
      const chatbotId = c.req.param('chatbotId')

      if (!chatbotId) {
        const response: ApiResponse = {
          success: false,
          error: 'chatbotId is required',
          timestamp: Date.now(),
        }
        return c.json(response, 400)
      }

      const body = await c.req.json()
      const action = syncService.validateAction(body)

      const sent = await syncService.pushAction(chatbotId, action)

      const response: ApiResponse = {
        success: true,
        data: {
          message: sent ? 'Action sent successfully' : 'Action queued (connection not active)',
          sent,
        },
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

  // 广播 Action 到所有连接
  api.post('/action/broadcast', async c => {
    try {
      const body = await c.req.json()
      const action = syncService.validateAction(body)

      await syncService.broadcastAction(action)

      const response: ApiResponse = {
        success: true,
        data: { message: 'Action broadcasted successfully' },
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

  // 获取连接统计
  api.get('/stats', c => {
    const stats = syncService.getConnectionStats()
    const response: ApiResponse = {
      success: true,
      data: stats,
      timestamp: Date.now(),
    }
    return c.json(response)
  })

  return api
}
