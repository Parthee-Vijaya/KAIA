import { z } from 'zod';
import { hash, type Dataset } from './data';
import { roundMoneyRatio } from './arithmetic';
import { assertAnalysisContext, unavailableQuestionReason } from './analysis';
import { AccessDeniedError } from './policy';
import type {
  AccessContext,
  Analysis,
  AnalysisContext,
  ChartSpec,
  IllustrationCalculation,
  IllustrationSpec,
  IllustrationTerm,
  Metric,
  SourceRef,
} from './types';
export type { IllustrationSpec, IllustrationCalculation, IllustrationTerm } from './types';

const title = z.string().trim().min(1).max(120);
const assumptions = z.array(z.string().trim().min(1).max(300)).max(8).default([]);
const years = z.number().int().min(1).max(20);
const quantityUnit = z.enum(['timer', 'minutter', 'besøg', 'elever', 'borgere', 'km', 'enheder']);
const factorSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    valueMilli: z.number().int().min(0).max(1_000_000_000),
  })
  .strict();
const termSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    kind: z.enum(['upfrontCost', 'annualCost', 'annualBenefit']),
    quantityFactors: z.array(factorSchema).min(1).max(3),
    divisor: z.union([z.literal(1), z.literal(60), z.literal(1000)]),
    unitValueOre: z.number().int().min(0).max(10_000_000_000),
    quantityUnit: quantityUnit.optional(),
    cashRealizationBps: z.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .superRefine((term, issue) => {
    if (term.kind !== 'annualBenefit' && term.cashRealizationBps)
      issue.addIssue({
        code: 'custom',
        message: 'En kontant realiseringsandel kan kun anvendes på gevinster.',
      });
  });
export const illustrationSpecSchema: z.ZodType<IllustrationSpec> = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('investment'),
      title,
      years,
      terms: z
        .array(termSchema)
        .min(1)
        .max(6)
        .refine(
          (terms) =>
            new Set(terms.map((term) => term.label.toLocaleLowerCase('da'))).size === terms.length,
        ),
      assumptions,
    })
    .strict(),
  z
    .object({
      kind: z.literal('activity'),
      title,
      years,
      initialQuantityMilli: z.number().int().min(0).max(1_000_000_000_000),
      annualChangeBps: z.number().int().min(-10_000).max(10_000),
      unit: quantityUnit,
      assumptions,
    })
    .strict(),
  z
    .object({
      kind: z.literal('process'),
      title,
      steps: z
        .array(
          z
            .object({
              label: z.string().trim().min(1).max(80),
              description: z.string().trim().min(1).max(400),
            })
            .strict(),
        )
        .min(3)
        .max(6),
      assumptions,
    })
    .strict(),
]);

export class IllustrationInputError extends Error {
  readonly status = 422;
  readonly code = 'ILLUSTRATION_INVALID';
}
const money = (ore: number) =>
  new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ore / 100);
const quantity = (value: number) =>
  new Intl.NumberFormat('da-DK', { maximumFractionDigits: 3 }).format(value);
const safe = (value: bigint) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new IllustrationInputError(
      'Illustrationen overstiger den præcise talrepræsentation. Vælg mindre antagelser.',
    );
  return number;
};
const total = (values: number[]) => safe(values.reduce((sum, value) => sum + BigInt(value), 0n));
function rounded(numerator: bigint, denominator: bigint) {
  try {
    return roundMoneyRatio(numerator, denominator);
  } catch {
    throw new IllustrationInputError(
      'Illustrationen overstiger den præcise talrepræsentation. Vælg mindre antagelser.',
    );
  }
}
function termValue(term: IllustrationTerm) {
  const numerator = term.quantityFactors.reduce(
    (value, factor) => value * BigInt(factor.valueMilli),
    1n,
  );
  const denominator = 1000n ** BigInt(term.quantityFactors.length) * BigInt(term.divisor);
  const amountOre = rounded(numerator * BigInt(term.unitValueOre), denominator);
  const cashAmountOre =
    term.kind === 'annualBenefit'
      ? rounded(
          numerator * BigInt(term.unitValueOre) * BigInt(term.cashRealizationBps || 0),
          denominator * 10_000n,
        )
      : 0;
  return {
    label: term.label,
    kind: term.kind,
    quantityNumerator: numerator.toString(),
    quantityDenominator: denominator.toString(),
    quantityMilli: rounded(numerator * 1000n, denominator),
    ...(term.quantityUnit ? { quantityUnit: term.quantityUnit } : {}),
    amountOre,
    cashAmountOre,
    capacityAmountOre: term.kind === 'annualBenefit' ? total([amountOre, -cashAmountOre]) : 0,
  };
}

