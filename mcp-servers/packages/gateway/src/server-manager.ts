import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { createServerLogger } from '@ai-tel-mook/shared';

const logger = createServerLogger('gateway:server-manager');

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  cwd?: string;
}

export interface McpServer {
  name: string;
  process: ChildProcess | null;
  status: 'stopped' | 'starting' | 'running' | 'error';
  tools: string[];
  error?: string;
}

// Server configurations
const SERVERS_ROOT = path.resolve(process.cwd(), 'packages');

export const SERVER_CONFIGS: McpServerConfig[] = [
  {
    name: 'sql-validator',
    command: 'node',
    args: [path.join(SERVERS_ROOT, 'sql-validator-mcp', 'dist', 'index.js')],
  },
  {
    name: 'datahub',
    command: 'node',
    args: [path.join(SERVERS_ROOT, 'datahub-mcp', 'dist', 'index.js')],
  },
  {
    name: 'airflow',
    command: 'node',
    args: [path.join(SERVERS_ROOT, 'airflow-mcp', 'dist', 'index.js')],
  },
];

// Tool to server mapping
export const TOOL_SERVER_MAP: Record<string, string> = {
  // SQL Validator tools
  'execute_sql': 'sql-validator',
  'validate_syntax': 'sql-validator',
  // DataHub tools
  'search_tables': 'datahub',
  'schema_lookup': 'datahub',
  'get_lineage': 'datahub',
  'register_lineage': 'datahub',
  // Airflow tools
  'generate_dag': 'airflow',
  'validate_dag': 'airflow',
  'register_dag': 'airflow',
  'list_dags': 'airflow',
  'get_dag_status': 'airflow',
};

class ServerManager {
  private servers: Map<string, McpServer> = new Map();

  constructor() {
    // Initialize server state - all mock servers are always "running"
    // since tools are imported directly, not spawned as child processes
    for (const config of SERVER_CONFIGS) {
      this.servers.set(config.name, {
        name: config.name,
        process: null,
        status: 'running', // Mock system: always running
        tools: Object.entries(TOOL_SERVER_MAP)
          .filter(([, server]) => server === config.name)
          .map(([tool]) => tool),
      });
    }
  }

  getServerForTool(toolName: string): string | undefined {
    return TOOL_SERVER_MAP[toolName];
  }

  getServer(name: string): McpServer | undefined {
    return this.servers.get(name);
  }

  getAllServers(): McpServer[] {
    return Array.from(this.servers.values());
  }

  getAllTools(): Array<{ name: string; server: string }> {
    return Object.entries(TOOL_SERVER_MAP).map(([name, server]) => ({
      name,
      server,
    }));
  }

  async startServer(name: string): Promise<boolean> {
    const server = this.servers.get(name);
    if (!server) {
      logger.error(`Server '${name}' not found`);
      return false;
    }

    if (server.status === 'running') {
      logger.info(`Server '${name}' is already running`);
      return true;
    }

    const config = SERVER_CONFIGS.find(c => c.name === name);
    if (!config) {
      logger.error(`Config for server '${name}' not found`);
      return false;
    }

    server.status = 'starting';

    try {
      const childProcess = spawn(config.command, config.args, {
        cwd: config.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      childProcess.on('error', (error) => {
        logger.error(`Server '${name}' error: ${error.message}`);
        server.status = 'error';
        server.error = error.message;
      });

      childProcess.on('exit', (code) => {
        logger.info(`Server '${name}' exited with code ${code}`);
        server.status = 'stopped';
        server.process = null;
      });

      childProcess.stderr?.on('data', (data) => {
        logger.warn(`[${name}] ${data.toString().trim()}`);
      });

      server.process = childProcess;
      server.status = 'running';

      logger.info(`Server '${name}' started`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to start server '${name}': ${message}`);
      server.status = 'error';
      server.error = message;
      return false;
    }
  }

  async stopServer(name: string): Promise<boolean> {
    const server = this.servers.get(name);
    if (!server) {
      logger.error(`Server '${name}' not found`);
      return false;
    }

    if (!server.process) {
      logger.info(`Server '${name}' is not running`);
      return true;
    }

    try {
      server.process.kill('SIGTERM');
      server.status = 'stopped';
      server.process = null;
      logger.info(`Server '${name}' stopped`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to stop server '${name}': ${message}`);
      return false;
    }
  }

  async startAll(): Promise<void> {
    logger.info('Starting all MCP servers...');
    for (const config of SERVER_CONFIGS) {
      await this.startServer(config.name);
    }
  }

  async stopAll(): Promise<void> {
    logger.info('Stopping all MCP servers...');
    for (const config of SERVER_CONFIGS) {
      await this.stopServer(config.name);
    }
  }

  getStatus(): Record<string, { status: string; tools: string[] }> {
    const status: Record<string, { status: string; tools: string[] }> = {};
    for (const [name, server] of this.servers) {
      status[name] = {
        status: server.status,
        tools: server.tools,
      };
    }
    return status;
  }
}

export const serverManager = new ServerManager();
