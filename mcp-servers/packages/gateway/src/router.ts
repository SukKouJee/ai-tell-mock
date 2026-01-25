import { Router } from 'express';
import { createServerLogger } from '@ai-tel-mook/shared';
import { serverManager, TOOL_SERVER_MAP } from './server-manager.js';

// Import tools from MCP packages
import { executeSql, validateSyntax } from '@ai-tel-mook/sql-validator-mcp/tools';
import { searchTables, schemaLookup, getLineage, registerLineageHandler } from '@ai-tel-mook/datahub-mcp/tools';
import { generateDag, validateDag, registerDag, listDags, getDagStatus } from '@ai-tel-mook/airflow-mcp/tools';

const logger = createServerLogger('gateway:router');

// Tool handler mapping
const TOOL_HANDLERS: Record<string, (args: unknown) => Promise<unknown>> = {
  // SQL Validator
  execute_sql: executeSql as (args: unknown) => Promise<unknown>,
  validate_syntax: validateSyntax as (args: unknown) => Promise<unknown>,
  // DataHub
  search_tables: searchTables as (args: unknown) => Promise<unknown>,
  schema_lookup: schemaLookup as (args: unknown) => Promise<unknown>,
  get_lineage: getLineage as (args: unknown) => Promise<unknown>,
  register_lineage: registerLineageHandler as (args: unknown) => Promise<unknown>,
  // Airflow
  generate_dag: generateDag as (args: unknown) => Promise<unknown>,
  validate_dag: validateDag as (args: unknown) => Promise<unknown>,
  register_dag: registerDag as (args: unknown) => Promise<unknown>,
  list_dags: listDags as (args: unknown) => Promise<unknown>,
  get_dag_status: getDagStatus as (args: unknown) => Promise<unknown>,
};

export const router = Router();

// Health check
router.get('/health', (_req, res) => {
  const status = serverManager.getStatus();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    servers: status,
  });
});

// List all available tools
router.get('/tools', (_req, res) => {
  const tools = serverManager.getAllTools();
  res.json({
    tools: tools.map(t => ({
      name: t.name,
      server: t.server,
    })),
    total: tools.length,
  });
});

// Get server status
router.get('/servers', (_req, res) => {
  const servers = serverManager.getAllServers();
  res.json({
    servers: servers.map(s => ({
      name: s.name,
      status: s.status,
      tools: s.tools,
      error: s.error,
    })),
  });
});

// Direct tool invocation
router.post('/mcp/tools/call', async (req, res) => {
  const { tool, arguments: args } = req.body;

  if (!tool) {
    return res.status(400).json({
      error: true,
      code: 'INVALID_REQUEST',
      message: 'Missing required field: tool',
    });
  }

  const serverName = TOOL_SERVER_MAP[tool];
  if (!serverName) {
    return res.status(404).json({
      error: true,
      code: 'TOOL_NOT_FOUND',
      message: `Unknown tool: ${tool}`,
      availableTools: Object.keys(TOOL_SERVER_MAP),
    });
  }

  const handler = TOOL_HANDLERS[tool];
  if (!handler) {
    return res.status(500).json({
      error: true,
      code: 'HANDLER_NOT_FOUND',
      message: `Handler not implemented for tool: ${tool}`,
    });
  }

  logger.info(`Tool call: ${tool} via ${serverName}`);

  try {
    const result = await handler(args || {});
    return res.json({
      success: true,
      tool,
      server: serverName,
      result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as { code?: string }).code ?? 'EXECUTION_ERROR';

    logger.error(`Tool error: ${errorMessage}`);

    return res.status(500).json({
      error: true,
      code: errorCode,
      message: errorMessage,
      tool,
      server: serverName,
    });
  }
});

// MCP message handler (SSE endpoint)
router.post('/mcp/messages', async (req, res) => {
  const { method, params } = req.body;

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    if (method === 'tools/list') {
      const tools = serverManager.getAllTools();
      const response = {
        jsonrpc: '2.0',
        id: req.body.id,
        result: {
          tools: tools.map(t => ({
            name: t.name,
            description: `Tool from ${t.server} server`,
            inputSchema: { type: 'object' },
          })),
        },
      };
      res.write(`data: ${JSON.stringify(response)}\n\n`);
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      const handler = TOOL_HANDLERS[name];

      if (!handler) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`,
          },
        };
        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      } else {
        const result = await handler(args || {});
        const response = {
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
        res.write(`data: ${JSON.stringify(response)}\n\n`);
      }
    } else {
      const errorResponse = {
        jsonrpc: '2.0',
        id: req.body.id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResponse = {
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32603,
        message: errorMessage,
      },
    };
    res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
  }

  res.end();
});
