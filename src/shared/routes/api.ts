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

  // 轮询 Action（用于 Cloudflare Workers 环境）
  api.get('/action/:chatbotId/poll', async c => {
    try {
      const chatbotId = c.req.param('chatbotId')

      if (!chatbotId) {
        const response: ApiResponse = {
          success: false,
          error: 'ChatBot ID is required',
          timestamp: Date.now(),
        }
        return c.json(response, 400)
      }

      // 获取待处理的 Actions（从 KV 存储中获取）
      const actions = await syncService.getActionsForChatbot(chatbotId)

      // 在 Cloudflare Workers 中，轮询 API 无法访问其他请求上下文的 WebSocket 连接
      // 所以我们只返回 Actions，让前端通过 HTTP 响应或 WebSocket 消息处理
      if (actions.length > 0) {
        console.log(`Poll API: Found ${actions.length} actions for ${chatbotId}`)
        console.log(`Poll API: Actions will be returned in HTTP response for client processing`)
      }

      const response: ApiResponse = {
        success: true,
        data: {
          chatbotId,
          actions,
          polled: true,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      }

      return c.json(response)
    } catch (error) {
      console.error('Poll actions error:', error)

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }

      return c.json(response, 500)
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

  // 存储统计信息
  api.get('/storage/stats', async c => {
    try {
      // 检查存储是否支持统计信息
      if (typeof (syncService as any).storage?.getStats === 'function') {
        const stats = await (syncService as any).storage.getStats()

        // 获取所有键的完整列表
        if (typeof (syncService as any).storage?.listKeys === 'function') {
          const allKeys = await (syncService as any).storage.listKeys()
          stats.keys = allKeys
          stats.totalKeys = allKeys.length
        }

        const response: ApiResponse = {
          success: true,
          data: stats,
          timestamp: Date.now(),
        }
        return c.json(response)
      } else {
        const response: ApiResponse = {
          success: false,
          error: 'Statistics not supported by current storage adapter',
          timestamp: Date.now(),
        }
        return c.json(response, 501)
      }
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }
      return c.json(response, 500)
    }
  })

  // 清空所有存储数据
  api.delete('/storage/clear', async c => {
    try {
      // 检查存储是否支持清空操作
      if (typeof (syncService as any).storage?.clear === 'function') {
        await (syncService as any).storage.clear()

        const response: ApiResponse = {
          success: true,
          data: { message: 'All storage data cleared successfully' },
          timestamp: Date.now(),
        }
        return c.json(response)
      } else {
        const response: ApiResponse = {
          success: false,
          error: 'Clear operation not supported by current storage adapter',
          timestamp: Date.now(),
        }
        return c.json(response, 501)
      }
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }
      return c.json(response, 500)
    }
  })

  return api
}
