import sys
import asyncio

# Force Windows selector event loop policy for psycopg compatibility
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn

async def main():
    config = uvicorn.Config(
        "main:app", 
        host="0.0.0.0", 
        port=8080, 
        log_level="info", 
        loop="asyncio"  # Tells uvicorn to use the existing running loop
    )
    server = uvicorn.Server(config)
    await server.serve()

if __name__ == "__main__":
    asyncio.run(main())
