/**
 * Next.js API Route for MCP Gateway Chat
 *
 * 이 파일을 복사해서 사용:
 * apps/web/app/api/chat/route.ts
 */
import { NextRequest, NextResponse } from 'next/server';

const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || 'http://localhost:8080';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Tool definitions for OpenAI function calling
const TOOLS = [
  {
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                taskId: { type: 'string' },
                operator: { type: 'string' },
                params: { type: 'object' },
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
    type: 'function' as const,
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
    type: 'function' as const,
    function: {
      name: 'get_dag_status',
      description: 'Get DAG status and run history',
      parameters: {
        type: 'object',
        properties: {
          dagId: { type: 'string', description: 'DAG ID' },
        },
        required: ['dagId'],
      },
    },
  },
];

// Call MCP Gateway tool
async function callMcpTool(toolName: string, args: Record<string, unknown>) {
  const response = await fetch(`${MCP_GATEWAY_URL}/mcp/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: toolName, arguments: args }),
  });

  if (!response.ok) {
    throw new Error(`Gateway error: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.message || 'Unknown error');
  }

  return data.result;
}

// Call OpenAI API
async function callOpenAI(messages: Array<{ role: string; content: string; tool_call_id?: string; name?: string }>, tools?: typeof TOOLS) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: tools ? 'auto' : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function POST(request: NextRequest) {
  try {
    const { message, context, history = [] } = await request.json();

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Build messages array
    const systemPrompt = `You are a helpful data platform assistant. You can:
- Search for tables and get schema information
- Execute SQL queries on mock data
- View and manage data lineage
- Generate and manage Airflow DAGs

Available tables are in the IPTV domain (STB quality metrics).
Respond in Korean when the user speaks Korean.

${context ? `Current context:\n${JSON.stringify(context, null, 2)}` : ''}`;

    const messages: Array<{ role: string; content: string; tool_call_id?: string; name?: string }> = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];

    // First call to OpenAI
    let response = await callOpenAI(messages, TOOLS);
    let assistantMessage = response.choices[0].message;

    // Handle tool calls
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const { name, arguments: argsStr } = toolCall.function;
        const args = JSON.parse(argsStr);

        try {
          const result = await callMcpTool(name, args);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify(result),
          });
        } catch (error) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify({ error: String(error) }),
          });
        }
      }

      // Get next response
      response = await callOpenAI(messages, TOOLS);
      assistantMessage = response.choices[0].message;
    }

    return NextResponse.json({
      message: assistantMessage.content,
      toolCalls: messages.filter(m => m.role === 'tool').map(m => ({
        name: m.name,
        result: m.content,
      })),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
