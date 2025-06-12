import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { openApiSchema } from '../openapi-schema'

export function createOpenAPIRoute(corsOrigins: string[]) {
  const openapi = new Hono()

  // CORS 中间件
  openapi.use(
    '*',
    cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    })
  )

  // 获取 OpenAPI Schema
  openapi.get('/schema.json', c => {
    return c.json(openApiSchema)
  })

  // 获取 OpenAPI Schema (YAML 格式)
  openapi.get('/schema.yaml', c => {
    // 简单的 JSON 到 YAML 转换
    const yamlString = jsonToYaml(openApiSchema)
    return c.text(yamlString, 200, {
      'Content-Type': 'application/yaml'
    })
  })

  return openapi
}

// 简单的 JSON 到 YAML 转换函数
function jsonToYaml(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent)
  let yaml = ''

  if (Array.isArray(obj)) {
    for (const item of obj) {
      yaml += `${spaces}- ${jsonToYaml(item, indent + 1).trim()}\n`
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`
        for (const item of value) {
          yaml += `${spaces}  - ${jsonToYaml(item, indent + 2).trim()}\n`
        }
      } else if (typeof value === 'object' && value !== null) {
        yaml += `${spaces}${key}:\n${jsonToYaml(value, indent + 1)}`
      } else {
        const yamlValue = typeof value === 'string' ? `"${value}"` : value
        yaml += `${spaces}${key}: ${yamlValue}\n`
      }
    }
  } else {
    return String(obj)
  }

  return yaml
}
