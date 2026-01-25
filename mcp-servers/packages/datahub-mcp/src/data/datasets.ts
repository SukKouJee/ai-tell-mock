import type { DatasetSchema, LineageEdge, LineageNode } from '@ai-tel-mook/shared';

// Mock Dataset Registry
export const DATASETS: DatasetSchema[] = [
  {
    urn: 'urn:li:dataset:(urn:li:dataPlatform:hive,iptv.tb_stb_5min_qual,PROD)',
    name: 'tb_stb_5min_qual',
    platform: 'hive',
    schema: 'iptv',
    description: 'STB 5분 단위 품질 지표 테이블. 각 STB 모델별 5분 간격 품질 메트릭 수집.',
    columns: [
      { name: 'collect_dt', type: 'timestamp', nullable: false, description: '수집일시', isPrimaryKey: true },
      { name: 'stb_model_cd', type: 'varchar(50)', nullable: false, description: '장비모델코드', isPrimaryKey: true },
      { name: 'mlr', type: 'float', nullable: true, description: 'Media Loss Rate - 미디어 손실률' },
      { name: 'jitter', type: 'float', nullable: true, description: 'Jitter (ms) - 지터' },
      { name: 'ts_loss', type: 'int', nullable: true, description: 'TS Packet Loss - TS 패킷 손실 수' },
      { name: 'buffering_cnt', type: 'int', nullable: true, description: '버퍼링 횟수' },
      { name: 'bitrate_avg', type: 'float', nullable: true, description: '평균 비트레이트 (kbps)' },
    ],
    tags: ['iptv', 'quality', 'stb', '5min', 'realtime'],
    owners: ['data-platform@company.com'],
    lastModified: '2024-01-15T10:30:00Z',
  },
  {
    urn: 'urn:li:dataset:(urn:li:dataPlatform:hive,iptv.tb_stb_quality_daily_dist,PROD)',
    name: 'tb_stb_quality_daily_dist',
    platform: 'hive',
    schema: 'iptv',
    description: '일별 품질 정규분포 통계 테이블. tb_stb_5min_qual 데이터를 일단위로 집계한 통계 데이터.',
    columns: [
      { name: 'stat_date', type: 'date', nullable: false, description: '통계일자', isPrimaryKey: true },
      { name: 'stb_model_cd', type: 'varchar(50)', nullable: false, description: '장비모델코드', isPrimaryKey: true },
      { name: 'mlr_mean', type: 'float', nullable: true, description: 'MLR 평균' },
      { name: 'mlr_stddev', type: 'float', nullable: true, description: 'MLR 표준편차' },
      { name: 'jitter_mean', type: 'float', nullable: true, description: 'Jitter 평균' },
      { name: 'jitter_stddev', type: 'float', nullable: true, description: 'Jitter 표준편차' },
    ],
    tags: ['iptv', 'quality', 'stb', 'daily', 'statistics', 'aggregation'],
    owners: ['data-platform@company.com'],
    lastModified: '2024-01-15T08:00:00Z',
  },
  {
    urn: 'urn:li:dataset:(urn:li:dataPlatform:hive,iptv.tb_stb_master,PROD)',
    name: 'tb_stb_master',
    platform: 'hive',
    schema: 'iptv',
    description: 'STB 장비 마스터 테이블. 모든 STB 장비의 기본 정보.',
    columns: [
      { name: 'stb_id', type: 'varchar(50)', nullable: false, description: 'STB 고유 ID', isPrimaryKey: true },
      { name: 'stb_model_cd', type: 'varchar(50)', nullable: false, description: '장비모델코드' },
      { name: 'customer_id', type: 'varchar(50)', nullable: true, description: '고객 ID' },
      { name: 'install_date', type: 'date', nullable: true, description: '설치일자' },
      { name: 'region_cd', type: 'varchar(10)', nullable: true, description: '지역코드' },
      { name: 'firmware_version', type: 'varchar(20)', nullable: true, description: '펌웨어 버전' },
    ],
    tags: ['iptv', 'stb', 'master', 'device'],
    owners: ['device-team@company.com'],
    lastModified: '2024-01-10T14:00:00Z',
  },
  {
    urn: 'urn:li:dataset:(urn:li:dataPlatform:hive,iptv.tb_channel_schedule,PROD)',
    name: 'tb_channel_schedule',
    platform: 'hive',
    schema: 'iptv',
    description: '채널 편성표 테이블. TV 채널별 프로그램 스케줄 정보.',
    columns: [
      { name: 'channel_id', type: 'varchar(20)', nullable: false, description: '채널 ID', isPrimaryKey: true },
      { name: 'program_id', type: 'varchar(50)', nullable: false, description: '프로그램 ID', isPrimaryKey: true },
      { name: 'start_time', type: 'timestamp', nullable: false, description: '시작시간', isPrimaryKey: true },
      { name: 'end_time', type: 'timestamp', nullable: false, description: '종료시간' },
      { name: 'program_name', type: 'varchar(200)', nullable: true, description: '프로그램명' },
      { name: 'genre', type: 'varchar(50)', nullable: true, description: '장르' },
    ],
    tags: ['iptv', 'channel', 'schedule', 'program'],
    owners: ['content-team@company.com'],
    lastModified: '2024-01-14T20:00:00Z',
  },
];