/** Hypotheses never read ledger rows, documents, denominators or external observations. */
export function buildIllustration(
  question: string,
  user: AccessContext,
  baselineContext: AnalysisContext,
  inputSpec: IllustrationSpec,
  datasetShell: Dataset,
): Analysis {
  if (typeof question !== 'string' || !question.trim() || question.length > 4000)
    throw new IllustrationInputError('Skriv et spørgsmål på højst 4.000 tegn.');
  const unavailable = unavailableQuestionReason(question);
  if (unavailable) throw new IllustrationInputError(unavailable);
  const parsed = illustrationSpecSchema.safeParse(inputSpec);
  if (!parsed.success)
    throw new IllustrationInputError(
      'Illustrationens antagelser eller forløb kunne ikke valideres.',
    );
  const spec = parsed.data;
  const context: AnalysisContext = {
    area: baselineContext.area,
    entityIds: [...baselineContext.entityIds].sort(),
    period: { ...baselineContext.period },
    intent: 'illustration',
    metric: 'net',
  };
  if (
    context.entityIds.length > 100 ||
    new Set(context.entityIds).size !== context.entityIds.length
  )
    throw new IllustrationInputError(
      'Illustrationen kræver en entydig afgrænsning på højst 100 enheder.',
    );
  assertAnalysisContext(user, context, datasetShell.entities);
  const selected = context.entityIds.map((id) =>
    datasetShell.entities.find((entity) => entity.id === id),
  );
  if (
    selected.some(
      (entity) => !entity || entity.type === 'committee' || entity.area !== context.area,
    )
  )
    throw new AccessDeniedError(
      'Illustrationen skal afgrænses til tilladte driftsenheder i samme område.',
    );
  const coverage = datasetShell.coverage || { fromYear: 2023, toYear: 2028 };
  if (
    !datasetShell.version ||
    !datasetShell.seed ||
    context.period.year < coverage.fromYear ||
    context.period.year > coverage.toYear
  )
    throw new IllustrationInputError(
      'Illustrationens udgangspunkt skal ligge i det valgte datasnapshot.',
    );
  const startYear = context.period.year;
  const endYear = startYear + (spec.kind === 'process' ? 1 : spec.years) - 1;
  if (endYear > 2050) throw new IllustrationInputError('En illustration må højst række til 2050.');
  const period =
    spec.kind === 'process'
      ? `${context.period.fromMonth}–${context.period.toMonth} ${startYear}`
      : `${startYear}–${endYear}`;
  const identity = JSON.stringify({
    version: datasetShell.version,
    seed: datasetShell.seed,
    referenceDate: datasetShell.referenceDate,
    context: { ...context, entityIds: [...context.entityIds].sort() },
    spec,
  });
  const key =
    hash(identity).toString(16).padStart(8, '0') +
    hash([...identity].reverse().join(''))
      .toString(16)
      .padStart(8, '0');
  const assumptionId = `DEMO-ILLUSTRATION-ASSUMPTIONS-${key}`;
  const calculationId = `DEMO-ILLUSTRATION-CALC-${key}`;
  const sourceIds = [calculationId];
  const scope = selected.map((entity) => entity!.name).join(', ');
  const common = [
    'Forudsætninger og trin er valgt til dette eksempel; de beskriver ikke registrerede kommunale forhold eller vedtagne beslutninger.',
    `Illustrationen er adgangsafgrænset til ${scope}. Snapshot ${datasetShell.version}, reference ${datasetShell.referenceDate}; snapshotperioden ændres ikke af den illustrative tidshorisont.`,
    ...(endYear > coverage.toYear
      ? [
          `Årene efter ${coverage.toYear} ligger uden for datasættet og er udelukkende hypotetiske; de er ikke kommunale prognoser.`,
        ]
      : []),
    ...spec.assumptions,
  ];
  let calculation: IllustrationCalculation;
  let chart: ChartSpec;
  let metrics: Metric[] = [];
  let conclusion: string;
  let narrative: string[];
  let assumptionText: string;
  let calculationText: string;
  if (spec.kind === 'investment') {
    const terms = spec.terms.map(termValue);
    const upfrontCostOre = total(
      terms.filter((term) => term.kind === 'upfrontCost').map((term) => term.amountOre),
    );
    const annualCostOre = total(
      terms.filter((term) => term.kind === 'annualCost').map((term) => term.amountOre),
    );
    const benefit = terms.filter((term) => term.kind === 'annualBenefit');
    const annualBenefitValueOre = total(benefit.map((term) => term.amountOre));
    const annualCashBenefitOre = total(benefit.map((term) => term.cashAmountOre));
    const annualCapacityValueOre = total(benefit.map((term) => term.capacityAmountOre));
    let cumulative = 0;
    let breakEvenYear: number | null = null;
    const points = Array.from({ length: spec.years }, (_, index) => {
      const cost = total([annualCostOre, index === 0 ? upfrontCostOre : 0]);
      const net = total([annualCashBenefitOre, -cost]);
      cumulative = total([cumulative, net]);
      if (upfrontCostOre > 0 && cumulative >= 0 && breakEvenYear === null)
        breakEvenYear = startYear + index;
      return {
        label: String(startYear + index),
        cost,
        benefit: annualCashBenefitOre,
        capacityValue: annualCapacityValueOre,
        net,
        cumulative,
      };
    });
    calculation = {
      kind: 'investment',
      upfrontCostOre,
      annualCostOre,
      annualBenefitValueOre,
      annualCashBenefitOre,
      annualCapacityValueOre,
      breakEvenYear,
      terms,
    };
    metrics = [
      { label: 'Engangsomkostning', value: upfrontCostOre, unit: 'ore', sourceIds },
      { label: 'Årlig drift', value: annualCostOre, unit: 'ore', sourceIds },
      {
        label: 'Årlig beregnet gevinstværdi',
        value: annualBenefitValueOre,
        unit: 'ore',
        sourceIds,
      },
      {
        label: 'Heraf antaget kontant effekt',
        value: annualCashBenefitOre,
        unit: 'ore',
        sourceIds,
      },
      { label: 'Heraf kapacitetsværdi', value: annualCapacityValueOre, unit: 'ore', sourceIds },
      {
        label: `Samlet kontant netto efter ${spec.years} år`,
        value: cumulative,
        unit: 'ore',
        sourceIds,
      },
      ...terms
        .filter((term) => term.kind === 'annualBenefit' && term.quantityUnit)
        .map((term) => ({
          label: `${term.label} · beregnet mængde pr. år`,
          value: term.quantityMilli / 1000,
          unit: 'number' as const,
          displayUnit: term.quantityUnit,
          sourceIds,
        })),
      ...(breakEvenYear !== null
        ? [
            {
              label: 'Første år med ikke-negativt akkumuleret netto',
              value: breakEvenYear,
              unit: 'number' as const,
              displayUnit: 'år',
              sourceIds,
            },
          ]
        : []),
    ];
    chart = {
      type: 'line',
      title: 'Illustrativ investering og gevinst',
      subtitle: `${period} · kontant effekt og kapacitetsværdi vises særskilt`,
      unit: 'ore',
      displayUnit: 'kr.',
      rows: points,
      series: [
        { key: 'cost', label: 'Omkostninger', color: '#bc4d30' },
        { key: 'benefit', label: 'Antaget kontant effekt', color: '#006f71' },
        {
          key: 'capacityValue',
          label: 'Kapacitetsværdi · ikke kontant',
          color: '#464f5e',
          dashed: true,
        },
        { key: 'cumulative', label: 'Akkumuleret kontant netto', color: '#9b4028' },
      ],
      sourceIds,
    };
    conclusion = `Med de valgte forudsætninger er den samlede kontante nettoeffekt ${money(cumulative)} over ${spec.years} år. [2]`;
    narrative = [
      `Den årlige gevinstværdi er ${money(annualBenefitValueOre)}, fordelt på ${money(annualCashBenefitOre)} i antaget kontant effekt og ${money(annualCapacityValueOre)} i kapacitetsværdi. Kun den kontante effekt indgår i kontant netto. [2]`,
      upfrontCostOre === 0
        ? 'Der er ikke antaget en engangsomkostning, så der beregnes ingen tilbagebetalingstid.'
        : breakEvenYear === null
          ? 'Det akkumulerede kontante netto forbliver negativt inden for illustrationens tidshorisont. [2]'
          : `Det akkumulerede kontante netto bliver første gang ikke-negativt i ${breakEvenYear} under de valgte antagelser. [2]`,
      'Se og justér forudsætningerne i Vis data.',
    ];
    assumptionText = spec.terms
      .map(
        (term) =>
          `${term.label} (${term.kind}): ${term.quantityFactors.map((factor) => `${factor.label} ${quantity(factor.valueMilli / 1000)}`).join(' × ')} / ${term.divisor}${term.quantityUnit ? ` i ${term.quantityUnit}` : ''}; enhedsværdi ${money(term.unitValueOre)}; ${term.kind === 'annualBenefit' ? `antaget kontant realisering ${quantity((term.cashRealizationBps || 0) / 100)} %` : 'omkostning'}.`,
      )
      .join('\n');
    calculationText = `Hvert bidrag beregnes som produktet af faktorernes valueMilli / 1000, ganget med unitValueOre og divideret med divisor. Der afrundes én gang til øre, med halve øre mod +∞. Kontant gevinst beregnes fra samme uafrundede produkt gange cashRealizationBps / 10000. Kapacitetsværdi er afrundet samlet gevinst minus kontant gevinst. Visningsmængder afrundes særskilt til 0,001 enhed; beløb beregnes før denne visningsafrunding. Årets kontante netto = kontant gevinst − drift − engangsomkostning (kun første år). Akkumuleret netto = summen af årsnetto. Ingen diskontering, inflation, skat, udligning eller selvstændig momsberegning er indregnet; ens momsgrundlag og konstante årlige antagelser er forudsat.\n${terms.map((term) => `${term.label}: faktorprodukt/divisor ${quantity(term.quantityMilli / 1000)}${term.quantityUnit ? ` ${term.quantityUnit}` : ''}; værdi ${money(term.amountOre)}, kontant ${money(term.cashAmountOre)}, kapacitetsværdi ${money(term.capacityAmountOre)}.`).join('\n')}\n${points.map((point) => `${point.label}: omkostninger ${money(point.cost)}, kontant effekt ${money(point.benefit)}, ikke-kontant kapacitetsværdi ${money(point.capacityValue)}, kontant netto ${money(point.net)}, akkumuleret ${money(point.cumulative)}.`).join('\n')}`;
    common.push(
      'Frigjort tid eller anden gevinstværdi bliver kun kontant effekt gennem en særskilt antaget realiseringsandel. Standardandelen er 0 %. Kapacitetsværdi og kontante gevinster summeres aldrig til en påstået budgetbesparelse.',
    );
  } else if (spec.kind === 'activity') {
    const multiplier = BigInt(10_000 + spec.annualChangeBps);
    const points = Array.from({ length: spec.years }, (_, index) => ({
      year: startYear + index,
      quantityMilli: rounded(
        BigInt(spec.initialQuantityMilli) * multiplier ** BigInt(index),
        10_000n ** BigInt(index),
      ),
    }));
    calculation = { kind: 'activity', points };
    const first = points[0].quantityMilli;
    const last = points.at(-1)!.quantityMilli;
    metrics = [
      {
        label: 'Antaget startniveau',
        value: first / 1000,
        unit: 'number',
        displayUnit: spec.unit,
        sourceIds,
      },
      {
        label: 'Illustrativt slutniveau',
        value: last / 1000,
        unit: 'number',
        displayUnit: spec.unit,
        sourceIds,
      },
      {
        label: 'Illustrativ ændring',
        value: total([last, -first]) / 1000,
        unit: 'number',
        displayUnit: spec.unit,
        sourceIds,
      },
      {
        label: 'Antaget årlig ændring',
        value: spec.annualChangeBps / 100,
        unit: 'percent',
        displayUnit: '%',
        sourceIds,
      },
    ];
    chart = {
      type: 'line',
      title: 'Illustrativ aktivitetsudvikling',
      subtitle: `${period} · ${spec.unit}`,
      unit: 'number',
      displayUnit: spec.unit,
      rows: points.map((point) => ({
        label: String(point.year),
        value: point.quantityMilli / 1000,
      })),
      series: [{ key: 'value', label: `Antaget niveau · ${spec.unit}`, color: '#006f71' }],
      sourceIds,
    };
    conclusion = `Med de valgte forudsætninger går niveauet fra ${quantity(first / 1000)} ${spec.unit} i ${startYear} til ${quantity(last / 1000)} ${spec.unit} i ${endYear} ved ${quantity(spec.annualChangeBps / 100)} % årlig ændring. [2]`;
    narrative = [
      'Fremskrivningen viser virkningen af den valgte årlige ændring med samme beregningsregel i alle år. [2]',
      'Se og justér forudsætningerne i Vis data.',
    ];
    assumptionText = `Antaget startniveau: ${quantity(spec.initialQuantityMilli / 1000)} ${spec.unit}; antaget årlig ændring ${quantity(spec.annualChangeBps / 100)} %; ${spec.years} år med start i ${startYear}.`;
    calculationText = `Niveau i år t = startniveau × (1 + annualChangeBps / 10000)^t, hvor t=0 er startåret. Hvert års niveau beregnes direkte fra startværdien med rationelle heltal og afrundes til 0,001 ${spec.unit}; tidligere afrundede år genbruges ikke.\n${points.map((point) => `${point.year}: ${quantity(point.quantityMilli / 1000)} ${spec.unit} (${point.quantityMilli} tusindedele).`).join('\n')}`;
  } else {
    calculation = { kind: 'process', stepCount: spec.steps.length };
    chart = {
      type: 'flow',
      title: 'Illustrativt forløb',
      subtitle: 'Forslag til rækkefølge',
      unit: 'number',
      displayUnit: 'rækkefølge',
      rows: spec.steps.map((step, index) => ({ ...step, order: index + 1 })),
      series: [{ key: 'order', label: 'Trin', color: '#006f71' }],
      sourceIds,
    };
    conclusion = 'Her er et muligt forløb, som kan tilpasses det konkrete behov. [1]';
    narrative = [
      ...spec.steps.map((step) => `${step.label}: ${step.description} [1]`),
      'Se forslagene og forløbets grundlag i Vis data.',
    ];
    assumptionText = spec.steps
      .map((step, index) => `${index + 1}. ${step.label}: ${step.description}`)
      .join('\n');
    calculationText =
      'Der beregnes ingen økonomiske beløb, aktivitetsmål, sandsynligheder eller effekter. Serveren validerer og ordner de foreslåede trin. Rækkefølgen er en del af modeludkastet; positionsnumre er ikke effektmålinger.';
  }
  const sources: SourceRef[] = [
    {
      id: assumptionId,
      title: 'Valgte forudsætninger',
      type: 'demo',
      status: 'simulated',
      origin: 'assumption',
      period,
      datasetVersion: datasetShell.version,
      excerpt: `Værdier og trin er valgt som forudsætninger for dette eksempel, ikke som opslag i kommunale registreringer eller dokumenterede beslutninger. Afgrænsning: ${scope}.\n${assumptionText}\n${spec.assumptions.join('\n')}`,
    },
    {
      id: calculationId,
      title: 'Beregning og metode',
      type: 'demo',
      status: 'simulated',
      origin: 'calculation',
      period,
      datasetVersion: datasetShell.version,
      excerpt: `Beregnet fra illustrationens særskilte antagelsesgrundlag ${assumptionId}; ingen regnskabs-, budget- eller dokumentrækker er anvendt. Dataversionen fastholder adgangsafgrænsningen, ikke en påstand om at hypotesen findes i datasættet.\n${calculationText}`,
    },
  ];
  return {
    analysisId: `DEMO-ILLUSTRATION-${key}`,
    datasetVersion: datasetShell.version,
    question,
    title: spec.title,
    conclusion,
    narrative,
    metrics,
    sources,
    chart,
    context,
    basisKind: 'illustration',
    illustration: { version: 1, spec, calculation },
    assumptions: common,
    followups:
      spec.kind === 'investment'
        ? [
            'Vis samme illustration med en lavere kontant realiseringsandel.',
            'Hvilke antagelser er mest afgørende for resultatet?',
          ]
        : spec.kind === 'activity'
          ? [
              'Vis samme illustration med en lavere årlig ændring.',
              'Forklar antagelserne bag denne udvikling.',
            ]
          : [
              'Uddyb det første trin i forløbet.',
              'Hvilke oplysninger skal vi indsamle, før vi kan beregne en effekt?',
            ],
  };
}
