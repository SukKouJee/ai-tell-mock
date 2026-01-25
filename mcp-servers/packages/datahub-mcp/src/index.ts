#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createServerLogger } from '@ai-tel-mook/shared';
import { searchTablesTool, searchTables } from './tools/search-tables.js';
import { schemaLookupTool, schemaLookup } from './tools/schema-lookup.js';
import { getLineageTool, getLineage } from './tools/get-lineage.js';
import { registerLineageTool, registerLineageHandler } from './tools/register-lineage.js';

const logger = createServerLogger('datahub-mcp');

const server = new Server(
  {
    name: 'datahub-mcp',
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
        name: searchTablesTool.name,
        description: searchTablesTool.description,
        inputSchema: searchTablesTool.inputSchema,
      },
      {
        name: schemaLookupTool.name,
        description: schemaLookupTool.description,
        inputSchema: schemaLookupTool.inputSchema,
      },
      {
        name: getLineageTool.name,
        description: getLineageTool.description,
        inputSchema: getLineageTool.inputSchema,
      },
      {
        name: registerLineageTool.name,
        description: registerLineageTool.description,
        inputSchema: registerLineageTool.inputSchema,
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
      case 'search_tables':
        result = await searchTables(args as unknown as Parameters<typeof searchTables>[0]);
        break;
      case 'schema_lookup':
        result = await schemaLookup(args as unknown as Parameters<typeof schemaLookup>[0]);
        break;
      case 'get_lineage':
        result = await getLineage(args as unknown as Parameters<typeof getLineage>[0]);
        break;
      case 'register_lineage':
        result = await registerLineageHandler(args as unknown as Parameters<typeof registerLineageHandler>[0]);
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
  logger.info('Starting datahub-mcp server');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Server connected and ready');
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
