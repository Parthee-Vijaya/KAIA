import { z } from 'zod';
import { analyzeResolvedContext, assertAnalysisContext } from './analysis';
import { CATEGORIES, hash, type Dataset } from './data';
import { buildIllustration, illustrationSpecSchema } from './illustrations';
import type {
  AccessContext,
  Analysis,
  AnalysisContext,
  IllustrationSpec,
  IllustrationTerm,
  ScenarioAssumptions,
} from './types';
import { DEFAULT_SCENARIO } from './types';

/** Values are wire primitives, never client-provided paths, labels, units or scope. */
export type AnalysisEditorValue = number | 'annual' | 'remaining';
export type AnalysisEditorValues = Record<string, AnalysisEditorValue>;
export interface AnalysisEditorField {
  id: string;
  label: string;
  kind: 'number' | 'choice';
  value: AnalysisEditorValue;
  /** Display value = raw value / scale; calculations always receive the raw value. */
  scale: number;
  displayUnit: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: 'annual' | 'remaining'; label: string; disabled?: boolean }[];
  help: string;
}
export interface AnalysisEditor {
  basisAnalysisId: string;
  datasetVersion: string;
  basisFingerprint: string;
  kind: 'scenario' | 'investment' | 'activity' | 'process' | 'none';
  fields: AnalysisEditorField[];
  values: AnalysisEditorValues;
}
export interface AnalysisEditorResult {
  analysis: Analysis;
  editor: AnalysisEditor;
  previewKey: string;
}
export class AnalysisEditorError extends Error {
  readonly status = 422;
  readonly code = 'ANALYSIS_EDITOR_INVALID';
}
const scenarioLimits = {
  energyPercent: { min: -100, max: 200, label: 'Energipris', help: 'Påvirker kun energiposter.' },
  salaryPercent: { min: -50, max: 100, label: 'Lønomkostninger', help: 'Påvirker kun lønposter.' },
  substitutePercent: {
    min: -100,
    max: 200,
    label: 'Vikarforbrug',
    help: 'Påvirker kun vikarposter.',
  },
  pupilsPercent: {
    min: -50,
    max: 50,
    label: 'Elevaktivitet',
    help: 'Påvirker kun den variable andel på 28 % af aktivitetsudgifterne; faste udgifter følger ikke automatisk elevtallet.',
  },
  budgetPercent: {
    min: -50,
    max: 100,
    label: 'Budgetramme',
    help: 'Ændrer budgetrammen separat; forbruget ændres ikke automatisk.',
  },
  maintenancePercent: {
    min: -100,
    max: 200,
    label: 'Vedligehold',
    help: 'Påvirker kun vedligeholdelsesposter.',
  },
} as const;
const scenarioKeys = Object.keys(scenarioLimits) as (keyof typeof scenarioLimits)[];
const scenarioSchema = z
  .object({
    energyPercent: z.number().min(-100).max(200),
    salaryPercent: z.number().min(-50).max(100),
    substitutePercent: z.number().min(-100).max(200),
    pupilsPercent: z.number().min(-50).max(50),
    budgetPercent: z.number().min(-50).max(100),
    maintenancePercent: z.number().min(-100).max(200),
    horizon: z.enum(['annual', 'remaining']),
  })
  .strict();
