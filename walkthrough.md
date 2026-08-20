# AgentVault Verification & Phase Walkthrough

This document outlines the architecture, code changes, and verification steps for Phase 1 and Phase 2.

---

## Phase 2 — LangGraph Agent + PostgreSQL Checkpointer

### 1. Rationale & Approach
To deploy and monitor autonomous agents, AgentVault implements a Python-based microservice runner.
- **LangGraph Orchestration:** Reusable nodes compile into a stateful graph representing agent execution logic.
- **PostgreSQL Checkpointer:** We use `AsyncPostgresSaver` to automatically checkpoint state to database tables (`checkpoints`, `checkpoint_writes`, `checkpoint_migrations`, etc.) after every node transition.
- **Execution Resumption:** By passing `None` as the input with a configured `thread_id`, the graph seamlessly resumes from its last database checkpoint.
- **Human-In-The-Loop Approval:** The graph compiles with `interrupt_before=["action"]` to pause execution, allowing human operators to set approval (`approved: True/False`) before critical actions run.
- **Redis pub/sub Streaming:** Every node update or status transition publishes a JSON payload to a Redis channel (`agent:events:{thread_id}`) to enable real-time dashboard streaming.
- **Gemini Integration:** We integrate Gemini (`gemini-1.5-flash`) via `langchain-google-genai` as the primary LLM provider.
- **Developer Safety Fallbacks:**
  - **Mock LLM:** If `GEMINI_API_KEY` is not present, the agent automatically falls back to a deterministic Mock LLM so that the service runs locally out-of-the-box.
  - **Graceful DB Startup:** If the database connection fails during server boot (due to wrong credentials), the microservice catches the error and logs a warning rather than crashing, keeping the routes open.
  - **Windows Event Loop Policy:** On Windows, `psycopg3` (async) is incompatible with the default `ProactorEventLoop`. We created a launcher script (`run_server.py`) to force the selector loop before starting Uvicorn.

---

### 2. File Index (New Python Microservice)

The new Python runner is located in the `agent-runner/` directory:
- **[requirements.txt](file:///c:/Users/arush/OneDrive/Documents/Agentvault/agent-runner/requirements.txt):** Declares `langgraph`, `langgraph-checkpoint-postgres`, `langchain-google-genai`, `redis`, `psycopg[binary]`, `fastapi`, and `uvicorn` dependencies.
- **[redis_client.py](file:///c:/Users/arush/OneDrive/Documents/Agentvault/agent-runner/redis_client.py):** Redis connection management and publishing logic.
- **[checkpointer.py](file:///c:/Users/arush/OneDrive/Documents/Agentvault/agent-runner/checkpointer.py):** Initializes the `AsyncConnectionPool` and exposes a lazy checkpointer getter.
- **[agent.py](file:///c:/Users/arush/OneDrive/Documents/Agentvault/agent-runner/agent.py):** Defines the `AgentState`, the nodes (`call_model`, `action`), loop policies, and the compiled `agent_graph` with a mock LLM fallback.
- **[main.py](file:///c:/Users/arush/OneDrive/Documents/Agentvault/agent-runner/main.py):** Setup FastAPI endpoints for `/run`, `/approve`, and `/resume`.
- **[run_server.py](file:///c:/Users/arush/OneDrive/Documents/Agentvault/agent-runner/run_server.py):** Wrapper entrypoint to start Uvicorn inside the `WindowsSelectorEventLoopPolicy` on Windows.

---

### 3. Local Verification & Testing

#### Setting up the environment
1. Change directory to the runner: `cd agent-runner`
2. Create virtual environment: `python -m venv venv`
3. Activate virtual environment:
   - Windows (PowerShell): `.\venv\Scripts\Activate.ps1`
   - Mac/Linux: `source venv/bin/activate`
4. Install packages: `pip install -r requirements.txt`
5. Run the server: `python run_server.py`

#### Hit endpoints using Postman / cURL
The microservice runs on port `8080`.

1. **Start a new Run (`POST http://localhost:8080/run`):**
   * Body (JSON):
     ```json
     {
       "thread_id": "thread-abc-123",
       "message": "hello agent"
     }
     ```
   * Response: Output messages and `"status": "running"`.

2. **Trigger Human Approval (`POST http://localhost:8080/run`):**
   * Send a message containing "deploy":
     ```json
     {
       "thread_id": "thread-abc-123",
       "message": "please deploy my app"
     }
     ```
   * Response: `"status": "paused"`, `"needs_approval": true`, showing the run is paused before execution.

3. **Approve and Continue (`POST http://localhost:8080/approve`):**
   * Approve the run:
     ```json
     {
       "thread_id": "thread-abc-123",
       "approved": true
     }
     ```
   * Response: State is updated, checkpoint is read, and the execution completes, outputting `"[SYSTEM]: Critical deploy operation approved and executed successfully!"`.

---

## Phase 1 — Authentication, Tenant Schema & Express API

We built and fixed the core Node.js application, resolving all strict compilation and dependency issues:
- **Express Auth App:** Setup [`src/app.ts`](file:///c:/Users/arush/OneDrive/Documents/Agentvault/src/app.ts) and [`src/server.ts`](file:///c:/Users/arush/OneDrive/Documents/Agentvault/src/server.ts) to connect to Redis and PostgreSQL.
- **Authentication Routes:** Created `/auth/signup` and `/auth/login` in [`src/routes/auth.routes.ts`](file:///c:/Users/arush/OneDrive/Documents/Agentvault/src/routes/auth.routes.ts) and [`src/controllers/auth.controller.ts`](file:///c:/Users/arush/OneDrive/Documents/Agentvault/src/controllers/auth.controller.ts) using bcrypt for hashing and JWT tokens for sessions.
- **TypeScript Fixes:** Extended Express `Request` type globally in [`src/types/express.d.ts`](file:///c:/Users/arush/OneDrive/Documents/Agentvault/src/types/express.d.ts) to support the custom `user` property, and resolved index-null errors in database queries under strict compile rules.
