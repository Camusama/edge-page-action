import { Pool, type PoolClient } from 'pg'
import { BaseStorageAdapter } from './base'

export class PostgresStorageAdapter extends BaseStorageAdapter {
  private pool: Pool
  private connected: boolean = false

  constructor(databaseUrl: string, prefix: string = 'edge-sync', ttl: number = 3600) {
    super(prefix, ttl)
    
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    this.pool.on('error', (err) => {
      console.error('PostgreSQL Pool Error:', err)
      this.connected = false
    })

    this.pool.on('connect', () => {
      console.log('PostgreSQL Client Connected')
      this.connected = true
    })
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      try {
        // 测试连接
        const client = await this.pool.connect()
        client.release()
        this.connected = true
        
        // 初始化数据库表
        await this.initializeTables()
      } catch (error) {
        console.error('Failed to connect to PostgreSQL:', error)
        this.connected = false
        throw error
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.pool.end()
      this.connected = false
    }
  }

  private async initializeTables(): Promise<void> {
    const client = await this.pool.connect()
    try {
      // 创建存储表
      await client.query(`
        CREATE TABLE IF NOT EXISTS edge_sync_storage (
          key VARCHAR(255) PRIMARY KEY,
          value JSONB NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `)

      // 创建索引
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_edge_sync_storage_expires_at 
        ON edge_sync_storage(expires_at)
      `)

      // 创建Action队列表
      await client.query(`
        CREATE TABLE IF NOT EXISTS edge_sync_action_queue (
          id SERIAL PRIMARY KEY,
          chatbot_id VARCHAR(255) NOT NULL,
          action JSONB NOT NULL,
          queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE
        )
      `)

      // 创建Action队列索引
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_edge_sync_action_queue_chatbot_id 
        ON edge_sync_action_queue(chatbot_id)
      `)
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_edge_sync_action_queue_expires_at 
        ON edge_sync_action_queue(expires_at)
      `)

      console.log('PostgreSQL tables initialized successfully')
    } finally {
      client.release()
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      const fullKey = this.getKey(key)
      const finalTtl = ttl || this.ttl
      const expiresAt = finalTtl > 0 ? new Date(Date.now() + finalTtl * 1000) : null
      
      await client.query(`
        INSERT INTO edge_sync_storage (key, value, expires_at, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (key) 
        DO UPDATE SET 
          value = EXCLUDED.value,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
      `, [fullKey, JSON.stringify(value), expiresAt])
    } finally {
      client.release()
    }
  }

  async get(key: string): Promise<any> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      const fullKey = this.getKey(key)
      
      // 清理过期数据
      await client.query(`
        DELETE FROM edge_sync_storage 
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `)
      
      const result = await client.query(`
        SELECT value FROM edge_sync_storage 
        WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())
      `, [fullKey])
      
      if (result.rows.length === 0) {
        return null
      }
      
      try {
        return JSON.parse(result.rows[0].value)
      } catch (error) {
        console.error('Error parsing JSON from PostgreSQL:', error)
        return null
      }
    } finally {
      client.release()
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      const fullKey = this.getKey(key)
      await client.query(`
        DELETE FROM edge_sync_storage WHERE key = $1
      `, [fullKey])
    } finally {
      client.release()
    }
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      const fullKey = this.getKey(key)
      const result = await client.query(`
        SELECT 1 FROM edge_sync_storage 
        WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())
      `, [fullKey])
      
      return result.rows.length > 0
    } finally {
      client.release()
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect()
    }
  }

  // 获取所有匹配的键
  async getKeys(pattern: string): Promise<string[]> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      const fullPattern = this.getKey(pattern)
      const result = await client.query(`
        SELECT key FROM edge_sync_storage 
        WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())
      `, [fullPattern.replace('*', '%')])
      
      return result.rows.map(row => row.key.replace(`${this.prefix}:`, ''))
    } finally {
      client.release()
    }
  }

  // 批量获取
  async mget(keys: string[]): Promise<any[]> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      const fullKeys = keys.map(key => this.getKey(key))
      const result = await client.query(`
        SELECT key, value FROM edge_sync_storage 
        WHERE key = ANY($1) AND (expires_at IS NULL OR expires_at > NOW())
      `, [fullKeys])
      
      const resultMap = new Map()
      result.rows.forEach(row => {
        try {
          resultMap.set(row.key, JSON.parse(row.value))
        } catch (error) {
          console.error('Error parsing JSON from PostgreSQL:', error)
          resultMap.set(row.key, null)
        }
      })
      
      return fullKeys.map(key => resultMap.get(key) || null)
    } finally {
      client.release()
    }
  }

  // 批量设置
  async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      const finalTtl = ttl || this.ttl
      const expiresAt = finalTtl > 0 ? new Date(Date.now() + finalTtl * 1000) : null
      
      await client.query('BEGIN')
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const fullKey = this.getKey(key)
        await client.query(`
          INSERT INTO edge_sync_storage (key, value, expires_at, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (key) 
          DO UPDATE SET 
            value = EXCLUDED.value,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
        `, [fullKey, JSON.stringify(value), expiresAt])
      }
      
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  // 获取统计信息
  async getStats(): Promise<any> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      const totalResult = await client.query(`
        SELECT COUNT(*) as total_keys FROM edge_sync_storage
      `)
      
      const activeResult = await client.query(`
        SELECT COUNT(*) as active_keys FROM edge_sync_storage 
        WHERE expires_at IS NULL OR expires_at > NOW()
      `)
      
      const queueResult = await client.query(`
        SELECT COUNT(*) as queue_items FROM edge_sync_action_queue 
        WHERE expires_at IS NULL OR expires_at > NOW()
      `)
      
      return {
        connected: this.connected,
        totalKeys: parseInt(totalResult.rows[0].total_keys),
        activeKeys: parseInt(activeResult.rows[0].active_keys),
        queueItems: parseInt(queueResult.rows[0].queue_items),
        prefix: this.prefix,
        ttl: this.ttl,
      }
    } finally {
      client.release()
    }
  }

  /**
   * Action 队列支持（用于轮询模式）
   */
  async addActionToQueue(chatbotId: string, action: any): Promise<void> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      console.log(`PostgreSQL: Adding action to queue for chatbot: ${chatbotId}`, action)
      
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5分钟过期
      
      await client.query(`
        INSERT INTO edge_sync_action_queue (chatbot_id, action, expires_at)
        VALUES ($1, $2, $3)
      `, [chatbotId, JSON.stringify({
        ...action,
        queuedAt: Date.now(),
      }), expiresAt])
      
      // 限制队列长度，删除旧的记录
      await client.query(`
        DELETE FROM edge_sync_action_queue 
        WHERE chatbot_id = $1 
        AND id NOT IN (
          SELECT id FROM edge_sync_action_queue 
          WHERE chatbot_id = $1 
          ORDER BY queued_at DESC 
          LIMIT 100
        )
      `, [chatbotId])
      
      console.log(`PostgreSQL: Action queue updated for ${chatbotId}`)
    } finally {
      client.release()
    }
  }

  /**
   * 获取并清空 Action 队列
   */
  async getAndClearActionQueue(chatbotId: string): Promise<any[]> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      console.log(`PostgreSQL: Getting action queue for chatbot: ${chatbotId}`)
      
      // 清理过期的队列项
      await client.query(`
        DELETE FROM edge_sync_action_queue 
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `)
      
      // 获取并删除队列项
      const result = await client.query(`
        DELETE FROM edge_sync_action_queue 
        WHERE chatbot_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
        RETURNING action
      `, [chatbotId])
      
      const actions = result.rows.map(row => {
        try {
          return JSON.parse(row.action)
        } catch (error) {
          console.error('Error parsing action JSON:', error)
          return null
        }
      }).filter(action => action !== null)
      
      console.log(`PostgreSQL: Found ${actions.length} actions in queue for ${chatbotId}`)
      
      return actions
    } finally {
      client.release()
    }
  }

  /**
   * 清理过期数据
   */
  async cleanup(): Promise<void> {
    await this.ensureConnected()
    const client = await this.pool.connect()
    
    try {
      // 清理过期的存储数据
      const storageResult = await client.query(`
        DELETE FROM edge_sync_storage 
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `)
      
      // 清理过期的队列数据
      const queueResult = await client.query(`
        DELETE FROM edge_sync_action_queue 
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `)
      
      console.log(`PostgreSQL cleanup: Removed ${storageResult.rowCount} expired storage items and ${queueResult.rowCount} expired queue items`)
    } finally {
      client.release()
    }
  }
}