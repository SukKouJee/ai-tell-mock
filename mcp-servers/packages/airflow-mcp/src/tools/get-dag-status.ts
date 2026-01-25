import {
  GetDagStatusInputSchema,
  DagInfo,
  DagRunInfo,
  ErrorCodes,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';
import { faker } from '@faker-js/faker';
import { getDag } from '../store/dag-store.js';

export interface GetDagStatusInput {
  dagId: string;
}

export interface DagStatusResult {
  dagInfo: DagInfo;
  recentRuns: DagRunInfo[];
  nextScheduledRun?: string;
}

function generateMockRuns(count: number): DagRunInfo[] {
  const runs: DagRunInfo[] = [];
  const states: Array<'success' | 'failed' | 'running' | 'queued'> = ['success', 'success', 'success', 'failed'];

  for (let i = 0; i < count; i++) {
    const startDate = faker.date.recent({ days: i + 1 });
    const state = i === 0
      ? faker.helpers.arrayElement(['running', 'queued', 'success', 'failed'])
      : faker.helpers.arrayElement(states);

    const endDate = state === 'running' || state === 'queued'
      ? undefined
      : new Date(startDate.getTime() + faker.number.int({ min: 60000, max: 600000 }));

    runs.push({
      runId: `scheduled__${startDate.toISOString()}`,
      state,
      startDate: startDate.toISOString(),
      endDate: endDate?.toISOString(),
      executionDate: startDate.toISOString(),
    });
  }

  return runs.sort((a, b) =>
    new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
}

function calculateNextRun(schedule: string): string {
  const now = new Date();

  // Simple schedule parsing
  if (schedule === '@daily' || schedule === '0 0 * * *') {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next.toISOString();
  }

  if (schedule === '@hourly' || schedule === '0 * * * *') {
    const next = new Date(now);
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return next.toISOString();
  }

  if (schedule === '@weekly' || schedule === '0 0 * * 0') {
    const next = new Date(now);
    const daysUntilSunday = 7 - next.getDay();
    next.setDate(next.getDate() + daysUntilSunday);
    next.setHours(0, 0, 0, 0);
    return next.toISOString();
  }

  // Default: next day
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export async function getDagStatus(input: GetDagStatusInput): Promise<DagStatusResult> {
  const parsed = GetDagStatusInputSchema.parse(input);
  const { dagId } = parsed;

  await simulateDelay(StandardDelays.metadata);

  const dagInfo = getDag(dagId);

  if (!dagInfo) {
    throw {
      code: ErrorCodes.TABLE_NOT_FOUND, // Reusing error code
      message: `DAG '${dagId}' not found`,
    };
  }

  // Generate mock recent runs
  const recentRuns = generateMockRuns(5);

  // Update dagInfo with most recent run
  dagInfo.lastRun = recentRuns[0];

  // Calculate next scheduled run
  const nextScheduledRun = dagInfo.isPaused
    ? undefined
    : calculateNextRun(dagInfo.schedule);

  return {
    dagInfo,
    recentRuns,
    nextScheduledRun,
  };
}

export const getDagStatusTool = {
  name: 'get_dag_status',
  description: 'Get detailed status of a DAG including recent run history and next scheduled run.',
  inputSchema: {
    type: 'object',
    properties: {
      dagId: {
        type: 'string',
        description: 'The DAG ID to get status for',
      },
    },
    required: ['dagId'],
  },
  handler: getDagStatus,
};
