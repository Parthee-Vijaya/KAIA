import { randomUUID } from 'node:crypto';
import { sql, db } from './db';
import * as schema from './schema';
import { and, or, eq, gte, lte, inArray, asc, sql as drizzleSql } from 'drizzle-orm';
import { ApiError } from './errors';
import { lockRunningAnalysisRequest, completeAnalysisRequest } from './analysis-requests';
import { allowedEntities, canAccessDocument, isCouncilOnly } from '@/domain/policy';
import { DATASET_VERSION, type Dataset } from '@/domain/data';
import { assertAnalysisContext } from '@/domain/analysis';
import type { DashboardScope } from '@/domain/dashboard';
import type {
  AccessContext,
  Analysis,
  AnalysisContext,
  Conversation,
  Entity,
  LedgerRow,
  SavedInsight,
  SavedScenario,
} from '@/domain/types';
export async function datasetMetadata(version = DATASET_VERSION) {
  const [m] = await sql()`SELECT * FROM kaia_datasets WHERE version=${version}`;
  if (!m) throw new ApiError(503, 'Datasættet er ikke indlæst. Kør migration og seed.');
  return {
    version: m.version,
    referenceDate: m.reference_date,
    rowCount: m.row_count,
    documentCount: m.document_count,
    seed: m.seed,
    demography: m.demography,
    coverage: m.coverage || { fromYear: 2023, toYear: 2028 },
    municipalMetadata: m.municipal_metadata || undefined,
  };
}
export async function allEntities(version = DATASET_VERSION) {
  const rows = await db()
    .select({ data: schema.entities.data })
    .from(schema.entities)
    .where(eq(schema.entities.version, version))
    .orderBy(asc(schema.entities.id));
  return rows.map((r) => r.data);
}
export async function loadDatasetShell(
  access: AccessContext,
  version = DATASET_VERSION,
): Promise<Dataset> {
  const meta = await datasetMetadata(version);
  const entities = await allEntities(version);
  if (!allowedEntities(access, entities).length)
    throw new ApiError(403, 'Du har ikke adgang til data i dette snapshot.');
  return {
    version: meta.version,
    seed: meta.seed,
    referenceDate: meta.referenceDate,
    entities,
    demography: meta.demography,
    coverage: meta.coverage,
    municipalMetadata: meta.municipalMetadata,
    rows: [],
    documents: [],
  };
}
export async function loadDataset(
  access: AccessContext,
  context?: AnalysisContext,
  version = DATASET_VERSION,
): Promise<Dataset> {
  const meta = await datasetMetadata(version);
  const entities = await allEntities(version);
  const permitted = allowedEntities(access, entities)
    .filter((e) => e.type !== 'committee' && (!context || context.entityIds.includes(e.id)))
    .map((e) => e.id);
  const currentYear = context?.period.year || Number(meta.referenceDate.slice(0, 4));
  const comparisonYear = context?.comparison?.year || currentYear - 1;
  const minYear =
    context?.intent === 'trend'
      ? meta.coverage.fromYear
      : context?.intent === 'projection'
        ? Number(meta.referenceDate.slice(0, 4))
        : context?.intent === 'yearComparison'
          ? Math.min(currentYear, comparisonYear)
          : ['pricequantity', 'energy', 'scenario'].includes(context?.intent || '')
            ? Math.max(meta.coverage.fromYear, currentYear - 1)
            : currentYear;
  const maxYear =
    context?.intent === 'projection'
      ? context.projectionEndYear || currentYear
      : context?.intent === 'yearComparison'
        ? Math.max(currentYear, comparisonYear)
        : currentYear;
  const entireArea =
    !!context &&
    permitted.length ===
      entities.filter((entity) => entity.type !== 'committee' && entity.area === context.area)
        .length;
  if (!permitted.length) throw new ApiError(403, 'Du har ikke adgang til data i dette snapshot.');
  const [records, docs, profiles, benchmarks] = await Promise.all([
    db()
      .select()
      .from(schema.ledger)
      .where(
        and(
          eq(schema.ledger.version, version),
          inArray(schema.ledger.entityId, permitted),
          or(
            and(gte(schema.ledger.year, minYear), lte(schema.ledger.year, maxYear)),
            and(eq(schema.ledger.category, 'energy'), eq(schema.ledger.year, 2023)),
          ),
        ),
      )
      .orderBy(
        asc(schema.ledger.entityId),
        asc(schema.ledger.year),
        asc(schema.ledger.month),
        asc(schema.ledger.category),
        asc(schema.ledger.kind),
        asc(schema.ledger.id),
      ),
    db()
      .select({ data: schema.documents.data })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.version, version),
          inArray(schema.documents.area, access.areas),
          isCouncilOnly(access) ? eq(schema.documents.classification, 'political') : undefined,
        ),
      ),
    context?.intent === 'municipalBenchmark'
      ? db()
          .select({ data: schema.municipalProfiles.data })
          .from(schema.municipalProfiles)
          .where(eq(schema.municipalProfiles.version, version))
      : Promise.resolve([]),
    context?.intent === 'municipalBenchmark' && entireArea
      ? db()
          .select({ data: schema.municipalBenchmarks.data })
          .from(schema.municipalBenchmarks)
          .where(
            and(
              eq(schema.municipalBenchmarks.version, version),
              eq(schema.municipalBenchmarks.area, context.area),
              gte(schema.municipalBenchmarks.year, minYear),
              lte(schema.municipalBenchmarks.year, maxYear),
            ),
          )
      : Promise.resolve([]),
  ]);
  const rows: LedgerRow[] = records.map(({ version, quantity, unitPriceOre, ...row }) => ({
    datasetVersion: version,
    ...row,
    ...(quantity !== null && unitPriceOre !== null ? { quantity, unitPriceOre } : {}),
  }));
  return {
    version: meta.version,
    seed: meta.seed,
    referenceDate: meta.referenceDate,
    entities,
    demography: meta.demography,
    coverage: meta.coverage,
    municipalities: profiles.map((row) => row.data),
    municipalBenchmarks: benchmarks.map((row) => row.data),
    municipalMetadata: meta.municipalMetadata,
    rows,
    documents: docs.map((r) => r.data).filter((d) => canAccessDocument(access, d, entities)),
  };
}
/** One scoped dashboard read. Metadata/entities are reused from the already loaded, validated shell. */
export async function loadDashboardDataset(
  access: AccessContext,
  scope: DashboardScope,
  shell: Dataset,
  options: { includeForecast?: boolean } = {},
): Promise<Dataset> {
  assertAnalysisContext(access, { ...scope, intent: 'budget' }, shell.entities);
  if (
    scope.entityIds.some(
      (id) =>
        !shell.entities.some(
          (entity) => entity.id === id && entity.type !== 'committee' && entity.area === scope.area,
        ),
    )
  )
    throw new ApiError(403, 'Dashboardet kræver driftsenheder fra det tilladte fagområde.');
  const includeForecast = options.includeForecast !== false;
  const range = shell.coverage || { fromYear: 2023, toYear: 2028 };
  const referenceYear = Number(shell.referenceDate.slice(0, 4));
  const years = new Set([scope.period.year]);
  if (includeForecast) {
    years.add(scope.period.year - 1);
    for (let year = referenceYear; year <= 2032; year++) years.add(year);
  }
  const selectedYears = [...years].filter((year) => year >= range.fromYear && year <= range.toYear);
  const entireArea = shell.entities
    .filter((entity) => entity.type !== 'committee' && entity.area === scope.area)
    .every((entity) => scope.entityIds.includes(entity.id));
  const [records, documents, profiles, benchmarks] = await Promise.all([
    selectedYears.length
      ? db()
          .select()
          .from(schema.ledger)
          .where(
            and(
              eq(schema.ledger.version, shell.version),
              inArray(schema.ledger.entityId, scope.entityIds),
              inArray(schema.ledger.year, selectedYears),
            ),
          )
          .orderBy(
            asc(schema.ledger.entityId),
            asc(schema.ledger.year),
            asc(schema.ledger.month),
            asc(schema.ledger.category),
            asc(schema.ledger.kind),
            asc(schema.ledger.id),
          )
      : Promise.resolve([]),
    db()
      .select({ data: schema.documents.data })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.version, shell.version),
          eq(schema.documents.area, scope.area),
          isCouncilOnly(access) ? eq(schema.documents.classification, 'political') : undefined,
          drizzleSql`${schema.documents.data}->'entityIds' <@ ${JSON.stringify(scope.entityIds)}::jsonb`,
        ),
      ),
    includeForecast && entireArea
      ? db()
          .select({ data: schema.municipalProfiles.data })
          .from(schema.municipalProfiles)
          .where(eq(schema.municipalProfiles.version, shell.version))
          .orderBy(asc(schema.municipalProfiles.id))
      : Promise.resolve([]),
    includeForecast && entireArea
      ? db()
          .select({ data: schema.municipalBenchmarks.data })
          .from(schema.municipalBenchmarks)
          .where(
            and(
              eq(schema.municipalBenchmarks.version, shell.version),
              eq(schema.municipalBenchmarks.area, scope.area),
              eq(schema.municipalBenchmarks.year, scope.period.year),
              gte(schema.municipalBenchmarks.month, scope.period.fromMonth),
              lte(schema.municipalBenchmarks.month, scope.period.toMonth),
            ),
          )
          .orderBy(asc(schema.municipalBenchmarks.id))
      : Promise.resolve([]),
  ]);
  const rows: LedgerRow[] = records.map(({ version, quantity, unitPriceOre, ...row }) => ({
    datasetVersion: version,
    ...row,
    ...(quantity !== null && unitPriceOre !== null ? { quantity, unitPriceOre } : {}),
  }));
  return {
    ...shell,
    rows,
    documents: documents
      .map((row) => row.data)
      .filter(
        (document) =>
          document.datasetVersion === shell.version &&
          canAccessDocument(access, document, shell.entities),
      ),
    municipalities: profiles.map((row) => row.data),
    municipalBenchmarks: benchmarks.map((row) => row.data),
  };
}
export function assertAnalysisAccess(
  access: AccessContext,
  analysis: Analysis,
  entities: Entity[],
) {
  const permitted = new Set(allowedEntities(access, entities).map((e) => e.id));
  if (
    !analysis.context.entityIds.length ||
    !access.areas.includes(analysis.context.area) ||
    analysis.context.entityIds.some((id) => !permitted.has(id))
  )
    throw new ApiError(403, 'Den gemte analyse ligger uden for dit aktuelle adgangsområde.');
  if (
    isCouncilOnly(access) &&
    (['comparison', 'energy', 'heatmap', 'mobilityCapacity'].includes(
      analysis.context.intent || '',
    ) ||
      analysis.sources.some((s) => s.rowIds?.length) ||
      analysis.context.entityIds.length <
        allowedEntities(access, entities).filter(
          (e) => e.area === analysis.context.area && e.type !== 'committee',
        ).length)
  )
    throw new ApiError(403, 'Den gemte analyse kræver detaljeret adgang.');
}
async function assertStoredAnalysisAccess(access: AccessContext, analysis: Analysis) {
  const entities = await allEntities(analysis.datasetVersion);
  assertAnalysisAccess(access, analysis, entities);
  const ids = analysis.sources.flatMap((s) => (s.documentId ? [s.documentId] : []));
  if (!ids.length) return;
  const rows =
    await sql()`SELECT data FROM kaia_documents WHERE dataset_version=${analysis.datasetVersion} AND id IN ${sql()(ids)}`;
  if (
    rows.length !== new Set(ids).size ||
    rows.some((r) => !canAccessDocument(access, r.data, entities))
  )
    throw new ApiError(
      403,
      'En kilde i analysen kræver et andet adgangsområde eller en anden klassifikation.',
    );
}
export async function ownedAnalysis(user: AccessContext, id: string) {
  const [row] =
    await sql()`SELECT data FROM kaia_analyses WHERE id=${id} AND owner_id=${user.userId}`;
  if (!row) throw new ApiError(404, 'Analysen blev ikke fundet.');
  const a = row.data as Analysis;
  await assertStoredAnalysisAccess(user, a);
  return a;
}
export async function conversation(user: AccessContext, id: string): Promise<Conversation> {
  const [c] =
    await sql()`SELECT * FROM kaia_conversations WHERE id=${id} AND owner_id=${user.userId}`;
  if (!c) throw new ApiError(404, 'Samtalen blev ikke fundet.');
  const rows =
    await sql()`SELECT data FROM kaia_analyses WHERE conversation_id=${id} AND owner_id=${user.userId} ORDER BY created_at`;
  const analyses = rows.map((r) => r.data as Analysis);
  await Promise.all(analyses.map((a) => assertStoredAnalysisAccess(user, a)));
  return { id: c.id, title: c.title, updatedAt: new Date(c.updated_at).toISOString(), analyses };
}
export async function saveAnalysis(
  user: AccessContext,
  analysis: Analysis,
  conversationId?: string,
  requestId?: string,
) {
  const id = conversationId || randomUUID();
  if (conversationId) await conversation(user, id);
  const saved: Analysis = {
    ...analysis,
    formulation: analysis.formulation || { provider: 'demo', model: 'Deterministisk analyse' },
    analysisId: randomUUID(),
    conversationId: id,
  };
  await assertStoredAnalysisAccess(user, saved);
  await sql().begin(async (tx) => {
    if (requestId) await lockRunningAnalysisRequest(tx, user, requestId);
    if (!conversationId)
      await tx`INSERT INTO kaia_conversations(id,owner_id,title) VALUES(${id},${user.userId},${analysis.question.slice(0, 120)})`;
    await tx`INSERT INTO kaia_analyses(id,conversation_id,owner_id,data) VALUES(${saved.analysisId},${id},${user.userId},${tx.json(saved as never)})`;
    await tx`UPDATE kaia_conversations SET updated_at=now() WHERE id=${id} AND owner_id=${user.userId}`;
    if (requestId) await completeAnalysisRequest(tx, user, requestId, saved.analysisId);
  });
  return saved;
}
export async function lists(user: AccessContext) {
  const [cs, is, ss] = await Promise.all([
    sql()`SELECT c.id,c.title,c.updated_at,(SELECT jsonb_agg(a.data) FROM kaia_analyses a WHERE a.conversation_id=c.id AND a.owner_id=${user.userId}) AS snapshots FROM kaia_conversations c WHERE c.owner_id=${user.userId} ORDER BY c.updated_at DESC LIMIT 60`,
    sql()`SELECT * FROM kaia_insights WHERE owner_id=${user.userId} ORDER BY created_at DESC LIMIT 100`,
    sql()`SELECT * FROM kaia_scenarios WHERE owner_id=${user.userId} ORDER BY created_at DESC LIMIT 100`,
  ]);
  const canRead = async (a: Analysis) => {
    try {
      await assertStoredAnalysisAccess(user, a);
      return true;
    } catch {
      return false;
    }
  };
  const [conversationAllowed, insightAllowed, scenarioAllowed] = await Promise.all([
    Promise.all(
      cs.map(async (c) =>
        (await Promise.all((c.snapshots || []).map((a: Analysis) => canRead(a)))).every(Boolean),
      ),
    ),
    Promise.all(is.map((r) => canRead(r.analysis))),
    Promise.all(ss.map((r) => canRead(r.analysis))),
  ]);
  return {
    conversations: cs
      .filter((_, i) => conversationAllowed[i])
      .map(
        (c) =>
          ({
            id: c.id,
            title: c.title,
            updatedAt: new Date(c.updated_at).toISOString(),
            analyses: [],
          }) as Conversation,
      ),
    insights: is
      .filter((_, i) => insightAllowed[i])
      .map(
        (r) =>
          ({
            id: r.id,
            title: r.title,
            createdAt: new Date(r.created_at).toISOString(),
            analysis: r.analysis,
          }) as SavedInsight,
      ),
    scenarios: ss
      .filter((_, i) => scenarioAllowed[i])
      .map(
        (r) =>
          ({
            id: r.id,
            title: r.title,
            createdAt: new Date(r.created_at).toISOString(),
            context: r.analysis.context,
            assumptions: r.analysis.scenario?.assumptions || r.analysis.context.scenario,
            analysis: r.analysis,
          }) as SavedScenario,
      ),
  };
}
export const DEMO_LOGIN_BUDGET_KEY = 'global:demo-logins';
export const DEMO_ANALYSIS_BUDGET_KEY = 'global:demo-analyses';
/** Atomic saturation avoids both races and unlimited increments after a public quota is exhausted. */
export async function consumeUsageBudget(key: string, limit: number, message: string) {
  const [row] =
    await sql()`INSERT INTO kaia_usage(user_id,window_start,count) VALUES(${key},date_trunc('hour',now()),1) ON CONFLICT(user_id,window_start) DO UPDATE SET count=kaia_usage.count+1 WHERE kaia_usage.count<${limit} RETURNING count`;
  if (!row) throw new ApiError(429, message);
}
export async function consumeDemoLoginBudget() {
  await consumeUsageBudget(
    DEMO_LOGIN_BUDGET_KEY,
    120,
    'Demoen har nået grænsen på 120 nye login i timen. Prøv igen senere.',
  );
}
export async function consumeAnalysisBudget(user: AccessContext) {
  await consumeUsageBudget(
    user.userId,
    60,
    'Du har nået grænsen på 60 analyser i timen. Prøv senere.',
  );
  if (user.userId.startsWith('demo:'))
    await consumeUsageBudget(
      DEMO_ANALYSIS_BUDGET_KEY,
      300,
      'Demoen har nået den fælles grænse på 300 analyser i timen. Prøv igen senere.',
    );
}
export async function audit(user: AccessContext, action: string, target: string) {
  await sql()`INSERT INTO kaia_audit(user_id,action,target) VALUES(${user.userId},${action},${target.slice(0, 200)})`;
}
/** Slider previews have no model calls or writes to user artefacts; a separate minute budget keeps interaction usable. */
export async function consumePreviewBudget(user: AccessContext) {
  const [row] =
    await sql()`INSERT INTO kaia_usage(user_id,window_start,count) VALUES(${`preview:${user.userId}`},date_trunc('minute',now()),1) ON CONFLICT(user_id,window_start) DO UPDATE SET count=kaia_usage.count+1 RETURNING count`;
  if (row.count > 120)
    throw new ApiError(429, 'For mange scenarieændringer. Vent et øjeblik og prøv igen.');
}