const percentage = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 8 });
const quantity = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 3 });
const money = new Intl.NumberFormat('da-DK', {
  style: 'currency',
  currency: 'DKK',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
};
const fingerprint = (value: unknown) => {
  const text = stable(value);
  // Matching token only: ownership and authorization never depend on this fingerprint.
  return [0, 1, 2, 3].map((salt) => hash(`${salt}:${text}`).toString(16).padStart(8, '0')).join('');
};
function assertSnapshot(basis: Analysis, dataset: Dataset) {
  if (!basis.analysisId || !basis.datasetVersion || basis.datasetVersion !== dataset.version)
    throw new AnalysisEditorError('Analysen og beregningsgrundlaget skal bruge samme dataversion.');
  const { year, fromMonth, toMonth } = basis.context.period;
  const coverage = dataset.coverage || { fromYear: 2023, toYear: 2028 };
  if (
    !Number.isInteger(year) ||
    year < coverage.fromYear ||
    year > coverage.toYear ||
    !Number.isInteger(fromMonth) ||
    !Number.isInteger(toMonth) ||
    fromMonth < 1 ||
    toMonth > 12 ||
    fromMonth > toMonth ||
    !dataset.seed ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dataset.referenceDate) ||
    !Number.isFinite(Date.parse(dataset.referenceDate))
  )
    throw new AnalysisEditorError(
      'Det gemte grundlag mangler en gyldig periode eller snapshotreference.',
    );
}
function hasRemainingMonths(basis: Analysis, dataset: Dataset) {
  const year = Number(dataset.referenceDate.slice(0, 4));
  return (
    basis.context.period.year > year ||
    (basis.context.period.year === year && Number(dataset.referenceDate.slice(5, 7)) < 12)
  );
}
const economicIntents = new Set([
  'budget',
  'forecast',
  'comparison',
  'energy',
  'trend',
  'category',
  'composition',
  'heatmap',
  'yearComparison',
  'municipalBenchmark',
  'projection',
  'pricequantity',
  'demography',
]);
function canEditDataset(basis: Analysis) {
  return (
    !basis.missingData &&
    (basis.context.intent === 'scenario' ||
      !!basis.scenario ||
      (economicIntents.has(basis.context.intent || 'budget') &&
        (basis.metrics.some((metric) => metric.unit === 'ore') || basis.chart?.unit === 'ore')))
  );
}
function scenarioOf(basis: Analysis, dataset: Dataset): ScenarioAssumptions {
  const existing = basis.scenario?.assumptions || basis.context.scenario;
  const parsed = scenarioSchema.safeParse(
    existing || {
      ...DEFAULT_SCENARIO,
      horizon: hasRemainingMonths(basis, dataset) ? 'remaining' : 'annual',
    },
  );
  if (!parsed.success)
    throw new AnalysisEditorError('Det gemte scenarie mangler gyldige forudsætninger.');
  return parsed.data;
}
function illustrationOf(basis: Analysis): IllustrationSpec | undefined {
  if (!basis.illustration && basis.basisKind !== 'illustration') return;
  if (basis.illustration?.version !== 1)
    throw new AnalysisEditorError('Illustrationens version understøttes ikke.');
  const parsed = illustrationSpecSchema.safeParse(basis.illustration.spec);
  if (!parsed.success)
    throw new AnalysisEditorError('Illustrationens gemte forudsætninger kunne ikke valideres.');
  return parsed.data;
}
function numberField(
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  scale: number,
  displayUnit: string,
  help: string,
  step = 1,
): AnalysisEditorField {
  return { id, label, kind: 'number', value, min, max, scale, displayUnit, help, step };
}
const termName = (term: IllustrationTerm, index: number) =>
  `${term.kind === 'upfrontCost' ? 'Engangsomkostning' : term.kind === 'annualCost' ? 'Årlig drift' : 'Årlig gevinst'} · bidrag ${index + 1}`;
const neutralFactorNames = new Map(
  [
    'Medarbejdere',
    'Besøg',
    'Minutter pr. uge',
    'Minutter pr. besøg',
    'Minutter pr. medarbejder',
    'Arbejdsuger',
    'Uger',
    'Timer',
    'Timer pr. uge',
    'Timer pr. besøg',
    'Antal',
    'Enheder',
    'Elever',
    'Borgere',
    'Kilometer',
    'Km',
    'Dage',
    'Arbejdsdage',
    'Årlige besøg',
  ].map((label) => [label.toLocaleLowerCase('da-DK'), label]),
);
const factorName = (label: string, index: number) =>
  neutralFactorNames.get(label.trim().toLocaleLowerCase('da-DK')) || `Faktor ${index + 1}`;
function factorUnit(label: string, index: number) {
  const name = factorName(label, index);
  if (name.startsWith('Minutter')) return 'min.';
  if (name === 'Arbejdsuger' || name === 'Uger') return 'uger';
  if (name === 'Medarbejdere') return 'medarb.';
  if (name.startsWith('Timer')) return 'timer';
  if (name === 'Besøg' || name === 'Årlige besøg') return 'besøg';
  if (name === 'Elever') return 'elever';
  if (name === 'Borgere') return 'borgere';
  if (name === 'Kilometer' || name === 'Km') return 'km';
  if (name === 'Dage' || name === 'Arbejdsdage') return 'dage';
  return 'enheder';
}

