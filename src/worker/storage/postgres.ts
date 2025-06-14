import { BaseStorageAdapter } from './base'
import type { CloudflareBindings } from '../../shared/types'

/**
 * Cloudflare Workers PostgreSQL 存储适配器
 *
 * 使用 Cloudflare Workers 的 Hyperdrive 连接到 PostgreSQL 数据库
 */
export class WorkerPostgresStorageAdapter extends BaseStorageAdapter {
  private hyperdrive: any
  private connected: boolean = false

  constructor(hyperdrive: any, prefix: string = 'edge-sync', ttl: number = 3600) {
    super(prefix, ttl)
    this.hyperdrive = hyperdrive
  }

  /**
   * 执行 PostgreSQL 查询
   * 使用 Hyperdrive 连接执行查询
   */
  private async executeQuery(query: string, params: any[] = []): Promise<any> {
    try {
      // 使用 Hyperdrive 的 connectionString 和 postgres 驱动
      const postgres = (await import('postgres')).default
      const sql = postgres(this.hyperdrive.connectionString, {
        // Workers 限制并发外部连接数，因此限制连接池大小
        max: 1,
        idle_timeout: 20,
        max_lifetime: 60 * 30,

        ssl: {
          rejectUnauthorized: false,
        },
      })

      // 执行查询
      const result = await sql.unsafe(query, params)

      // 关闭连接
      await sql.end()

      return {
        rows: Array.isArray(result) ? result : [],
        rowCount: Array.isArray(result) ? result.length : 0,
      }
    } catch (error) {
      console.error('PostgreSQL query error:', error)
      throw error
    }
  }

  async connect(): Promise<void> {
    try {
      console.log('Connecting to PostgreSQL via Hyperdrive...')

      // 测试连接
      await this.executeQuery('SELECT 1 as test')
      this.connected = true

      console.log('PostgreSQL connected successfully via Hyperdrive')

      // 初始化数据库表
      await this.initializeTables()
    } catch (error) {
      console.error('Failed to connect to PostgreSQL via Hyperdrive:', error)
      this.connected = false
      throw error
    }
  }

