import {
  ValidateDagInputSchema,
  DagValidationResult,
  DagError,
  DagWarning,
  ErrorCodes,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';

export interface ValidateDagInput {
  code: string;
}

export async function validateDag(input: ValidateDagInput): Promise<DagValidationResult> {
  const parsed = ValidateDagInputSchema.parse(input);
  const { code } = parsed;

  await simulateDelay(StandardDelays.metadata);

  const errors: DagError[] = [];
  const warnings: DagWarning[] = [];

  // Check for empty code
  if (!code.trim()) {
    errors.push({
      code: ErrorCodes.DAG_INVALID,
      message: 'DAG code is empty',
    });
    return { valid: false, errors, warnings };
  }

  // Check for required imports
  if (!code.includes('from airflow import DAG') && !code.includes('from airflow.models import DAG')) {
    errors.push({
      code: ErrorCodes.DAG_INVALID,
      message: 'Missing required import: "from airflow import DAG"',
    });
  }

  // Check for DAG definition
  const dagMatch = code.match(/DAG\s*\(/);
  if (!dagMatch) {
    errors.push({
      code: ErrorCodes.DAG_INVALID,
      message: 'No DAG definition found',
    });
  }

  // Check for dag_id
  const dagIdMatch = code.match(/dag_id\s*=\s*["']([^"']+)["']/);
  if (!dagIdMatch) {
    errors.push({
      code: ErrorCodes.DAG_INVALID,
      message: 'Missing dag_id parameter in DAG definition',
    });
  } else {
    const dagId = dagIdMatch[1];
    // Validate dag_id format
    if (!/^[a-z][a-z0-9_]*$/.test(dagId)) {
      errors.push({
        code: ErrorCodes.DAG_INVALID,
        message: `Invalid dag_id format: "${dagId}". Must start with lowercase letter and contain only lowercase letters, numbers, and underscores.`,
      });
    }
  }

  // Check for schedule_interval
  const hasScheduleInterval = code.includes('schedule_interval');
  const hasSchedule = code.includes('schedule=') || code.includes('schedule =');
  if (!hasScheduleInterval && !hasSchedule) {
    warnings.push({
      code: 'W001',
      message: 'No schedule_interval or schedule defined',
      suggestion: 'Add schedule_interval parameter (e.g., schedule_interval="@daily")',
    });
  }

  // Check for start_date
  if (!code.includes('start_date')) {
    errors.push({
      code: ErrorCodes.DAG_INVALID,
      message: 'Missing start_date in DAG definition or default_args',
    });
  }

  // Extract task IDs
  const taskIdMatches = code.matchAll(/task_id\s*=\s*["']([^"']+)["']/g);
  const taskIds = new Set<string>();
  const duplicateTaskIds: string[] = [];

  for (const match of taskIdMatches) {
    const taskId = match[1];
    if (taskIds.has(taskId)) {
      duplicateTaskIds.push(taskId);
    }
    taskIds.add(taskId);
  }

  // Check for duplicate task IDs
  if (duplicateTaskIds.length > 0) {
    errors.push({
      code: ErrorCodes.DAG_INVALID,
      message: `Duplicate task IDs found: ${duplicateTaskIds.join(', ')}`,
    });
  }

  // Check for tasks
  if (taskIds.size === 0) {
    warnings.push({
      code: 'W002',
      message: 'No tasks defined in DAG',
      suggestion: 'Add at least one task to the DAG',
    });
  }

  // Check for circular dependencies (basic check)
  const dependencyPattern = /(\w+)\s*>>\s*(\w+)/g;
  const dependencies = new Map<string, string[]>();

  let depMatch;
  while ((depMatch = dependencyPattern.exec(code)) !== null) {
    const upstream = depMatch[1];
    const downstream = depMatch[2];

    if (!dependencies.has(downstream)) {
      dependencies.set(downstream, []);
    }
    dependencies.get(downstream)!.push(upstream);
  }

  // Simple cycle detection
  function hasCycle(taskId: string, visited: Set<string>, stack: Set<string>): boolean {
    visited.add(taskId);
    stack.add(taskId);

    const deps = dependencies.get(taskId) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (hasCycle(dep, visited, stack)) {
          return true;
        }
      } else if (stack.has(dep)) {
        return true;
      }
    }

    stack.delete(taskId);
    return false;
  }

  const visited = new Set<string>();
  for (const taskId of dependencies.keys()) {
    if (!visited.has(taskId)) {
      if (hasCycle(taskId, visited, new Set())) {
        errors.push({
          code: ErrorCodes.DAG_INVALID,
          message: 'Circular dependency detected in task dependencies',
        });
        break;
      }
    }
  }

  // Check for common issues
  if (code.includes('datetime.now()')) {
    warnings.push({
      code: 'W003',
      message: 'Using datetime.now() can cause issues',
      suggestion: 'Use {{ ds }} or {{ execution_date }} templates instead',
    });
  }

  // Check for hardcoded credentials
  const credentialPatterns = [
    /password\s*=\s*["'][^"']+["']/i,
    /secret\s*=\s*["'][^"']+["']/i,
    /api_key\s*=\s*["'][^"']+["']/i,
  ];

  for (const pattern of credentialPatterns) {
    if (pattern.test(code)) {
      warnings.push({
        code: 'W004',
        message: 'Possible hardcoded credentials detected',
        suggestion: 'Use Airflow Variables or Connections for sensitive data',
      });
      break;
    }
  }

  // Check Python syntax (basic)
  const unclosedBrackets = (code.match(/\(/g) || []).length - (code.match(/\)/g) || []).length;
  const unclosedBraces = (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length;
  const unclosedSquare = (code.match(/\[/g) || []).length - (code.match(/\]/g) || []).length;

  if (unclosedBrackets !== 0) {
    errors.push({
      code: ErrorCodes.DAG_INVALID,
      message: 'Unbalanced parentheses in code',
    });
  }

  if (unclosedBraces !== 0) {
    errors.push({
      code: ErrorCodes.DAG_INVALID,
      message: 'Unbalanced curly braces in code',
    });
  }

  if (unclosedSquare !== 0) {
    errors.push({
      code: ErrorCodes.DAG_INVALID,
      message: 'Unbalanced square brackets in code',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export const validateDagTool = {
  name: 'validate_dag',
  description: 'Validate DAG code for common issues, missing requirements, and best practices.',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The DAG Python code to validate',
      },
    },
    required: ['code'],
  },
  handler: validateDag,
};
