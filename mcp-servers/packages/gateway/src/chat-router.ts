import { Router } from 'express';
import { createServerLogger } from '@ai-tel-mook/shared';

// Import tools
import { executeSql, validateSyntax } from '@ai-tel-mook/sql-validator-mcp/tools';
import { searchTables, schemaLookup, getLineage, registerLineageHandler } from '@ai-tel-mook/datahub-mcp/tools';
import { generateDag, validateDag, registerDag, listDags, getDagStatus } from '@ai-tel-mook/airflow-mcp/tools';

const logger = createServerLogger('gateway:chat');

// Thread-based conversation storage
interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{ name: string; result: unknown }>;
  timestamp: string;
}

interface Thread {
  id: string;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
}

// In-memory thread storage (could be replaced with Redis/DB later)
const threads: Map<string, Thread> = new Map();

// Tool handlers
const TOOL_HANDLERS: Record<string, (args: unknown) => Promise<unknown>> = {
  execute_sql: executeSql as (args: unknown) => Promise<unknown>,
  validate_syntax: validateSyntax as (args: unknown) => Promise<unknown>,
  search_tables: searchTables as (args: unknown) => Promise<unknown>,
  schema_lookup: schemaLookup as (args: unknown) => Promise<unknown>,
  get_lineage: getLineage as (args: unknown) => Promise<unknown>,
  register_lineage: registerLineageHandler as (args: unknown) => Promise<unknown>,
  generate_dag: generateDag as (args: unknown) => Promise<unknown>,
  validate_dag: validateDag as (args: unknown) => Promise<unknown>,
  register_dag: registerDag as (args: unknown) => Promise<unknown>,
  list_dags: listDags as (args: unknown) => Promise<unknown>,
  get_dag_status: getDagStatus as (args: unknown) => Promise<unknown>,
};

