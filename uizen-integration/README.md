# Uizen01 + MCP Gateway 통합 가이드

기존 Uizen01 Chat UI와 MCP Gateway를 연결하는 방법입니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                     Uizen01 Web App                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │  ChatPanel  │───▶│   useChat   │───▶│ /api/chat/...   │  │
│  │    (UI)     │    │   (Hook)    │    │   (Next.js)     │  │
│  └─────────────┘    └─────────────┘    └────────┬────────┘  │
└─────────────────────────────────────────────────┼───────────┘
                                                  │ HTTP
                                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   MCP Gateway (:8080)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Thread-based Chat API                    │   │
│  │  POST /chat/:threadId/messages  - 메시지 전송         │   │
│  │  GET  /chat/:threadId/messages  - 대화 내역 조회      │   │
│  │  GET  /chat/:threadId/status    - 스레드 상태         │   │
│  │  DELETE /chat/:threadId         - 스레드 삭제         │   │
│  │  GET  /chat/threads             - 스레드 목록         │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────┬───────────────┬────────────────────────┐  │
│  │ sql-validator│   datahub     │       airflow          │  │
│  │  - execute   │  - search     │  - generate_dag        │  │
│  │  - validate  │  - schema     │  - validate/register   │  │
│  │              │  - lineage    │  - list/status         │  │
│  └──────────────┴───────────────┴────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 설치 방법

### 1. 파일 복사

```bash
# API Routes 복사 (Thread-based)
cp -r uizen-integration/api-route/chat/* \
   /path/to/uizen01/apps/web/app/api/chat/

# 파일 구조:
# apps/web/app/api/chat/
# ├── [threadId]/
# │   ├── route.ts          # GET (status), DELETE (삭제)
# │   └── messages/
# │       └── route.ts      # POST (메시지 전송), GET (내역 조회)
# ├── threads/
# │   └── route.ts          # GET (스레드 목록)
# └── route.ts              # Legacy (단일 메시지)

# Hook 복사
cp uizen-integration/hooks/useChat.ts \
   /path/to/uizen01/packages/shared/hooks/useChat.ts
```

### 2. Hook Export 추가

`packages/shared/hooks/index.ts`:
```typescript
export * from './useChat';
```

### 3. Store 추가 (필요시)

`packages/shared/stores/useChatStore.ts`:
```typescript
import { create } from 'zustand';

interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatStore {
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  appendToMessage: (id: string, content: string) => void;
  setMessages: (threadId: string, messages: ChatMessage[]) => void;
  clearMessages: (threadId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  appendToMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + content } : m
      ),
    })),
  setMessages: (threadId, messages) =>
    set((state) => ({
      messages: [
        ...state.messages.filter((m) => m.threadId !== threadId),
        ...messages,
      ],
    })),
  clearMessages: (threadId) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.threadId !== threadId),
    })),
}));
```

### 4. 환경변수 설정

`apps/web/.env.local`:
```env
MCP_GATEWAY_URL=http://localhost:8080
```

### 5. MCP Gateway 실행

```bash
cd G:\ai\langgraph\ai_tell_mook\mcp-servers
npm run start -w packages/gateway
```

### 6. Uizen01 실행

```bash
cd /path/to/uizen01
pnpm dev
```

## 사용 예시

### 기본 사용 (자동 threadId 생성):

```tsx
import { useChat } from '@workspace/shared';

export default function ChatPage() {
  const {
    threadId,
    messages,
    sendMessage,
    clearChat,
    isStreaming,
    error,
  } = useChat({
    gatewayUrl: 'http://localhost:8080',
  });

  const handleSend = async (text: string) => {
    await sendMessage(text, {
      page: 'sample',
      filters: { status: 'active' },
    });
  };

  return (
    <div>
      <p>Thread: {threadId}</p>
      {messages.map((m) => (
        <div key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}
      {isStreaming && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={() => handleSend('STB 테이블 검색해줘')}>
        Send
      </button>
    </div>
  );
}
```

### 기존 스레드 불러오기:

```tsx
const {
  threadId,
  messages,
  sendMessage,
  loadMessages,
  threadStatus,
} = useChat({
  threadId: 'existing-thread-id',  // 기존 threadId 지정
  gatewayUrl: 'http://localhost:8080',
  autoLoad: true,  // 마운트 시 자동으로 메시지 불러오기
});
```

### 스레드 삭제:

```tsx
const { deleteThread } = useChat({ threadId: 'thread-to-delete' });

const handleDelete = async () => {
  await deleteThread();
  // 삭제 후 처리...
};
```

## API Endpoints

### Thread-based (권장)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/chat/:threadId/messages` | 스레드에 메시지 전송 |
| GET | `/api/chat/:threadId/messages` | 스레드 대화 내역 조회 |
| GET | `/api/chat/:threadId` | 스레드 상태 조회 |
| DELETE | `/api/chat/:threadId` | 스레드 삭제 |
| GET | `/api/chat/threads` | 모든 스레드 목록 |

### Legacy (하위 호환)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/chat` | 단일 메시지 (history 포함) |
| GET | `/api/chat/status` | 전역 상태 |

## 사용 가능한 기능

Chat에서 자연어로 요청하면 자동으로 적절한 Tool이 호출됩니다:

| 요청 예시 | 호출되는 Tool |
|----------|--------------|
| "STB 관련 테이블 찾아줘" | `search_tables` |
| "tb_stb_5min_qual 스키마 보여줘" | `schema_lookup` |
| "SELECT * FROM iptv.tb_stb_5min_qual LIMIT 5" | `execute_sql` |
| "이 쿼리 문법 검사해줘" | `validate_syntax` |
| "tb_stb_5min_qual의 lineage 보여줘" | `get_lineage` |
| "일별 집계 DAG 만들어줘" | `generate_dag` |
| "등록된 DAG 목록 보여줘" | `list_dags` |

## curl 테스트

```bash
# 새 스레드에 메시지 전송
curl -X POST http://localhost:8080/chat/my-thread/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "STB 테이블 검색해줘"}'

# 스레드 대화 내역 조회
curl http://localhost:8080/chat/my-thread/messages

# 스레드 상태 조회
curl http://localhost:8080/chat/my-thread/status

# 모든 스레드 목록
curl http://localhost:8080/chat/threads

# 스레드 삭제
curl -X DELETE http://localhost:8080/chat/my-thread
```

## 트러블슈팅

### Gateway 연결 오류
```
Error: Gateway error: ECONNREFUSED
```
→ MCP Gateway가 실행 중인지 확인: `curl http://localhost:8080/health`

### OpenAI API 오류
```
Error: OPENAI_API_KEY environment variable is not set
```
→ Gateway의 `.env` 파일에 `OPENAI_API_KEY` 설정 확인

### Tool 호출 실패
```
Error: Unknown tool: xxx
```
→ Gateway에서 지원하는 tool 목록 확인: `curl http://localhost:8080/tools`

### 스레드를 찾을 수 없음
```
Error: Thread xxx not found
```
→ 스레드가 삭제되었거나 서버 재시작됨 (현재 in-memory 저장)
