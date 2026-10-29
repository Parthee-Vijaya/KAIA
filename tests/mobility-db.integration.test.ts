import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { sql, closeDb } from '../src/server/db';
import { loadDatasetShell, saveAnalysis, ownedAnalysis } from '../src/server/repository';
import { buildMobilityAnalysis, DEFAULT_MOBILITY } from '../src/domain/mobility';
import { MOBILITY_QUESTION } from '../src/domain/mobility-question';
import { getPlanDraft, preparePlanDraft, approvePlanDraft } from '../src/server/plan-drafts';
import type { AccessContext, Analysis, AnalysisContext } from '../src/domain/types';
const run = process.env.KAIA_DB_TEST === '1';
const a: AccessContext = {
  userId: `mobility-fixture-${randomUUID()}`,
  tenantId: 'local-test',
  objectId: randomUUID(),
  displayName: 'Fagchef',
  title: 'Fagchef',
  roles: ['KAIA.DepartmentHead'],
  areas: ['schools'],
  unitIds: ['school-hoeng'],
};
const b = { ...a, userId: `mobility-fixture-${randomUUID()}`, objectId: randomUUID() };
let analysis: Analysis, planId: string, fingerprint: string;
describe.skipIf(!run)('Real local Postgres: capacity-plan ownership and mandate', () => {
  beforeAll(async () => {
    config({ path: '.env.local', quiet: true });
    vi.stubEnv('KAIA_TEST_MODE', '1');
    vi.stubEnv('VERCEL', '');
    for (const u of [a, b]) {
      await sql()`INSERT INTO kaia_users(id,tenant_id,object_id,roles,display_name,title) VALUES(${u.userId},${u.tenantId},${u.objectId},${sql().json(u.roles)},${u.displayName},${u.title})`;
      await sql()`INSERT INTO kaia_grants(user_id,unit_ids,areas) VALUES(${u.userId},${sql().json(u.unitIds)},${sql().json(u.areas)})`;
    }
    const shell = await loadDatasetShell(a);
    const context: AnalysisContext = {
      area: 'schools',
      entityIds: ['school-hoeng'],
      period: { year: 2026, fromMonth: 1, toMonth: 12 },
      metric: 'net',
      intent: 'mobilityCapacity',
    };
    analysis = await saveAnalysis(
      a,
      buildMobilityAnalysis(MOBILITY_QUESTION, a, context, shell, DEFAULT_MOBILITY),
    );
  });
  afterAll(async () => {
    for (const u of [a, b]) {
      await sql()`DELETE FROM kaia_plan_drafts WHERE owner_id=${u.userId}`;
      await sql()`DELETE FROM kaia_audit WHERE user_id=${u.userId}`;
      await sql()`DELETE FROM kaia_analyses WHERE owner_id=${u.userId}`;
      await sql()`DELETE FROM kaia_conversations WHERE owner_id=${u.userId}`;
      await sql()`DELETE FROM kaia_grants WHERE user_id=${u.userId}`;
      await sql()`DELETE FROM kaia_users WHERE id=${u.userId}`;
    }
    await closeDb();
    vi.unstubAllEnvs();
  });
  it('starts without a draft and prepares one immutable owned snapshot', async () => {
    expect(await getPlanDraft(a, analysis.analysisId)).toBeNull();
    const plan = await preparePlanDraft(a, analysis.analysisId);
    planId = plan.id;
    fingerprint = plan.fingerprint;
    expect(plan.state).toBe('pending');
    expect((await preparePlanDraft(a, analysis.analysisId)).id).toBe(planId);
    expect(plan.canApprove).toBe(true);
  });
  it('does not disclose another owner’s draft or analysis', async () => {
    await expect(getPlanDraft(b, analysis.analysisId)).rejects.toMatchObject({ status: 404 });
    await expect(preparePlanDraft(b, analysis.analysisId)).rejects.toMatchObject({ status: 404 });
    await expect(approvePlanDraft(b, planId, fingerprint)).rejects.toMatchObject({ status: 404 });
  });
  it('rechecks scope and council detail restrictions when reopening', async () => {
    await expect(
      getPlanDraft({ ...a, unitIds: ['school-nyrup'] }, analysis.analysisId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      getPlanDraft({ ...a, roles: ['KAIA.Council'] }, analysis.analysisId),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('requires a separate approval mandate and exact fingerprint', async () => {
    await expect(
      approvePlanDraft({ ...a, roles: ['KAIA.Finance'] }, planId, fingerprint),
    ).rejects.toMatchObject({ status: 403 });
    await expect(approvePlanDraft(a, planId, '0'.repeat(64))).rejects.toMatchObject({
      status: 409,
    });
    expect((await getPlanDraft(a, analysis.analysisId))!.state).toBe('pending');
  });
  it('approves once, journals once and preserves the original analysis', async () => {
    const approved = await approvePlanDraft(a, planId, fingerprint);
    const again = await approvePlanDraft(a, planId, fingerprint);
    expect(approved.state).toBe('approved');
    expect(again.approvedAt).toBe(approved.approvedAt);
    const [audit] =
      await sql()`SELECT count(*) AS n FROM kaia_audit WHERE target=${planId} AND action='plan.approve'`;
    expect(Number(audit.n)).toBe(1);
    expect(await ownedAnalysis(a, analysis.analysisId)).toEqual(analysis);
  });
  it('does not transfer approval to a newly saved scenario', async () => {
    const shell = await loadDatasetShell(a);
    const next = await saveAnalysis(
      a,
      buildMobilityAnalysis(
        MOBILITY_QUESTION,
        a,
        analysis.context,
        shell,
        { ...DEFAULT_MOBILITY, extraClasses: 1 },
        analysis.mobility,
      ),
      analysis.conversationId,
    );
    expect(await getPlanDraft(a, next.analysisId)).toBeNull();
    const plan = await preparePlanDraft(a, next.analysisId);
    expect(plan.state).toBe('pending');
    expect(plan.fingerprint).not.toBe(fingerprint);
  });
});
