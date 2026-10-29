import { createHash, randomUUID } from 'node:crypto';
import { sql } from './db';
import { ApiError } from './errors';
import { ownedAnalysis } from './repository';
import type { AccessContext, Analysis } from '@/domain/types';
import { money } from '@/domain/format';
import { MOBILITY_VERSION } from '@/domain/mobility';

export interface PlanDraft {
  id: string;
  analysisId: string;
  fingerprint: string;
  state: 'pending' | 'approved';
  createdAt: string;
  approvedAt?: string;
  canApprove: boolean;
  draft: {
    title: string;
    scope: string[];
    period: string;
    summary: string;
    assumptions: string[];
    sourceIds: string[];
    effect: string;
    externalStatus: string;
  };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => JSON.stringify(key) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function planFingerprint(analysis: Analysis) {
  return createHash('sha256')
    .update(
      canonical({
        datasetVersion: analysis.datasetVersion,
        context: analysis.context,
        mobility: analysis.mobility,
        sources: analysis.sources,
      }),
    )
    .digest('hex');
}
export const canApprovePlan = (user: AccessContext) =>
  user.roles.some((role) => ['KAIA.Admin', 'KAIA.Executive', 'KAIA.DepartmentHead'].includes(role));
export function buildPlanDraft(analysis: Analysis): PlanDraft['draft'] {
  if (analysis.mobility?.version !== MOBILITY_VERSION)
    throw new ApiError(422, 'Planudkast kræver en understøttet skolekapacitetsanalyse.');
  const c = analysis.mobility,
    last = c.scenario.at(-1)!;
  return {
    title: 'Udkast til skolekapacitetsplan',
    scope: [...analysis.context.entityIds],
    period: `${c.anchorYear}–${last.year}`,
    summary: analysis.conclusion,
    assumptions: [
      ...analysis.assumptions,
      `Årlig driftsændring i ${last.year}: ${money(c.costDeltaOre)} i forhold til uændrede forudsætninger.`,
      `Variabel drift ${money(c.assumptions.variableCostOre)} pr. elev/år. Ny fast klassedrift 1,1 mio. kr. pr. klasse/år.`,
      `Tilflytning ændret ${c.assumptions.migrationChangePercent} %, ${c.assumptions.extraClasses} ekstra klasser, ${last.shortage} lokale manglende pladser i sidste prognoseår.`,
    ],
    sourceIds: analysis.sources.map((source) => source.id),
    effect:
      'Godkendelse gemmer kun et internt demoudkast. Ingen bevilling, klasselukning, ændring af skoledistrikt eller ekstern sag oprettes.',
    externalStatus: 'Ikke tilsluttet et eksternt fagsystem.',
  };
}
function publicDraft(row: Record<string, unknown>, user: AccessContext): PlanDraft {
  return {
    id: String(row.id),
    analysisId: String(row.analysis_id),
    fingerprint: String(row.fingerprint),
    state: row.state as PlanDraft['state'],
    createdAt: new Date(row.created_at as string).toISOString(),
    ...(row.approved_at ? { approvedAt: new Date(row.approved_at as string).toISOString() } : {}),
    canApprove: canApprovePlan(user),
    draft: row.draft as PlanDraft['draft'],
  };
}
export async function getPlanDraft(user: AccessContext, analysisId: string) {
  await ownedAnalysis(user, analysisId);
  const [row] =
    await sql()`SELECT * FROM kaia_plan_drafts WHERE owner_id=${user.userId} AND analysis_id=${analysisId}`;
  return row ? publicDraft(row, user) : null;
}
export async function preparePlanDraft(user: AccessContext, analysisId: string) {
  const analysis = await ownedAnalysis(user, analysisId),
    draft = buildPlanDraft(analysis),
    fingerprint = planFingerprint(analysis);
  return await sql().begin(async (tx) => {
    const [row] =
      await tx`INSERT INTO kaia_plan_drafts(id,owner_id,analysis_id,fingerprint,state,draft) VALUES(${randomUUID()},${user.userId},${analysisId},${fingerprint},'pending',${sql().json(draft as never)}) ON CONFLICT(owner_id,analysis_id) DO UPDATE SET analysis_id=EXCLUDED.analysis_id RETURNING *`;
    if (row.fingerprint !== fingerprint)
      throw new ApiError(409, 'Beregningsgrundlaget er ændret. Opret og gennemgå en ny analyse.');
    // The upsert row lock serializes concurrent prepares through the audit insertion.
    await tx`INSERT INTO kaia_audit(user_id,action,target) SELECT ${user.userId},'plan.prepare',${String(row.id)} WHERE NOT EXISTS(SELECT 1 FROM kaia_audit WHERE user_id=${user.userId} AND action='plan.prepare' AND target=${String(row.id)})`;
    return publicDraft(row, user);
  });
}
export async function approvePlanDraft(user: AccessContext, id: string, fingerprint: string) {
  const [row] =
    await sql()`SELECT * FROM kaia_plan_drafts WHERE id=${id} AND owner_id=${user.userId}`;
  if (!row) throw new ApiError(404, 'Udkastet blev ikke fundet.');
  const analysis = await ownedAnalysis(user, String(row.analysis_id));
  buildPlanDraft(analysis);
  if (!canApprovePlan(user))
    throw new ApiError(
      403,
      'Godkendelse kræver rollen Fagchef, Direktion eller Administrator inden for analysens scope.',
    );
  if (fingerprint !== row.fingerprint || planFingerprint(analysis) !== fingerprint)
    throw new ApiError(
      409,
      'Godkendelsen matcher ikke det viste beregningsgrundlag. Gennemgå udkastet igen.',
    );
  await sql().begin(async (tx) => {
    const changed =
      await tx`UPDATE kaia_plan_drafts SET state='approved',approved_at=now() WHERE id=${id} AND owner_id=${user.userId} AND fingerprint=${fingerprint} AND state='pending' RETURNING id`;
    if (changed.length)
      await tx`INSERT INTO kaia_audit(user_id,action,target) VALUES(${user.userId},'plan.approve',${id})`;
  });
  const [updated] =
    await sql()`SELECT * FROM kaia_plan_drafts WHERE id=${id} AND owner_id=${user.userId}`;
  return publicDraft(updated, user);
}