// Lineage Edges
export const LINEAGE_EDGES: LineageEdge[] = [
  {
    sourceUrn: 'urn:li:dataset:(urn:li:dataPlatform:hive,iptv.tb_stb_5min_qual,PROD)',
    targetUrn: 'urn:li:dataset:(urn:li:dataPlatform:hive,iptv.tb_stb_quality_daily_dist,PROD)',
    type: 'TRANSFORMED',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    sourceUrn: 'urn:li:dataset:(urn:li:dataPlatform:hive,iptv.tb_stb_master,PROD)',
    targetUrn: 'urn:li:dataset:(urn:li:dataPlatform:hive,iptv.tb_stb_5min_qual,PROD)',
    type: 'DERIVED',
    createdAt: '2024-01-01T00:00:00Z',
  },
];

// In-memory store for newly registered lineage
const additionalLineageEdges: LineageEdge[] = [];

export function getDatasetByUrn(urn: string): DatasetSchema | undefined {
  return DATASETS.find(d => d.urn === urn);
}

export function getDatasetByName(name: string): DatasetSchema | undefined {
  const normalizedName = name.toLowerCase();
  return DATASETS.find(
    d =>
      d.name.toLowerCase() === normalizedName ||
      `${d.schema}.${d.name}`.toLowerCase() === normalizedName
  );
}

export function searchDatasets(query: string, limit: number = 10): DatasetSchema[] {
  const normalizedQuery = query.toLowerCase();
  const results = DATASETS.filter(dataset => {
    // Search in name
    if (dataset.name.toLowerCase().includes(normalizedQuery)) return true;
    // Search in description
    if (dataset.description?.toLowerCase().includes(normalizedQuery)) return true;
    // Search in tags
    if (dataset.tags?.some(tag => tag.toLowerCase().includes(normalizedQuery))) return true;
    // Search in column names and descriptions
    if (dataset.columns.some(
      col =>
        col.name.toLowerCase().includes(normalizedQuery) ||
        col.description?.toLowerCase().includes(normalizedQuery)
    )) return true;
    return false;
  });

  return results.slice(0, limit);
}

export function getAllLineageEdges(): LineageEdge[] {
  return [...LINEAGE_EDGES, ...additionalLineageEdges];
}

export function getUpstreamLineage(urn: string, depth: number = 1): LineageNode[] {
  const visited = new Set<string>();
  const result: LineageNode[] = [];

  function traverse(currentUrn: string, currentDepth: number) {
    if (currentDepth > depth || visited.has(currentUrn)) return;
    visited.add(currentUrn);

    const edges = getAllLineageEdges().filter(e => e.targetUrn === currentUrn);
    for (const edge of edges) {
      const dataset = getDatasetByUrn(edge.sourceUrn);
      if (dataset && !visited.has(edge.sourceUrn)) {
        result.push({
          urn: dataset.urn,
          name: `${dataset.schema}.${dataset.name}`,
          platform: dataset.platform,
          type: edge.type,
          distance: currentDepth,
        });
        traverse(edge.sourceUrn, currentDepth + 1);
      }
    }
  }

  traverse(urn, 1);
  return result;
}

export function getDownstreamLineage(urn: string, depth: number = 1): LineageNode[] {
  const visited = new Set<string>();
  const result: LineageNode[] = [];

  function traverse(currentUrn: string, currentDepth: number) {
    if (currentDepth > depth || visited.has(currentUrn)) return;
    visited.add(currentUrn);

    const edges = getAllLineageEdges().filter(e => e.sourceUrn === currentUrn);
    for (const edge of edges) {
      const dataset = getDatasetByUrn(edge.targetUrn);
      if (dataset && !visited.has(edge.targetUrn)) {
        result.push({
          urn: dataset.urn,
          name: `${dataset.schema}.${dataset.name}`,
          platform: dataset.platform,
          type: edge.type,
          distance: currentDepth,
        });
        traverse(edge.targetUrn, currentDepth + 1);
      }
    }
  }

  traverse(urn, 1);
  return result;
}

export function registerLineage(edge: LineageEdge): void {
  // Check if edge already exists
  const exists = getAllLineageEdges().some(
    e => e.sourceUrn === edge.sourceUrn && e.targetUrn === edge.targetUrn
  );

  if (!exists) {
    additionalLineageEdges.push({
      ...edge,
      createdAt: new Date().toISOString(),
    });
  }
}
