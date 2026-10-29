import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.KAIA_VERIFY_URL || 'https://kaia-sand.vercel.app';
const checks = [];
function check(name, actual, expected = true) {
  assert.deepEqual(actual, expected, name);
  checks.push({ name, result: 'passed' });
}
async function call(path, cookie = '', body) {
  return fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      cookie,
      origin: base,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(60000),
  });
}
async function login(profile) {
  const response = await fetch(base + '/auth/demo', {
    method: 'POST',
    headers: { origin: base },
    body: new URLSearchParams({ profile }),
    redirect: 'manual',
  });
  check('Normal demo login ' + profile, response.status, 303);
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('kaia_session='));
  check('HttpOnly cookie', cookie.includes('HttpOnly'));
  return cookie.split(';')[0];
}
async function analyze(cookie, question, extra = {}) {
  const response = await call('/api/analyze', cookie, { question, ...extra });
  check('Analyze HTTP', response.status, 200);
  const events = (await response.text())
    .trim()
    .split('\n')
    .map((s) => JSON.parse(s));
  check('Stream ends successfully', events.at(-1).type, 'done');
  const a = events.find((e) => e.type === 'analysis').analysis;
  check('Six server stages', a.trace.steps.length, 6);
  check(
    'Actual trace streamed',
    events.some((e) => e.type === 'trace'),
  );
  check(
    'Answer streamed',
    events.some((e) => e.type === 'text'),
  );
  check(
    'Five completed stages',
    a.trace.steps.slice(0, 5).every((s) => s.state === 'completed' && s.startedAt && s.finishedAt),
  );
  check('Demo provider distinct from data status', a.formulation.provider, 'demo');
  return a;
}
check(
  'Anonymous plan denied',
  (await call('/api/plan-drafts?analysisId=00000000-0000-4000-8000-000000000000')).status,
  401,
);
check(
  'Anonymous scenario denied',
  (await call('/api/mobility', '', { mode: 'preview' })).status,
  401,
);
const owner = await login('school'),
  other = await login('school'),
  council = await login('council');
const workspace = await (await call('/api/workspace', owner)).json();
check('Four original suggestions', workspace.suggestions.length, 4);
const question =
  'Hvordan har flyttemønstrene blandt børnefamilier udviklet sig de seneste fem år, hvad betyder det for skolekapaciteten, og hvilke muligheder har vi?';
const original = await analyze(owner, question);
check('Mobility version', original.mobility.version, 'KAIA-MOBILITY-v1');
check('80 historical rows', original.mobility.history.length, 80);
check('Shared chart and KPI', original.metrics[0].value, original.chart.rows.at(-1).scenario);
check(
  'Observed versus forecast years',
  original.chart.rows.map((r) => r.label),
  Array.from({ length: 10 }, (_, i) => String(2021 + i)),
);
const assumptions = { migrationChangePercent: 25, extraClasses: 2, variableCostOre: 1800000 };
const previewResponse = await call('/api/mobility', owner, {
  mode: 'preview',
  analysisId: original.analysisId,
  assumptions,
});
check('Preview HTTP', previewResponse.status, 200);
const preview = (await previewResponse.json()).analysis;
check('Baseline immutable', preview.mobility.baseline, original.mobility.baseline);
check('History immutable', preview.mobility.history, original.mobility.history);
check(
  'Two classes add 48 places',
  preview.mobility.scenario.at(-1).capacity - original.mobility.scenario.at(-1).capacity,
  48,
);
check(
  'Forecast responds to migration',
  preview.mobility.scenario.at(-1).pupils > original.mobility.scenario.at(-1).pupils,
);
check(
  'Other owner preview denied',
  (
    await call('/api/mobility', other, {
      mode: 'preview',
      analysisId: original.analysisId,
      assumptions,
    })
  ).status,
  404,
);
check(
  'Invalid assumptions rejected',
  (
    await call('/api/mobility', owner, {
      mode: 'preview',
      analysisId: original.analysisId,
      assumptions: { ...assumptions, extraClasses: 900 },
    })
  ).status,
  400,
);
check(
  'Client role injection rejected',
  (
    await call('/api/mobility', owner, {
      mode: 'preview',
      analysisId: original.analysisId,
      assumptions,
      role: 'KAIA.Admin',
    })
  ).status,
  400,
);
const savedResponse = await call('/api/mobility', owner, {
  mode: 'save',
  analysisId: original.analysisId,
  assumptions,
});
check('Save scenario HTTP', savedResponse.status, 200);
const saved = (await savedResponse.json()).analysis;
check('New scenario ID', saved.analysisId !== original.analysisId);
check('Same conversation', saved.conversationId, original.conversationId);
const prepared = await call('/api/plan-drafts', owner, {
  mode: 'prepare',
  analysisId: saved.analysisId,
});
check('Prepare draft', prepared.status, 200);
const plan = (await prepared.json()).plan;
check('Draft pending', plan.state, 'pending');
check('Server mandate', plan.canApprove);
check(
  'Other owner draft denied',
  (await call(`/api/plan-drafts?analysisId=${saved.analysisId}`, other)).status,
  404,
);
check(
  'Other owner approval denied',
  (
    await call('/api/plan-drafts', other, {
      mode: 'approve',
      id: plan.id,
      fingerprint: plan.fingerprint,
    })
  ).status,
  404,
);
check(
  'Stale fingerprint rejected',
  (
    await call('/api/plan-drafts', owner, {
      mode: 'approve',
      id: plan.id,
      fingerprint: '0'.repeat(64),
    })
  ).status,
  409,
);
const approved = await call('/api/plan-drafts', owner, {
  mode: 'approve',
  id: plan.id,
  fingerprint: plan.fingerprint,
});
check('Approve internal draft', approved.status, 200);
const approval = (await approved.json()).plan;
check('Approval persisted', approval.state, 'approved');
const reload = (await (await call(`/api/plan-drafts?analysisId=${saved.analysisId}`, owner)).json())
  .plan;
