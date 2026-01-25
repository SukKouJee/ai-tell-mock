import { faker } from '@faker-js/faker';
import type { SqlColumn } from '../types/index.js';

// IPTV Domain Constants
const STB_MODELS = ['STB-2000X', 'STB-3000S', 'STB-4000P'];

// Table Schema Registry
export interface TableSchema {
  name: string;
  schema: string;
  fullName: string;
  columns: SqlColumn[];
  generators: Record<string, () => unknown>;
}

export const TABLE_SCHEMAS: Record<string, TableSchema> = {
  'iptv.tb_stb_5min_qual': {
    name: 'tb_stb_5min_qual',
    schema: 'iptv',
    fullName: 'iptv.tb_stb_5min_qual',
    columns: [
      { name: 'collect_dt', type: 'timestamp', nullable: false, description: '수집일시', isPrimaryKey: true },
      { name: 'stb_model_cd', type: 'varchar(50)', nullable: false, description: '장비모델코드', isPrimaryKey: true },
      { name: 'mlr', type: 'float', nullable: true, description: 'Media Loss Rate' },
      { name: 'jitter', type: 'float', nullable: true, description: 'Jitter (ms)' },
      { name: 'ts_loss', type: 'int', nullable: true, description: 'TS Packet Loss' },
      { name: 'buffering_cnt', type: 'int', nullable: true, description: '버퍼링 횟수' },
      { name: 'bitrate_avg', type: 'float', nullable: true, description: '평균 비트레이트' },
    ],
    generators: {
      collect_dt: () => faker.date.recent({ days: 7 }).toISOString(),
      stb_model_cd: () => faker.helpers.arrayElement(STB_MODELS),
      mlr: () => faker.number.float({ min: 0.0005, max: 0.002, fractionDigits: 6 }),
      jitter: () => faker.number.float({ min: 5, max: 20, fractionDigits: 2 }),
      ts_loss: () => faker.number.int({ min: 0, max: 100 }),
      buffering_cnt: () => faker.number.int({ min: 0, max: 10 }),
      bitrate_avg: () => faker.number.float({ min: 2000, max: 8000, fractionDigits: 2 }),
    },
  },
  'iptv.tb_stb_quality_daily_dist': {
    name: 'tb_stb_quality_daily_dist',
    schema: 'iptv',
    fullName: 'iptv.tb_stb_quality_daily_dist',
    columns: [
      { name: 'stat_date', type: 'date', nullable: false, description: '통계일자', isPrimaryKey: true },
      { name: 'stb_model_cd', type: 'varchar(50)', nullable: false, description: '장비모델코드', isPrimaryKey: true },
      { name: 'mlr_mean', type: 'float', nullable: true, description: 'MLR 평균' },
      { name: 'mlr_stddev', type: 'float', nullable: true, description: 'MLR 표준편차' },
      { name: 'jitter_mean', type: 'float', nullable: true, description: 'Jitter 평균' },
      { name: 'jitter_stddev', type: 'float', nullable: true, description: 'Jitter 표준편차' },
    ],
    generators: {
      stat_date: () => faker.date.recent({ days: 30 }).toISOString().split('T')[0],
      stb_model_cd: () => faker.helpers.arrayElement(STB_MODELS),
      mlr_mean: () => faker.number.float({ min: 0.0008, max: 0.0015, fractionDigits: 6 }),
      mlr_stddev: () => faker.number.float({ min: 0.0001, max: 0.0004, fractionDigits: 6 }),
      jitter_mean: () => faker.number.float({ min: 8, max: 15, fractionDigits: 2 }),
      jitter_stddev: () => faker.number.float({ min: 1, max: 5, fractionDigits: 2 }),
    },
  },
};

export function generateMockRow(tableName: string): Record<string, unknown> | null {
  const schema = TABLE_SCHEMAS[tableName.toLowerCase()];
  if (!schema) {
    return null;
  }

  const row: Record<string, unknown> = {};
  for (const column of schema.columns) {
    const generator = schema.generators[column.name];
    if (generator) {
      row[column.name] = generator();
    }
  }
  return row;
}

export function generateMockRows(tableName: string, count: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const row = generateMockRow(tableName);
    if (row) {
      rows.push(row);
    }
  }
  return rows;
}

export function getTableSchema(tableName: string): TableSchema | null {
  return TABLE_SCHEMAS[tableName.toLowerCase()] || null;
}

export function getAllTableNames(): string[] {
  return Object.keys(TABLE_SCHEMAS);
}

export function getColumnNames(tableName: string): string[] | null {
  const schema = TABLE_SCHEMAS[tableName.toLowerCase()];
  if (!schema) {
    return null;
  }
  return schema.columns.map(c => c.name);
}

// Simple SQL parser to extract table name from query
export function extractTableFromSql(sql: string): string | null {
  const normalizedSql = sql.toLowerCase().replace(/\s+/g, ' ').trim();

  // Match FROM clause
  const fromMatch = normalizedSql.match(/from\s+([a-z_][a-z0-9_.]*)/);
  if (fromMatch) {
    return fromMatch[1];
  }

  // Match INSERT INTO
  const insertMatch = normalizedSql.match(/insert\s+into\s+([a-z_][a-z0-9_.]*)/);
  if (insertMatch) {
    return insertMatch[1];
  }

  // Match UPDATE
  const updateMatch = normalizedSql.match(/update\s+([a-z_][a-z0-9_.]*)/);
  if (updateMatch) {
    return updateMatch[1];
  }

  return null;
}

// Extract columns from SELECT clause
export function extractColumnsFromSql(sql: string): string[] | null {
  const normalizedSql = sql.toLowerCase().replace(/\s+/g, ' ').trim();

  const selectMatch = normalizedSql.match(/select\s+(.+?)\s+from/);
  if (!selectMatch) {
    return null;
  }

  const columnsClause = selectMatch[1].trim();

  if (columnsClause === '*') {
    return null; // Indicates all columns
  }

  return columnsClause.split(',').map(c => c.trim().split(/\s+as\s+/).pop()!.trim());
}

// Extract LIMIT from SQL
export function extractLimitFromSql(sql: string): number | null {
  const normalizedSql = sql.toLowerCase().replace(/\s+/g, ' ').trim();
  const limitMatch = normalizedSql.match(/limit\s+(\d+)/);
  if (limitMatch) {
    return parseInt(limitMatch[1], 10);
  }
  return null;
}
