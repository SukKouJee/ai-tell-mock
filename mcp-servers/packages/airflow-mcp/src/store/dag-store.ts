import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DagInfo, DagRunInfo } from '@ai-tel-mook/shared';
import { faker } from '@faker-js/faker';

// Path to generated-dags directory (relative to project root)
const DAGS_DIR = path.resolve(process.cwd(), 'generated-dags');

// In-memory store for DAG metadata
const dagMetadata: Map<string, DagInfo> = new Map();

// Initialize store
function ensureDagsDirectory(): void {
  if (!fs.existsSync(DAGS_DIR)) {
    fs.mkdirSync(DAGS_DIR, { recursive: true });
  }
}

function generateMockLastRun(): DagRunInfo | undefined {
  // 70% chance of having a last run
  if (Math.random() > 0.7) {
    return undefined;
  }

  const states: Array<'success' | 'failed' | 'running' | 'queued'> = ['success', 'failed', 'running', 'queued'];
  const state = faker.helpers.arrayElement(states);

  const startDate = faker.date.recent({ days: 1 });
  const endDate = state === 'running' || state === 'queued'
    ? undefined
    : new Date(startDate.getTime() + faker.number.int({ min: 60000, max: 600000 }));

  return {
    runId: `scheduled__${startDate.toISOString()}`,
    state,
    startDate: startDate.toISOString(),
    endDate: endDate?.toISOString(),
    executionDate: startDate.toISOString(),
  };
}

export function getDagFilePath(dagId: string): string {
  return path.join(DAGS_DIR, `${dagId}.py`);
}

export function saveDag(dagId: string, code: string, overwrite: boolean = false): DagInfo {
  ensureDagsDirectory();

  const filePath = getDagFilePath(dagId);

  // Check if DAG already exists
  if (fs.existsSync(filePath) && !overwrite) {
    throw {
      code: 'E005',
      message: `DAG '${dagId}' already exists. Set overwrite=true to replace.`,
    };
  }

  // Write DAG file
  fs.writeFileSync(filePath, code, 'utf-8');

  // Create/update metadata
  const dagInfo: DagInfo = {
    dagId,
    description: extractDescription(code),
    schedule: extractSchedule(code),
    isPaused: false,
    lastRun: generateMockLastRun(),
    filePath,
    createdAt: new Date().toISOString(),
  };

  dagMetadata.set(dagId, dagInfo);

  return dagInfo;
}

export function getDag(dagId: string): DagInfo | null {
  // First check in-memory metadata
  if (dagMetadata.has(dagId)) {
    return dagMetadata.get(dagId)!;
  }

  // Check if file exists on disk
  const filePath = getDagFilePath(dagId);
  if (fs.existsSync(filePath)) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const dagInfo: DagInfo = {
      dagId,
      description: extractDescription(code),
      schedule: extractSchedule(code),
      isPaused: false,
      lastRun: generateMockLastRun(),
      filePath,
      createdAt: fs.statSync(filePath).birthtime.toISOString(),
    };
    dagMetadata.set(dagId, dagInfo);
    return dagInfo;
  }

  return null;
}

export function listDags(limit: number = 50): DagInfo[] {
  ensureDagsDirectory();

  // Read all DAG files from directory
  const files = fs.readdirSync(DAGS_DIR).filter(f => f.endsWith('.py'));

  const dags: DagInfo[] = [];
  for (const file of files.slice(0, limit)) {
    const dagId = file.replace('.py', '');
    const dag = getDag(dagId);
    if (dag) {
      dags.push(dag);
    }
  }

  return dags;
}

export function deleteDag(dagId: string): boolean {
  const filePath = getDagFilePath(dagId);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    dagMetadata.delete(dagId);
    return true;
  }

  return false;
}

export function getDagCode(dagId: string): string | null {
  const filePath = getDagFilePath(dagId);

  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }

  return null;
}

// Helper functions to extract metadata from DAG code
function extractDescription(code: string): string | undefined {
  // Look for doc string after DAG definition
  const docMatch = code.match(/DAG\([^)]*\)\s*:\s*"""([^"]*)"""/s);
  if (docMatch) {
    return docMatch[1].trim();
  }

  // Look for description parameter
  const descMatch = code.match(/description\s*=\s*['"]([^'"]+)['"]/);
  if (descMatch) {
    return descMatch[1];
  }

  return undefined;
}

function extractSchedule(code: string): string {
  // Look for schedule_interval parameter
  const intervalMatch = code.match(/schedule_interval\s*=\s*['"]([^'"]+)['"]/);
  if (intervalMatch) {
    return intervalMatch[1];
  }

  // Look for schedule parameter (newer Airflow)
  const scheduleMatch = code.match(/schedule\s*=\s*['"]([^'"]+)['"]/);
  if (scheduleMatch) {
    return scheduleMatch[1];
  }

  return '@daily';
}
