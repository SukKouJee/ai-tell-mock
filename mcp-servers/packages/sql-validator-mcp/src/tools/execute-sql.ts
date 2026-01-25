import {
  ExecuteSqlInputSchema,
  SqlExecutionResult,
  ErrorCodes,
  generateMockRows,
  extractTableFromSql,
  extractColumnsFromSql,
  extractLimitFromSql,
  getTableSchema,
  getAllTableNames,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';

export interface ExecuteSqlInput {
  sql: string;
  mode?: 'plan' | 'limit' | 'full';
  limit?: number;
}

export async function executeSql(input: ExecuteSqlInput): Promise<SqlExecutionResult> {
  const startTime = Date.now();

  // Validate input
  const parsed = ExecuteSqlInputSchema.parse(input);
  const { sql, mode, limit } = parsed;

  // Simulate network/processing delay
  await simulateDelay(StandardDelays.query);

  // Extract table name from SQL
  const tableName = extractTableFromSql(sql);

  if (!tableName) {
    throw {
      code: ErrorCodes.SYNTAX_ERROR,
      message: 'Could not extract table name from SQL query',
    };
  }

  // Check if table exists
  const tableSchema = getTableSchema(tableName);

  if (!tableSchema) {
    const availableTables = getAllTableNames().join(', ');
    throw {
      code: ErrorCodes.TABLE_NOT_FOUND,
      message: `Table '${tableName}' not found. Available tables: ${availableTables}`,
    };
  }

  // Handle different modes
  if (mode === 'plan') {
    // Plan mode: return execution plan without data
    return {
      success: true,
      columns: tableSchema.columns.map(c => c.name),
      rows: [],
      rowCount: 0,
      executionTimeMs: Date.now() - startTime,
      mode: 'plan',
    };
  }

  // Determine row count to generate
  const sqlLimit = extractLimitFromSql(sql);
  let rowCount: number;

  if (mode === 'limit') {
    // Limited mode: use provided limit or SQL LIMIT
    rowCount = sqlLimit ?? limit ?? 10;
  } else {
    // Full mode: generate more rows (simulating full result set)
    rowCount = sqlLimit ?? Math.floor(Math.random() * 50) + 50;
  }

  // Cap at 1000 rows for safety
  rowCount = Math.min(rowCount, 1000);

  // Extract requested columns
  const requestedColumns = extractColumnsFromSql(sql);
  let columns: string[];
  let rows: Record<string, unknown>[];

  // Generate mock data
  const allRows = generateMockRows(tableName, rowCount);

  if (requestedColumns === null) {
    // SELECT * case
    columns = tableSchema.columns.map(c => c.name);
    rows = allRows;
  } else {
    // Specific columns requested
    columns = requestedColumns;
    rows = allRows.map(row => {
      const filteredRow: Record<string, unknown> = {};
      for (const col of requestedColumns) {
        // Handle column aliases and find actual column
        const actualCol = tableSchema.columns.find(
          c => c.name.toLowerCase() === col.toLowerCase()
        );
        if (actualCol) {
          filteredRow[col] = row[actualCol.name];
        }
      }
      return filteredRow;
    });
  }

  return {
    success: true,
    columns,
    rows,
    rowCount: rows.length,
    executionTimeMs: Date.now() - startTime,
    mode: mode ?? 'limit',
  };
}

export const executeSqlTool = {
  name: 'execute_sql',
  description: 'Execute SQL query against mock database. Modes: "plan" shows execution plan only, "limit" returns limited results (default), "full" returns all results.',
  inputSchema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'SQL query to execute',
      },
      mode: {
        type: 'string',
        enum: ['plan', 'limit', 'full'],
        description: 'Execution mode: plan (no data), limit (default, limited rows), full (all rows)',
        default: 'limit',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of rows to return in limit mode',
        default: 100,
      },
    },
    required: ['sql'],
  },
  handler: executeSql,
};