/** Metadata only. The API must first load an owned, currently authorized analysis. */
export function describeAnalysisEditor(basis: Analysis, dataset: Dataset): AnalysisEditor {
  assertSnapshot(basis, dataset);
  const fields: AnalysisEditorField[] = [];
  const spec = illustrationOf(basis);
  let kind: AnalysisEditor['kind'] = spec?.kind || 'none';
  if (spec && spec.kind !== 'process') {
    const maximumYears = Math.min(20, 2050 - basis.context.period.year + 1);
    if (spec.years > maximumYears)
      throw new AnalysisEditorError('Illustrationen må højst række til 2050.');
    fields.push(
      numberField(
        'illustration.years',
        'Tidshorisont',
        spec.years,
        1,
        maximumYears,
        1,
        'år',
        'Hypotetiske kalenderår fra den gemte analyses startår; ingen automatisk budgetprognose.',
      ),
    );
    if (spec.kind === 'investment') {
      spec.terms.forEach((term, i) => {
        const name = termName(term, i);
        term.quantityFactors.forEach((factor, j) =>
          fields.push(
            numberField(
              `illustration.terms.${i}.quantityFactors.${j}.valueMilli`,
              `${name} · ${factorName(factor.label, j)}`,
              factor.valueMilli,
              0,
              1_000_000_000,
              1000,
              factorUnit(factor.label, j),
              'Faktor i det gemte bidrag. Produktet og den faste divisor bestemmer mængden; værdien er en antagelse.',
            ),
          ),
        );
        fields.push(
          numberField(
            `illustration.terms.${i}.unitValueOre`,
            `${name} · enhedsværdi`,
            term.unitValueOre,
            0,
            10_000_000_000,
            100,
            'kr.',
            'Værdi pr. beregnet enhed på det samme forudsatte momsgrundlag.',
          ),
        );
        if (term.kind === 'annualBenefit')
          fields.push(
            numberField(
              `illustration.terms.${i}.cashRealizationBps`,
              `${name} · kontant realisering`,
              term.cashRealizationBps || 0,
              0,
              10_000,
              100,
              '%',
              'Kun denne andel bliver antaget kontant effekt; resten er kapacitetsværdi.',
            ),
          );
      });
    } else {
      fields.push(
        numberField(
          'illustration.initialQuantityMilli',
          'Startniveau',
          spec.initialQuantityMilli,
          0,
          1_000_000_000_000,
          1000,
          spec.unit,
          'Antaget aktivitet i startåret; ingen observeret måling.',
        ),
      );
      fields.push(
        numberField(
          'illustration.annualChangeBps',
          'Årlig ændring',
          spec.annualChangeBps,
          -10_000,
          10_000,
          100,
          '%',
          'Samme relative ændring hvert år, beregnet direkte fra det oprindelige startniveau.',
        ),
      );
    }
  } else if (!spec && canEditDataset(basis)) {
    kind = 'scenario';
    const assumptions = scenarioOf(basis, dataset);
    scenarioKeys.forEach((key) => {
      const setting = scenarioLimits[key];
      fields.push(
        numberField(
          `scenario.${key}`,
          setting.label,
          assumptions[key],
          setting.min,
          setting.max,
          1,
          '%',
          setting.help,
          0.1,
        ),
      );
    });
    const remaining = hasRemainingMonths(basis, dataset);
    fields.push({
      id: 'scenario.horizon',
      label: 'Virkningsperiode',
      kind: 'choice',
      value: assumptions.horizon,
      scale: 1,
      displayUnit: '',
      options: [
        { value: 'remaining', label: 'Resterende prognosemåneder', disabled: !remaining },
        { value: 'annual', label: 'Illustrativ helårsvirkning' },
      ],
      help: remaining
        ? 'Justeringen beregnes mod en helårsbaseline; den gemte analyses måneder bevares som reference. Resterende måneder ændrer kun prognoser efter snapshotreferencen. Helårsvirkning omskriver ikke regnskabet.'
        : 'Justeringen beregnes mod en helårsbaseline; den gemte analyses måneder bevares som reference. Året har ingen resterende prognosemåneder. Vælg illustrativ helårsvirkning; regnskabshistorikken bevares.',
    });
  }
  return {
    basisAnalysisId: basis.analysisId,
    datasetVersion: dataset.version,
    basisFingerprint: fingerprint({
      id: basis.analysisId,
      version: basis.datasetVersion,
      seed: dataset.seed,
      referenceDate: dataset.referenceDate,
      context: basis.context,
      spec,
      scenario: kind === 'scenario' ? scenarioOf(basis, dataset) : undefined,
    }),
    kind,
    fields,
    values: Object.fromEntries(fields.map((field) => [field.id, field.value])),
  };
}
function patchValues(editor: AnalysisEditor, input: AnalysisEditorValues): AnalysisEditorValues {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
    Object.keys(input).length > 40
  )
    throw new AnalysisEditorError('Send kun en afgrænset samling af redigerbare felter.');
  const fields = new Map(editor.fields.map((field) => [field.id, field]));
  const values = { ...editor.values };
  for (const [id, value] of Object.entries(input)) {
    const field = fields.get(id);
    if (!field)
      throw new AnalysisEditorError('Et felt findes ikke i det oprindelige beregningsgrundlag.');
    if (field.kind === 'choice') {
      if (!field.options?.some((option) => option.value === value && !option.disabled))
        throw new AnalysisEditorError('Virkningsperioden er ikke tilgængelig i dette snapshot.');
    } else if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < field.min! ||
      value > field.max! ||
      (!id.startsWith('scenario.') && !Number.isSafeInteger(value))
    )
      throw new AnalysisEditorError(`Kontrollér tal og grænser for ${field.label}.`);
    values[id] = Object.is(value, -0) ? 0 : value;
  }
  return values;
}
function editedSpec(original: IllustrationSpec, values: AnalysisEditorValues): IllustrationSpec {
  if (original.kind === 'process') return structuredClone(original);
  const years = values['illustration.years'] as number;
  if (original.kind === 'activity') {
    const initialQuantityMilli = values['illustration.initialQuantityMilli'] as number;
    const annualChangeBps = values['illustration.annualChangeBps'] as number;
    return {
      kind: 'activity',
      title: 'Opdateret aktivitetsillustration',
      years,
      unit: original.unit,
      initialQuantityMilli,
      annualChangeBps,
      assumptions: [
        `Redigeret hypotese: startniveau ${quantity.format(initialQuantityMilli / 1000)} ${original.unit}, årlig ændring ${percentage.format(annualChangeBps / 100)} % over ${years} år.`,
        'Tidligere fri modeltekst er erstattet af de aktuelle typede antagelser. Tallene er ikke observationer eller en kommunal budgetprognose.',
      ],
    };
  }
  const terms = original.terms.map((term, i): IllustrationTerm => ({
    label: termName(term, i),
    kind: term.kind,
    divisor: term.divisor,
    ...(term.quantityUnit ? { quantityUnit: term.quantityUnit } : {}),
    quantityFactors: term.quantityFactors.map((factor, j) => ({
      label: factorName(factor.label, j),
      valueMilli: values[`illustration.terms.${i}.quantityFactors.${j}.valueMilli`] as number,
    })),
    unitValueOre: values[`illustration.terms.${i}.unitValueOre`] as number,
    ...(term.kind === 'annualBenefit'
      ? {
          cashRealizationBps: values[`illustration.terms.${i}.cashRealizationBps`] as number,
        }
      : {}),
  }));
  return {
    kind: 'investment',
    title: 'Opdateret investeringsillustration',
    years,
    terms,
    assumptions: [
      `Redigeret modeludkast over ${years} år. Alle værdier er antagelser; de er ikke kommunale regnskabstal eller dokumenterede gevinster.`,
      'Bidragsnavne og faktorroller er neutrale visningsnavne, ikke talkilder. Tidligere fri modeltekst indgår ikke i det redigerede grundlag.',
      ...terms.map(
        (term) =>
          `${term.label}: ${term.quantityFactors.map((factor) => `${factor.label} ${quantity.format(factor.valueMilli / 1000)}`).join(' × ')} / ${term.divisor}; enhedsværdi ${money.format(term.unitValueOre / 100)}${term.kind === 'annualBenefit' ? `; kontant andel ${percentage.format((term.cashRealizationBps || 0) / 100)} %` : ''}.`,
      ),
    ],
  };
}
function authorizedContext(basis: Analysis, user: AccessContext, dataset: Dataset) {
  assertAnalysisContext(user, basis.context, dataset.entities);
  if (
    basis.context.entityIds.length > 100 ||
    new Set(basis.context.entityIds).size !== basis.context.entityIds.length ||
    basis.context.entityIds.some(
      (id) =>
        !dataset.entities.some(
          (entity) =>
            entity.id === id && entity.area === basis.context.area && entity.type !== 'committee',
        ),
    )
  )
    throw new AnalysisEditorError(
      'Grundlaget skal bruge entydige, tilladte driftsenheder i samme område.',
    );
}
function scenarioContext(basis: Analysis, values: AnalysisEditorValues): AnalysisContext {
  const assumptions = scenarioSchema.parse(
    Object.fromEntries([
      ...scenarioKeys.map((key) => [key, values[`scenario.${key}`]]),
      ['horizon', values['scenario.horizon']],
    ]),
  );
  return {
    area: basis.context.area,
    entityIds: [...basis.context.entityIds],
    period: { ...basis.context.period },
    intent: 'scenario',
    metric: 'net',
    scenario: assumptions,
  };
}
function assertScenarioRows(basis: Analysis, dataset: Dataset) {
  const selected = new Set(basis.context.entityIds);
  const referenceYear = Number(dataset.referenceDate.slice(0, 4));
  const referenceMonth = Number(dataset.referenceDate.slice(5, 7));
  const observed = (month: number) =>
    basis.context.period.year < referenceYear ||
    (basis.context.period.year === referenceYear && month <= referenceMonth);
  const contributions = new Set<string>(),
    ids = new Set<string>();
  let exposure = 0n;
  for (const row of dataset.rows) {
    if (!selected.has(row.entityId) || row.year !== basis.context.period.year) continue;
    if (row.datasetVersion !== dataset.version)
      throw new AnalysisEditorError('Scenariets poster må ikke blande dataversioner.');
    if (!Number.isSafeInteger(row.amountOre) || ids.has(row.id))
      throw new AnalysisEditorError(
        'Scenariets posteringer skal være entydige og præcise heltal i øre.',
      );
    ids.add(row.id);
    if (row.kind !== 'budget' && row.kind !== (observed(row.month) ? 'actual' : 'forecast'))
      continue;
    exposure += BigInt(row.amountOre < 0 ? -row.amountOre : row.amountOre);
    contributions.add(`${row.entityId}|${row.month}|${row.category}|${row.kind}`);
  }
  if (exposure * 5n > BigInt(Number.MAX_SAFE_INTEGER))
    throw new AnalysisEditorError('Scenariets samlede beløb overstiger sikre heltal i øre.');
  for (const id of selected)
    for (let month = 1; month <= 12; month++)
      for (const category of CATEGORIES)
        for (const kind of ['budget', observed(month) ? 'actual' : 'forecast'])
          if (!contributions.has(`${id}|${month}|${category}|${kind}`))
            throw new AnalysisEditorError(
              'Scenariet kræver komplette budget- og regnskabs-/prognoseposter for hele året. Manglende poster erstattes ikke af nul.',
            );
}