  private async initializeTables(): Promise<void> {
    try {
      // 创建存储表
      await this.executeQuery(`
        CREATE TABLE IF NOT EXISTS edge_sync_storage (
          key VARCHAR(255) PRIMARY KEY,
          value JSONB NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `)

      // 创建索引
      await this.executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_edge_sync_storage_expires_at 
        ON edge_sync_storage(expires_at)
      `)

      // 创建Action队列表
      await this.executeQuery(`
        CREATE TABLE IF NOT EXISTS edge_sync_action_queue (
          id SERIAL PRIMARY KEY,
          chatbot_id VARCHAR(255) NOT NULL,
          action JSONB NOT NULL,
          queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE
        )
      `)

      // 创建Action队列索引
      await this.executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_edge_sync_action_queue_chatbot_id 
        ON edge_sync_action_queue(chatbot_id)
      `)

      await this.executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_edge_sync_action_queue_expires_at 
        ON edge_sync_action_queue(expires_at)
      `)

      console.log('PostgreSQL tables initialized successfully')
    } catch (error) {
      console.error('Failed to initialize PostgreSQL tables:', error)
      // 不抛出错误，允许继续运行
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.ensureConnected()

    const fullKey = this.getKey(key)
    const finalTtl = ttl || this.ttl
    const expiresAt = finalTtl > 0 ? new Date(Date.now() + finalTtl * 1000).toISOString() : null

    await this.executeQuery(
      `
      INSERT INTO edge_sync_storage (key, value, expires_at, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (key) 
      DO UPDATE SET 
        value = EXCLUDED.value,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `,
      [fullKey, JSON.stringify(value), expiresAt]
    )
  }

  async get(key: string): Promise<any> {
    await this.ensureConnected()

    const fullKey = this.getKey(key)

    // 清理过期数据
    await this.executeQuery(`
      DELETE FROM edge_sync_storage 
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
    `)

    const result = await this.executeQuery(
      `
      SELECT value FROM edge_sync_storage 
      WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())
    `,
      [fullKey]
    )

    if (!result.rows || result.rows.length === 0) {
      return null
    }

    try {
      return JSON.parse(result.rows[0].value)
    } catch (error) {
      console.error('Error parsing JSON from PostgreSQL:', error)
      return null
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureConnected()

    const fullKey = this.getKey(key)
    await this.executeQuery(
      `
      DELETE FROM edge_sync_storage WHERE key = $1
    `,
      [fullKey]
    )
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnected()

    const fullKey = this.getKey(key)
    const result = await this.executeQuery(
      `
      SELECT 1 FROM edge_sync_storage 
      WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())
    `,
      [fullKey]
    )

    return result.rows && result.rows.length > 0
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect()
    }
  }

  // 获取所有匹配的键
  async listKeys(pattern?: string): Promise<string[]> {
    await this.ensureConnected()

    const fullPattern = pattern ? this.getKey(pattern) : `${this.prefix}:%`
    const result = await this.executeQuery(
      `
      SELECT key FROM edge_sync_storage 
      WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())
    `,
      [fullPattern.replace('*', '%')]
    )

    return result.rows ? result.rows.map((row: any) => row.key.replace(`${this.prefix}:`, '')) : []
  }

  // 批量获取
  async mget(keys: string[]): Promise<any[]> {
    await this.ensureConnected()

    const fullKeys = keys.map(key => this.getKey(key))
    const result = await this.executeQuery(
      `
      SELECT key, value FROM edge_sync_storage 
      WHERE key = ANY($1) AND (expires_at IS NULL OR expires_at > NOW())
    `,
      [fullKeys]
    )

    const resultMap = new Map()
    if (result.rows) {
      result.rows.forEach((row: any) => {
        try {
          resultMap.set(row.key, JSON.parse(row.value))
        } catch (error) {
          console.error('Error parsing JSON from PostgreSQL:', error)
          resultMap.set(row.key, null)
        }
      })
    }

    return fullKeys.map(key => resultMap.get(key) || null)
  }

  // 批量设置
  async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void> {
    await this.ensureConnected()

    const finalTtl = ttl || this.ttl
    const expiresAt = finalTtl > 0 ? new Date(Date.now() + finalTtl * 1000).toISOString() : null

    // 在 Workers 中，我们需要逐个执行，因为不支持事务
    for (const [key, value] of Object.entries(keyValuePairs)) {
      const fullKey = this.getKey(key)
      await this.executeQuery(
        `
        INSERT INTO edge_sync_storage (key, value, expires_at, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (key) 
        DO UPDATE SET 
          value = EXCLUDED.value,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
      `,
        [fullKey, JSON.stringify(value), expiresAt]
      )
    }
  }

  // 获取统计信息
  async getStats(): Promise<any> {
    await this.ensureConnected()

    try {
      const totalResult = await this.executeQuery(`
        SELECT COUNT(*) as total_keys FROM edge_sync_storage
      `)

      const activeResult = await this.executeQuery(`
        SELECT COUNT(*) as active_keys FROM edge_sync_storage 
        WHERE expires_at IS NULL OR expires_at > NOW()
      `)

      const queueResult = await this.executeQuery(`
        SELECT COUNT(*) as queue_items FROM edge_sync_action_queue 
        WHERE expires_at IS NULL OR expires_at > NOW()
      `)

      return {
        connected: this.connected,
        totalKeys: totalResult.rows ? parseInt(totalResult.rows[0].total_keys) : 0,
        activeKeys: activeResult.rows ? parseInt(activeResult.rows[0].active_keys) : 0,
        queueItems: queueResult.rows ? parseInt(queueResult.rows[0].queue_items) : 0,
        prefix: this.prefix,
        ttl: this.ttl,
      }
    } catch (error) {
      console.error('Error getting PostgreSQL stats:', error)
      return {
        connected: this.connected,
        totalKeys: 0,
        activeKeys: 0,
        queueItems: 0,
        prefix: this.prefix,
        ttl: this.ttl,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Action 队列支持（用于轮询模式）
   */
  async addActionToQueue(chatbotId: string, action: any): Promise<void> {
    console.log(`PostgreSQL: Adding action to queue for chatbot: ${chatbotId}`, action)

    await this.ensureConnected()

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5分钟过期

    await this.executeQuery(
      `
      INSERT INTO edge_sync_action_queue (chatbot_id, action, expires_at)
      VALUES ($1, $2, $3)
    `,
      [
        chatbotId,
        JSON.stringify({
          ...action,
          queuedAt: Date.now(),
        }),
        expiresAt,
      ]
    )

    // 限制队列长度，删除旧的记录
    await this.executeQuery(
      `
      DELETE FROM edge_sync_action_queue 
      WHERE chatbot_id = $1 
      AND id NOT IN (
        SELECT id FROM edge_sync_action_queue 
        WHERE chatbot_id = $1 
        ORDER BY queued_at DESC 
        LIMIT 100
      )
    `,
      [chatbotId]
    )

    console.log(`PostgreSQL: Action queue updated for ${chatbotId}`)
  }

  /**
   * 获取并清空 Action 队列
   */
  async getAndClearActionQueue(chatbotId: string): Promise<any[]> {
    console.log(`PostgreSQL: Getting action queue for chatbot: ${chatbotId}`)

    await this.ensureConnected()

    // 清理过期的队列项
    await this.executeQuery(`
      DELETE FROM edge_sync_action_queue 
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
    `)

    // 获取队列项
    const result = await this.executeQuery(
      `
      SELECT action FROM edge_sync_action_queue 
      WHERE chatbot_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY queued_at ASC
    `,
      [chatbotId]
    )

    const actions = result.rows
      ? result.rows
          .map((row: any) => {
            try {
              return JSON.parse(row.action)
            } catch (error) {
              console.error('Error parsing action JSON:', error)
              return null
            }
          })
          .filter((action: any) => action !== null)
      : []

    // 清空队列
    if (actions.length > 0) {
      await this.executeQuery(
        `
        DELETE FROM edge_sync_action_queue 
        WHERE chatbot_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
      `,
        [chatbotId]
      )
    }

    console.log(`PostgreSQL: Found ${actions.length} actions in queue for ${chatbotId}`)

    return actions
  }

  /**
   * 清理过期数据
   */
  async cleanup(): Promise<void> {
    await this.ensureConnected()

    try {
      // 清理过期的存储数据
      const storageResult = await this.executeQuery(`
        DELETE FROM edge_sync_storage 
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `)

      // 清理过期的队列数据
      const queueResult = await this.executeQuery(`
        DELETE FROM edge_sync_action_queue 
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `)

      console.log(`PostgreSQL cleanup: Removed expired items`)
    } catch (error) {
      console.error('PostgreSQL cleanup error:', error)
    }
  }
}
