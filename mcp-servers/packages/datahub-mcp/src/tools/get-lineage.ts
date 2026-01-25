import {
  GetLineageInputSchema,
  LineageGraph,
  ErrorCodes,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';
import {
  getDatasetByUrn,
  getDatasetByName,
  getUpstreamLineage,
  getDownstreamLineage,
  DATASETS,
} from '../data/datasets.js';

export interface GetLineageInput {
  datasetUrn: string;
  direction?: 'upstream' | 'downstream' | 'both';
  depth?: number;
}

export async function getLineage(input: GetLineageInput): Promise<LineageGraph> {
  const parsed = GetLineageInputSchema.parse(input);
  const { datasetUrn, direction, depth } = parsed;

  await simulateDelay(StandardDelays.metadata);

  // Try to find dataset - accept URN or table name
  let dataset = getDatasetByUrn(datasetUrn);

  if (!dataset) {
    dataset = getDatasetByName(datasetUrn);
  }

  if (!dataset) {
    const availableTables = DATASETS.map(d => `${d.schema}.${d.name}`).join(', ');
    throw {
      code: ErrorCodes.TABLE_NOT_FOUND,
      message: `Dataset '${datasetUrn}' not found. Available tables: ${availableTables}`,
    };
  }

  const result: LineageGraph = {
    dataset: `${dataset.schema}.${dataset.name}`,
    upstream: [],
    downstream: [],
  };

  if (direction === 'upstream' || direction === 'both') {
    result.upstream = getUpstreamLineage(dataset.urn, depth);
  }

  if (direction === 'downstream' || direction === 'both') {
    result.downstream = getDownstreamLineage(dataset.urn, depth);
  }

  return result;
}

export const getLineageTool = {
  name: 'get_lineage',
  description: 'Get upstream and/or downstream lineage for a dataset. Shows data dependencies and transformations.',
  inputSchema: {
    type: 'object',
    properties: {
      datasetUrn: {
        type: 'string',
        description: 'Dataset URN or table name (e.g., "iptv.tb_stb_5min_qual")',
      },
      direction: {
        type: 'string',
        enum: ['upstream', 'downstream', 'both'],
        description: 'Lineage direction to retrieve',
        default: 'both',
      },
      depth: {
        type: 'number',
        description: 'How many levels of lineage to traverse (1-5)',
        default: 1,
      },
    },
    required: ['datasetUrn'],
  },
  handler: getLineage,
};
