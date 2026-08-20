import os
from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

# Load environment variables
load_dotenv()
load_dotenv(dotenv_path="../.env")

db_url = os.getenv("DATABASE_URL")
if not db_url:
    raise ValueError("Missing env var: DATABASE_URL")

# Create connection pool required by PostgresSaver
pool = AsyncConnectionPool(
    conninfo=db_url,
    max_size=10,
    open=False,  # Prevents pool from trying to connect before event loop starts
    kwargs={"autocommit": True, "row_factory": dict_row}
)

checkpointer = None

def get_checkpointer():
    """Lazily instantiates the checkpointer inside the active event loop."""
    global checkpointer
    if checkpointer is None:
        checkpointer = AsyncPostgresSaver(pool)
    return checkpointer

async def init_db():
    """
    Sets up the checkpointer tables (checkpoints, checkpoint_writes, 
    checkpoint_migrations, checkpoint_blobs) if they do not exist.
    """
    cp = get_checkpointer()
    await cp.setup()
