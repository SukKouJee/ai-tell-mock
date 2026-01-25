#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createServerLogger } from '@ai-tel-mook/shared';
import { generateDagTool, generateDag } from './tools/generate-dag.js';
import { validateDagTool, validateDag } from './tools/validate-dag.js';
import { registerDagTool, registerDag } from './tools/register-dag.js';
import { listDagsTool, listDags } from './tools/list-dags.js';
import { getDagStatusTool, getDagStatus } from './tools/get-dag-status.js';

const logger = createServerLogger('airflow-mcp');

const server = new Server(
  {
    name: 'airflow-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug('Listing tools');
  return {
    tools: [
      {
        name: generateDagTool.name,
        description: generateDagTool.description,
        inputSchema: generateDagTool.inputSchema,
      },
      {
        name: validateDagTool.name,
        description: validateDagTool.description,
        inputSchema: validateDagTool.inputSchema,
      },
      {
        name: registerDagTool.name,
        description: registerDagTool.description,
        inputSchema: registerDagTool.inputSchema,
      },
      {
        name: listDagsTool.name,
        description: listDagsTool.description,
        inputSchema: listDagsTool.inputSchema,
      },
      {
        name: getDagStatusTool.name,
        description: getDagStatusTool.description,
        inputSchema: getDagStatusTool.inputSchema,
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info(`Tool call: ${name}`);

  try {
    let result: unknown;

    switch (name) {
      case 'generate_dag':
        result = await generateDag(args as unknown as Parameters<typeof generateDag>[0]);
        break;
      case 'validate_dag':
        result = await validateDag(args as unknown as Parameters<typeof validateDag>[0]);
        break;
      case 'register_dag':
        result = await registerDag(args as unknown as Parameters<typeof registerDag>[0]);
        break;
      case 'list_dags':
        result = await listDags((args ?? {}) as unknown as Parameters<typeof listDags>[0]);
        break;
      case 'get_dag_status':
        result = await getDagStatus(args as unknown as Parameters<typeof getDagStatus>[0]);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

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
    const errorCode = (error as { code?: string }).code ?? 'UNKNOWN_ERROR';

    logger.error(`Tool error: ${errorMessage}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            code: errorCode,
            message: errorMessage,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  logger.info('Starting airflow-mcp server');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server connected and ready');
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
