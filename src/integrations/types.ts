import type { AccessContext, Area, Period, Role } from '../domain/types';

export type DataStatus = 'simulated' | 'verified-public-snapshot' | 'public-api-extract';
export type SourceOperation =
  'aggregate' | 'detail' | 'document' | 'series' | 'export' | 'ingest' | 'tool';
export interface CatalogSource {
  id: string;
  title: string;
  description: string;
  status: DataStatus;
  kind: 'ledger' | 'documents' | 'context' | 'mcp' | 'cli';
  areas: Area[];
  unitIds: string[];
  roles: Role[];
  operations: SourceOperation[];
  geography: string;
  frequency: string;
  unit: string;
  period: { fromYear: number; toYear: number };
  observedAt: string;
  retrievedAt: string;
  sourceUrl?: string;
  tools: string[];
  concepts: string[];
  integration: 'implemented' | 'fixture' | 'requires-configuration';
}
export interface SourceRequest {
  sourceId: string;
  operation: SourceOperation;
  area: Area;
  unitIds: string[];
  period: Period;
  periodRange?: { fromYear: number; toYear: number };
}
export interface QueryPlan {
  question: string;
  steps: Array<SourceRequest & { reason: string; optional?: boolean }>;
  explanation: string;
}
export type { ContextSeries } from '../domain/types';
export type Policy = (access: AccessContext, request: SourceRequest) => CatalogSource;
export interface IntegrationAudit {
  event: 'integration.call';
  userId: string;
  sourceId: string;
  operation: string;
  outcome: 'ok' | 'denied' | 'error';
  durationMs: number;
  timestamp: string;
}
