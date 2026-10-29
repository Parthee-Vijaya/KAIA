import type { Analysis, ChartSpec } from './types';
import {
  CLASS_COST_ORE,
  CLASS_SIZE,
  mobilityDemand,
  DEFAULT_MOBILITY,
  MobilityError,
} from './mobility';

export interface MobilityDetailSelection {
  entityId?: string;
  year: number;
}
export interface MobilitySchoolYear {
  id: string;
  name: string;
  year: number;
  pupils: number;
  baselinePupils: number;
  capacity: number;
  baselineCapacity: number;
  shortage: number;
  spare: number;
  extraClasses: number;
  variableCostOre: number;
  fixedCostOre: number;
}
/** Derive finer views from the owned immutable snapshot; filtering never reallocates classes. */
export function mobilityDetail(analysis: Analysis, selection: MobilityDetailSelection) {
  const c = analysis.mobility;
  if (!c || !analysis.chart) throw new MobilityError('Vælg et skolekapacitetsforløb.');
  if (selection.entityId && !c.schools.some((s) => s.id === selection.entityId))
    throw new MobilityError('Skolen indgår ikke i det gemte grundlag.');
  if (
    !Number.isInteger(selection.year) ||
    selection.year < c.anchorYear ||
    selection.year > c.anchorYear + 4
  )
    throw new MobilityError('Vælg et af de fem prognoseår.');
  const schools = c.schools.filter((s) => !selection.entityId || s.id === selection.entityId);
  const years = Array.from({ length: 5 }, (_, i) => c.anchorYear + i);
  const allSchoolYears: MobilitySchoolYear[] = c.schools.flatMap((s) =>
    years.map((year) => {
      const extraClasses = c.schoolResults.find((r) => r.id === s.id)!.extraClasses;
      const pupils = mobilityDemand(s, year - c.anchorYear + 1, c.assumptions),
        capacity = s.capacity + extraClasses * CLASS_SIZE;
      return {
        id: s.id,
        name: s.name,
        year,
        pupils,
        baselinePupils: mobilityDemand(s, year - c.anchorYear + 1, DEFAULT_MOBILITY),
        capacity,
        baselineCapacity: s.capacity,
        shortage: Math.max(0, pupils - capacity),
        spare: Math.max(0, capacity - pupils),
        extraClasses,
        variableCostOre: pupils * c.assumptions.variableCostOre,
        fixedCostOre: extraClasses * CLASS_COST_ORE,
      };
    }),
  );
  const selected = allSchoolYears.filter(
    (r) => (!selection.entityId || r.id === selection.entityId) && r.year === selection.year,
  );
  const history = c.history.filter((r) => !selection.entityId || r.entityId === selection.entityId);
  const historicYears = Array.from({ length: 5 }, (_, i) => c.anchorYear - 5 + i);
  const sum = (key: keyof MobilitySchoolYear) => selected.reduce((n, r) => n + Number(r[key]), 0);
  const ids = analysis.sources.map((s) => s.id),
    scope = schools.length === 1 ? schools[0].name : 'Alle valgte skoler';
  const timeline: ChartSpec = {
    ...analysis.chart!,
    highlightLabel: String(selection.year),
    title: `Elever og pladser · ${scope}`,
    rows: [
      ...historicYears.map((year, i) => ({
        label: String(year),
        history: history.filter((r) => r.year === year).reduce((n, r) => n + r.pupils, 0),
        baseline: i === 4 ? schools.reduce((n, s) => n + s.pupils, 0) : null,
        scenario: i === 4 ? schools.reduce((n, s) => n + s.pupils, 0) : null,
        capacity: schools.reduce((n, s) => n + s.capacity, 0),
      })),
      ...years.map((year) => {
        const rows = allSchoolYears.filter(
          (r) => r.year === year && (!selection.entityId || r.id === selection.entityId),
        );
        return {
          label: String(year),
          history: null,
          baseline: rows.reduce((n, r) => n + r.baselinePupils, 0),
          scenario: rows.reduce((n, r) => n + r.pupils, 0),
          capacity: rows.reduce((n, r) => n + r.capacity, 0),
        };
      }),
    ],
  };
  const movement: ChartSpec = {
    type: 'stacked',
    title: `Flytninger fordelt på type · ${scope}`,
    subtitle: `${c.anchorYear - 5}–${c.anchorYear - 1} · familiehændelser · ud = negativ`,
    unit: 'number',
    displayUnit: 'familiehændelser',
    rows: historicYears.map((year) => {
      const rows = history.filter((r) => r.year === year);
      const total = (key: keyof (typeof rows)[number]) =>
        rows.reduce((n, r) => n + Number(r[key]), 0);
      return {
        label: String(year),
        domesticIn: total('domesticIn'),
        domesticOut: -total('domesticOut'),
        internationalIn: total('internationalIn'),
        internationalOut: -total('internationalOut'),
        internalIn: total('internalIn'),
        internalOut: -total('internalOut'),
      };
    }),
    series: [
      { key: 'domesticIn', label: 'Fra andre kommuner', color: '#006f71' },
      { key: 'domesticOut', label: 'Til andre kommuner', color: '#bc4d30' },
      { key: 'internationalIn', label: 'Fra udlandet', color: '#464f5e' },
      { key: 'internationalOut', label: 'Til udlandet', color: '#9b4028' },
      { key: 'internalIn', label: 'Fra andre demoområder', color: '#252525' },
      { key: 'internalOut', label: 'Til andre demoområder', color: '#535e70' },
    ],
    sourceIds: [ids[0]],
  };
  const schoolComparison: ChartSpec = {
    type: 'bar',
    title: `Elever og anvendelige pladser · ${selection.year}`,
    subtitle: `${scope} · sorteret efter lokal pladsmangel`,
    unit: 'number',
    displayUnit: 'elever / pladser',
    rows: [...selected]
      .sort((a, b) => b.shortage - a.shortage || a.name.localeCompare(b.name, 'da'))
      .map((r) => ({ label: r.name, pupils: r.pupils, capacity: r.capacity })),
    series: [
      { key: 'pupils', label: 'Forventede elever', color: '#bc4d30' },
      { key: 'capacity', label: 'Anvendelige pladser', color: '#006f71' },
    ],
    sourceIds: [ids[3]],
  };
  const baseCost = selected.reduce(
      (n, r) => n + r.baselinePupils * DEFAULT_MOBILITY.variableCostOre,
      0,
    ),
    pupilEffect = selected.reduce(
      (n, r) => n + (r.pupils - r.baselinePupils) * DEFAULT_MOBILITY.variableCostOre,
      0,
    ),
    unitEffect = selected.reduce(
      (n, r) => n + r.pupils * (c.assumptions.variableCostOre - DEFAULT_MOBILITY.variableCostOre),
      0,
    ),
    classEffect = sum('fixedCostOre');
  const costBridge: ChartSpec = {
    type: 'waterfall',
    title: `Hvad ændrer den årlige drift? · ${selection.year}`,
    subtitle: `${scope} · årlig drift i kr. · eksisterende faste udgifter holdes uændrede`,
    unit: 'ore',
    rows: [
      { label: 'Ændret elevtal', value: pupilEffect },
      { label: 'Ændret enhedspris', value: unitEffect },
      { label: 'Nye klassers drift', value: classEffect },
      {
        label: 'Samlet driftsændring',
        value: pupilEffect + unitEffect + classEffect,
        start: 0,
      },
    ],
    series: [{ key: 'value', label: 'Årlig drift', color: '#006f71' }],
    sourceIds: [ids[3]],
  };
  return {
    datasetVersion: analysis.datasetVersion,
    modelVersion: c.version,
    selection,
    scope,
    years,
    schools: c.schools.map((s) => ({ id: s.id, name: s.name })),
    schoolYears: allSchoolYears,
    selectedRows: selected,
    history,
    metrics: {
      pupils: sum('pupils'),
      capacity: sum('capacity'),
      shortage: sum('shortage'),
      spare: sum('spare'),
      baselineCostOre: baseCost,
      scenarioCostOre: sum('variableCostOre') + classEffect,
      variableCostOre: sum('variableCostOre'),
      fixedCostOre: classEffect,
      costDeltaOre: pupilEffect + unitEffect + classEffect,
    },
    charts: { timeline, movement, schoolComparison, costBridge },
    sourceIds: ids,
    sources: analysis.sources,
    explanation: `${selection.year}: Lokal pladsmangel beregnes pr. skole. Ledige pladser på andre skoler udligner ikke automatisk. Filtrering ændrer ikke fordelingen af de gemte nye klasser. Historikken er årlig; der foreligger ikke månedlige flyttetal.`,
  };
}
export type MobilityDetail = ReturnType<typeof mobilityDetail>;
