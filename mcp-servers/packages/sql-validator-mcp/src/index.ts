#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createServerLogger } from '@ai-tel-mook/shared';
import { executeSqlTool, executeSql } from './tools/execute-sql.js';
import { validateSyntaxTool, validateSyntax } from './tools/validate-syntax.js';

const logger = createServerLogger('sql-validator-mcp');

const server = new Server(
  {
    name: 'sql-validator-mcp',
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
        name: executeSqlTool.name,
        description: executeSqlTool.description,
        inputSchema: executeSqlTool.inputSchema,
      },
      {
        name: validateSyntaxTool.name,
        description: validateSyntaxTool.description,
        inputSchema: validateSyntaxTool.inputSchema,
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
      case 'execute_sql':
        result = await executeSql(args as unknown as Parameters<typeof executeSql>[0]);
        break;
      case 'validate_syntax':
        result = await validateSyntax(args as unknown as Parameters<typeof validateSyntax>[0]);
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
  logger.info('Starting sql-validator-mcp server');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server connected and ready');
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
