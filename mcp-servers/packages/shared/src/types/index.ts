import { z } from 'zod';

// SQL Types
export interface SqlColumn {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
  isPrimaryKey?: boolean;
}

export interface SqlTable {
  name: string;
  schema: string;
  fullName: string;
  columns: SqlColumn[];
  description?: string;
  tags?: string[];
}

export interface SqlExecutionResult {
  success: boolean;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  mode: 'plan' | 'limit' | 'full';
}

export interface SqlValidationResult {
  valid: boolean;
  errors: SqlError[];
  warnings: SqlWarning[];
}

export interface SqlError {
  code: string;
  message: string;
  line?: number;
  column?: number;
}

export interface SqlWarning {
  code: string;
  message: string;
  suggestion?: string;
}

// DataHub Types
export interface DatasetSchema {
  urn: string;
  name: string;
  platform: string;
  schema: string;
  columns: SqlColumn[];
  description?: string;
  tags?: string[];
  owners?: string[];
  lastModified?: string;
}

export interface LineageEdge {
  sourceUrn: string;
  targetUrn: string;
  type: 'TRANSFORMED' | 'DERIVED' | 'COPIED';
  createdAt?: string;
}

export interface LineageGraph {
  dataset: string;
  upstream: LineageNode[];
  downstream: LineageNode[];
}

export interface LineageNode {
  urn: string;
  name: string;
  platform: string;
  type: string;
  distance: number;
}

export interface SearchResult {
  urn: string;
  name: string;
  platform: string;
  schema: string;
  description?: string;
  matchedFields: string[];
}

// Airflow Types
export interface DagConfig {
  dagId: string;
  description?: string;
  schedule: string;
  startDate: string;
  catchup?: boolean;
  tags?: string[];
  tasks: DagTask[];
  defaultArgs?: Record<string, unknown>;
}

export interface DagTask {
  taskId: string;
  operator: string;
  params: Record<string, unknown>;
  dependencies?: string[];
}

export interface DagInfo {
  dagId: string;
  description?: string;
  schedule: string;
  isPaused: boolean;
  lastRun?: DagRunInfo;
  filePath: string;
  createdAt: string;
}

export interface DagRunInfo {
  runId: string;
  state: 'success' | 'failed' | 'running' | 'queued';
  startDate: string;
  endDate?: string;
  executionDate: string;
}

export interface DagValidationResult {
  valid: boolean;
  errors: DagError[];
  warnings: DagWarning[];
}

export interface DagError {
  code: string;
  message: string;
  taskId?: string;
}

export interface DagWarning {
  code: string;
  message: string;
  suggestion?: string;
}

// Error Codes
export const ErrorCodes = {
  TABLE_NOT_FOUND: 'E001',
  COLUMN_NOT_FOUND: 'E002',
  SYNTAX_ERROR: 'E003',
  TIMEOUT: 'E004',
  DAG_EXISTS: 'E005',
  DAG_INVALID: 'E006',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// Zod Schemas for Validation
export const SqlExecuteModeSchema = z.enum(['plan', 'limit', 'full']);
export type SqlExecuteMode = z.infer<typeof SqlExecuteModeSchema>;

export const ExecuteSqlInputSchema = z.object({
  sql: z.string().min(1, 'SQL query is required'),
  mode: SqlExecuteModeSchema.default('limit'),
  limit: z.number().int().positive().optional().default(100),
});

export const ValidateSyntaxInputSchema = z.object({
  sql: z.string().min(1, 'SQL query is required'),
});

export const SearchTablesInputSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  limit: z.number().int().positive().optional().default(10),
});

export const SchemaLookupInputSchema = z.object({
  tableName: z.string().min(1, 'Table name is required'),
});

export const GetLineageInputSchema = z.object({
  datasetUrn: z.string().min(1, 'Dataset URN is required'),
  direction: z.enum(['upstream', 'downstream', 'both']).default('both'),
  depth: z.number().int().positive().max(5).optional().default(1),
});

export const RegisterLineageInputSchema = z.object({
  sourceUrn: z.string().min(1, 'Source URN is required'),
  targetUrn: z.string().min(1, 'Target URN is required'),
  type: z.enum(['TRANSFORMED', 'DERIVED', 'COPIED']).default('TRANSFORMED'),
});

export const DagTaskSchema = z.object({
  taskId: z.string().min(1),
  operator: z.string().min(1),
  params: z.record(z.unknown()),
  dependencies: z.array(z.string()).optional(),
});

export const GenerateDagInputSchema = z.object({
  dagId: z.string().min(1, 'DAG ID is required').regex(/^[a-z][a-z0-9_]*$/, 'DAG ID must start with lowercase letter and contain only lowercase letters, numbers, and underscores'),
  description: z.string().optional(),
  schedule: z.string().min(1, 'Schedule is required'),
  startDate: z.string().min(1, 'Start date is required'),
  catchup: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional(),
  tasks: z.array(DagTaskSchema).min(1, 'At least one task is required'),
  defaultArgs: z.record(z.unknown()).optional(),
});

export const ValidateDagInputSchema = z.object({
  code: z.string().min(1, 'DAG code is required'),
});

export const RegisterDagInputSchema = z.object({
  dagId: z.string().min(1, 'DAG ID is required'),
  code: z.string().min(1, 'DAG code is required'),
  overwrite: z.boolean().optional().default(false),
});

export const ListDagsInputSchema = z.object({
  limit: z.number().int().positive().optional().default(50),
});

export const GetDagStatusInputSchema = z.object({
  dagId: z.string().min(1, 'DAG ID is required'),
});
