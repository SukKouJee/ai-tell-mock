import {
  RegisterDagInputSchema,
  DagInfo,
  simulateDelay,
  StandardDelays,
} from '@ai-tel-mook/shared';
import { saveDag } from '../store/dag-store.js';
import { validateDag } from './validate-dag.js';

export interface RegisterDagInput {
  dagId: string;
  code: string;
  overwrite?: boolean;
}

export interface RegisterDagResult {
  success: boolean;
  message: string;
  dagInfo: DagInfo;
  warnings: string[];
}

export async function registerDag(input: RegisterDagInput): Promise<RegisterDagResult> {
  const parsed = RegisterDagInputSchema.parse(input);
  const { dagId, code, overwrite } = parsed;

  await simulateDelay(StandardDelays.fileSystem);

  // Validate before registering
  const validationResult = await validateDag({ code });

  if (!validationResult.valid) {
    throw {
      code: 'E006',
      message: `DAG validation failed: ${validationResult.errors.map(e => e.message).join('; ')}`,
    };
  }

  // Save the DAG
  const dagInfo = saveDag(dagId, code, overwrite);

  return {
    success: true,
    message: `DAG '${dagId}' registered successfully at ${dagInfo.filePath}`,
    dagInfo,
    warnings: validationResult.warnings.map(w => w.message),
  };
}

export const registerDagTool = {
  name: 'register_dag',
  description: 'Validate and save a DAG to the generated-dags directory. Validates code before saving.',
  inputSchema: {
    type: 'object',
    properties: {
      dagId: {
        type: 'string',
        description: 'Unique DAG identifier',
      },
      code: {
        type: 'string',
        description: 'The DAG Python code to register',
      },
      overwrite: {
        type: 'boolean',
        description: 'Whether to overwrite existing DAG',
        default: false,
      },
    },
    required: ['dagId', 'code'],
  },
  handler: registerDag,
};
