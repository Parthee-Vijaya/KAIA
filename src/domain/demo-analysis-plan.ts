import { assertAnalysisContext, parseQuestion, unavailableQuestionReason } from './analysis';
import { illustrationSpecSchema } from './illustrations';
import { AccessDeniedError } from './policy';
import type { Dataset } from './data';
import type {
  AccessContext,
  Analysis,
  AnalysisContext,
  IllustrationSpec,
  IllustrationTerm,
  ScenarioAssumptions,
} from './types';

export interface DemoAnalysisInput {
  question: string;
  user: AccessContext;
  dataset: Dataset;
  previous?: Analysis;
  inputContext?: Partial<AnalysisContext>;
  scenario?: ScenarioAssumptions;
  /** Already parsed by the server; data-analysis outcomes preserve this context unchanged. */
  currentContext?: AnalysisContext;
}
export type DemoAnalysisPlan =
  | { outcome: 'analysis'; context: AnalysisContext }
  | {
      outcome: 'illustration';
      context: AnalysisContext;
      spec: IllustrationSpec;
      trigger:
        'explicit-hypothesis' | 'unsupported-dimension' | 'open-topic' | 'followup' | 'unknown';
    };
export class DemoAnalysisPlanError extends Error {
  readonly status = 422;
  readonly code = 'DEMO_PLAN_INVALID';
}
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('ø', 'o')
    .replaceAll('æ', 'ae')
    .replaceAll('−', '-');
type Topic = 'ai' | 'care' | 'roads' | 'staff' | 'wellbeing' | 'waiting' | 'savings' | 'generic';
type Parameter =
  | 'staff'
  | 'minutes'
  | 'weeks'
  | 'visits'
  | 'km'
  | 'years'
  | 'upfront'
  | 'annualCost'
  | 'hourlyValue'
  | 'cashPercent'
  | 'growthPercent'
  | 'initial'
  | 'perKmCost'
  | 'perKmMaintenance';
type Parameters = Partial<Record<Parameter, number>>;
const baseAssumptions = [
  'Forberedte demoforudsætninger v1. Alle nye parametre er illustrative antagelser, ikke observeret bemanding, priser, aktiviteter eller dokumenterede kommunale beslutninger.',
  'Entydige tal i spørgsmålet anvendes som antagelser; øvrige værdier er faste demoforudsætninger. Kontant realisering er 0 %, medmindre en særskilt andel er angivet.',
];
const termLabels: Record<IllustrationTerm['kind'], string> = {
  upfrontCost: 'Opstart',
  annualCost: 'Årlig drift',
  annualBenefit: 'Årlig kapacitetsværdi',
};
function validateContext(input: DemoAnalysisInput, context: AnalysisContext) {
  const p = context.period,
    coverage = input.dataset.coverage || { fromYear: 2023, toYear: 2028 };
  if (
    !input.dataset.version ||
    !input.dataset.seed ||
    !Number.isInteger(p.year) ||
    p.year < coverage.fromYear ||
    p.year > coverage.toYear ||
    p.year < 2020 ||
    p.year > 2032 ||
    !Number.isInteger(p.fromMonth) ||
    !Number.isInteger(p.toMonth) ||
    p.fromMonth < 1 ||
    p.toMonth > 12 ||
    p.fromMonth > p.toMonth
  )
    throw new DemoAnalysisPlanError(
      'Spørgsmålets referenceperiode skal ligge i det valgte datasnapshot med gyldige måneder.',
    );
  assertAnalysisContext(input.user, context, input.dataset.entities);
  if (
    context.entityIds.length > 100 ||
    new Set(context.entityIds).size !== context.entityIds.length ||
    context.entityIds.some(
      (id) =>
        !input.dataset.entities.some(
          (entity) =>
            entity.id === id && entity.type !== 'committee' && entity.area === context.area,
        ),
    )
  )
    throw new AccessDeniedError(
      'Spørgsmålet skal afgrænses til tilladte driftsenheder i samme område.',
    );
}
function contextOf(input: DemoAnalysisInput) {
  const context =
    input.currentContext ||
    parseQuestion(input.question, input.user, input.dataset, input.previous?.context, {
      ...input.inputContext,
      ...(input.scenario ? { scenario: input.scenario } : {}),
    });
  const copy = structuredClone(context);
  validateContext(input, copy);
  return copy;
}
function illustrationContext(current: AnalysisContext): AnalysisContext {
  return {
    area: current.area,
    entityIds: [...current.entityIds],
    period: { ...current.period },
    intent: 'illustration',
    metric: 'net',
  };
}
function topicOf(q: string): Topic {
  if (
    /skolepsykolog|psykolog|laerer(?:e|nes|ens)?\b|sygeplejersk|sosu|okonomikonsulent|stillingsgrup|arsvaerk|ansaet|bemand/.test(
      q,
    )
  )
    return 'staff';
  if (/ventetid|ventelist|sagsbehandlingstid/.test(q)) return 'waiting';
  if (/trivsel|sygefravaer|sygedag|fravaer|inklusion|ensomhed/.test(q)) return 'wellbeing';
  if (/cykelsti|\bvej(?:e|en|ene)?\b|infrastruktur/.test(q)) return 'roads';
  if (/hjemmepleje|aeldrepleje|pleje|aeldre|besog/.test(q)) return 'care';
  if (/\bai\b|kunstig intelligens|digitaliser|digital(?:e|t)? service|automatis|teknologi/.test(q))
    return 'ai';
  if (/bespar|spare|prioriter|effektiviser/.test(q)) return 'savings';
  return 'generic';
}
const unsupportedDimension = (q: string) =>
  /skolepsykolog|psykolog|laerer(?:e|nes|ens)?\b|sygeplejersk|sosu|okonomikonsulent|stillingsgrup|arsvaerk|bemand|ventetid|ventelist|sagsbehandlingstid|trivsel|sygefravaer|sygedag|fravaer|co2|klimaaftryk/.test(
    q,
  );
