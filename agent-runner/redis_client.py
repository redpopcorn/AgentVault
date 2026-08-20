import os
import json
import redis
from dotenv import load_dotenv

# Load environment variables (preferring local .env, falling back to parent directory's .env)
load_dotenv()
load_dotenv(dotenv_path="../.env")

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(redis_url, decode_responses=True)

def publish_event(thread_id: str, event_type: str, data: dict):
    """
    Publishes an agent execution event to a Redis pub/sub channel.
    Channel name format: agent:events:{thread_id}
    """
    payload = {
        "thread_id": thread_id,
        "type": event_type,
        "data": data
    }
    channel = f"agent:events:{thread_id}"
    try:
        redis_client.publish(channel, json.dumps(payload))
    except Exception as e:
        print(f"Failed to publish event to Redis: {e}")
