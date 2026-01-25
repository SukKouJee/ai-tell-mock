#!/usr/bin/env node
/**
 * Gateway Bridge - stdio-to-HTTP bridge for Claude Desktop
 *
 * This MCP server acts as a bridge between Claude Desktop (stdio) and
 * the HTTP Gateway (port 8080). It forwards all tool calls to the gateway.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';

// Tool definitions with full schemas
const TOOLS = [
  {
    name: 'execute_sql',
    description: 'Execute SQL query against mock database. Modes: "plan" shows execution plan only, "limit" returns limited results (default), "full" returns all results.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'SQL query to execute' },
        mode: { type: 'string', enum: ['plan', 'limit', 'full'], description: 'Execution mode', default: 'limit' },
        limit: { type: 'number', description: 'Maximum rows to return', default: 100 },
      },
      required: ['sql'],
    },
  },
  {
    name: 'validate_syntax',
    description: 'Validate SQL syntax without executing the query. Returns errors and warnings.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'SQL query to validate' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'search_tables',
    description: 'Search for tables by keyword in name, description, tags, or columns. Returns matching tables with metadata.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword (e.g., "STB", "품질", "quality")' },
        limit: { type: 'number', description: 'Maximum results', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'schema_lookup',
    description: 'Get detailed schema information for a table including columns, types, descriptions, and metadata.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tableName: { type: 'string', description: 'Table name (e.g., "iptv.tb_stb_5min_qual")' },
      },
      required: ['tableName'],
    },
  },
  {
    name: 'get_lineage',
    description: 'Get upstream and/or downstream lineage for a dataset. Shows data dependencies and transformations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetUrn: { type: 'string', description: 'Dataset URN or table name' },
        direction: { type: 'string', enum: ['upstream', 'downstream', 'both'], default: 'both' },
        depth: { type: 'number', description: 'Lineage depth (1-5)', default: 1 },
      },
      required: ['datasetUrn'],
    },
  },
  {
    name: 'register_lineage',
    description: 'Register a new lineage relationship between two datasets.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sourceUrn: { type: 'string', description: 'Source dataset URN or table name' },
        targetUrn: { type: 'string', description: 'Target dataset URN or table name' },
        type: { type: 'string', enum: ['TRANSFORMED', 'DERIVED', 'COPIED'], default: 'TRANSFORMED' },
      },
      required: ['sourceUrn', 'targetUrn'],
    },
  },
  {
    name: 'generate_dag',
    description: 'Generate Airflow DAG Python code from a configuration.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        dagId: { type: 'string', description: 'Unique DAG identifier' },
        description: { type: 'string', description: 'DAG description' },
        schedule: { type: 'string', description: 'Cron expression or preset (e.g., "@daily")' },
        startDate: { type: 'string', description: 'Start date (ISO format)' },
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
        defaultArgs: { type: 'object' },
      },
      required: ['dagId', 'schedule', 'startDate', 'tasks'],
    },
  },
  {
    name: 'validate_dag',
    description: 'Validate DAG code for common issues and best practices.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'DAG Python code to validate' },
      },
      required: ['code'],
    },
  },
  {
    name: 'register_dag',
    description: 'Validate and save a DAG to the generated-dags directory.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        dagId: { type: 'string', description: 'DAG identifier' },
        code: { type: 'string', description: 'DAG Python code' },
        overwrite: { type: 'boolean', default: false },
      },
      required: ['dagId', 'code'],
    },
  },
  {
    name: 'list_dags',
    description: 'List all registered DAGs with their metadata and status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', default: 50 },
      },
    },
  },
  {
    name: 'get_dag_status',
    description: 'Get detailed status of a DAG including recent run history.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        dagId: { type: 'string', description: 'DAG ID to get status for' },
      },
      required: ['dagId'],
    },
  },
];

interface GatewayResponse {
  success?: boolean;
  error?: boolean;
  message?: string;
  result?: unknown;
}

async function callGateway(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${GATEWAY_URL}/mcp/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, arguments: args }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gateway error: ${response.status} - ${error}`);
  }

  const data = await response.json() as GatewayResponse;

  if (data.error) {
    throw new Error(data.message || 'Unknown gateway error');
  }

  return data.result;
}

const server = new Server(
  {
    name: 'ai-tel-mook-gateway-bridge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls - forward to gateway
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await callGateway(name, (args || {}) as Record<string, unknown>);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            message: errorMessage,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Gateway Bridge connected (forwarding to ${GATEWAY_URL})`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
