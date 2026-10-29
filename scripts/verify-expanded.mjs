import { writeFileSync } from 'node:fs';

const base = process.env.KAIA_VERIFY_URL || 'https://kaia-sand.vercel.app';
const version = 'KAIA-DEMO-2026.09-v4';
const checks = [];
function check(name, actual, expected = true) {
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
  checks.push({ name, result: 'passed', actual });
}
async function call(path, cookie = '', data) {
  return fetch(base + path, {
    method: data ? 'POST' : 'GET',
    headers: { cookie, origin: base, ...(data ? { 'content-type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(45_000),
  });
}
async function login(profile) {
  const response = await fetch(base + '/auth/demo', {
    method: 'POST',
    headers: { origin: base },
    body: new URLSearchParams({ profile }),
    redirect: 'manual',
    signal: AbortSignal.timeout(45_000),
  });
  check('demo login ' + profile, response.status, 303);
  const header = response.headers.getSetCookie().find((value) => value.startsWith('kaia_session='));
  check(
    'HttpOnly Secure session cookie',
    !!header && header.includes('HttpOnly') && header.includes('Secure'),
  );
  check(
    'redirect stays on configured frontend',
    new URL(response.headers.get('location'), base).href,
    base + '/',
  );
  return header.split(';')[0];
}
async function analyze(cookie, question, extra = {}) {
  const response = await call('/api/analyze', cookie, { question, ...extra });
  check('analysis HTTP', response.status, 200);
  const text = await response.text();
  const events = text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  check('NDJSON stream completed', events.at(-1).type, 'done');
  const analysis = events.find((event) => event.type === 'analysis')?.analysis;
  check(
    'analysis has a reproducible version',
    analysis?.datasetVersion,
    extra.datasetVersion || version,
  );
  check('public demo never invokes paid model', analysis?.formulation?.provider, 'demo');
  return analysis;
}
const page = await call('/');
check('public frontend responds', page.status, 200);
check('login is clearly marked as demo', (await page.text()).includes('Demologin'));
const anonymous = await call('/api/workspace');
check('anonymous workspace denied', anonymous.status, 401);
const first = await login('school');
const initial = await (await call('/api/workspace', first)).json();
check('expanded posting count', initial.dataset.rowCount, 1245024);
check('expanded document count', initial.dataset.documentCount, 1742);
check('history starts in 2020', initial.dataset.coverage.fromYear, 2020);
check('forecast coverage ends in 2032', initial.dataset.coverage.toYear, 2032);
check('four relevant suggestions', initial.suggestions.length, 4);
check('school role is server assigned', initial.user.roles.join(','), 'KAIA.DepartmentHead');
check(
  'no synthetic unit properties in client navigation',
  initial.entities.every((entity) => !Object.hasOwn(entity, 'synthetic')),
);
const result = await analyze(first, 'Giv mig et overblik over budgetstatus på skoleområdet.');
check('chart and metric share value', result.chart.rows[0].actual, result.metrics[1].value);
const doc = result.sources.find((source) => source.documentId)?.documentId;
check('analysis supplies readable document evidence', !!doc);
const document = await call(
  '/api/documents/' + encodeURIComponent(doc) + '?version=' + result.datasetVersion,
  first,
);
check('source document opens', document.status, 200);
check('document clearly simulated', (await document.json()).status, 'simulated');
const saved = await call('/api/insights', first, { analysisId: result.analysisId });
check('save insight in local database through Vercel', saved.status, 201);
const insight = await saved.json();
const reloaded = await (await call('/api/workspace', first)).json();
check(
  'saved insight survives new request',
  reloaded.insights.some((item) => item.id === insight.id),
);
const followup = await analyze(first, 'Vis samme analyse for 2025.', {
  conversationId: result.conversationId,
});
check('followup changes year', followup.context.period.year, 2025);
check(
  'followup preserves month coverage',
  followup.context.period.toMonth,
  result.context.period.toMonth,
);
const assumptions = {
  energyPercent: 15,
  salaryPercent: 0,
  substitutePercent: 0,
  pupilsPercent: 0,
  budgetPercent: 0,
  maintenancePercent: 0,
  horizon: 'remaining',
};
const preview = await call('/api/scenarios/preview', first, {
  analysisId: result.analysisId,
  assumptions,
});
check('scenario recalculates on local backend', preview.status, 200);
const scenario = (await preview.json()).analysis;
check('scenario increases only relevant energy expenditure', scenario.scenario.deltaOre > 0);
const stored = await call('/api/scenarios', first, {
  analysisId: result.analysisId,
  title: 'Hybridkontrol · energi +15 %',
  assumptions,
});
check('scenario saved', stored.status, 201);
const storedScenario = await stored.json();
check(
  'scenario reopens',
  (await (await call('/api/scenarios', first)).json()).some(
    (item) => item.id === storedScenario.id,
  ),
);
const denied = await call('/api/analyze', first, {
  question: 'Vis budgetstatus på socialområdet.',
});
check('server enforces school scope through proxy', denied.status, 403);
check(
  'public demo cannot open provider administration',
  (await call('/api/providers', first)).status,
  403,
);
const second = await login('school');
const other = await (await call('/api/workspace', second)).json();
check(
  'same display profile creates different private identity',
  initial.user.userId !== other.user.userId,
);
check(
  'other visitor cannot open private conversation',
  (await call('/api/conversations/' + result.conversationId, second)).status,
  404,
);
check(
  'other visitor cannot export private analysis',
  (await call('/api/export?analysisId=' + result.analysisId + '&format=json', second)).status,
  404,
);
check(
  'other visitor cannot see saved insight',
  !other.insights.some((item) => item.id === insight.id),
);
const yearBasis = await analyze(first, 'Vis budgetstatus på skoleområdet for 2025');
const yearComparison = await analyze(first, 'Sammenlign op mod sidste års data', {
  conversationId: yearBasis.conversationId,
});
check('natural language year comparison', yearComparison.context.intent, 'yearComparison');
check('comparison retains current conversation year', yearComparison.context.period.year, 2025);
check('compares previous year', yearComparison.context.comparison.year, 2024);
check('comparison retains same months', yearComparison.context.period.toMonth, 9);
check(
  'year comparison graph uses same prior metric',
  yearComparison.chart.rows[0].value,
  yearComparison.metrics[0].value,
);
check(
  'year comparison graph uses same current metric',
  yearComparison.chart.rows[1].value,
  yearComparison.metrics[1].value,
);
const peer = await analyze(first, 'Sammenlign med en sammennlignelig kommune', {
  conversationId: yearBasis.conversationId,
});
check('municipality comparison recognizes user typo', peer.context.intent, 'municipalBenchmark');
check('school municipality comparison normalizes by pupils', peer.context.metric, 'perPupil');
check('peer selected and identified', !!peer.context.comparison.municipalityId);
check('financial benchmark source is simulated', peer.sources[0].status, 'simulated');
check(
  'official names do not prove simulated economics',
  peer.sources
    .filter((source) => source.type === 'name')
    .every((source) => source.status === 'official-name'),
);
check(
  'peer comparison graph agrees with local metric',
  peer.chart.rows[0].value,
  peer.metrics[0].value,
);
const holbaek = await analyze(first, 'Sammenlign med Holbæk Kommune', {
  conversationId: yearBasis.conversationId,
});
check(
  'explicit peer changes comparison',
  holbaek.context.comparison.municipalityId,
  'municipality-holbaek',
);
const why = await analyze(first, 'Hvorfor er den kommune sammenlignelig?', {
  conversationId: yearBasis.conversationId,
});
check(
  'explanation retains chosen peer',
  why.context.comparison.municipalityId,
  holbaek.context.comparison.municipalityId,
);
check(
  'peer explanation exposes synthetic structural assumptions',
  why.narrative.join(' ').includes('fiktiv'),
);
const unknown = await analyze(first, 'Sammenlign med Aarhus Kommune', {
  conversationId: yearBasis.conversationId,
});
check('unknown peer produces honest missing-data response', !!unknown.missingData);
check('unknown peer does not invent a graph', !unknown.chart);
const projection = await analyze(first, 'Vis prognosen for skoleområdet frem til 2032');
check('multi-year forecast intent', projection.context.intent, 'projection');
check('multi-year forecast has seven annual points', projection.chart.rows.length, 7);
check('last forecast year', projection.context.projectionEndYear, 2032);
const last = projection.chart.rows.at(-1);
check('forecast low/base/high ordered', last.low <= last.base && last.base <= last.high);
check(
  'forecast graph baseline matches metric',
  projection.chart.rows[0].base,
  projection.metrics[0].value,
);
check('forecast graph endpoint matches metric', last.base, projection.metrics[1].value);
check(
  'forecast distinguishes sensitivity from statistical confidence',
  projection.assumptions.join(' ').includes('statistisk'),
);
const projectionSaved = await call('/api/insights', first, { analysisId: projection.analysisId });
check('forecast insight saved', projectionSaved.status, 201);
const projectionInsight = await projectionSaved.json();
const afterReload = await (await call('/api/workspace', first)).json();
check(
  'forecast snapshot persists including dataversion',
  afterReload.insights.some(
    (item) => item.id === projectionInsight.id && item.analysis.datasetVersion === version,
  ),
);
const old = await analyze(first, 'Vis budgetstatus på skoleområdet', {
  datasetVersion: 'KAIA-DEMO-2026.09-v3',
});
const oldProjection = await analyze(first, 'Vis prognosen frem til 2032', {
  conversationId: old.conversationId,
  datasetVersion: old.datasetVersion,
});
check('existing version remains pinned', oldProjection.datasetVersion, old.datasetVersion);
check('old snapshot explains missing new forecast years', !!oldProjection.missingData);
check(
  'conversation version cannot be silently replaced',
  (
    await call('/api/analyze', first, {
      question: 'Vis budgetstatus',
      conversationId: old.conversationId,
      datasetVersion: version,
    })
  ).status,
  409,
);
const report = {
  testedAt: new Date().toISOString(),
  url: base,
  mode: 'Actual Vercel frontend to HMAC protected HTTPS tunnel, local production Node server and local PostgreSQL; public demo auth; no Microsoft or model credentials',
  checks,
};
writeFileSync('docs/expanded-http-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ url: base, checks: checks.length, passed: true }));
