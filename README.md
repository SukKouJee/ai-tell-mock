# AI-TEL Mock System

AI-TEL Mock System은 IPTV/STB 도메인을 위한 Mock MCP(Model Context Protocol) 서버 시스템입니다. 메타데이터 조회, SQL 실행, Airflow DAG 관리 및 AI 기반 채팅 기능을 제공합니다.

## Overview

이 프로젝트는 두 가지 주요 컴포넌트로 구성됩니다:

1. **MCP Servers** (TypeScript) - Mock 서비스 제공
   - DataHub 메타데이터 조회
   - SQL 실행 및 검증
   - Airflow DAG 생성/관리
   - AI 채팅 (OpenAI 연동)

2. **crewAI Agents** (Python) - 멀티 에이전트 시스템 (선택적)
   - 복잡한 태스크 오케스트레이션
   - 에이전트 협업

---

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

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- OpenAI API Key

### 1. Clone & Install

```bash
git clone https://github.com/SukKouJee/ai-tell-mock.git
cd ai-tell-mock/mcp-servers
npm install
```

### 2. Configure Environment

```bash
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

# Start Gateway
npm run start -w packages/gateway
```

### 4. Verify

```bash
# Health check
curl http://localhost:8080/health

# List tools
curl http://localhost:8080/tools

# Test chat
curl -X POST http://localhost:8080/chat/test-thread/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "STB 테이블 검색해줘"}'
```

---

## Docker로 실행하기

### 1. Docker 이미지 빌드

```bash
cd mcp-servers
docker build -t ai-tel-mock-gateway .
```

### 2. Docker 컨테이너 실행

```bash
# 환경변수를 직접 전달
docker run -d \
  --name mcp-gateway \
  -p 8080:8080 \
  -e OPENAI_API_KEY=sk-your-openai-api-key \
  -e OPENAI_MODEL=gpt-4o-mini \
  ai-tel-mock-gateway

# 또는 .env 파일 사용
docker run -d \
  --name mcp-gateway \
  -p 8080:8080 \
  --env-file packages/gateway/.env \
  ai-tel-mock-gateway
```

### 3. Docker Compose (선택사항)

`docker-compose.yml` 파일 생성:

```yaml
version: '3.8'
services:
  mcp-gateway:
    build: ./mcp-servers
    container_name: mcp-gateway
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PORT=8080
      - HOST=0.0.0.0
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_MODEL=gpt-4o-mini
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    restart: unless-stopped
```

실행:
```bash
# .env 파일에 OPENAI_API_KEY 설정 후
docker-compose up -d
```

### 4. 컨테이너 관리

```bash
# 로그 확인
docker logs -f mcp-gateway

# 컨테이너 중지
docker stop mcp-gateway

# 컨테이너 제거
docker rm mcp-gateway

# Health 체크
curl http://localhost:8080/health
```

---

## Chat Flow

```
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
    │   "message": "STB 관련       │                               │
    │    테이블은 3개입니다..."}    │                               │
    │◀─────────────────────────────│                               │
```

---

## API Reference

### Base URL
```
http://localhost:8080
```

### Health & Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/tools` | GET | List all MCP tools |
| `/servers` | GET | List MCP server status |

### Chat API (Thread-based)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat/:threadId/messages` | POST | Send message to thread |
| `/chat/:threadId/messages` | GET | Get thread history |
| `/chat/:threadId/status` | GET | Get thread status |
| `/chat/:threadId` | DELETE | Delete thread |
| `/chat/threads` | GET | List all threads |
| `/chat/status` | GET | Global chat status |