const municipalTopic = (q: string) =>
  /kommune|skole|elev|pleje|social|kultur|idraet|fritid|beredskab|sundhed|miljo|teknik|administration|okonomi|aeldre|arbejdsmarked|cykelsti|\bvej(?:e|en|ene)?\b|borger|medarbejder|arbejdsgang|opgave|service|prioriter|bespar|spare|forvaltning|\bai\b|digital|ventetid|trivsel|forbedr|indsats|tilbud|investering/.test(
    q,
  );
const hypothetical = (q: string) =>
  /hvad hvis|hvad sker|regneeksempel|illustr|antag|hypotet|invester|betale sig|koste|omkostning|besparelsespotentiale/.test(
    q,
  );

/** Danish decimal/thousands input is scaled as a rational, never rounded through binary floats. */
function scaled(text: string, digits: number, multiplier = 1): number {
  let value = text.replace(/[ \u00a0]/g, '');
  if (value.includes(',')) value = value.replaceAll('.', '').replace(',', '.');
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replaceAll('.', '');
  if (!/^-?\d+(?:\.\d+)?$/.test(value))
    throw new DemoAnalysisPlanError('Talformatet kunne ikke fortolkes entydigt.');
  const negative = value.startsWith('-');
  const [whole, fractional = ''] = value.replace('-', '').split('.');
  const numerator = BigInt(whole + fractional) * BigInt(multiplier) * 10n ** BigInt(digits);
  const denominator = 10n ** BigInt(fractional.length);
  if (numerator % denominator)
    throw new DemoAnalysisPlanError(
      'Antagelsen har flere decimaler end beregningens præcise enhed.',
    );
  const result = Number(numerator / denominator) * (negative ? -1 : 1);
  if (!Number.isSafeInteger(result))
    throw new DemoAnalysisPlanError('Antagelsen overstiger det tilladte talområde.');
  return result;
}
function parameters(q: string): { values: Parameters; ambiguous: boolean } {
  const values: Parameters = {};
  let ambiguous = false;
  const assign = (key: Parameter, value: number) => {
    if (values[key] !== undefined && values[key] !== value) ambiguous = true;
    else values[key] = value;
  };
  const numbers = [...q.matchAll(/(?<![\w.,])(-?\d+(?:[.,]\d+)*(?:[ \u00a0]\d{3})*)/g)];
  const yearWords: Record<string, number> = {
    en: 1,
    et: 1,
    to: 2,
    tre: 3,
    fire: 4,
    fem: 5,
    seks: 6,
    syv: 7,
    otte: 8,
    ni: 9,
    ti: 10,
    elleve: 11,
    tolv: 12,
    tyve: 20,
  };
  for (const word of q.matchAll(/\b([a-z]+)\s+ar\b/g)) {
    if (yearWords[word[1]]) assign('years', yearWords[word[1]]);
    else if (!['pr', 'per', 'hvert', 'sidste', 'forrige', 'naeste', 'hele'].includes(word[1]))
      ambiguous = true;
  }
  for (const match of numbers) {
    const text = match[1],
      start = match.index!,
      before = q
        .slice(Math.max(0, start - 55), start)
        .split(/\s+(?:og|samt|mens)\s+|;|,(?!\d)/)
        .at(-1)!,
      after = q
        .slice(start + text.length, start + text.length + 70)
        .split(/\s+(?:og|samt|mens)\s+|;|,(?!\d)/)[0];
    if (
      /^20\d{2}$/.test(text) &&
      !/^\s*(?:medarbejder|ansat|besog|enhed|minut|km|kilometer)/.test(after)
    )
      continue;
    let key: Parameter | undefined,
      digits = 3,
      multiplier = 1;
    if (
      /^\s*(?:medarbejdere?|ansatte?|arsvaerk|(?:ekstra\s+)?(?:okonomikonsulent|skolepsykolog|psykolog|laerer|sygeplejersk|sosu))/.test(
        after,
      )
    )
      key = 'staff';
    else if (/^\s*(?:minutter?|min\.?\b)/.test(after)) key = 'minutes';
    else if (/^\s*(?:arbejdsuger?|uger?)\b/.test(after)) key = 'weeks';
    else if (/^\s*besog\b/.test(after)) key = 'visits';
    else if (/^\s*(?:km|kilometer)\b/.test(after)) key = 'km';
    else if (/^\s*(?:enheder)\b/.test(after)) key = 'initial';
    else if (/^\s*ar(?:s)?\b/.test(after)) {
      key = 'years';
      digits = 0;
    } else if (/^\s*(?:%|procent|pct\.?)/.test(after)) {
      digits = 2;
      if (/kontant|realiser/.test(before + ' ' + after)) key = 'cashPercent';
      else if (/vaekst|arlig|aendring|vokse|stige|falde/.test(before + ' ' + after))
        key = 'growthPercent';
      else ambiguous = true;
    } else if (/^\s*(?:mio\.?|millioner?|tusind|kr\.?|kroner?)\b/.test(after)) {
      digits = 2;
      if (/^\s*(?:mio\.?|millioner?)/.test(after)) multiplier = 1_000_000;
      else if (/^\s*tusind/.test(after)) multiplier = 1000;
      if (
        /timevaerdi|timepris|timelon/.test(before) ||
        /(?:kr\.?|kroner?)\s*(?:\/|pr\.?|per)\s*time/.test(after)
      )
        key = 'hourlyValue';
      else if (/(?:kr\.?|kroner?)\s*(?:\/|pr\.?|per)\s*(?:km|kilometer)/.test(after))
        key = /vedligehold|drift|arlig/.test(before) ? 'perKmMaintenance' : 'perKmCost';
      else if (
        /drift|licens|vedligehold|arlig(?:e)? omkost/.test(before) ||
        /(?:kr\.?|kroner?)\s*(?:(?:\/|pr\.?|per)\s*ar\b|arligt\b)/.test(after)
      )
        key = 'annualCost';
      else key = 'upfront';
    } else if (/^\s*(?:i stedet|istedet)/.test(after)) {
      ambiguous = true;
    }
    if (key) {
      let value = scaled(text, digits, multiplier);
      if (key === 'growthPercent' && /fald|reduc|nedgang|mindre|lavere/.test(before.slice(-35)))
        value = -Math.abs(value);
      assign(key, value);
    } else if (!/^\s*(?:%|procent|pct)/.test(after)) ambiguous = true;
  }
  return { values, ambiguous };
}
function checked(spec: IllustrationSpec, context: AnalysisContext): IllustrationSpec {
  const parsed = illustrationSpecSchema.safeParse(spec);
  if (!parsed.success || (spec.kind !== 'process' && context.period.year + spec.years - 1 > 2050))
    throw new DemoAnalysisPlanError(
      'Illustrationens antagelser overstiger de tilladte grænser eller år 2050.',
    );
  return parsed.data;
}
function processSpec(topic: Topic): IllustrationSpec {
  const variants: Record<
    Topic,
    { title: string; steps: { label: string; description: string }[] }
  > = {
    ai: {
      title: 'Muligheder med AI og digitale arbejdsgange',
      steps: [
        {
          label: 'Vælg en konkret arbejdsgang',
          description:
            'Afgræns eksempelvis udkast, resuméer eller genfinding af viden i det valgte område.',
        },
        {
          label: 'Afprøv med kendte eksempler',
          description:
            'Brug et afgrænset materiale og lad fagfunktionen kontrollere kvalitet og fejl.',
        },
        {
          label: 'Undersøg tid og kvalitet',
          description:
            'Sammenhold tidsforbrug og opgavekvalitet før en mulig ændring; frigivet tid er ikke automatisk en kontant besparelse.',
        },
        {
          label: 'Lav et åbent regneeksempel',
          description:
            'Undersøg en mulig investering med synlige antagelser om opstart, drift, tidsværdi og kontant realisering.',
        },
      ],
    },
    care: {
      title: 'Forslag til at undersøge mere tid i plejen',
      steps: [
        {
          label: 'Afgræns opgaven',
          description:
            'Vælg en arbejdsgang og en relevant aktivitet inden for det tilladte plejeområde.',
        },
        {
          label: 'Undersøg ressourcer og kvalitet',
          description:
            'Få et aggregeret grundlag for tid, besøg, kontinuitet og kvalitet uden individuelle borgersager.',
        },
        {
          label: 'Afprøv en mulig ændring',
          description:
            'Undersøg en afgrænset ændring og dens faglige konsekvenser; der antages ingen dokumenteret effekt.',
        },
        {
          label: 'Vurder kapacitet særskilt',
          description:
            'Brug et regneeksempel til frigjort tid og hold kapacitetsværdi adskilt fra kontantøkonomi.',
        },
      ],
    },
    roads: {
      title: 'Forslag til at undersøge et infrastrukturtiltag',
      steps: [
        {
          label: 'Afgræns strækningen',
          description: 'Beskriv formål, længde og forbindelser i det valgte område.',
        },
        {
          label: 'Adskil anlæg og drift',
          description: 'Opstil tydelige antagelser om anlægspris og løbende vedligehold.',
        },
        {
          label: 'Undersøg faglige forhold',
          description:
            'Indhent relevante oplysninger om kapacitet, areal og trafikale konsekvenser; der er ingen lokal trafikmåling i dette eksempel.',
        },
        {
          label: 'Sammenhold muligheder',
          description:
            'Vurder alternative løsninger, uden at en tænkt effekt fremstilles som en dokumenteret gevinst.',
        },
      ],
    },
    staff: {
      title: 'Muligt grundlag for en bemandingsvurdering',
      steps: [
        {
          label: 'Afgræns funktionen',
          description:
            'Beskriv opgaver og kapacitetsbehov i den valgte enhed; eksisterende stillingsgrupper er ikke opgjort her.',
        },
        {
          label: 'Opstil enhedsomkostningen',
          description:
            'Brug en synlig antagelse om antal medarbejdere og årlig omkostning, frem for områdets samlede nettoudgift.',
        },
        {
          label: 'Vurder alternativerne',
          description:
            'Undersøg opgavefordeling og kapacitet uden at antage en bestemt faglig eller økonomisk effekt.',
        },
      ],
    },
    wellbeing: {
      title: 'Forslag til at undersøge trivsel og fravær',
      steps: [
        {
          label: 'Afgræns spørgsmålet',
          description: 'Definér den relevante gruppe, periode og aktivitet på aggregeret niveau.',
        },
        {
          label: 'Find et målegrundlag',
          description:
            'Indhent sammenlignelige oplysninger; økonomiposteringer dokumenterer ikke i sig selv trivsel eller en årsag til fravær.',
        },
        {
          label: 'Undersøg mulige forklaringer',
          description: 'Skeln mellem observationer og hypoteser og vurder flere mulige forhold.',
        },
        {
          label: 'Afprøv og følg op',
          description:
            'Aftal en afgrænset indsats og en måde at følge kvalitet og udvikling uden at love en effekt.',
        },
      ],
    },
    waiting: {
      title: 'Forslag til at undersøge ventetid og kapacitet',
      steps: [
        {
          label: 'Definér ventetiden',
          description:
            'Fastlæg start, afslutning og aktivitet, så en senere måling bliver sammenlignelig.',
        },
        {
          label: 'Undersøg til- og afgang',
          description:
            'Find et aggregeret grundlag for aktivitet og kapacitet; der er ingen observeret venteliste i illustrationen.',
        },
        {
          label: 'Afprøv et alternativ',
          description: 'Undersøg mulige arbejdsgange og ressourcebehov med tydelige antagelser.',
        },
      ],
    },
    savings: {
      title: 'Muligheder for at undersøge prioriteringer',
      steps: [
        {
          label: 'Start i det tilladte budgetgrundlag',
          description: 'Undersøg udgiftstyper og afvigelser for samme enheder og periode.',
        },
        {
          label: 'Adskil faste og variable udgifter',
          description:
            'Vurder hvilke poster en ændret aktivitet faktisk kan påvirke, og hvilke der kræver en kapacitetsbeslutning.',
        },
        {
          label: 'Beregn et afgrænset scenarie',
          description:
            'Prøv energi, løn, vikarer eller vedligehold i et scenarie; et ændret budget giver ikke automatisk lavere forbrug.',
        },
        {
          label: 'Vurder faglige konsekvenser',
          description:
            'Sammenhold mulige virkninger og antagelser før en prioritering. Der er ikke fastlagt en besparelse i dette forløb.',
        },
      ],
    },
    generic: {
      title: 'Et muligt kommunalt undersøgelsesforløb',
      steps: [
        {
          label: 'Afgræns formålet',
          description:
            'Beskriv det ønskede resultat og den relevante aktivitet inden for det valgte område.',
        },
        {
          label: 'Gør grundlaget tydeligt',
          description:
            'Skeln mellem økonomital fra snapshot, antagelser og oplysninger, der først skal indhentes.',
        },
        {
          label: 'Undersøg et alternativ',
          description:
            'Opstil et muligt tiltag og vurder ressourcer og faglige konsekvenser uden at love en bestemt effekt.',
        },
        {
          label: 'Aftal en opfølgning',
          description:
            'Vælg et aggregeret grundlag til en senere vurdering af det afgrænsede tiltag.',
        },
      ],
    },
  };
  return {
    kind: 'process',
    ...variants[topic],
    assumptions: [
      baseAssumptions[0],
      'Trinene er et forberedt forslag, ikke en faktisk beslutning, observeret effekt eller dokumentation af lokale årsager.',
    ],
  };
}
function constantTerm(
  label: string,
  kind: IllustrationTerm['kind'],
  amountOre: number,
): IllustrationTerm {
  return {
    label,
    kind,
    quantityFactors: [{ label: 'Antal', valueMilli: 1000 }],
    divisor: 1,
    unitValueOre: amountOre,
  };
}
function numericSpec(topic: Topic, p: Parameters): IllustrationSpec {
  const years = p.years ?? (topic === 'staff' ? 1 : 5);
  if (topic === 'roads') {
    const factor = { label: 'Kilometer', valueMilli: p.km ?? 1000 };
    return {
      kind: 'investment',
      title: 'Illustrativt anlæg og vedligehold',
      years,
      assumptions: baseAssumptions,
      terms: [
        p.upfront !== undefined
          ? constantTerm('Antaget samlet anlæg', 'upfrontCost', p.upfront)
          : {
              label: 'Illustrativt anlæg',
              kind: 'upfrontCost',
              quantityFactors: [factor],
              divisor: 1,
              unitValueOre: p.perKmCost ?? 250_000_000,
              quantityUnit: 'km',
            },
        p.annualCost !== undefined
          ? constantTerm('Antaget årligt vedligehold', 'annualCost', p.annualCost)
          : {
              label: 'Årligt vedligehold',
              kind: 'annualCost',
              quantityFactors: [{ ...factor }],
              divisor: 1,
              unitValueOre: p.perKmMaintenance ?? 2_500_000,
              quantityUnit: 'km',
            },
      ],
    };
  }
  if (topic === 'staff') {
    return {
      kind: 'investment',
      title: 'Illustrativ medarbejderomkostning',
      years,
      assumptions: [
        ...baseAssumptions,
        'Eksemplet indeholder alene en antaget medarbejderomkostning. Der foreligger ingen oplysninger om faktisk bemanding, løn pr. stilling eller en effekt af ekstra kapacitet.',
      ],
      terms: [
        {
          label: 'Antaget årlig medarbejderomkostning',
          kind: 'annualCost',
          quantityFactors: [{ label: 'Medarbejdere', valueMilli: p.staff ?? 1000 }],
          divisor: 1,
          unitValueOre: p.annualCost ?? p.upfront ?? 60_000_000,
        },
      ],
    };
  }
  if (
    p.growthPercent !== undefined ||
    p.initial !== undefined ||
    (p.visits !== undefined && p.minutes === undefined && topic !== 'ai')
  ) {
    return {
      kind: 'activity',
      title: 'Illustrativ aktivitetsudvikling',
      years,
      initialQuantityMilli: p.initial ?? p.visits ?? 1_000_000,
      annualChangeBps: p.growthPercent ?? 200,
      unit: p.visits !== undefined || topic === 'care' ? 'besøg' : 'enheder',
      assumptions: baseAssumptions,
    };
  }
  const care = topic === 'care' || p.visits !== undefined;
  return {
    kind: 'investment',
    title: care ? 'Illustrativ tid og kapacitet i plejen' : 'Illustrativ investering og arbejdstid',
    years,
    assumptions: baseAssumptions,
    terms: [
      constantTerm('Opstart', 'upfrontCost', p.upfront ?? (care ? 25_000_000 : 75_000_000)),
      constantTerm('Årlig drift', 'annualCost', p.annualCost ?? (care ? 6_000_000 : 12_000_000)),
      {
        label: 'Årlig kapacitetsværdi',
        kind: 'annualBenefit',
        quantityFactors: care
          ? [
              { label: 'Årlige besøg', valueMilli: p.visits ?? 24_000_000 },
              { label: 'Minutter pr. besøg', valueMilli: p.minutes ?? 8000 },
            ]
          : [
              { label: 'Medarbejdere', valueMilli: p.staff ?? 100_000 },
              { label: 'Minutter pr. uge', valueMilli: p.minutes ?? 15_000 },
              { label: 'Arbejdsuger', valueMilli: p.weeks ?? 46_000 },
            ],
        divisor: 60,
        unitValueOre: p.hourlyValue ?? (care ? 36_000 : 35_000),
        quantityUnit: 'timer',
        cashRealizationBps: p.cashPercent ?? 0,
      },
    ],
  };
}
function sameScope(a: AnalysisContext, b: AnalysisContext) {
  return (
    a.area === b.area && [...a.entityIds].sort().join('\n') === [...b.entityIds].sort().join('\n')
  );
}
function followupSpec(previous: IllustrationSpec, p: Parameters): IllustrationSpec | undefined {
  if (previous.kind === 'process') return;
  if (previous.kind === 'activity') {
    if (
      Object.keys(p).some((key) => !['years', 'initial', 'visits', 'growthPercent'].includes(key))
    )
      return;
    return {
      ...previous,
      title: 'Opdateret aktivitetsillustration',
      assumptions: baseAssumptions,
      years: p.years ?? previous.years,
      initialQuantityMilli: p.initial ?? p.visits ?? previous.initialQuantityMilli,
      annualChangeBps: p.growthPercent ?? previous.annualChangeBps,
    };
  }
  const spec = structuredClone(previous);
  spec.title = 'Opdateret investeringsillustration';
  spec.assumptions = baseAssumptions;
  spec.years = p.years ?? spec.years;
  const applied = new Set<Parameter>(p.years !== undefined ? ['years'] : []);
  spec.terms = spec.terms.map((term, index) => ({
    ...term,
    label: `${termLabels[term.kind]} · bidrag ${index + 1}`,
    quantityFactors: term.quantityFactors.map((factor, factorIndex) => {
      const label = normalize(factor.label);
      const role = /medarbejder|ansat|arsvaerk/.test(label)
        ? 'staff'
        : /minut/.test(label)
          ? 'minutes'
          : /uger|uge\b/.test(label)
            ? 'weeks'
            : /besog/.test(label)
              ? 'visits'
              : /kilometer|\bkm\b/.test(label)
                ? 'km'
                : undefined;
      const neutral = role
        ? {
            staff: 'Medarbejdere',
            minutes: 'Minutter',
            weeks: 'Arbejdsuger',
            visits: 'Årlige besøg',
            km: 'Kilometer',
          }[role]
        : `Faktor ${factorIndex + 1}`;
      if (role && p[role] !== undefined) applied.add(role);
      return {
        label: neutral,
        valueMilli: role && p[role] !== undefined ? p[role]! : factor.valueMilli,
      };
    }),
  }));
  for (const [role, kind] of [
    ['upfront', 'upfrontCost'],
    ['annualCost', 'annualCost'],
    ['hourlyValue', 'annualBenefit'],
  ] as const) {
    if (p[role] === undefined) continue;
    const terms = spec.terms.filter((term) => term.kind === kind);
    if (terms.length !== 1) return;
    terms[0].unitValueOre = p[role]!;
    applied.add(role);
  }
  if (p.cashPercent !== undefined) {
    const benefits = spec.terms.filter((term) => term.kind === 'annualBenefit');
    if (!benefits.length) return;
    benefits.forEach((term) => {
      term.cashRealizationBps = p.cashPercent;
    });
    applied.add('cashPercent');
  }
  return Object.keys(p).every((key) => applied.has(key as Parameter)) ? spec : undefined;
}

