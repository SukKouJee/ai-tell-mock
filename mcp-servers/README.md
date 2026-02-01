# AI-TEL Mock MCP Servers

TypeScript MCP (Model Context Protocol) servers for the AI-TEL Mock System, providing mock services for metadata lookup, SQL execution, Airflow DAG management, and AI-powered chat.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                    │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│   Claude Desktop    │     uizen01 UI      │         curl / API Client       │
│   (MCP stdio)       │   (Next.js SSE)     │          (HTTP REST)            │
└─────────┬───────────┴──────────┬──────────┴──────────────┬──────────────────┘
          │                      │                         │
          │ stdio                │ HTTP                    │ HTTP
          ▼                      ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MCP Gateway (:8080)                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     Chat API (OpenAI Integration)                      │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │  POST /chat/:threadId/messages  ──▶  OpenAI GPT-4o-mini         │  │ │
│  │  │  GET  /chat/:threadId/messages      (Function Calling)           │  │ │
│  │  │  GET  /chat/:threadId/status    ◀──────────┐                     │  │ │
│  │  │  DELETE /chat/:threadId                    │                     │  │ │
│  │  │  GET  /chat/threads                        │                     │  │ │
│  │  └────────────────────────────────────────────┼─────────────────────┘  │ │
│  └───────────────────────────────────────────────┼────────────────────────┘ │
│                                                  │ Tool Calls               │
│  ┌───────────────────────────────────────────────┼────────────────────────┐ │
│  │                    MCP Tool Router                                     │ │
│  │  POST /mcp/tools/call  ───────────────────────┤                        │ │
│  │  GET  /tools                                  │                        │ │
│  │  GET  /servers                                │                        │ │
│  └───────────────────────────────────────────────┼────────────────────────┘ │
└──────────────────────────────────────────────────┼──────────────────────────┘
                                                   │
          ┌────────────────────────────────────────┼────────────────────────┐
          │                                        │                        │
          ▼                                        ▼                        ▼
┌──────────────────┐              ┌──────────────────┐        ┌──────────────────┐
│   datahub-mcp    │              │  sql-validator   │        │   airflow-mcp    │
│                  │              │      -mcp        │        │                  │
│  • search_tables │              │  • execute_sql   │        │  • generate_dag  │
│  • schema_lookup │              │  • validate_sql  │        │  • validate_dag  │
│  • get_lineage   │              │                  │        │  • register_dag  │
│  • register_     │              │                  │        │  • list_dags     │
│    lineage       │              │                  │        │  • get_dag_status│
└────────┬─────────┘              └────────┬─────────┘        └────────┬─────────┘
         │                                 │                           │
         ▼                                 ▼                           ▼
┌──────────────────┐              ┌──────────────────┐        ┌──────────────────┐
│   Mock JSON      │              │    Faker.js      │        │   File-based     │
│   Data Store     │              │    Generator     │        │   DAG Store      │
│   (IPTV Tables)  │              │   (Dynamic Data) │        │ (generated-dags/)│
└──────────────────┘              └──────────────────┘        └──────────────────┘
```

## Chat Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Chat Message Flow                                  │
└─────────────────────────────────────────────────────────────────────────────┘

User Input                    MCP Gateway                      OpenAI API
    │                              │                               │
    │  POST /chat/:threadId/       │                               │
    │       messages               │                               │
    │  {"message": "STB 테이블     │                               │
    │   검색해줘"}                 │                               │
    │─────────────────────────────▶│                               │
    │                              │                               │
    │                              │  1. Save user message         │
    │                              │     to thread                 │
    │                              │                               │
    │                              │  2. Build OpenAI request      │
    │                              │     with tools                │
    │                              │─────────────────────────────▶│
    │                              │                               │
    │                              │  3. OpenAI returns            │
    │                              │     tool_calls:               │
    │                              │     [{name:"search_tables",   │
    │                              │       args:{query:"STB"}}]    │
    │                              │◀─────────────────────────────│
    │                              │                               │
    │                              │  4. Execute MCP tools         │
    │                              │     locally                   │
    │                              │                               │
    │                 ┌────────────┼────────────┐                  │
    │                 │            │            │                  │
    │                 ▼            ▼            ▼                  │
    │          ┌──────────┐ ┌──────────┐ ┌──────────┐              │
    │          │ datahub  │ │   sql    │ │ airflow  │              │
    │          │   mcp    │ │validator │ │   mcp    │              │
    │          └────┬─────┘ └──────────┘ └──────────┘              │
    │               │                                              │
    │               │ Tool Result                                  │
    │               ▼                                              │
    │                              │                               │
    │                              │  5. Send tool results         │
    │                              │     back to OpenAI            │
    │                              │─────────────────────────────▶│
    │                              │                               │
    │                              │  6. OpenAI generates          │
    │                              │     final response            │
    │                              │◀─────────────────────────────│
    │                              │                               │
    │                              │  7. Save assistant message    │
    │                              │     to thread                 │
    │                              │                               │
    │  Response:                   │                               │
    │  {"success": true,           │                               │
    │   "threadId": "...",         │                               │
    │   "message": "STB 관련       │                               │
    │    테이블은 3개입니다...",    │                               │
    │   "toolCalls": [...]}        │                               │
    │◀─────────────────────────────│                               │
    │                              │                               │
```

