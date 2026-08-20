import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from agent import get_agent_graph, AgentState
from checkpointer import init_db, pool
from redis_client import publish_event
import json

app = FastAPI(title="Agent Runner Microservice")

class RunRequest(BaseModel):
    thread_id: str
    message: str

class ApproveRequest(BaseModel):
    thread_id: str
    approved: bool

class ResumeRequest(BaseModel):
    thread_id: str

def serialize_message(msg: BaseMessage) -> Dict[str, Any]:
    """Helper to convert LangChain messages into JSON serializable format."""
    msg_type = "unknown"
    if isinstance(msg, HumanMessage) or (hasattr(msg, 'type') and msg.type == 'human'):
        msg_type = "human"
    elif isinstance(msg, AIMessage) or (hasattr(msg, 'type') and msg.type == 'ai'):
        msg_type = "ai"
    return {
        "type": msg_type,
        "content": msg.content
    }

async def stream_and_publish(thread_id: str, inputs: Optional[dict], config: dict):
    """
    Executes the LangGraph stream, publishes each node update to Redis,
    and returns the final updated state of the messages.
    """
    last_node = None
    try:
        # Publish start event
        publish_event(thread_id, "run_started", {"inputs": str(inputs) if inputs else None})

        async for event_type, chunk in get_agent_graph().astream(
            inputs, 
            config=config, 
            stream_mode=["updates", "debug"]
        ):
            if event_type == "updates":
                for node_name, node_update in chunk.items():
                    last_node = node_name
                    # Convert messages if any in the update
                    serialized_updates = {}
                    for key, val in node_update.items():
                        if key == "messages" and isinstance(val, list):
                            serialized_updates[key] = [serialize_message(m) for m in val]
                        else:
                            serialized_updates[key] = val

                    # Publish update event to Redis
                    publish_event(thread_id, "node_updated", {
                        "node": node_name,
                        "updates": serialized_updates
                    })
            elif event_type == "debug":
                # Debug events show checkpointer steps/task metadata
                publish_event(thread_id, "debug", {"info": str(chunk)})

        # Get final state to check for interrupts/success
        state = await get_agent_graph().aget_state(config)
        is_paused = len(state.next) > 0
        
        status = "paused" if is_paused else "completed"
        publish_event(thread_id, "run_finished", {
            "status": status,
            "next_nodes": list(state.next)
        })

        return state
    except Exception as e:
        publish_event(thread_id, "run_failed", {"error": str(e)})
        raise e

@app.on_event("startup")
async def startup_event():
    """Initializes connection pool and checkpointer schema on startup."""
    try:
        await pool.open()
        await init_db()
        print("Database checkpointer initialized successfully.")
    except Exception as e:
        print(f"Warning: Database connection failed. Persistent checkpointer is disabled. Error: {e}")

@app.post("/run")
async def run_agent(req: RunRequest):
    """
    Starts a new run or sends a message to an ongoing conversation.
    """
    config = {"configurable": {"thread_id": req.thread_id}}
    inputs = {"messages": [HumanMessage(content=req.message)]}
    
    try:
        state = await stream_and_publish(req.thread_id, inputs, config)
        
        # Format output
        messages = [serialize_message(m) for m in state.values.get("messages", [])]
        is_paused = len(state.next) > 0
        
        return {
            "thread_id": req.thread_id,
            "status": "paused" if is_paused else "running",
            "needs_approval": state.values.get("needs_approval", False),
            "messages": messages
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/approve")
async def approve_run(req: ApproveRequest):
    """
    Sets human approval state on a paused agent and resumes execution.
    """
    config = {"configurable": {"thread_id": req.thread_id}}
    
    try:
        # Check current state first
        state = await get_agent_graph().aget_state(config)
        if not state.values:
            raise HTTPException(status_code=404, detail="No run state found for this thread.")
        
        if len(state.next) == 0:
            return {
                "message": "Agent run is already complete.",
                "messages": [serialize_message(m) for m in state.values.get("messages", [])]
            }

        # Update the state to approve/reject
        # We write into state as if we are the model node that decided it
        await get_agent_graph().aupdate_state(
            config, 
            {"approved": req.approved, "needs_approval": False}, 
            as_node="call_model"
        )
        
        publish_event(req.thread_id, "human_approved", {"approved": req.approved})

        # Resume execution by sending None inputs (tells LangGraph to resume from active checkpoint)
        final_state = await stream_and_publish(req.thread_id, None, config)
        messages = [serialize_message(m) for m in final_state.values.get("messages", [])]
        
        return {
            "thread_id": req.thread_id,
            "status": "completed",
            "messages": messages
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/resume")
async def resume_run(req: ResumeRequest):
    """
    Resumes a paused or crashed run from its last checkpoint without modifying inputs.
    """
    config = {"configurable": {"thread_id": req.thread_id}}
    
    try:
        state = await get_agent_graph().aget_state(config)
        if not state.values:
            raise HTTPException(status_code=404, detail="No run state found for this thread.")
        
        if len(state.next) == 0:
            return {
                "message": "Agent run is already complete.",
                "messages": [serialize_message(m) for m in state.values.get("messages", [])]
            }

        # Resume execution
        final_state = await stream_and_publish(req.thread_id, None, config)
        messages = [serialize_message(m) for m in final_state.values.get("messages", [])]
        
        return {
            "thread_id": req.thread_id,
            "status": "paused" if len(final_state.next) > 0 else "completed",
            "messages": messages
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
