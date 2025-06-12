# Edge Sync State Server

一个基于 Hono.js 的状态同步服务器，支持页面状态缓存和前端 Action 推送。

## 🚀 特性

- **多环境支持**: 同时支持 Node.js 和 Cloudflare Workers
- **状态同步**: 基于 chatbotId 的页面状态缓存和同步
- **实时通信**: HTTP SSE (Server-Sent Events) 连接
- **存储抽象**: 支持 Redis 和 Cloudflare Durable Objects
- **Action 推送**: 向前端推送页面操作指令
- **类型安全**: 完整的 TypeScript 支持
- **边缘计算**: Cloudflare Workers 全球分布式部署

## 📦 安装

```bash
cd packages/edge-sync-state
npm install
```

## ⚙️ 配置

### Node.js 环境配置 (`.env` 文件):

```env
CACHE_TYPE=redis
REDIS_URL=redis://localhost:6379/0
CACHE_PREFIX=edge-sync
CACHE_TTL=3600
PORT=3000
CORS_ORIGINS=*
```

### Cloudflare Workers 环境配置 (`wrangler.jsonc`):

```jsonc
{
  "name": "edge-sync-state",
  "main": "src/index.ts",
  "compatibility_date": "2025-06-12",
  "durable_objects": {
    "bindings": [
      {
        "name": "EDGE_SYNC_DO",
        "class_name": "EdgeSyncStateDO"
      }
    ]
  },
  "vars": {
    "CACHE_TYPE": "durable-objects",
    "CACHE_PREFIX": "edge-sync",
    "CACHE_TTL": "3600",
    "CORS_ORIGINS": "*"
  }
}
```

### 环境变量说明

- `CACHE_TYPE`: 缓存类型 (`redis` | `durable-objects`)
- `REDIS_URL`: Redis 连接 URL (当使用 Redis 时必需)
- `CACHE_PREFIX`: 缓存键前缀
- `CACHE_TTL`: 缓存过期时间 (秒)
- `PORT`: 服务器端口 (Node.js 环境)
- `CORS_ORIGINS`: CORS 允许的源，用逗号分隔

## 🏃‍♂️ 运行

### Node.js 环境 (使用 Redis)

```bash
# 开发模式 (热重载)
npm run start

# 确保 Redis 服务器运行
# redis-server
```

### Cloudflare Workers 环境 (使用 Durable Objects)

```bash
# 本地开发模式
npm run dev

# 部署到 Cloudflare Workers
npm run deploy

# 生成类型定义
npm run cf-typegen
```

### 测试

```bash
# 测试 Node.js 模式
node test-cloudflare-workers.js

# 测试 Cloudflare Workers 模式 (需要先运行 npm run dev)
# 然后在浏览器中访问 http://localhost:8787
```

## 📡 API 端点

### 状态管理

- `GET /api/health` - 健康检查
- `GET /api/state/{chatbotId}` - 获取页面状态
- `POST /api/state/{chatbotId}` - 更新页面状态

### Action 推送

- `POST /api/action/{chatbotId}` - 推送 Action 到指定连接
- `POST /api/action/broadcast` - 广播 Action 到所有连接

### SSE 连接

- `GET /sse/connect/{chatbotId}` - 建立 SSE 连接

### 管理接口

- `GET /admin/status` - 获取系统状态
- `GET /admin/connections` - 获取所有活跃连接
- `DELETE /admin/connections/{chatbotId}` - 断开指定连接
- `POST /admin/broadcast` - 广播消息到所有连接
- `POST /admin/cleanup` - 清理非活跃连接

## 📝 使用示例

### 前端连接

```javascript
// 建立 SSE 连接
const chatbotId = 'chatbot_123'
const eventSource = new EventSource(`http://localhost:3000/sse/connect/${chatbotId}`)

eventSource.onmessage = event => {
  const data = JSON.parse(event.data)
  console.log('收到消息:', data)

  if (data.type === 'action') {
    // 处理前端 Action
    handleAction(data.data)
  }
}

// 更新页面状态
async function updatePageState(state) {
  await fetch(`http://localhost:3000/api/state/${chatbotId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
}
```

### 后端推送 Action

```javascript
// 推送页面跳转 Action
await fetch(`http://localhost:3000/api/action/${chatbotId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'navigate',
    payload: { url: 'https://example.com' },
  }),
})

