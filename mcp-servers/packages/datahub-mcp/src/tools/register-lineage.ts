import {
  RegisterLineageInputSchema,
  ErrorCodes,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';
import {
  getDatasetByUrn,
  getDatasetByName,
  registerLineage as addLineageEdge,
  DATASETS,
} from '../data/datasets.js';

export interface RegisterLineageInput {
  sourceUrn: string;
  targetUrn: string;
  type?: 'TRANSFORMED' | 'DERIVED' | 'COPIED';
}

export interface RegisterLineageResult {
  success: boolean;
  message: string;
  sourceDataset: string;
  targetDataset: string;
  type: string;
}

function resolveDatasetUrn(input: string): string | null {
  // If already a URN, validate it exists
  if (input.startsWith('urn:')) {
    const dataset = getDatasetByUrn(input);
    return dataset ? dataset.urn : null;
  }

  // Otherwise try to find by name
  const dataset = getDatasetByName(input);
  return dataset ? dataset.urn : null;
}

export async function registerLineageHandler(input: RegisterLineageInput): Promise<RegisterLineageResult> {
  const parsed = RegisterLineageInputSchema.parse(input);
  const { sourceUrn: sourceInput, targetUrn: targetInput, type } = parsed;

  await simulateDelay(StandardDelays.metadata);

  // Resolve source
  const sourceUrn = resolveDatasetUrn(sourceInput);
  if (!sourceUrn) {
    const availableTables = DATASETS.map(d => `${d.schema}.${d.name}`).join(', ');
    throw {
      code: ErrorCodes.TABLE_NOT_FOUND,
      message: `Source dataset '${sourceInput}' not found. Available tables: ${availableTables}`,
    };
  }

  // Resolve target
  const targetUrn = resolveDatasetUrn(targetInput);
  if (!targetUrn) {
    const availableTables = DATASETS.map(d => `${d.schema}.${d.name}`).join(', ');
    throw {
      code: ErrorCodes.TABLE_NOT_FOUND,
      message: `Target dataset '${targetInput}' not found. Available tables: ${availableTables}`,
    };
  }

  // Get dataset names for response
  const sourceDataset = getDatasetByUrn(sourceUrn)!;
  const targetDataset = getDatasetByUrn(targetUrn)!;

  // Register the lineage edge
  addLineageEdge({
    sourceUrn,
    targetUrn,
    type: type ?? 'TRANSFORMED',
  });

  return {
    success: true,
    message: 'Lineage relationship registered successfully',
    sourceDataset: `${sourceDataset.schema}.${sourceDataset.name}`,
    targetDataset: `${targetDataset.schema}.${targetDataset.name}`,
    type: type ?? 'TRANSFORMED',
  };
}

export const registerLineageTool = {
  name: 'register_lineage',
  description: 'Register a new lineage relationship between two datasets. Creates a data flow dependency.',
  inputSchema: {
    type: 'object',
    properties: {
      sourceUrn: {
        type: 'string',
        description: 'Source dataset URN or table name (upstream data source)',
      },
      targetUrn: {
        type: 'string',
        description: 'Target dataset URN or table name (downstream data consumer)',
      },
      type: {
        type: 'string',
        enum: ['TRANSFORMED', 'DERIVED', 'COPIED'],
        description: 'Type of lineage relationship',
        default: 'TRANSFORMED',
      },
    },
    required: ['sourceUrn', 'targetUrn'],
  },
  handler: registerLineageHandler,
};
