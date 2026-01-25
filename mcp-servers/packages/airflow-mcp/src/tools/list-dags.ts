import {
  ListDagsInputSchema,
  DagInfo,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';
import { listDags as listDagsFromStore } from '../store/dag-store.js';

export interface ListDagsInput {
  limit?: number;
}

export interface ListDagsResult {
  dags: DagInfo[];
  total: number;
}

export async function listDags(input: ListDagsInput = {}): Promise<ListDagsResult> {
  const parsed = ListDagsInputSchema.parse(input);
  const { limit } = parsed;

  await simulateDelay(StandardDelays.metadata);

  const dags = listDagsFromStore(limit);

  return {
    dags,
    total: dags.length,
  };
}

export const listDagsTool = {
  name: 'list_dags',
  description: 'List all registered DAGs with their metadata and status.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of DAGs to return',
        default: 50,
      },
    },
    required: [],
  },
  handler: listDags,
};
