import {
  SearchTablesInputSchema,
  SearchResult,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';
import { searchDatasets } from '../data/datasets.js';

export interface SearchTablesInput {
  query: string;
  limit?: number;
}

export async function searchTables(input: SearchTablesInput): Promise<SearchResult[]> {
  const parsed = SearchTablesInputSchema.parse(input);
  const { query, limit } = parsed;

  await simulateDelay(StandardDelays.metadata);

  const datasets = searchDatasets(query, limit);

  return datasets.map(dataset => {
    const matchedFields: string[] = [];
    const normalizedQuery = query.toLowerCase();

    if (dataset.name.toLowerCase().includes(normalizedQuery)) {
      matchedFields.push('name');
    }
    if (dataset.description?.toLowerCase().includes(normalizedQuery)) {
      matchedFields.push('description');
    }
    if (dataset.tags?.some(tag => tag.toLowerCase().includes(normalizedQuery))) {
      matchedFields.push('tags');
    }
    if (dataset.columns.some(col =>
      col.name.toLowerCase().includes(normalizedQuery) ||
      col.description?.toLowerCase().includes(normalizedQuery)
    )) {
      matchedFields.push('columns');
    }

    return {
      urn: dataset.urn,
      name: `${dataset.schema}.${dataset.name}`,
      platform: dataset.platform,
      schema: dataset.schema,
      description: dataset.description,
      matchedFields,
    };
  });
}

export const searchTablesTool = {
  name: 'search_tables',
  description: 'Search for tables by keyword in name, description, tags, or columns. Returns matching tables with metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search keyword (e.g., "STB", "품질", "quality")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 10,
      },
    },
    required: ['query'],
  },
  handler: searchTables,
};
