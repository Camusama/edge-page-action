import type { AppConfig, CloudflareBindings } from './types'

// 检测是否在 Cloudflare Workers 环境中运行
function isCloudflareWorkers(): boolean {
  return typeof globalThis.caches !== 'undefined' && typeof globalThis.WebSocketPair !== 'undefined'
}

// 手动加载 .env 文件（仅在 Node.js 环境中）
function loadEnvFile() {
  if (isCloudflareWorkers()) {
    return // 在 Cloudflare Workers 中不需要加载 .env 文件
  }

  try {
    const { readFileSync } = require('fs')
    const { join } = require('path')

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

export function loadConfig(env?: any): AppConfig {
  // 在 Node.js 环境中加载环境变量
  if (!isCloudflareWorkers()) {
    loadEnvFile()
  }

  // 从环境变量或 Cloudflare Workers env 加载配置
  const envSource = env || (isCloudflareWorkers() ? {} : process.env)

  const config: AppConfig = {
    cacheType:
      (envSource.CACHE_TYPE as 'redis' | 'durable-objects') ||
      (isCloudflareWorkers() ? 'durable-objects' : 'redis'),
    redisUrl: envSource.REDIS_URL,
    cachePrefix: envSource.CACHE_PREFIX || 'edge-sync',
    cacheTtl: parseInt(envSource.CACHE_TTL || '3600'),
    port: parseInt(envSource.PORT || '3000'),
    corsOrigins: envSource.CORS_ORIGINS?.split(',').filter(Boolean) || ['*'],
  }

  // 验证配置
  validateConfig(config)

  return config
}

function validateConfig(config: AppConfig): void {
  if (config.cacheType === 'redis' && !config.redisUrl) {
    throw new Error('REDIS_URL environment variable is required when using Redis storage')
  }

  if (config.cacheType === 'durable-objects' && !isCloudflareWorkers()) {
    console.warn('Durable Objects storage is designed for Cloudflare Workers environment')
  }

  if (config.cacheTtl < 0) {
    throw new Error('CACHE_TTL must be a non-negative number')
  }

  if (config.port && (config.port < 1 || config.port > 65535)) {
    throw new Error('PORT must be between 1 and 65535')
  }
}

// 默认配置（用于 Node.js 环境）
export const config = loadConfig()

// 导出工具函数
export { isCloudflareWorkers }