## Quick Start

### 1. Install Dependencies

```bash
cd mcp-servers
npm install
```

### 2. Configure Environment

```bash
# Copy example and edit
cp packages/gateway/.env.example packages/gateway/.env

# Edit .env file
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
PORT=8080
HOST=0.0.0.0
```

### 3. Build & Run

```bash
# Build all packages
npm run build

# Start Gateway (includes all services)
npm run start -w packages/gateway
```

### 4. Verify

```bash
# Health check
curl http://localhost:8080/health

# List available tools
curl http://localhost:8080/tools

# Check chat status
curl http://localhost:8080/chat/status
```

---

## Docker

### Build & Run

Dockerfile은 **미리 빌드된 dist 폴더**를 사용합니다. Docker 이미지 빌드 전에 반드시 TypeScript 빌드를 먼저 실행해야 합니다.

```bash
# 1. TypeScript 빌드 (필수)
npm run build

# 2. Docker 이미지 빌드
docker build -t ai-tel-mook-gateway .

# 3. 컨테이너 실행
docker run -p 8080:8080 \
  -e OPENAI_API_KEY=sk-your-key \
  ai-tel-mook-gateway
```

### 왜 이런 방식인가?

- **빠른 빌드**: Docker 내에서 TypeScript 컴파일을 하지 않아 이미지 빌드 속도가 빠름
- **작은 이미지**: devDependencies 제외, 컴파일된 JS 파일만 포함
- **일관성**: 로컬에서 테스트한 동일한 빌드 결과물이 Docker에서 실행됨

### 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `OPENAI_API_KEY` | - | OpenAI API 키 (필수) |
| `OPENAI_MODEL` | gpt-4o-mini | 사용할 모델 |
| `PORT` | 8080 | 서버 포트 |
| `HOST` | 0.0.0.0 | 바인드 주소 |
| `NODE_ENV` | production | 실행 환경 |

---

## API Reference

### Base URL
```
http://localhost:8080
```

---

### Health & Status

#### GET /health
Health check endpoint.

```bash
curl http://localhost:8080/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-25T14:00:00.000Z"
}
```

#### GET /tools
List all available MCP tools.

```bash
curl http://localhost:8080/tools
```

**Response:**
```json
{
  "tools": [
    {
      "name": "search_tables",
      "description": "Search for tables by keyword",
      "inputSchema": {...}
    },
    ...
  ],
  "count": 11
}
```

#### GET /servers
List MCP server status.

```bash
curl http://localhost:8080/servers
```

**Response:**
```json
{
  "servers": [
    {"name": "sql-validator-mcp", "status": "running", "tools": 2},
    {"name": "datahub-mcp", "status": "running", "tools": 4},
    {"name": "airflow-mcp", "status": "running", "tools": 5}
  ]
}
```

---

### MCP Tool Invocation

#### POST /mcp/tools/call
Directly invoke an MCP tool.

```bash
curl -X POST http://localhost:8080/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_tables",
    "arguments": {"query": "STB"}
  }'
```

**Request Body:**
```json
{
  "tool": "string - Tool name",
  "arguments": "object - Tool arguments"
}
```

**Response:**
```json
{
  "success": true,
  "result": [...],
  "executionTimeMs": 15
}
```

---

### Chat API (Thread-based)

#### POST /chat/:threadId/messages
Send a message to a chat thread. Thread is auto-created if it doesn't exist.

