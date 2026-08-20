import { app } from './app'
import { env } from '@config/env'
import { connectRedis } from '@config/redis'

const startServer = async () => {
  try {
    // Connect to Redis
    await connectRedis()
    console.log('Connected to Redis')

    const port = env.port
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()