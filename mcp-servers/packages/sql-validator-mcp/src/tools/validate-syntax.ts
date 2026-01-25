import {
  ValidateSyntaxInputSchema,
  SqlValidationResult,
  SqlError,
  SqlWarning,
  ErrorCodes,
  extractTableFromSql,
  getTableSchema,
  getAllTableNames,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';

export interface ValidateSyntaxInput {
  sql: string;
}


export async function validateSyntax(input: ValidateSyntaxInput): Promise<SqlValidationResult> {
  // Validate input
  const parsed = ValidateSyntaxInputSchema.parse(input);
  const { sql } = parsed;

  // Simulate processing delay
  await simulateDelay(StandardDelays.metadata);

  const errors: SqlError[] = [];
  const warnings: SqlWarning[] = [];

  const normalizedSql = sql.trim().toUpperCase();

  // Check for empty query
  if (!normalizedSql) {
    errors.push({
      code: ErrorCodes.SYNTAX_ERROR,
      message: 'SQL query is empty',
    });
    return { valid: false, errors, warnings };
  }

  // Check for statement type
  const firstWord = normalizedSql.split(/\s+/)[0];
  const validStatementTypes = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER'];

  if (!validStatementTypes.includes(firstWord)) {
    errors.push({
      code: ErrorCodes.SYNTAX_ERROR,
      message: `Unknown statement type: ${firstWord}. Expected one of: ${validStatementTypes.join(', ')}`,
      line: 1,
      column: 1,
    });
  }

  // Check for balanced parentheses
  const openParens = (sql.match(/\(/g) || []).length;
  const closeParens = (sql.match(/\)/g) || []).length;

  if (openParens !== closeParens) {
    errors.push({
      code: ErrorCodes.SYNTAX_ERROR,
      message: `Unbalanced parentheses: ${openParens} opening, ${closeParens} closing`,
    });
  }

  // Check for balanced quotes
  const singleQuotes = (sql.match(/'/g) || []).length;
  const doubleQuotes = (sql.match(/"/g) || []).length;

  if (singleQuotes % 2 !== 0) {
    errors.push({
      code: ErrorCodes.SYNTAX_ERROR,
      message: 'Unbalanced single quotes',
    });
  }

  if (doubleQuotes % 2 !== 0) {
    errors.push({
      code: ErrorCodes.SYNTAX_ERROR,
      message: 'Unbalanced double quotes',
    });
  }

  // SELECT statement specific checks
  if (firstWord === 'SELECT') {
    // Check for FROM clause
    if (!normalizedSql.includes('FROM')) {
      errors.push({
        code: ErrorCodes.SYNTAX_ERROR,
        message: 'SELECT statement missing FROM clause',
      });
    }

    // Check for table existence
    const tableName = extractTableFromSql(sql);
    if (tableName) {
      const tableSchema = getTableSchema(tableName);
      if (!tableSchema) {
        const availableTables = getAllTableNames();
        warnings.push({
          code: 'W001',
          message: `Table '${tableName}' not found in schema registry`,
          suggestion: `Available tables: ${availableTables.join(', ')}`,
        });
      }
    }
  }

  // Check for SELECT *
  if (normalizedSql.includes('SELECT *')) {
    warnings.push({
      code: 'W002',
      message: 'Using SELECT * is not recommended',
      suggestion: 'Specify explicit column names for better performance and clarity',
    });
  }

  // Check for missing LIMIT
  if (firstWord === 'SELECT' && !normalizedSql.includes('LIMIT')) {
    warnings.push({
      code: 'W003',
      message: 'SELECT without LIMIT clause',
      suggestion: 'Consider adding LIMIT to prevent returning too many rows',
    });
  }

  // Check for common SQL injection patterns (warning only)
  const injectionPatterns = ['--', ';--', '/*', '*/', 'DROP TABLE', 'DROP DATABASE'];
  for (const pattern of injectionPatterns) {
    if (normalizedSql.includes(pattern)) {
      warnings.push({
        code: 'W004',
        message: `Potentially dangerous pattern detected: ${pattern}`,
        suggestion: 'Review query for SQL injection risks',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export const validateSyntaxTool = {
  name: 'validate_syntax',
  description: 'Validate SQL syntax without executing the query. Returns errors and warnings.',
  inputSchema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'SQL query to validate',
      },
    },
    required: ['sql'],
  },
  handler: validateSyntax,
};