```bash
curl -X POST http://localhost:8080/chat/my-thread-001/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "STB 관련 테이블 검색해줘",
    "context": {
      "page": "dashboard",
      "filters": {"status": "active"}
    }
  }'
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| message | string | Yes | User message |
| context | object | No | Additional context for AI |

**Response:**
```json
{
  "success": true,
  "threadId": "my-thread-001",
  "messageId": "msg_1706184000000_assistant",
  "message": "STB 관련 테이블은 다음과 같습니다:\n\n1. **iptv.tb_stb_5min_qual**\n   - STB 5분 단위 품질 지표 테이블\n\n2. **iptv.tb_stb_quality_daily_dist**\n   - 일별 품질 정규분포 통계 테이블\n\n3. **iptv.tb_stb_master**\n   - STB 장비 마스터 테이블",
  "toolCalls": [
    {
      "name": "search_tables",
      "result": [
        {"name": "iptv.tb_stb_5min_qual", ...},
        {"name": "iptv.tb_stb_quality_daily_dist", ...},
        {"name": "iptv.tb_stb_master", ...}
      ]
    }
  ]
}
```

#### GET /chat/:threadId/messages
Get all messages in a thread.

```bash
curl http://localhost:8080/chat/my-thread-001/messages
```

**Response:**
```json
{
  "success": true,
  "threadId": "my-thread-001",
  "messages": [
    {
      "id": "msg_1706184000000_user",
      "role": "user",
      "content": "STB 관련 테이블 검색해줘",
      "timestamp": "2026-01-25T14:00:00.000Z"
    },
    {
      "id": "msg_1706184005000_assistant",
      "role": "assistant",
      "content": "STB 관련 테이블은 다음과 같습니다...",
      "toolCalls": [...],
      "timestamp": "2026-01-25T14:00:05.000Z"
    }
  ],
  "createdAt": "2026-01-25T14:00:00.000Z",
  "updatedAt": "2026-01-25T14:00:05.000Z"
}
```

#### GET /chat/:threadId/status
Get thread status and metadata.

```bash
curl http://localhost:8080/chat/my-thread-001/status
```

**Response:**
```json
{
  "enabled": true,
  "model": "gpt-4o-mini",
  "tools": ["search_tables", "schema_lookup", "execute_sql", ...],
  "thread": {
    "id": "my-thread-001",
    "messageCount": 4,
    "createdAt": "2026-01-25T14:00:00.000Z",
    "updatedAt": "2026-01-25T14:05:00.000Z"
  }
}
```

#### DELETE /chat/:threadId
Delete a thread and all its messages.

```bash
curl -X DELETE http://localhost:8080/chat/my-thread-001
```

**Response:**
```json
{
  "success": true,
  "message": "Thread my-thread-001 deleted"
}
```

#### GET /chat/threads
List all active threads.

```bash
curl http://localhost:8080/chat/threads
```

**Response:**
```json
{
  "success": true,
  "threads": [
    {
      "id": "my-thread-001",
      "messageCount": 4,
      "createdAt": "2026-01-25T14:00:00.000Z",
      "updatedAt": "2026-01-25T14:05:00.000Z"
    },
    {
      "id": "dashboard-thread",
      "messageCount": 10,
      "createdAt": "2026-01-25T13:00:00.000Z",
      "updatedAt": "2026-01-25T14:10:00.000Z"
    }
  ],
  "total": 2
}
```

#### GET /chat/status
Global chat API status (legacy endpoint).

```bash
curl http://localhost:8080/chat/status
```

**Response:**
```json
{
  "enabled": true,
  "model": "gpt-4o-mini",
  "tools": ["search_tables", "schema_lookup", ...],
  "activeThreads": 2
}
```

#### POST /chat (Legacy)
Simple chat without thread persistence.

```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "STB 테이블 검색해줘",
    "history": [
      {"role": "user", "content": "안녕"},
      {"role": "assistant", "content": "안녕하세요!"}
    ]
  }'
