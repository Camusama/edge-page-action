import type { AppConfig } from './types'
import { readFileSync } from 'fs'
import { join } from 'path'

// 手动加载 .env 文件
function loadEnvFile() {
  try {
    const envPath = join(process.cwd(), '.env')
    const envContent = readFileSync(envPath, 'utf8')

    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim()
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=')
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim()
          process.env[key.trim()] = value
        }
      }
    })
  } catch (error) {
    console.warn(
      'Could not load .env file:',
      error instanceof Error ? error.message : String(error)
    )
  }
}

export function loadConfig(): AppConfig {
  // 加载环境变量
  loadEnvFile()
  // 从环境变量加载配置
  const config: AppConfig = {
    cacheType: (process.env.CACHE_TYPE as 'redis' | 'durable-objects') || 'redis',
    redisUrl: process.env.REDIS_URL,
    cachePrefix: process.env.CACHE_PREFIX || 'edge-sync',
    cacheTtl: parseInt(process.env.CACHE_TTL || '3600'),
    port: parseInt(process.env.PORT || '3000'),
    corsOrigins: process.env.CORS_ORIGINS?.split(',').filter(Boolean) || ['*'],
  }

  // 验证配置
  validateConfig(config)

  return config
}

function validateConfig(config: AppConfig): void {
  if (config.cacheType === 'redis' && !config.redisUrl) {
    throw new Error('REDIS_URL environment variable is required when using Redis storage')
  }

  if (config.cacheTtl < 0) {
    throw new Error('CACHE_TTL must be a non-negative number')
  }

  if (config.port && (config.port < 1 || config.port > 65535)) {
    throw new Error('PORT must be between 1 and 65535')
  }
}

export const config = loadConfig()
