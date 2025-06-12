import { Hono } from 'hono'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'

export function createStaticRoutes() {
  const staticApp = new Hono()

  // MIME 类型映射
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.md': 'text/markdown'
  }

  // 获取 MIME 类型
  function getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase()
    return mimeTypes[ext] || 'application/octet-stream'
  }

  // 静态文件服务
  staticApp.get('/*', (c) => {
    try {
      let requestPath = c.req.path
      
      // 如果是根路径，重定向到测试仪表板
      if (requestPath === '/' || requestPath === '') {
        requestPath = '/test-dashboard.html'
      }
      
      // 移除开头的斜杠
      if (requestPath.startsWith('/')) {
        requestPath = requestPath.slice(1)
      }
      
      // 构建文件路径
      const filePath = join(process.cwd(), requestPath)
      
      // 检查文件是否存在
      if (!existsSync(filePath)) {
        return c.text('File not found', 404)
      }
      
      // 检查是否是文件
      const stats = statSync(filePath)
      if (!stats.isFile()) {
        return c.text('Not a file', 404)
      }
      
      // 读取文件内容
      const content = readFileSync(filePath)
      const mimeType = getMimeType(filePath)
      
      // 设置响应头
      c.header('Content-Type', mimeType)
      c.header('Cache-Control', 'no-cache')
      
      // 如果是 HTML 文件，注入一些有用的脚本
      if (mimeType === 'text/html') {
        let htmlContent = content.toString()
        
        // 注入自动刷新脚本（开发模式）
        const devScript = `
        <script>
          // 开发模式自动刷新检测
          if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            console.log('🔧 开发模式：静态文件服务已启用');
            
            // 检测服务器状态
            async function checkServerStatus() {
              try {
                const response = await fetch('/api/health');
                if (response.ok) {
                  console.log('✅ 服务器连接正常');
                } else {
                  console.warn('⚠️ 服务器响应异常');
                }
              } catch (error) {
                console.error('❌ 服务器连接失败:', error.message);
              }
            }
            
            // 页面加载完成后检查服务器状态
            window.addEventListener('load', () => {
              setTimeout(checkServerStatus, 1000);
            });
          }
        </script>
        `
        
        // 在 </body> 前插入脚本
        if (htmlContent.includes('</body>')) {
          htmlContent = htmlContent.replace('</body>', devScript + '\n</body>')
        } else {
          htmlContent += devScript
        }
        
        return c.html(htmlContent)
      }
      
      return new Response(content, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache'
        }
      })
      
    } catch (error) {
      console.error('Static file serve error:', error)
      return c.text('Internal server error', 500)
    }
  })

  return staticApp
}