// 推送点击 Action
await fetch(`http://localhost:3000/api/action/${chatbotId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'click',
    target: '#submit-button',
  }),
})
```

## 🏗️ 架构设计

```
├── src/
│   ├── types/           # 类型定义
│   │   └── index.ts
│   ├── storage/         # 存储抽象层
│   │   ├── base.ts      # 基础存储接口
│   │   ├── redis.ts     # Redis 实现
│   │   ├── durable-objects.ts    # Durable Objects 适配器
│   │   ├── durable-object.ts     # Durable Object 类
│   │   └── factory.ts   # 存储工厂
│   ├── connection/      # 连接管理
│   │   └── sse-manager.ts
│   ├── services/        # 业务逻辑
│   │   └── sync-service.ts
│   ├── routes/          # 模块化路由
│   │   ├── api.ts       # API 路由
│   │   ├── sse.ts       # SSE 路由
│   │   └── admin.ts     # 管理路由
│   ├── config.ts        # 配置管理
│   ├── index.ts         # Hono 应用入口
│   └── server.ts        # Node.js 服务器
```

### 🌐 Cloudflare Durable Objects 实现

#### 特性

- **全球分布式**: 数据自动分布到全球边缘节点
- **强一致性**: 每个 Durable Object 实例保证数据一致性
- **自动扩展**: 根据负载自动创建和销毁实例
- **TTL 支持**: 内置数据过期机制
- **批量操作**: 支持批量读写操作

#### 存储架构

```
Cloudflare Workers
├── EdgeSyncStateDO (Durable Object)
│   ├── 存储状态数据
│   ├── TTL 过期管理
│   ├── 批量操作支持
│   └── 自动清理机制
└── DurableObjectsStorageAdapter
    ├── HTTP 通信层
    ├── 错误处理
    └── 类型安全
```

### 🔧 模块化路由设计

每个路由模块都是独立的，支持：

- 独立的 CORS 配置
- 服务依赖注入
- 错误处理
- 中间件支持

添加新路由模块只需：

1. 在 `src/routes/` 创建新文件
2. 在 `index.ts` 中动态挂载
3. 无需修改现有代码

## 🧪 测试

### 启动服务器

```bash
cd packages/edge-sync-state
npm run start
```

### API 测试

```bash
# 健康检查
curl http://localhost:3050/api/health

# 更新页面状态
curl -X POST http://localhost:3050/api/state/test123 \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","title":"Test Page","inputs":{"name":"John"}}'

# 获取页面状态
curl http://localhost:3050/api/state/test123

# 推送 Action
curl -X POST http://localhost:3050/api/action/test123 \
  -H "Content-Type: application/json" \
  -d '{"type":"navigate","payload":{"url":"https://google.com"}}'

# 建立 SSE 连接
curl -N http://localhost:3050/sse/connect/test123
```

### 前端测试

#### 完整测试仪表板

打开 `test-dashboard.html` 文件在浏览器中使用功能完整的测试界面：

- 🔗 连接管理和状态监控
- 📊 系统状态和性能监控
- 📄 页面状态管理
- ⚡ Action 推送测试
- 🛠️ 管理功能
- 📝 实时日志和过滤

#### 基础示例

打开 `example.html` 文件查看简单的前端集成示例。

详细测试指南请参考 `TEST-GUIDE.md`。

## 🔮 未来扩展

- [ ] WebSocket 连接支持
- [ ] Cloudflare Durable Objects 存储
- [ ] 连接认证和授权
- [ ] 消息持久化
- [ ] 集群支持

## 📋 API 文档

### 状态管理 API

#### GET /api/health

健康检查端点

**响应示例:**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": 1749708226173,
    "connections": {
      "totalConnections": 0,
      "connections": []
    }
  },
  "timestamp": 1749708226173
}
```

#### GET /api/state/{chatbotId}

获取指定 chatbotId 的页面状态

**响应示例:**

```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "title": "Test Page",
    "timestamp": 1749708233619,
    "chatbotId": "test123",
    "inputs": { "name": "John" },
    "forms": {}
  },
  "timestamp": 1749708242233
}
```

#### POST /api/state/{chatbotId}

更新指定 chatbotId 的页面状态

**请求体示例:**

```json
{
  "url": "https://example.com",
  "title": "Test Page",
  "inputs": { "name": "John" },
  "customData": { "user": "张三" }
}
```

### Action 推送 API

#### POST /api/action/{chatbotId}

向指定 chatbotId 推送前端 Action

**请求体示例:**

```json
{
  "type": "navigate",
  "payload": { "url": "https://google.com" }
}
```

**Action 类型:**

- `navigate`: 页面导航
- `click`: 元素点击
- `input`: 输入操作
- `scroll`: 滚动操作
- `custom`: 自定义操作

### SSE 连接

#### GET /sse/connect/{chatbotId}

建立 Server-Sent Events 连接

**消息格式:**

```json
{
  "type": "action|ping|connected",
  "data": {},
  "timestamp": 1749708268332
}
```