```

---

## Available MCP Tools

### DataHub Tools

| Tool | Description | Arguments |
|------|-------------|-----------|
| `search_tables` | Search tables by keyword | `query`: string, `limit?`: number |
| `schema_lookup` | Get table schema details | `tableName`: string |
| `get_lineage` | Get data lineage | `datasetUrn`: string, `direction?`: upstream/downstream/both, `depth?`: number |
| `register_lineage` | Register lineage relationship | `sourceUrn`: string, `targetUrn`: string, `type?`: TRANSFORMED/DERIVED/COPIED |

### SQL Tools

| Tool | Description | Arguments |
|------|-------------|-----------|
| `execute_sql` | Execute SQL query | `sql`: string, `mode?`: plan/limit/full, `limit?`: number |
| `validate_syntax` | Validate SQL syntax | `sql`: string |

### Airflow Tools

| Tool | Description | Arguments |
|------|-------------|-----------|
| `generate_dag` | Generate DAG Python code | `dagId`: string, `schedule`: string, `startDate`: string, `tasks`: array |
| `validate_dag` | Validate DAG code | `code`: string |
| `register_dag` | Save DAG to file system | `dagId`: string, `code`: string, `overwrite?`: boolean |
| `list_dags` | List registered DAGs | `limit?`: number |
| `get_dag_status` | Get DAG run status | `dagId`: string |

---

## Mock Data (IPTV Domain)

### Available Tables

#### iptv.tb_stb_5min_qual
STB 5-minute quality metrics.

| Column | Type | Description |
|--------|------|-------------|
| collect_dt | timestamp | Collection timestamp (PK) |
| stb_model_cd | varchar(50) | STB model code (PK) |
| mlr | float | Media Loss Rate |
| jitter | float | Jitter in ms |
| ts_loss | int | TS Packet Loss |
| buffering_cnt | int | Buffering count |
| bitrate_avg | float | Average bitrate (kbps) |

#### iptv.tb_stb_quality_daily_dist
Daily quality distribution statistics.

| Column | Type | Description |
|--------|------|-------------|
| stat_date | date | Statistics date (PK) |
| stb_model_cd | varchar(50) | STB model code (PK) |
| mlr_mean | float | MLR average |
| mlr_stddev | float | MLR standard deviation |
| jitter_mean | float | Jitter average |
| jitter_stddev | float | Jitter standard deviation |

#### iptv.tb_stb_master
STB device master table.

| Column | Type | Description |
|--------|------|-------------|
| stb_id | varchar(50) | STB unique ID (PK) |
| stb_model_cd | varchar(50) | STB model code |
| customer_id | varchar(50) | Customer ID |
| install_date | date | Installation date |
| region_cd | varchar(10) | Region code |
| firmware_version | varchar(20) | Firmware version |

#### iptv.tb_channel_schedule
Channel program schedule.

| Column | Type | Description |
|--------|------|-------------|
| channel_id | varchar(20) | Channel ID (PK) |
| program_id | varchar(50) | Program ID (PK) |
| start_time | timestamp | Start time (PK) |
| end_time | timestamp | End time |
| program_name | varchar(200) | Program name |
| genre | varchar(50) | Genre |

---

## uizen01 Integration

### Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          uizen01 Web App                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────────────┐  │
│  │  ChatPanel  │───▶│   useChat   │───▶│  /api/chat/[threadId]/...   │  │
│  │    (UI)     │    │   (Hook)    │    │       (Next.js API)          │  │
│  └─────────────┘    └─────────────┘    └─────────────┬────────────────┘  │
└────────────────────────────────────────────────────────┼─────────────────┘
                                                         │ HTTP
                                                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        MCP Gateway (:8080)                                │
│                    /chat/:threadId/messages                               │
└──────────────────────────────────────────────────────────────────────────┘
```

### Setup

1. **Environment Variables** (`apps/web/.env.local`):
```env
MCP_GATEWAY_URL=http://localhost:8080
```

2. **API Routes** are already configured in:
```
apps/web/app/api/chat/
├── [threadId]/
│   ├── route.ts          # GET (status), DELETE
│   └── messages/
│       └── route.ts      # POST (message), GET (history)
└── route.ts              # Legacy endpoint
```

3. **Run both services**:
```bash
# Terminal 1: MCP Gateway
cd G:\ai\langgraph\ai_tell_mook\mcp-servers
npm run start -w packages/gateway

# Terminal 2: uizen01
cd G:\ai\froentend\uizen01
pnpm dev
```

### SSE Event Format

uizen01 API converts Gateway JSON to SSE streaming:

```
data: {"type":"message_start","data":{"id":"msg_123","role":"ai"}}

data: {"type":"tool_call","data":{"name":"search_tables","result":[...]}}

data: {"type":"message_delta","data":{"content":"STB 관련"}}

data: {"type":"message_delta","data":{"content":" 테이블은"}}

data: {"type":"message_end","data":{}}
```

---

## Example Scenarios

### Scenario 1: Search and Query Tables

```bash
# 1. Search for STB tables
curl -X POST http://localhost:8080/chat/session-1/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "STB 관련 테이블 찾아줘"}'

# 2. Get schema details
curl -X POST http://localhost:8080/chat/session-1/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "tb_stb_5min_qual 스키마 보여줘"}'

# 3. Execute SQL query
curl -X POST http://localhost:8080/chat/session-1/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "SELECT * FROM iptv.tb_stb_5min_qual LIMIT 5 실행해줘"}'
```

### Scenario 2: Create Airflow DAG

```bash
# 1. Generate DAG code
curl -X POST http://localhost:8080/chat/dag-session/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "tb_stb_5min_qual 데이터를 일별로 집계하는 DAG 만들어줘"}'

# 2. Validate DAG
curl -X POST http://localhost:8080/chat/dag-session/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "생성된 DAG 코드 검증해줘"}'

# 3. Register DAG
curl -X POST http://localhost:8080/chat/dag-session/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "DAG 등록해줘"}'
```

