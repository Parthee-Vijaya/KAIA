import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  bigint,
  numeric,
  primaryKey,
  index,
  uuid,
  check,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type {
  Analysis,
  Entity,
  DemoDocument,
  Role,
  Area,
  Category,
  LedgerRow,
} from '@/domain/types';
import type {
  MunicipalBenchmarkMetadata,
  MunicipalBenchmarkRow,
  MunicipalProfile,
} from '@/domain/municipalities';
export const users = pgTable('kaia_users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  objectId: text('object_id').notNull(),
  roles: jsonb('roles').$type<Role[]>().notNull(),
  displayName: text('display_name').notNull(),
  title: text('title').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
export const grants = pgTable('kaia_grants', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  unitIds: jsonb('unit_ids').$type<string[]>().notNull(),
  areas: jsonb('areas').$type<Area[]>().notNull(),
});
export const sessions = pgTable('kaia_sessions', {
  idHash: text('id_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  testOnly: integer('test_only').notNull().default(0),
  demoOnly: integer('demo_only').notNull().default(0),
  demoProfile: text('demo_profile').$type<'executive' | 'school' | 'council'>(),
});
export const datasets = pgTable('kaia_datasets', {
  version: text('version').primaryKey(),
  seed: text('seed').notNull(),
  referenceDate: text('reference_date').notNull(),
  contentHash: text('content_hash'),
  rowCount: integer('row_count').notNull(),
  documentCount: integer('document_count').notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow(),
  coverage: jsonb('coverage').$type<{ fromYear: number; toYear: number }>().notNull(),
  municipalMetadata: jsonb('municipal_metadata').$type<MunicipalBenchmarkMetadata>(),
});
export const municipalProfiles = pgTable(
  'kaia_municipal_profiles',
  {
    version: text('dataset_version').notNull(),
    id: text('id').notNull(),
    data: jsonb('data').$type<MunicipalProfile>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.version, t.id] })],
);
export const municipalBenchmarks = pgTable(
  'kaia_municipal_benchmarks',
  {
    version: text('dataset_version').notNull(),
    id: text('id').notNull(),
    municipalityId: text('municipality_id').notNull(),
    area: text('area').$type<Area>().notNull(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    kind: text('kind').notNull(),
    data: jsonb('data').$type<MunicipalBenchmarkRow>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.version, t.id] }),
    index('kaia_municipal_scope_idx').on(t.version, t.area, t.year, t.municipalityId),
  ],
);
export const entities = pgTable(
  'kaia_entities',
  {
    version: text('dataset_version').notNull(),
    id: text('id').notNull(),
    area: text('area').notNull(),
    data: jsonb('data').$type<Entity>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.version, t.id] })],
);
export const ledger = pgTable(
  'kaia_ledger',
  {
    version: text('dataset_version').notNull(),
    id: text('id').notNull(),
    entityId: text('entity_id').notNull(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    category: text('category').$type<Category>().notNull(),
    kind: text('kind').$type<LedgerRow['kind']>().notNull(),
    amountOre: bigint('amount_ore', { mode: 'number' }).notNull(),
    quantity: numeric('quantity', { mode: 'number' }),
    unitPriceOre: bigint('unit_price_ore', { mode: 'number' }),
  },
  (t) => [
    primaryKey({ columns: [t.version, t.id] }),
    index('kaia_ledger_scope_idx').on(t.version, t.entityId, t.year, t.kind),
  ],
);
export const documents = pgTable(
  'kaia_documents',
  {
    version: text('dataset_version').notNull(),
    id: text('id').notNull(),
    area: text('area').notNull(),
    classification: text('classification').notNull(),
    data: jsonb('data').$type<DemoDocument>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.version, t.id] })],
);
export const conversations = pgTable('kaia_conversations', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
export const analyses = pgTable('kaia_analyses', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  data: jsonb('data').$type<Analysis>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
export const analysisRequests = pgTable(
  'kaia_analysis_requests',
  {
    requestId: uuid('request_id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    state: text('state').$type<'running' | 'cancelled' | 'completed'>().notNull(),
    jobKind: text('job_kind').$type<'analysis' | 'explanation'>().notNull().default('analysis'),
    analysisId: text('analysis_id').references(() => analyses.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('kaia_analysis_requests_owner_idx').on(t.ownerId, t.updatedAt),
    check(
      'kaia_analysis_requests_state_check',
      sql`${t.state} IN ('running','cancelled','completed')`,
    ),
    check('kaia_analysis_requests_kind_check', sql`${t.jobKind} IN ('analysis','explanation')`),
    check(
      'kaia_analysis_requests_terminal_check',
      sql`(${t.state}='completed' AND ${t.jobKind}='analysis' AND ${t.analysisId} IS NOT NULL) OR (${t.state}='completed' AND ${t.jobKind}='explanation' AND ${t.analysisId} IS NULL) OR (${t.state} IN ('running','cancelled') AND ${t.analysisId} IS NULL)`,
    ),
  ],
);
export const insights = pgTable('kaia_insights', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  analysis: jsonb('analysis').$type<Analysis>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
export const scenarios = pgTable('kaia_scenarios', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  analysis: jsonb('analysis').$type<Analysis>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
export const configuration = pgTable('kaia_configuration', {
  key: text('key').primaryKey(),
  data: jsonb('data').notNull(),
  encryptedSecret: text('encrypted_secret'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const planDrafts = pgTable(
  'kaia_plan_drafts',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    analysisId: text('analysis_id')
      .notNull()
      .references(() => analyses.id),
    fingerprint: text('fingerprint').notNull(),
    state: text('state').$type<'pending' | 'approved'>().notNull(),
    draft: jsonb('draft').$type<import('./plan-drafts').PlanDraft['draft']>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
  },
  (t) => [
    unique().on(t.ownerId, t.analysisId),
    index('kaia_plan_drafts_owner').on(t.ownerId, t.analysisId),
  ],
);