### MCP Tools

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp/tools/call` | POST | Invoke MCP tool directly |

---

## Available MCP Tools

### DataHub Tools

| Tool | Description |
|------|-------------|
| `search_tables` | Search tables by keyword |
| `schema_lookup` | Get table schema details |
| `get_lineage` | Get data lineage |
| `register_lineage` | Register lineage relationship |

### SQL Tools

| Tool | Description |
|------|-------------|
| `execute_sql` | Execute SQL query |
| `validate_syntax` | Validate SQL syntax |

### Airflow Tools

| Tool | Description |
|------|-------------|
| `generate_dag` | Generate DAG Python code |
| `validate_dag` | Validate DAG code |
| `register_dag` | Save DAG to file system |
| `list_dags` | List registered DAGs |
| `get_dag_status` | Get DAG run status |

---

## Mock Data (IPTV Domain)

### Available Tables

| Table | Description |
|-------|-------------|
| `iptv.tb_stb_5min_qual` | STB 5분 품질 지표 |
| `iptv.tb_stb_quality_daily_dist` | 일별 품질 분포 통계 |
| `iptv.tb_stb_master` | STB 장비 마스터 |
| `iptv.tb_channel_schedule` | 채널 편성표 |

### Sample Schema: tb_stb_5min_qual

| Column | Type | Description |
|--------|------|-------------|
| collect_dt | timestamp | 수집일시 (PK) |
| stb_model_cd | varchar(50) | 장비모델코드 (PK) |
| mlr | float | Media Loss Rate |
| jitter | float | Jitter (ms) |
| ts_loss | int | TS Packet Loss |
| buffering_cnt | int | 버퍼링 횟수 |
| bitrate_avg | float | 평균 비트레이트 (kbps) |

---

## Example Usage

### Search and Query

```bash
# Search tables
curl -X POST http://localhost:8080/chat/session-1/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "STB 관련 테이블 찾아줘"}'

# Get schema
curl -X POST http://localhost:8080/chat/session-1/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "tb_stb_5min_qual 스키마 보여줘"}'

# Execute SQL
curl -X POST http://localhost:8080/chat/session-1/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "SELECT * FROM iptv.tb_stb_5min_qual LIMIT 5"}'
```

### Create DAG

```bash
curl -X POST http://localhost:8080/chat/dag-session/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "tb_stb_5min_qual 데이터를 일별로 집계하는 DAG 만들어줘"}'
```

---

## Project Structure

```
ai-tell-mock/
├── mcp-servers/                 # TypeScript MCP System
│   ├── packages/
│   │   ├── shared/              # Common types & utilities
│   │   ├── gateway/             # HTTP Gateway (port 8080)
│   │   ├── sql-validator-mcp/   # SQL tools
│   │   ├── datahub-mcp/         # DataHub tools
│   │   └── airflow-mcp/         # Airflow tools
│   └── mock-data/               # Static mock JSON files
│
├── src/ai_tell_mook/            # Python crewAI (optional)
│   ├── config/
│   │   ├── agents.yaml
│   │   └── tasks.yaml
│   ├── crew.py
│   └── main.py
│
├── uizen-integration/           # uizen01 UI integration
│   ├── hooks/useChat.ts
│   └── api-route/
│
├── generated-dags/              # Output directory for DAGs
└── README.md
```

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
                              MCP Gateway (:8080)
```

### Setup

```bash
# Terminal 1: MCP Gateway
cd mcp-servers && npm run start -w packages/gateway

# Terminal 2: uizen01
cd /path/to/uizen01 && pnpm dev
```

Set in `apps/web/.env.local`:
```env
MCP_GATEWAY_URL=http://localhost:8080
```

---

## Claude Desktop Integration

Add to `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

## crewAI (Optional)

Python crewAI 멀티 에이전트 시스템을 사용하려면:

### Prerequisites
- Python >=3.10 <3.14
- UV package manager

### Setup

```bash
pip install uv
crewai install
```

### Run

```bash
crewai run
```

### Configuration

- `src/ai_tell_mook/config/agents.yaml` - 에이전트 정의
- `src/ai_tell_mook/config/tasks.yaml` - 태스크 정의
- `.env` - `OPENAI_API_KEY` 설정

---

## Troubleshooting

### Port 8080 in use
```bash
netstat -ano | findstr 8080
taskkill /F /PID <PID>
```

### OPENAI_API_KEY not set
```bash
# Verify .env file
cat mcp-servers/packages/gateway/.env
```

### Thread not found after restart
> Thread storage is in-memory. All threads are lost when gateway restarts.

---

## License

MIT

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request