/** Rebuild from an immutable owned basis; never patch a previous preview or invoke a model. */
export function recalculateAnalysisEditor(
  basis: Analysis,
  user: AccessContext,
  dataset: Dataset,
  input: AnalysisEditorValues,
): AnalysisEditorResult {
  const editor = describeAnalysisEditor(basis, dataset);
  authorizedContext(basis, user, dataset);
  const values = patchValues(editor, input);
  if (editor.kind === 'none' || editor.kind === 'process')
    throw new AnalysisEditorError(
      'Dette grundlag har ingen numeriske antagelser, der kan redigeres.',
    );
  let analysis: Analysis;
  if (editor.kind === 'scenario') {
    if (values['scenario.horizon'] === 'remaining' && !hasRemainingMonths(basis, dataset))
      throw new AnalysisEditorError(
        'Der er ingen resterende prognosemåneder i året. Vælg en illustrativ helårsvirkning; regnskabshistorikken bevares.',
      );
    assertScenarioRows(basis, dataset);
    analysis = analyzeResolvedContext(
      'Vis baseline og scenarie i samme graf.',
      user,
      scenarioContext(basis, values),
      dataset,
    );
  } else {
    const spec = editedSpec(illustrationOf(basis)!, values);
    analysis = buildIllustration(
      spec.kind === 'investment'
        ? 'Vis den opdaterede investeringsillustration.'
        : 'Vis den opdaterede aktivitetsillustration.',
      user,
      basis.context,
      spec,
      dataset,
    );
  }
  return {
    analysis: { ...analysis, formulation: { provider: 'demo', model: 'Deterministisk beregning' } },
    editor: {
      ...editor,
      fields: editor.fields.map((field) => ({ ...field, value: values[field.id] })),
      values,
    },
    previewKey: fingerprint({ basis: editor.basisFingerprint, values }),
  };
}
