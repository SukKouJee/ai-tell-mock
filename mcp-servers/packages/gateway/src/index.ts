#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServerLogger } from '@ai-tel-mook/shared';
import { router } from './router.js';
import { chatRouter } from './chat-router.js';
import { requestLogger } from './middleware/logging.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const logger = createServerLogger('gateway');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Routes
app.use('/', router);
app.use('/', chatRouter);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'MCP Gateway',
    version: '1.0.0',
    description: 'HTTP Gateway for AI-TEL Mock MCP Servers',
    endpoints: {
      health: 'GET /health',
      tools: 'GET /tools',
      servers: 'GET /servers',
      toolCall: 'POST /mcp/tools/call',
      mcpMessages: 'POST /mcp/messages',
      // Thread-based chat API
      chatThreadMessages: 'POST /chat/:threadId/messages',
      chatThreadGet: 'GET /chat/:threadId/messages',
      chatThreadStatus: 'GET /chat/:threadId/status',
      chatThreadDelete: 'DELETE /chat/:threadId',
      chatThreadList: 'GET /chat/threads',
      // Legacy (backward compatible)
      chat: 'POST /chat',
      chatStatus: 'GET /chat/status',
    },
    documentation: {
      toolCall: {
        description: 'Invoke an MCP tool directly',
        body: {
          tool: 'string - Tool name (e.g., "execute_sql")',
          arguments: 'object - Tool arguments',
        },
        example: {
          tool: 'search_tables',
          arguments: { query: 'STB 품질' },
        },
      },
    },
  });
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, HOST, () => {
  logger.info(`MCP Gateway started on http://${HOST}:${PORT}`);
  logger.info('Available endpoints:');
  logger.info('  GET  /              - API info');
  logger.info('  GET  /health        - Health check');
  logger.info('  GET  /tools         - List available tools');
  logger.info('  GET  /servers       - List MCP servers');
  logger.info('  POST /mcp/tools/call - Invoke tool');
  logger.info('  POST /mcp/messages   - MCP protocol handler');
  logger.info('  POST /chat          - Chat with AI (requires OPENAI_API_KEY)');
  logger.info('  GET  /chat/status   - Chat API status');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down...');
  process.exit(0);
});
