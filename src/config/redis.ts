
import { createClient } from 'redis'
import { env } from '@config/env'

export const redisClient = createClient({
    url : env.redisUrl
})

redisClient.on('error', (err) => console.error('Redis Client error:', err))

export const connectRedis = async (): Promise<void> => {
  if (!redisClient.isOpen) {
    await redisClient.connect()
  }
}

connectRedis();

redisClient.on('error', (err) => console.error('Redis error:', err))