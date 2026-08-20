import { createClient } from 'redis'
import { env } from '@config/env'

const realRedisClient = createClient({
    url : env.redisUrl
})

const realRedisSubscriber = createClient({
    url : env.redisUrl
})

let useMemoryFallback = false
const memoryStore = new Map<string, string>()
const pubSubListeners = new Map<string, Set<(message: string) => void>>()

realRedisClient.on('error', () => {
  // Suppress logs if we are already using the fallback
  if (!useMemoryFallback) {
    console.warn('Redis connection issue, using local in-memory fallback.')
  }
  useMemoryFallback = true
})

realRedisSubscriber.on('error', () => {
  useMemoryFallback = true
})

export const redisClient = {
  isOpen: false,
  async connect(): Promise<void> {
    try {
      if (!this.isOpen) {
        await realRedisClient.connect()
        this.isOpen = true
      }
    } catch (err) {
      console.warn('Could not connect to Redis server. Falling back to In-Memory store.')
      useMemoryFallback = true
      this.isOpen = true
    }
  },
  async get(key: string): Promise<string | null> {
    if (useMemoryFallback) {
      return memoryStore.get(key) ?? null
    }
    try {
      return await realRedisClient.get(key)
    } catch {
      return memoryStore.get(key) ?? null
    }
  },
  async set(key: string, value: string, options?: { EX?: number }): Promise<string | null> {
    if (useMemoryFallback) {
      memoryStore.set(key, value)
      if (options?.EX) {
        setTimeout(() => {
          memoryStore.delete(key)
        }, options.EX * 1000)
      }
      return 'OK'
    }
    try {
      return await realRedisClient.set(key, value, options)
    } catch {
      memoryStore.set(key, value)
      return 'OK'
    }
  },
  async publish(channel: string, message: string): Promise<number> {
    if (useMemoryFallback) {
      const listeners = pubSubListeners.get(channel)
      if (listeners) {
        listeners.forEach(cb => cb(message))
        return listeners.size
      }
      return 0
    }
    try {
      return await realRedisClient.publish(channel, message)
    } catch {
      const listeners = pubSubListeners.get(channel)
      if (listeners) {
        listeners.forEach(cb => cb(message))
        return listeners.size
      }
      return 0
    }
  },
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (useMemoryFallback) {
      if (!pubSubListeners.has(channel)) {
        pubSubListeners.set(channel, new Set())
      }
      pubSubListeners.get(channel)!.add(callback)
      return
    }
    try {
      if (!realRedisSubscriber.isOpen) {
        await realRedisSubscriber.connect()
      }
      await realRedisSubscriber.subscribe(channel, (message) => {
        callback(message)
      })
    } catch {
      console.warn(`Failed to subscribe to Redis channel ${channel}. Falling back to In-Memory pub/sub listeners.`)
      if (!pubSubListeners.has(channel)) {
        pubSubListeners.set(channel, new Set())
      }
      pubSubListeners.get(channel)!.add(callback)
    }
  },
  on(event: string, callback: (...args: any[]) => void) {
    realRedisClient.on(event, callback)
  }
}

export const connectRedis = async (): Promise<void> => {
  await redisClient.connect()
}

connectRedis();