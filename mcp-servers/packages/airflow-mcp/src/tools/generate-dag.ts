import {
  GenerateDagInputSchema,
  DagTask,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';

export interface GenerateDagInput {
  dagId: string;
  description?: string;
  schedule: string;
  startDate: string;
  catchup?: boolean;
  tags?: string[];
  tasks: DagTask[];
  defaultArgs?: Record<string, unknown>;
}

export interface GenerateDagResult {
  dagId: string;
  code: string;
  taskCount: number;
}

function formatPythonValue(value: unknown): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(formatPythonValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `"${k}": ${formatPythonValue(v)}`)
      .join(', ');
    return `{${entries}}`;
  }
  return String(value);
}

function generateTaskCode(task: DagTask, indent: string = '    '): string {
  const { taskId, operator, params } = task;

  // Map common operators to their imports and class names
  const operatorMap: Record<string, { import: string; className: string }> = {
    'PythonOperator': {
      import: 'from airflow.operators.python import PythonOperator',
      className: 'PythonOperator',
    },
    'BashOperator': {
      import: 'from airflow.operators.bash import BashOperator',
      className: 'BashOperator',
    },
    'DummyOperator': {
      import: 'from airflow.operators.dummy import DummyOperator',
      className: 'DummyOperator',
    },
    'EmptyOperator': {
      import: 'from airflow.operators.empty import EmptyOperator',
      className: 'EmptyOperator',
    },
    'SparkSubmitOperator': {
      import: 'from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator',
      className: 'SparkSubmitOperator',
    },
    'HiveOperator': {
      import: 'from airflow.providers.apache.hive.operators.hive import HiveOperator',
      className: 'HiveOperator',
    },
    'SqlSensor': {
      import: 'from airflow.providers.common.sql.sensors.sql import SqlSensor',
      className: 'SqlSensor',
    },
  };

  const opInfo = operatorMap[operator] || {
    import: `# Import for ${operator}`,
    className: operator,
  };

  // Build params string
  const paramLines = Object.entries(params)
    .map(([key, value]) => `${indent}    ${key}=${formatPythonValue(value)},`)
    .join('\n');

  return `${indent}${taskId} = ${opInfo.className}(
${indent}    task_id="${taskId}",
${paramLines}
${indent})`;
}

function generateDependenciesCode(tasks: DagTask[], indent: string = '    '): string {
  const deps: string[] = [];

  for (const task of tasks) {
    if (task.dependencies && task.dependencies.length > 0) {
      if (task.dependencies.length === 1) {
        deps.push(`${indent}${task.dependencies[0]} >> ${task.taskId}`);
      } else {
        deps.push(`${indent}[${task.dependencies.join(', ')}] >> ${task.taskId}`);
      }
    }
  }

  return deps.join('\n');
}

function collectImports(tasks: DagTask[]): Set<string> {
  const imports = new Set<string>();

  const operatorImports: Record<string, string> = {
    'PythonOperator': 'from airflow.operators.python import PythonOperator',
    'BashOperator': 'from airflow.operators.bash import BashOperator',
    'DummyOperator': 'from airflow.operators.dummy import DummyOperator',
    'EmptyOperator': 'from airflow.operators.empty import EmptyOperator',
    'SparkSubmitOperator': 'from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator',
    'HiveOperator': 'from airflow.providers.apache.hive.operators.hive import HiveOperator',
    'SqlSensor': 'from airflow.providers.common.sql.sensors.sql import SqlSensor',
  };

  for (const task of tasks) {
    const imp = operatorImports[task.operator];
    if (imp) {
      imports.add(imp);
    }
  }

  return imports;
}

export async function generateDag(input: GenerateDagInput): Promise<GenerateDagResult> {
  const parsed = GenerateDagInputSchema.parse(input);
  const {
    dagId,
    description,
    schedule,
    startDate,
    catchup,
    tags,
    tasks,
    defaultArgs,
  } = parsed;

  await simulateDelay(StandardDelays.metadata);

  // Collect operator imports
  const operatorImports = collectImports(tasks);

  // Build default_args
  const defaultArgsDict = {
    owner: 'airflow',
    depends_on_past: false,
    email_on_failure: false,
    email_on_retry: false,
    retries: 1,
    ...defaultArgs,
  };

  const defaultArgsCode = Object.entries(defaultArgsDict)
    .map(([key, value]) => `    "${key}": ${formatPythonValue(value)},`)
    .join('\n');

  // Build tags list
  const tagsCode = tags && tags.length > 0
    ? `tags=${formatPythonValue(tags)},`
    : '';

  // Generate task code
  const taskCodes = tasks.map(task => generateTaskCode(task)).join('\n\n');

  // Generate dependencies
  const dependenciesCode = generateDependenciesCode(tasks);

  // Build the DAG code
  const code = `"""
DAG: ${dagId}
${description || 'Auto-generated DAG'}
"""
from datetime import datetime, timedelta
from airflow import DAG
${Array.from(operatorImports).join('\n')}

default_args = {
${defaultArgsCode}
}

with DAG(
    dag_id="${dagId}",
    default_args=default_args,
    description="${description || dagId}",
    schedule_interval="${schedule}",
    start_date=datetime.fromisoformat("${startDate}"),
    catchup=${catchup ? 'True' : 'False'},
    ${tagsCode}
) as dag:

${taskCodes}

    # Task dependencies
${dependenciesCode || '    pass'}
`;

  return {
    dagId,
    code,
    taskCount: tasks.length,
  };
}

export const generateDagTool = {
  name: 'generate_dag',
  description: 'Generate Airflow DAG Python code from a configuration. Returns the generated code without registering it.',
  inputSchema: {
    type: 'object',
    properties: {
      dagId: {
        type: 'string',
        description: 'Unique DAG identifier (lowercase, underscores allowed)',
      },
      description: {
        type: 'string',
        description: 'Human-readable DAG description',
      },
      schedule: {
        type: 'string',
        description: 'Cron expression or preset (e.g., "@daily", "0 0 * * *")',
      },
      startDate: {
        type: 'string',
        description: 'Start date in ISO format (e.g., "2024-01-01")',
      },
      catchup: {
        type: 'boolean',
        description: 'Whether to run backfill for missed intervals',
        default: false,
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorizing the DAG',
      },
      tasks: {
        type: 'array',
        description: 'List of task definitions',
        items: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Unique task identifier' },
            operator: { type: 'string', description: 'Airflow operator class name' },
            params: { type: 'object', description: 'Operator parameters' },
            dependencies: {
              type: 'array',
              items: { type: 'string' },
              description: 'Task IDs this task depends on',
            },
          },
          required: ['taskId', 'operator', 'params'],
        },
      },
      defaultArgs: {
        type: 'object',
        description: 'Default arguments for all tasks',
      },
    },
    required: ['dagId', 'schedule', 'startDate', 'tasks'],
  },
  handler: generateDag,
};