### Scenario 3: Data Lineage

```bash
# Get lineage for a table
curl -X POST http://localhost:8080/chat/lineage-session/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "tb_stb_quality_daily_dist의 upstream lineage 보여줘"}'
```

---

## Error Codes

| Code | Error | Description |
|------|-------|-------------|
| E001 | TABLE_NOT_FOUND | Requested table doesn't exist |
| E002 | COLUMN_NOT_FOUND | Requested column doesn't exist |
| E003 | SYNTAX_ERROR | SQL syntax is invalid |
| E004 | TIMEOUT | Operation timed out |
| E005 | DAG_EXISTS | DAG ID already registered |
| E006 | DAG_INVALID | DAG validation failed |
| CHAT_ERROR | Chat processing failed | OpenAI API or tool execution error |
| THREAD_NOT_FOUND | Thread doesn't exist | Invalid threadId |

---

## Development

### Project Structure

```
mcp-servers/
├── package.json              # Root workspace config
├── tsconfig.base.json        # Shared TypeScript config
├── packages/
│   ├── shared/               # Common types & utilities
│   │   ├── src/
│   │   │   ├── types/        # TypeScript interfaces
│   │   │   ├── mock/         # Faker.js data generators
│   │   │   └── utils/        # Logger, delay utilities
│   │   └── package.json
│   │
│   ├── sql-validator-mcp/    # SQL tools
│   │   ├── src/
│   │   │   ├── index.ts      # MCP server entry
│   │   │   └── tools/        # Tool implementations
│   │   └── package.json
│   │
│   ├── datahub-mcp/          # DataHub tools
│   │   ├── src/
│   │   │   ├── index.ts      # MCP server entry
│   │   │   ├── tools/        # Tool implementations
│   │   │   └── data/         # Mock dataset registry
│   │   └── package.json
│   │
│   ├── airflow-mcp/          # Airflow tools
│   │   ├── src/
│   │   │   ├── index.ts      # MCP server entry
│   │   │   ├── tools/        # Tool implementations
│   │   │   └── store/        # DAG storage
│   │   └── package.json
│   │
│   └── gateway/              # HTTP Gateway
│       ├── src/
│       │   ├── index.ts      # Express server
│       │   ├── router.ts     # MCP tool routing
│       │   ├── chat-router.ts # Chat API with OpenAI
│       │   └── middleware/   # Logging, error handling
│       ├── .env              # Environment variables
│       └── package.json
│
├── mock-data/                # Static mock JSON files
│   └── datahub/
│       ├── tables/           # Table schemas
│       └── lineage/          # Lineage graphs
│
└── generated-dags/           # Output directory for DAGs
```

### Commands

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Build specific package
npm run build -w packages/gateway

# Development mode (watch)
npm run dev

# Run tests
npm test

# Clean build artifacts
npm run clean

# Start gateway
npm run start -w packages/gateway
```

### Adding New Tools

1. Create tool implementation in appropriate package
2. Register in package's `tools/index.ts`
3. Add to `TOOL_HANDLERS` in `gateway/src/chat-router.ts`
4. Add OpenAI function definition in `OPENAI_TOOLS`

---

## Claude Desktop Integration

### Configuration

Copy to Claude Desktop config location:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sql-validator": {
      "command": "node",
      "args": ["G:/ai/langgraph/ai_tell_mook/mcp-servers/packages/sql-validator-mcp/dist/index.js"]
    },
    "datahub": {
      "command": "node",
      "args": ["G:/ai/langgraph/ai_tell_mook/mcp-servers/packages/datahub-mcp/dist/index.js"]
    },
    "airflow": {
      "command": "node",
      "args": ["G:/ai/langgraph/ai_tell_mook/mcp-servers/packages/airflow-mcp/dist/index.js"]
    }
  }
}
```

---

## Troubleshooting

### Gateway won't start
```bash
# Check if port 8080 is in use
netstat -ano | grep 8080

# Kill existing process (Windows)
taskkill /F /PID <PID>
```

### OPENAI_API_KEY not set
```bash
# Check .env file exists
cat packages/gateway/.env

# Verify API key format
# Should start with "sk-"
```

### Tool execution fails
```bash
# Check tool list
curl http://localhost:8080/tools

# Test tool directly
curl -X POST http://localhost:8080/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"tool": "search_tables", "arguments": {"query": "test"}}'
```

### Thread not found after restart
> Note: Thread storage is in-memory. All threads are lost when gateway restarts. For persistence, implement Redis or database storage.
