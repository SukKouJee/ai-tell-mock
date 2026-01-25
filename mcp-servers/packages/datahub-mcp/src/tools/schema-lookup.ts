import {
  SchemaLookupInputSchema,
  DatasetSchema,
  ErrorCodes,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';
import { getDatasetByName, getDatasetByUrn, DATASETS } from '../data/datasets.js';

export interface SchemaLookupInput {
  tableName: string;
}

export async function schemaLookup(input: SchemaLookupInput): Promise<DatasetSchema> {
  const parsed = SchemaLookupInputSchema.parse(input);
  const { tableName } = parsed;

  await simulateDelay(StandardDelays.metadata);

  // Try to find by name first
  let dataset = getDatasetByName(tableName);

  // If not found, try as URN
  if (!dataset && tableName.startsWith('urn:')) {
    dataset = getDatasetByUrn(tableName);
  }

  if (!dataset) {
    const availableTables = DATASETS.map(d => `${d.schema}.${d.name}`).join(', ');
    throw {
      code: ErrorCodes.TABLE_NOT_FOUND,
      message: `Table '${tableName}' not found. Available tables: ${availableTables}`,
    };
  }

  return dataset;
}

export const schemaLookupTool = {
  name: 'schema_lookup',
  description: 'Get detailed schema information for a table including columns, types, descriptions, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: {
        type: 'string',
        description: 'Table name (e.g., "iptv.tb_stb_5min_qual") or DataHub URN',
      },
    },
    required: ['tableName'],
  },
  handler: schemaLookup,
};
