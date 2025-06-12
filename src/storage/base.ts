import type { StorageAdapter, PageState } from '../types'

export abstract class BaseStorageAdapter implements StorageAdapter {
  protected prefix: string
  protected ttl: number

  constructor(prefix: string = 'edge-sync', ttl: number = 3600) {
    this.prefix = prefix
    this.ttl = ttl
  }

  protected getKey(key: string): string {
    return `${this.prefix}:${key}`
  }

  protected getPageStateKey(chatbotId: string): string {
    return this.getKey(`page:${chatbotId}`)
  }

  // 抽象方法，由具体实现类实现
  abstract set(key: string, value: any, ttl?: number): Promise<void>
  abstract get(key: string): Promise<any>
  abstract delete(key: string): Promise<void>
  abstract exists(key: string): Promise<boolean>

  // 页面状态相关的便捷方法
  async setPageState(chatbotId: string, state: PageState): Promise<void> {
    const key = this.getPageStateKey(chatbotId)
    await this.set(key, state, this.ttl)
  }

  async getPageState(chatbotId: string): Promise<PageState | null> {
    const key = this.getPageStateKey(chatbotId)
    return await this.get(key)
  }

  async deletePageState(chatbotId: string): Promise<void> {
    const key = this.getPageStateKey(chatbotId)
    await this.delete(key)
  }
}