check('Approval timestamp stable', reload.approvedAt, approval.approvedAt);
const freshConversation = await (
  await call('/api/conversations/' + saved.conversationId, owner)
).json();
check(
  'Saved scenario survives reread',
  freshConversation.analyses.some((a) => a.analysisId === saved.analysisId),
);
check(
  'Original remains immutable',
  freshConversation.analyses.find((a) => a.analysisId === original.analysisId),
  original,
);
const exported = await call(`/api/export?analysisId=${saved.analysisId}&format=json`, owner);
check('Owned export', exported.status, 200);
const exportedData = await exported.json();
check('Export keeps scenario', JSON.stringify(exportedData).includes('KAIA-MOBILITY-v1'));
check(
  'Other owner export denied',
  (await call(`/api/export?analysisId=${saved.analysisId}&format=json`, other)).status,
  404,
);
const denied = await call('/api/analyze', council, { question });
check('Council detailed case denied', denied.status, 403);
const follow = await analyze(owner, 'Hvad hvis tilflytningen stiger 25 procent?', {
  conversationId: original.conversationId,
});
check('Chat followup stays in unified case', follow.context.intent, 'mobilityCapacity');
check(
  'Followup changes correct assumption',
  follow.mobility.assumptions.migrationChangePercent,
  25,
);
check(
  'Original approval not transferred',
  (await (await call(`/api/plan-drafts?analysisId=${follow.analysisId}`, owner)).json()).plan,
  null,
);
// Detail views remain bound to the same immutable, owned snapshot.
check(
  'Anonymous detail denied',
  (await call('/api/mobility/detail', '', { analysisId: saved.analysisId, year: 2030 })).status,
  401,
);
check(
  'Other owner detail denied',
  (await call('/api/mobility/detail', other, { analysisId: saved.analysisId, year: 2030 })).status,
  404,
);
check(
  'Council cannot reopen a detailed case',
  (await call('/api/mobility/detail', council, { analysisId: saved.analysisId, year: 2030 }))
    .status,
  404,
);
check(
  'Unavailable school rejected',
  (
    await call('/api/mobility/detail', owner, {
      analysisId: saved.analysisId,
      year: 2030,
      entityId: 'outside-snapshot',
    })
  ).status,
  422,
);
check(
  'Unavailable detail year rejected',
  (await call('/api/mobility/detail', owner, { analysisId: saved.analysisId, year: 2040 })).status,
  422,
);
check(
  'Detail role injection rejected',
  (
    await call('/api/mobility/detail', owner, {
      analysisId: saved.analysisId,
      year: 2030,
      role: 'KAIA.Admin',
    })
  ).status,
  400,
);
const detailResponse = await call('/api/mobility/detail', owner, {
  analysisId: saved.analysisId,
  year: 2030,
});
check('Detail endpoint', detailResponse.status, 200);
const detail = (await detailResponse.json()).detail;
check('80 school-year forecast points', detail.schoolYears.length, 80);
check('Detail and saved pupils reconcile', detail.metrics.pupils, saved.metrics[0].value);
check('Detail and saved shortage reconcile', detail.metrics.shortage, saved.metrics[2].value);
check('Detail and saved cost reconcile', detail.metrics.costDeltaOre, saved.mobility.costDeltaOre);
for (const year of detail.years) {
  const response = await call('/api/mobility/detail', owner, {
    analysisId: saved.analysisId,
    year,
    entityId: 'school-hoeng',
  });
  check('School/year filter ' + year, response.status, 200);
  const scoped = (await response.json()).detail;
  check('One school in detailed selection ' + year, scoped.selectedRows.length, 1);
  check('Five scoped historic rows ' + year, scoped.history.length, 5);
  const original = detail.schoolYears.find((r) => r.id === 'school-hoeng' && r.year === year);
  check('Class allocation preserved ' + year, scoped.metrics.capacity, original.capacity);
}
const changedDetailResponse = await call('/api/mobility/detail', owner, {
  analysisId: saved.analysisId,
  year: 2030,
  assumptions: { ...assumptions, migrationChangePercent: 50 },
});
check('Live detail assumptions', changedDetailResponse.status, 200);
const changedDetail = (await changedDetailResponse.json()).detail;
check(
  'Migration slider updates detailed forecasts',
  changedDetail.metrics.pupils > detail.metrics.pupils,
);
check(
  'Updated detail sources match live assumptions',
  changedDetail.sources.some((s) => s.excerpt.includes('50 %')),
);
const costRows = changedDetail.charts.costBridge.rows;
check(
  'Detailed waterfall reconciles exactly',
  Number(costRows[0].value) + Number(costRows[1].value) + Number(costRows[2].value),
  costRows[3].value,
);
const result = {
  base,
  checkedAt: new Date().toISOString(),
  checks,
  total: checks.length,
  provider: 'demo',
  externalSystemAction: 'not connected',
  realCortiIntegration: 'not run in this verification',
};
writeFileSync(
  process.env.KAIA_VERIFY_OUTPUT || '/tmp/kaia-mobility-http.json',
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify({ checks: checks.length, result: 'passed', base }));
