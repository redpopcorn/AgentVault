# AgentVault - Project Context
"AgentVault is a multi-tenant platform for deploying and monitoring long-running AI agents. The problem it solves is that teams running autonomous agents have no visibility into what the agent is doing mid-execution — they can't tell if it's stuck, making a bad decision, or needs human input. AgentVault gives teams real-time streaming of every agent step via WebSockets, lets humans pause and approve critical decisions, and isolates each agent run in a Docker container with state checkpointed to PostgreSQL so agents can survive crashes and resume exactly where they left off."
## What This Is
Multi-tenant AI agent orchestration platform.
Users belong to tenants (workspaces) with RBAC roles.
Agents run as isolated Docker containers, orchestrated by LangGraph.

## Current Phase
Phase 1 — Auth + Tenant Model + PostgreSQL Schema

## Tech Stack
- Node.js + Express + TypeScript (backend API)
- Python + LangGraph (agent runner — Phase 2)
- PostgreSQL (primary database)
- Redis (refresh tokens, access token blacklist, rate limiting, pub/sub)
- AWS SQS, S3, ECR, ECS (Phase 4-5)
- Next.js (frontend — Phase 6)

## Architecture Decisions Made
- Shared schema multi-tenancy (tenant_id on join table, not separate schemas)
- RBAC roles: admin / member / viewer — stored on tenant_members, not users
- JWT strategy: access token (15min) + refresh token (7d)
- JWT payload contains: { userId, tenantId, role }
- Refresh tokens stored in Redis with TTL (not PostgreSQL)
- Access token blacklist in Redis on role change/logout
- Token version strategy rejected — Redis blacklist chosen instead
- Raw pg (node-postgres) for DB queries, no ORM
- Single Pool instance exported from db.ts, shared across all query files
- Named exports throughout (no default exports)
- Path aliases configured: @config, @controllers, @middleware, @routes, @db, @utils

## Database Schema (db/schema.sql)
- tenants: id, companyname, slug (unique), created_at
- users: id, username, email (unique), password_hash, created_at
- tenant_members: id, tenant_id (FK cascade), user_id (FK cascade),
  role CHECK('admin','member','viewer'), created_at, UNIQUE(tenant_id, user_id)
- No refresh_tokens table — Redis handles this

## Files Built
- [x] tsconfig.json — strict mode, commonjs, path aliases, outDir: dist
- [x] .env — PORT, DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, REDIS_URL
- [x] .gitignore — .env, dist, node_modules
- [x] src/config/env.ts — requireEnv validation, fails fast on missing vars
- [x] src/config/db.ts — single Pool instance, connectionString from env
- [x] src/utils/hash.ts — hashPassword, comparePassword (bcrypt, 10 rounds)
- [x] src/utils/jwt.ts — generateAccessToken, generateRefreshToken,
                          verifyAccessToken, verifyRefreshToken
                          JwtPayload interface: { userId, tenantId, role }

## In Progress
- [ ] src/middleware/authenticate.ts
- [ ] src/middleware/authorize.ts
- [ ] src/db/queries/user.queries.ts
- [ ] src/db/queries/tenant.queries.ts
- [ ] src/controllers/auth.controller.ts
- [ ] src/routes/auth.routes.ts
- [ ] src/app.ts
- [ ] src/server.ts

## Request Flow
Request
  → app.ts (Express setup)
  → routes/auth.routes.ts (URL matching)
  → middleware/authenticate.ts (verify JWT, attach req.user)
  → middleware/authorize.ts (check role)
  → controllers/auth.controller.ts (business logic)
  → db/queries/user.queries.ts (SQL)
  → Response

## Key Patterns To Follow
- Never write SQL in controllers — only in db/queries/
- Never use process.env directly — always import from @config/env
- Never use `any` type — define interfaces
- All async route handlers need try/catch
- verifyAccessToken throws on expiry/tamper — always wrap in try/catch

## Current Problem
Building authenticate.ts middleware next. it is done