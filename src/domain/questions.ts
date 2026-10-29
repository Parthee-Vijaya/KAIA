import type { AccessContext, Area, InsightSuggestion, ScenarioAssumptions } from './types';
import { DEFAULT_SCENARIO } from './types';
export const demonstrationQuestions = [
  'Giv mig et overblik over budgetstatus på skoleområdet.',
  'Hvilke skoler har de største simulerede afvigelser i år?',
  'Sammenlign Skolen på Herredsåsen, Høng Skole og Svebølle Skole.',
  'Vis udviklingen i udgift pr. elev fra 2023 til 2026.',
  'Hvordan ser årsprognosen ud i forhold til det vedtagne demobudget?',
  'Hvilke typer udgifter bidrager mest til afvigelsen?',
  'Sammenlign energiudgifterne på de kommunale bygninger.',
  'Hvad sker der, hvis energiprisen stiger 15 procent resten af året?',
  'Hvad sker der, hvis vikarforbruget falder 10 procent på skoleområdet?',
  'Vis baseline og scenarie i samme graf.',
  'Hvilke simulerede politiske beslutninger er relevante for skoleområdets budget?',
  'Find den simulerede strategi, som opfølgningen henviser til.',
  'Lav en kort opsummering til et udvalg med tal og kildehenvisninger.',
  'Vis samme analyse for 2025.',
  'Sammenlign de relevante kultur- og idrætsfaciliteter.',
  'Gem analysen som en indsigt og åbn den igen.',
  'Gem et scenarie, ændr en forudsætning og nulstil det.',
  'Forklar beregningen bag udgift pr. elev.',
  'Hvor mange borgere fik en individuel social bevilling i går?',
  'Vis budgetstatus på socialområdet.',
  'Forklar energiudgifternes ændring med pris, mængde og samspil.',
  'Hvordan påvirker ændret demografi de variable skoleudgifter?',
  'Sammenlign op mod sidste års data.',
  'Sammenlign skoleområdet med en sammenlignelig kommune.',
  'Sammenlign udgift pr. elev med Holbæk Kommune.',
  'Hvorfor er den kommune sammenlignelig?',
  'Vis prognosen frem mod 2030.',
  'Fremskriv skoleområdets udgifter til 2032.',
  'Vis prognosen for udgift pr. elev frem til 2030.',
  'Vis udviklingen i budget og regnskab fra 2020 til 2026.',
];
export interface PreparedScenario {
  id: string;
  title: string;
  description: string;
  area: Area;
  question: string;
  assumptions: ScenarioAssumptions;
}
const scenario = (
  id: string,
  title: string,
  description: string,
  area: Area,
  question: string,
  changes: Partial<ScenarioAssumptions>,
): PreparedScenario => ({
  id,
  title,
  description,
  area,
  question,
  assumptions: { ...DEFAULT_SCENARIO, ...changes },
});
export const preparedScenarios: PreparedScenario[] = [
  scenario(
    'energy-15',
    'Energi +15 %',
    'Resten af 2026 · energiposter',
    'facilities',
    'Hvad hvis energiprisen stiger 15 procent resten af året på faciliteterne?',
    { energyPercent: 15 },
  ),
  scenario(
    'energy-saving',
    'Energi −10 %',
    'Helårsvirkning på energi',
    'facilities',
    'Hvad hvis energiprisen falder 10 procent på faciliteterne hele året?',
    { energyPercent: -10, horizon: 'annual' },
  ),
  scenario(
    'salary-3',
    'Løn +3 %',
    'Skoleområdet · helårsvirkning',
    'schools',
    'Hvad hvis lønomkostningerne stiger 3 procent på skoleområdet hele året?',
    { salaryPercent: 3, horizon: 'annual' },
  ),
  scenario(
    'substitute-10',
    'Vikarer −10 %',
    'Kun vikarudgifter · resten af året',
    'schools',
    'Hvad hvis vikarforbruget falder 10 procent på skoleområdet?',
    { substitutePercent: -10 },
  ),
  scenario(
    'pupils-5',
    'Elevtal −5 %',
    '28 % af aktivitetsudgifterne varierer',
    'schools',
    'Hvad hvis elevtallet falder 5 procent på skoleområdet?',
    { pupilsPercent: -5 },
  ),
  scenario(
    'budget-2',
    'Budgettilpasning −2 %',
    'Budgetrammen ændres; forbruget fastholdes',
    'schools',
    'Hvad hvis demobudgettet reduceres 2 procent på skoleområdet?',
    { budgetPercent: -2 },
  ),
  scenario(
    'maintenance-20',
    'Vedligehold +20 %',
    'Planlagt vedligehold · helår',
    'facilities',
    'Hvad hvis vedligehold stiger 20 procent på faciliteterne hele året?',
    { maintenancePercent: 20, horizon: 'annual' },
  ),
  scenario(
    'combined',
    'Energi og vikarer',
    'To adskilte kontokategorier',
    'schools',
    'Hvad hvis energi stiger 15 procent og vikarforbruget falder 10 procent på skoleområdet?',
    { energyPercent: 15, substitutePercent: -10 },
  ),
];
export function suggestions(access: AccessContext): InsightSuggestion[] {
  const area = access.areas.includes('schools') ? 'schools' : access.areas[0];
  const label: Record<string, string> = {
    schools: 'skoleområdet',
    facilities: 'kultur- og idrætsfaciliteterne',
    social: 'socialområdet',
    health: 'ældre- og sundhedsområdet',
    environment: 'teknik- og miljøområdet',
    administration: 'administrationen',
    preparedness: 'beredskabsområdet',
  };
  const scope = label[area] || 'dit område';
  const council =
    access.roles.includes('KAIA.Council') && !access.roles.some((r) => r !== 'KAIA.Council');
  return [
    {
      title: 'Hvordan ligger budgettet?',
      description: `Se forbrug og prognose for ${scope}.`,
      question: `Giv mig et overblik over budgetstatus på ${scope}.`,
      icon: 'budget',
    },
    council
      ? {
          title: 'Hvad driver afvigelsen?',
          description: 'Undersøg de samlede udgiftstyper.',
          question: `Hvilke typer udgifter bidrager mest til afvigelsen på ${scope}?`,
          icon: 'compare',
        }
      : {
          title: area === 'schools' ? 'Sammenlign udgift pr. elev' : 'Hvor er afvigelserne?',
          description:
            area === 'schools'
              ? 'Se forskelle mellem de tilladte skoler.'
              : 'Sammenlign enheder i dit adgangsområde.',
          question:
            area === 'schools'
              ? 'Sammenlign udgift pr. elev på skolerne.'
              : `Sammenlign enhedernes budgetafvigelser på ${scope}.`,
          icon: 'compare',
        },
    {
      title: 'Hvis energiprisen stiger?',
      description: 'Beregn +15 % i resten af året.',
      question: `Hvad hvis energiprisen stiger 15 procent resten af året på ${scope}?`,
      icon: 'energy',
    },
    {
      title: 'Hvad ligger bag tallene?',
      description: 'Find simulerede beslutninger og strategier.',
      question: `Hvilke simulerede politiske beslutninger er relevante for ${scope}?`,
      icon: 'document',
    },
  ];
}