/**
 * Metadata-only, finite templates; known ledger questions keep the existing engine.
 * Numeric grammar: attached Danish amounts, staff/minutes/weeks/visits/km/years/percent;
 * year words 1–12 and 20. Ambiguous or unsupported numeric relations get a process,
 * never guessed arithmetic. No document facts, arbitrary formulas or model calls.
 */
export function resolveDemoAnalysis(input: DemoAnalysisInput): DemoAnalysisPlan {
  if (typeof input.question !== 'string' || !input.question.trim() || input.question.length > 4000)
    throw new DemoAnalysisPlanError('Skriv et spørgsmål på højst 4.000 tegn.');
  const unavailable = unavailableQuestionReason(input.question);
  if (unavailable) throw new DemoAnalysisPlanError(unavailable);
  const current = contextOf(input),
    context = illustrationContext(current),
    q = normalize(input.question);
  if (current.intent === 'mobilityCapacity') return { outcome: 'analysis', context: current };
  const topic = topicOf(q),
    unsupported = unsupportedDimension(q);
  const makesNewExample =
    hypothetical(q) &&
    (/\bai\b|digital|automatis|investering|invester|arbejdstid|minut|medarbejder|besog|cykelsti|enheder/.test(
      q,
    ) ||
      topic !== 'generic');
  const datasetSwitch =
    /\b(?:budget|regnskab|prognose|postering|afvigelse|demografi)\w*/.test(q) &&
    !/samme illustration|samme regneeksempel/.test(q);
  const standardScenario =
    current.intent === 'scenario' &&
    !unsupported &&
    /energi|braendstof|lonomkost|vikar|elevtal|demobudget|budgetramme|vedligehold/.test(q) &&
    !/regneeksempel|illustr|invester|\bai\b|digital|automatis/.test(q);
  if (standardScenario) return { outcome: 'analysis', context: current };
  const following =
    !datasetSwitch &&
    !!input.previous?.illustration &&
    sameScope(input.previous.context, context) &&
    /i stedet|istedet|samme illustration|samme regneeksempel|vis det|antagelser|kontant|realiseringsandel/.test(
      q,
    );
  const needsParameters = makesNewExample || following || (unsupported && topic === 'staff');
  const parsed = needsParameters ? parameters(q) : { values: {} as Parameters, ambiguous: false };
  const illustrate = (
    spec: IllustrationSpec,
    trigger: Extract<DemoAnalysisPlan, { outcome: 'illustration' }>['trigger'],
  ): DemoAnalysisPlan => {
    validateContext(input, context);
    return { outcome: 'illustration', context, spec: checked(spec, context), trigger };
  };
  const illustrateNumbers = (
    selectedTopic: Topic,
    values: Parameters,
    trigger: Extract<DemoAnalysisPlan, { outcome: 'illustration' }>['trigger'],
  ): DemoAnalysisPlan => {
    const spec = numericSpec(selectedTopic, values);
    const care = selectedTopic === 'care' || values.visits !== undefined;
    const allowed: Parameter[] =
      selectedTopic === 'roads'
        ? ['years', 'km', 'upfront', 'annualCost', 'perKmCost', 'perKmMaintenance']
        : selectedTopic === 'staff'
          ? ['years', 'staff', 'upfront', 'annualCost']
          : spec.kind === 'activity'
            ? ['years', 'initial', 'visits', 'growthPercent']
            : [
                'years',
                'upfront',
                'annualCost',
                'hourlyValue',
                'cashPercent',
                'minutes',
                ...(care ? (['visits'] as const) : (['staff', 'weeks'] as const)),
              ];
    if (
      (selectedTopic === 'staff' &&
        (values.staff || 0) > 1000 &&
        (values.upfront !== undefined || values.annualCost !== undefined)) ||
      Object.keys(values).some((key) => !allowed.includes(key as Parameter)) ||
      (values.upfront !== undefined && values.perKmCost !== undefined) ||
      (values.annualCost !== undefined && values.perKmMaintenance !== undefined)
    )
      return illustrate(processSpec(selectedTopic), trigger);
    return illustrate(spec, trigger);
  };
  const adverseOrNegatedTime =
    /(?:bruger|bruge|tager|kraever).{0,60}(?:ekstra|mere tid|laengere)|(?:minut|time).{0,20}ekstra|(?:ikke|ingen|aldrig).{0,20}(?:spar|frig|gevinst)|oget tidsforbrug/.test(
      q,
    );
  if (following) {
    if (
      input.previous!.datasetVersion !== input.dataset.version ||
      input.previous!.illustration!.version !== 1
    )
      throw new DemoAnalysisPlanError(
        'En illustrationsopfølgning skal bruge det ejede snapshots samme dataversion.',
      );
    const previous = illustrationSpecSchema.safeParse(input.previous!.illustration!.spec);
    if (!previous.success)
      throw new DemoAnalysisPlanError(
        'Den tidligere illustrations antagelser kunne ikke valideres.',
      );
    if (parsed.ambiguous || adverseOrNegatedTime) return illustrate(processSpec(topic), 'followup');
    const changed = followupSpec(previous.data, parsed.values);
    if (changed) return illustrate(changed, 'followup');
    return illustrate(processSpec(topic), 'followup');
  }
  if (unsupported) {
    const quantifiedStaff = topic === 'staff' && /lon|omkost|udgift|koste|ansaet|arsvaerk/.test(q);
    return quantifiedStaff && !parsed.ambiguous
      ? illustrateNumbers('staff', parsed.values, 'unsupported-dimension')
      : illustrate(processSpec(topic), 'unsupported-dimension');
  }
  if (makesNewExample) {
    if (parsed.ambiguous || adverseOrNegatedTime || topic === 'wellbeing' || topic === 'waiting')
      return illustrate(processSpec(topic), 'explicit-hypothesis');
    return illustrateNumbers(topic, parsed.values, 'explicit-hypothesis');
  }
  if (topic === 'ai' || /nyt? tilbud|nye tilbud|nyt? tiltag|nye tiltag/.test(q))
    return illustrate(processSpec(topic), 'open-topic');
  if (current.intent === 'missing' && (municipalTopic(q) || topic !== 'generic'))
    return illustrate(processSpec(topic), topic === 'generic' ? 'unknown' : 'open-topic');
  return { outcome: 'analysis', context: current };
}
