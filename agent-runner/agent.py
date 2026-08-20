import os
from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage, AIMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from dotenv import load_dotenv
from checkpointer import checkpointer

# Load environment variables
load_dotenv()
load_dotenv(dotenv_path="../.env")

# Define Agent State
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    needs_approval: bool
    approved: bool

# Lazy LLM Initialization
llm = None

def get_llm():
    """Lazily loads the Gemini LLM, falling back to a MockLLM if no key is present."""
    global llm
    if llm is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("Warning: GEMINI_API_KEY is not set. Falling back to MockLLM for local testing.")
            class MockLLM:
                async def ainvoke(self, messages):
                    # Returns a mock message response
                    return AIMessage(content="[MOCK GEMINI]: I can help you compile, deploy, or run executions. Ask me to 'deploy' to test human approval pause.")
            return MockLLM()
        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=api_key,
            temperature=0.7
        )
    return llm

async def call_model(state: AgentState):
    """
    Calls the LLM (Gemini or Mock) to generate response or assess user request.
    """
    messages = state.get("messages", [])
    model = get_llm()
    response = await model.ainvoke(messages)
    
    # Assess if the last user message contains request for critical operations
    # (e.g. deploy, delete, run critical action) to trigger human approval
    last_user_message = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage) or (hasattr(msg, 'type') and msg.type == 'human'):
            last_user_message = str(msg.content).lower()
            break
            
    needs_approval = "deploy" in last_user_message or "execute" in last_user_message
    
    return {
        "messages": [response],
        "needs_approval": needs_approval,
        "approved": False
    }

async def action(state: AgentState):
    """
    Executes action block. Will only perform work if approved is True.
    """
    if state.get("approved"):
        return {
            "messages": [AIMessage(content="[SYSTEM]: Critical deploy operation approved and executed successfully!")],
            "needs_approval": False
        }
    else:
        return {
            "messages": [AIMessage(content="[SYSTEM]: Critical deploy operation blocked/rejected by human operator.")],
            "needs_approval": False
        }

def should_continue(state: AgentState):
    """
    Determines next node in flow based on whether approval is required.
    """
    if state.get("needs_approval"):
        return "action"
    return END

# Construct Graph workflow
workflow = StateGraph(AgentState)
workflow.add_node("call_model", call_model)
workflow.add_node("action", action)

workflow.add_edge(START, "call_model")
workflow.add_conditional_edges(
    "call_model",
    should_continue,
    {
        "action": "action",
        END: END
    }
)
workflow.add_edge("action", END)

# Lazy compiled graph reference
agent_graph = None

def get_agent_graph():
    """Lazily compiles the agent graph inside the running event loop."""
    global agent_graph
    if agent_graph is None:
        from checkpointer import get_checkpointer
        agent_graph = workflow.compile(
            checkpointer=get_checkpointer(),
            interrupt_before=["action"]
        )
    return agent_graph
