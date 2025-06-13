# WebSocket + Worker 调试指南

## 🐛 问题描述

用户报告 Worker + WebSocket 功能有问题：
1. 前端建立连接后能在 dashboard 看到连接
2. 点击 Action 后返回 "Action queued (connection not active)"
3. 连接随后断开

## 🔍 调试改进

### 1. 增强的调试日志

**WebSocket 连接管理器** (`src/worker/connection/websocket-manager.ts`):
- ✅ 连接建立时显示所有连接的 ChatBot ID
- ✅ 发送消息时检查连接状态和 WebSocket 状态
- ✅ 详细的错误日志和状态检查
- ✅ 改进的心跳机制（增加超时时间）

**同步服务** (`src/shared/services/sync-service.ts`):
- ✅ Action 推送时显示连接管理器信息
- ✅ 显示可用的 ChatBot ID 列表
- ✅ 失败时自动尝试队列机制

**前端测试仪表板**:
- ✅ 增强的 WebSocket 消息处理
- ✅ 心跳消息的自动响应
- ✅ 新增连接状态检查功能

### 2. 新增调试功能

**连接状态检查按钮** (`🔍 状态`):
- 显示 WebSocket 连接状态
- 检查服务器端连接记录
- 对比客户端和服务器端状态

**改进的消息处理**:
- 自动响应心跳消息
- 详细的消息类型日志
- 错误消息的详细记录

## 🧪 调试步骤

### 1. 基本连接测试

1. 打开测试仪表板
2. 设置或选择 ChatBot ID
3. 点击 "🔌 连接" 建立 WebSocket 连接
4. 观察控制台日志，确认连接建立

**期望日志**:
```
WebSocket connection established for chatbot: your-chatbot-id
Total connections: 1
All connected chatbot IDs: your-chatbot-id
```

### 2. 连接状态验证

1. 连接建立后，点击 "🔍 状态" 按钮
2. 检查客户端 WebSocket 状态
3. 验证服务器端连接记录

**期望结果**:
- WebSocket 状态: OPEN (1)
- 服务器端找到对应连接

### 3. Action 推送测试

1. 确保连接正常
2. 在 Action 推送区域发送测试 Action
3. 观察详细的调试日志

**关键调试信息**:
```
SyncService: Pushing action to chatbot: your-chatbot-id
SyncService: Connection manager type: WebSocketConnectionManager
SyncService: Total connections: 1
SyncService: Available chatbot IDs: your-chatbot-id
Attempting to send message to chatbot: your-chatbot-id
Available connections: your-chatbot-id
WebSocket state for your-chatbot-id: 1 (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)
Sending message to your-chatbot-id: {"type":"action",...}
Message sent successfully to your-chatbot-id
```

### 4. 心跳机制测试

1. 保持连接 30 秒以上
2. 观察心跳消息的发送和接收
3. 确认连接保持稳定

**期望行为**:
- 每 30 秒发送心跳
- 客户端自动响应心跳
- 连接保持活跃状态

## 🔧 可能的问题和解决方案

### 1. ChatBot ID 不匹配

**症状**: 连接建立但 Action 推送失败
**检查**: 对比客户端使用的 ID 和服务器端记录的 ID
**解决**: 确保 ID 完全一致，注意大小写和特殊字符

### 2. WebSocket 状态异常

**症状**: 连接显示存在但 WebSocket 状态不是 OPEN
**检查**: 使用状态检查功能查看 WebSocket readyState
**解决**: 重新建立连接，检查网络状况

### 3. 心跳超时

**症状**: 连接在一段时间后自动断开
**检查**: 观察心跳日志，确认双向通信
**解决**: 已增加超时时间到 90 秒（3 * 30秒）

### 4. 消息发送异常

**症状**: WebSocket.send() 抛出异常
**检查**: 查看详细的错误日志
**解决**: 检查消息格式，确保 WebSocket 连接有效

## 📊 调试日志示例

### 正常流程日志

```
// 连接建立
WebSocket connection established for chatbot: test-bot-123
Total connections: 1
All connected chatbot IDs: test-bot-123

// Action 推送
SyncService: Pushing action to chatbot: test-bot-123
SyncService: Available chatbot IDs: test-bot-123
Attempting to send message to chatbot: test-bot-123
Available connections: test-bot-123
WebSocket state for test-bot-123: 1 (OPEN)
Message sent successfully to test-bot-123
Action pushed to chatbot: test-bot-123

// 心跳
Heartbeat sent to test-bot-123
Received heartbeat from test-bot-123
```

### 异常流程日志

```
// 连接不存在
SyncService: Pushing action to chatbot: wrong-bot-id
SyncService: Available chatbot IDs: test-bot-123
Attempting to send message to chatbot: wrong-bot-id
Available connections: test-bot-123
No connection found for chatbot: wrong-bot-id
Failed to push action to chatbot: wrong-bot-id (connection not found)

// WebSocket 状态异常
WebSocket state for test-bot-123: 3 (CLOSED)
WebSocket not open for test-bot-123, state: 3
WebSocket connection removed for chatbot: test-bot-123
```

## 🚀 使用建议

1. **始终检查日志**: 使用浏览器开发者工具查看详细日志
2. **验证 ID 匹配**: 确保客户端和服务器端使用相同的 ChatBot ID
3. **监控连接状态**: 定期使用状态检查功能验证连接
4. **测试心跳机制**: 保持连接足够长时间以验证心跳工作正常
5. **重新连接**: 遇到问题时先断开再重新连接

通过这些调试改进，我们应该能够快速定位和解决 WebSocket 连接问题！
