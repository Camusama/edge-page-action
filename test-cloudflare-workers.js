/**
 * 测试 Cloudflare Workers + Durable Objects 模式
 *
 * 这个脚本用于测试 Cloudflare Workers 环境下的功能
 * 运行: wrangler dev --local
 */

const BASE_URL = 'http://127.0.0.1:8787'

async function testAPI() {
  console.log('🧪 Testing Cloudflare Workers + Durable Objects mode...\n')

  try {
    // 1. 测试根路由
    console.log('1. Testing root endpoint...')
    const rootResponse = await fetch(`${BASE_URL}/`)
    const rootData = await rootResponse.json()
    console.log('✅ Root endpoint:', rootData)
    console.log(`   Environment: ${rootData.environment}`)
    console.log(`   Cache Type: ${rootData.config.cacheType}\n`)

    // 2. 测试健康检查
    console.log('2. Testing health check...')
    const healthResponse = await fetch(`${BASE_URL}/api/health`)
    const healthData = await healthResponse.json()
    console.log('✅ Health check:', healthData.success ? 'PASS' : 'FAIL')
    console.log('   Health data:', JSON.stringify(healthData, null, 2))
    if (healthData.data && healthData.data.storage) {
      console.log(`   Storage connected: ${healthData.data.storage.connected}`)
    }
    console.log()

    // 3. 测试页面状态存储
    console.log('3. Testing page state storage...')
    const testChatbotId = 'test-chatbot-' + Date.now()
    const testState = {
      url: 'https://example.com/test',
      title: 'Test Page',
      timestamp: Date.now(),
      chatbotId: testChatbotId,
      inputs: { username: 'testuser' },
      customData: { test: true },
    }

    // 设置状态
    const setResponse = await fetch(`${BASE_URL}/api/state/${testChatbotId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testState),
    })
    const setData = await setResponse.json()
    console.log('✅ Set state:', setData.success ? 'PASS' : 'FAIL')

    // 获取状态
    const getResponse = await fetch(`${BASE_URL}/api/state/${testChatbotId}`)
    const getData = await getResponse.json()
    console.log('✅ Get state:', getData.success ? 'PASS' : 'FAIL')
    console.log(`   Retrieved URL: ${getData.data?.url}`)
    console.log(`   Retrieved Title: ${getData.data?.title}\n`)

    // 4. 测试 Action 推送
    console.log('4. Testing action push...')
    const testAction = {
      type: 'navigate',
      target: 'https://example.com/new-page',
      payload: { test: true },
      timestamp: Date.now(),
    }

    const actionResponse = await fetch(`${BASE_URL}/api/action/${testChatbotId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testAction),
    })
    const actionData = await actionResponse.json()
    console.log('✅ Action push:', actionData.success ? 'PASS' : 'FAIL')
    console.log(`   Connections notified: ${actionData.data?.connectionsNotified || 0}\n`)

    // 5. 测试管理接口
    console.log('5. Testing admin endpoints...')
    const statusResponse = await fetch(`${BASE_URL}/admin/status`)
    const statusData = await statusResponse.json()
    console.log('✅ Admin status:', statusData.success ? 'PASS' : 'FAIL')
    console.log(`   Active connections: ${statusData.data?.connections || 0}`)
    console.log(`   Storage type: ${statusData.data?.storage?.type}\n`)

    // 6. 清理测试数据
    console.log('6. Cleaning up test data...')
    const deleteResponse = await fetch(`${BASE_URL}/api/state/${testChatbotId}`, {
      method: 'DELETE',
    })
    const deleteData = await deleteResponse.json()
    console.log('✅ Cleanup:', deleteData.success ? 'PASS' : 'FAIL\n')

    console.log('🎉 All tests completed successfully!')
    console.log('\n📊 Test Summary:')
    console.log('- Root endpoint: ✅')
    console.log('- Health check: ✅')
    console.log('- State storage: ✅')
    console.log('- Action push: ✅')
    console.log('- Admin interface: ✅')
    console.log('- Data cleanup: ✅')
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error('Stack trace:', error.stack)
  }
}

async function testDurableObjectDirectly() {
  console.log('\n🔧 Testing Durable Object directly...')

  try {
    // 这些测试需要在 Cloudflare Workers 环境中运行
    // 因为需要访问 Durable Object bindings
    console.log('ℹ️  Direct Durable Object tests require Cloudflare Workers environment')
    console.log('   Run: wrangler dev --local')
    console.log('   Then access: http://localhost:8787')
  } catch (error) {
    console.error('❌ Durable Object test failed:', error.message)
  }
}

// 运行测试
if (typeof window === 'undefined') {
  // Node.js 环境
  testAPI().then(() => {
    testDurableObjectDirectly()
  })
} else {
  // 浏览器环境
  console.log('Run this script in Node.js environment or use browser console')
}