// OpenAI tool definitions
const OPENAI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_tables',
      description: 'Search for tables by keyword in name, description, tags, or columns',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword (e.g., "STB", "품질")' },
          limit: { type: 'number', description: 'Maximum results', default: 10 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schema_lookup',
      description: 'Get detailed schema information for a table',
      parameters: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Table name (e.g., "iptv.tb_stb_5min_qual")' },
        },
        required: ['tableName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_sql',
      description: 'Execute SQL query against mock database',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL query to execute' },
          mode: { type: 'string', enum: ['plan', 'limit', 'full'], default: 'limit' },
          limit: { type: 'number', default: 100 },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_syntax',
      description: 'Validate SQL syntax without executing',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL query to validate' },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lineage',
      description: 'Get upstream/downstream lineage for a dataset',
      parameters: {
        type: 'object',
        properties: {
          datasetUrn: { type: 'string', description: 'Dataset URN or table name' },
          direction: { type: 'string', enum: ['upstream', 'downstream', 'both'], default: 'both' },
          depth: { type: 'number', default: 1 },
        },
        required: ['datasetUrn'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_lineage',
      description: 'Register a new lineage relationship between two datasets',
      parameters: {
        type: 'object',
        properties: {
          sourceUrn: { type: 'string', description: 'Source dataset' },
          targetUrn: { type: 'string', description: 'Target dataset' },
          type: { type: 'string', enum: ['TRANSFORMED', 'DERIVED', 'COPIED'], default: 'TRANSFORMED' },
        },
        required: ['sourceUrn', 'targetUrn'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_dag',
      description: 'Generate Airflow DAG Python code',
      parameters: {
        type: 'object',
        properties: {
          dagId: { type: 'string', description: 'Unique DAG identifier' },
          description: { type: 'string' },
          schedule: { type: 'string', description: 'Cron or preset (e.g., "@daily")' },
          startDate: { type: 'string', description: 'ISO format date' },
          catchup: { type: 'boolean', default: false },
          tags: { type: 'array', items: { type: 'string' } },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                taskId: { type: 'string' },
                operator: { type: 'string' },
                params: { type: 'object' },
                dependencies: { type: 'array', items: { type: 'string' } },
              },
              required: ['taskId', 'operator', 'params'],
            },
          },
        },
        required: ['dagId', 'schedule', 'startDate', 'tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_dag',
      description: 'Validate DAG code for issues',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'DAG Python code' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_dag',
      description: 'Save a DAG to the generated-dags directory',
      parameters: {
        type: 'object',
        properties: {
          dagId: { type: 'string' },
          code: { type: 'string' },
          overwrite: { type: 'boolean', default: false },
        },
        required: ['dagId', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dags',
      description: 'List all registered DAGs',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 50 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_dag_status',
      description: 'Get DAG status and run history',
      parameters: {
        type: 'object',
        properties: {
          dagId: { type: 'string' },
        },
        required: ['dagId'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a helpful data platform assistant. You can:
- Search for tables and get schema information
- Execute SQL queries on mock data (IPTV STB quality metrics)
- View and manage data lineage
- Generate and manage Airflow DAGs

Available tables:
- iptv.tb_stb_5min_qual: STB 5분 단위 품질 지표
- iptv.tb_stb_quality_daily_dist: 일별 품질 통계
- iptv.tb_stb_master: STB 장비 마스터
- iptv.tb_channel_schedule: 채널 편성표

Respond in Korean when the user speaks Korean. Be concise and helpful.`;

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: OpenAIMessage;
    finish_reason: string;
  }>;
}

async function callOpenAI(
  messages: OpenAIMessage[],
  tools?: typeof OPENAI_TOOLS
): Promise<OpenAIResponse> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      tools: tools,
      tool_choice: tools ? 'auto' : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<OpenAIResponse>;
}

export const chatRouter = Router();

// Helper: Get or create thread
function getOrCreateThread(threadId: string): Thread {
  let thread = threads.get(threadId);
  if (!thread) {
    thread = {
      id: threadId,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    threads.set(threadId, thread);
    logger.info(`Created new thread: ${threadId}`);
  }
  return thread;
}

// Helper: Build history from thread messages
function buildHistoryFromThread(thread: Thread): Array<{ role: 'user' | 'assistant'; content: string }> {
  return thread.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-10) // Last 10 messages for context
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
}

// ============================================
// STATIC ROUTES (must be defined before dynamic :threadId routes)
// ============================================

// GET /chat/threads - List all threads
chatRouter.get('/chat/threads', (_req, res) => {
  const threadList = Array.from(threads.values()).map(t => ({
    id: t.id,
    messageCount: t.messages.length,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  return res.json({
    success: true,
    threads: threadList,
    total: threadList.length,
  });
});

// GET /chat/status - Global chat status (backward compatible)
chatRouter.get('/chat/status', (_req, res) => {
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  res.json({
    enabled: hasApiKey,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    tools: OPENAI_TOOLS.map(t => t.function.name),
    activeThreads: threads.size,
  });
});

// POST /chat - Simple chat without thread (backward compatible)
chatRouter.post('/chat', async (req, res) => {
  const { message, context, history = [] } = req.body;

  if (!message) {
    return res.status(400).json({
      error: true,
      code: 'INVALID_REQUEST',
      message: 'Missing required field: message',
    });
  }

  logger.info(`Chat request (legacy): ${message.substring(0, 50)}...`);

  try {
    // Build messages
    const contextStr = context ? `\n\nCurrent context:\n${JSON.stringify(context, null, 2)}` : '';

    const messages: OpenAIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + contextStr },
      ...history.map((h: { role: string; content: string }) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    // Call OpenAI
    let response = await callOpenAI(messages, OPENAI_TOOLS);
    let assistantMessage = response.choices[0].message;
    const toolResults: Array<{ name: string; result: unknown }> = [];

    // Handle tool calls
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const { name, arguments: argsStr } = toolCall.function;
        const args = JSON.parse(argsStr);

        logger.info(`Tool call: ${name}`);

        try {
          const handler = TOOL_HANDLERS[name];
          if (!handler) {
            throw new Error(`Unknown tool: ${name}`);
          }

          const result = await handler(args);
          toolResults.push({ name, result });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify(result),
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify({ error: errorMsg }),
          });
        }
      }

      // Get next response
      response = await callOpenAI(messages, OPENAI_TOOLS);
      assistantMessage = response.choices[0].message;
    }

    return res.json({
      success: true,
      message: assistantMessage.content,
      toolCalls: toolResults,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Chat error: ${errorMsg}`);

    return res.status(500).json({
      error: true,
      code: 'CHAT_ERROR',
      message: errorMsg,
    });
  }
});

// ============================================
// DYNAMIC ROUTES (with :threadId parameter)
// ============================================

// POST /chat/:threadId/messages - Send message to thread
chatRouter.post('/chat/:threadId/messages', async (req, res) => {
  const { threadId } = req.params;
  const { message, context } = req.body;

  if (!message) {
    return res.status(400).json({
      error: true,
      code: 'INVALID_REQUEST',
      message: 'Missing required field: message',
    });
  }

  logger.info(`Chat request [${threadId}]: ${message.substring(0, 50)}...`);

  try {
    const thread = getOrCreateThread(threadId);

    // Add user message to thread
    const userMsgId = `msg_${Date.now()}_user`;
    thread.messages.push({
      id: userMsgId,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // Build messages with history from thread
    const contextStr = context ? `\n\nCurrent context:\n${JSON.stringify(context, null, 2)}` : '';
    const history = buildHistoryFromThread(thread);

    const messages: OpenAIMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + contextStr },
      ...history.slice(0, -1), // Exclude the just-added user message (it's added below)
      { role: 'user', content: message },
    ];

    // Call OpenAI
    let response = await callOpenAI(messages, OPENAI_TOOLS);
    let assistantMessage = response.choices[0].message;
    const toolResults: Array<{ name: string; result: unknown }> = [];

    // Handle tool calls
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const { name, arguments: argsStr } = toolCall.function;
        const args = JSON.parse(argsStr);

        logger.info(`Tool call [${threadId}]: ${name}`);

        try {
          const handler = TOOL_HANDLERS[name];
          if (!handler) {
            throw new Error(`Unknown tool: ${name}`);
          }

          const result = await handler(args);
          toolResults.push({ name, result });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify(result),
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify({ error: errorMsg }),
          });
        }
      }

      // Get next response
      response = await callOpenAI(messages, OPENAI_TOOLS);
      assistantMessage = response.choices[0].message;
    }

    // Add assistant message to thread
    const assistantMsgId = `msg_${Date.now()}_assistant`;
    thread.messages.push({
      id: assistantMsgId,
      role: 'assistant',
      content: assistantMessage.content || '',
      toolCalls: toolResults.length > 0 ? toolResults : undefined,
      timestamp: new Date().toISOString(),
    });
    thread.updatedAt = new Date().toISOString();

    return res.json({
      success: true,
      threadId,
      messageId: assistantMsgId,
      message: assistantMessage.content,
      toolCalls: toolResults,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Chat error [${threadId}]: ${errorMsg}`);

    return res.status(500).json({
      error: true,
      code: 'CHAT_ERROR',
      message: errorMsg,
    });
  }
});

// GET /chat/:threadId/messages - Get all messages in thread
chatRouter.get('/chat/:threadId/messages', (req, res) => {
  const { threadId } = req.params;
  const thread = threads.get(threadId);

  if (!thread) {
    return res.status(404).json({
      error: true,
      code: 'THREAD_NOT_FOUND',
      message: `Thread ${threadId} not found`,
    });
  }

  return res.json({
    success: true,
    threadId,
    messages: thread.messages,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  });
});

// DELETE /chat/:threadId - Delete thread
chatRouter.delete('/chat/:threadId', (req, res) => {
  const { threadId } = req.params;
  const deleted = threads.delete(threadId);

  if (!deleted) {
    return res.status(404).json({
      error: true,
      code: 'THREAD_NOT_FOUND',
      message: `Thread ${threadId} not found`,
    });
  }

  logger.info(`Deleted thread: ${threadId}`);
  return res.json({
    success: true,
    message: `Thread ${threadId} deleted`,
  });
});

// GET /chat/:threadId/status - Get thread status
chatRouter.get('/chat/:threadId/status', (req, res) => {
  const { threadId } = req.params;
  const thread = threads.get(threadId);
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  return res.json({
    enabled: hasApiKey,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    tools: OPENAI_TOOLS.map(t => t.function.name),
    thread: thread ? {
      id: thread.id,
      messageCount: thread.messages.length,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    } : null,
  });
});
