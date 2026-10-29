import type { MobilityCase, MobilityAssumptions } from './mobility';
import type { AnalysisTrace } from './trace';
export type Role =
  'KAIA.Admin' | 'KAIA.Executive' | 'KAIA.Finance' | 'KAIA.DepartmentHead' | 'KAIA.Council';
export type Area =
  | 'schools'
  | 'facilities'
  | 'social'
  | 'health'
  | 'environment'
  | 'administration'
  | 'preparedness';
export interface AccessContext {
  userId: string;
  tenantId: string;
  objectId: string;
  roles: Role[];
  unitIds: string[];
  areas: Area[];
  displayName: string;
  title: string;
}
export interface Entity {
  id: string;
  name: string;
  aliases: string[];
  type: 'school' | 'facility' | 'committee' | 'organisation';
  area: Area;
  nameSourceUrl: string;
  verifiedAt: string;
  synthetic: { pupils?: number; annualBudgetOre: number };
}
export type PublicEntity = Omit<Entity, 'synthetic'>;
export type Category = 'salary' | 'energy' | 'substitute' | 'maintenance' | 'activity' | 'income';
export interface LedgerRow {
  id: string;
  datasetVersion: string;
  entityId: string;
  year: number;
  month: number;
  category: Category;
  kind: 'budget' | 'actual' | 'forecast';
  amountOre: number;
  quantity?: number;
  unitPriceOre?: number;
}
export interface DemoDocument {
  id: string;
  title: string;
  date: string;
  period: string;
  type: 'budget' | 'followup' | 'strategy' | 'decision' | 'note';
  status: 'simulated';
  classification: 'internal' | 'political';
  entityIds: string[];
  area: Area;
  text: string;
  relatedDocumentIds: string[];
  factRefs: string[];
  datasetVersion: string;
}
export interface ContextSeries {
  id: string;
  title: string;
  status: 'simulated' | 'verified-public-snapshot' | 'public-api-extract';
  sourceUrl: string;
  unit: string;
  geography: string;
  frequency: 'month' | 'quarter' | 'year';
  observedAt: string;
  retrievedAt: string;
  datasetVersion: string;
  observations: Array<{ period: string; value: number }>;
  assumptions: string[];
}
export interface SourceRef {
  id: string;
  title: string;
  type: 'demo' | 'name' | 'context';
  documentId?: string;
  url?: string;
  excerpt: string;
  period: string;
  datasetVersion: string;
  rowIds?: string[];
  status?: 'simulated' | 'verified-public-snapshot' | 'public-api-extract' | 'official-name';
  observedAt?: string;
  retrievedAt?: string;
  geography?: string;
  unit?: string;
  origin?: 'assumption' | 'calculation';
}
export interface Period {
  year: number;
  fromMonth: number;
  toMonth: number;
}
export interface AnalysisContext {
  period: Period;
  entityIds: string[];
  area: Area;
  intent?: string;
  scenario?: ScenarioAssumptions;
  metric?: 'net' | 'energy' | 'perPupil' | 'perCapita';
  comparison?: { kind: 'year' | 'municipality'; year?: number; municipalityId?: string };
  projectionEndYear?: number;
  mobilityAssumptions?: MobilityAssumptions;
}
export interface Metric {
  label: string;
  value: number;
  unit: 'ore' | 'percent' | 'number';
  description?: string;
  sourceIds: string[];
  displayUnit?: string;
}
export interface ChartRow {
  label: string;
  [key: string]: string | number | null;
}
export interface ChartSpec {
  type: 'line' | 'bar' | 'stacked' | 'waterfall' | 'heatmap' | 'scenario' | 'flow';
  title: string;
  subtitle: string;
  unit: 'ore' | 'percent' | 'number';
  rows: ChartRow[];
  series: { key: string; label: string; color: string; dashed?: boolean }[];
  sourceIds: string[];
  displayUnit?: string;
  highlightLabel?: string;
}
export interface IllustrationFactor {
  label: string;
  valueMilli: number;
}
export interface IllustrationTerm {
  label: string;
  kind: 'upfrontCost' | 'annualCost' | 'annualBenefit';
  quantityFactors: IllustrationFactor[];
  divisor: 1 | 60 | 1000;
  unitValueOre: number;
  quantityUnit?: 'timer' | 'minutter' | 'besøg' | 'elever' | 'borgere' | 'km' | 'enheder';
  /** Zero is the safe default: capacity value is not automatically cash savings. */
  cashRealizationBps?: number;
}
export type IllustrationSpec =
  | {
      kind: 'investment';
      title: string;
      years: number;
      terms: IllustrationTerm[];
      assumptions: string[];
    }
  | {
      kind: 'activity';
      title: string;
      years: number;
      initialQuantityMilli: number;
      annualChangeBps: number;
      unit: 'timer' | 'minutter' | 'besøg' | 'elever' | 'borgere' | 'km' | 'enheder';
      assumptions: string[];
    }
  | {
      kind: 'process';
      title: string;
      steps: { label: string; description: string }[];
      assumptions: string[];
    };
export type IllustrationCalculation =
  | {
      kind: 'investment';
      upfrontCostOre: number;
      annualCostOre: number;
      annualBenefitValueOre: number;
      annualCashBenefitOre: number;
      annualCapacityValueOre: number;
      breakEvenYear: number | null;
      terms: {
        label: string;
        kind: IllustrationTerm['kind'];
        quantityNumerator: string;
        quantityDenominator: string;
        quantityMilli: number;
        quantityUnit?: IllustrationTerm['quantityUnit'];
        amountOre: number;
        cashAmountOre: number;
        capacityAmountOre: number;
      }[];
    }
  | { kind: 'activity'; points: { year: number; quantityMilli: number }[] }
  | { kind: 'process'; stepCount: number };
export interface ScenarioAssumptions {
  energyPercent: number;
  salaryPercent: number;
  substitutePercent: number;
  pupilsPercent: number;
  budgetPercent: number;
  maintenancePercent: number;
  horizon: 'remaining' | 'annual';
}
export interface Analysis {
  analysisId: string;
  conversationId?: string;
  datasetVersion: string;
  question: string;
  renderedText?: string;
  formulation?: { provider: ProviderId; model: string };
  title: string;
  conclusion: string;
  narrative: string[];
  metrics: Metric[];
  sources: SourceRef[];
  chart?: ChartSpec;
  context: AnalysisContext;
  contextSeries?: ContextSeries[];
  assumptions: string[];
  followups: string[];
  missingData?: string;
  mobility?: MobilityCase;
  trace?: AnalysisTrace;
  basisKind?: 'dataset' | 'illustration';
  illustration?: { version: 1; spec: IllustrationSpec; calculation: IllustrationCalculation };
  scenario?: {
    assumptions: ScenarioAssumptions;
    baselineOre: number;
    scenarioOre: number;
    deltaOre: number;
  };
}
export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  analyses: Analysis[];
}
export interface SavedInsight {
  id: string;
  title: string;
  createdAt: string;
  analysis: Analysis;
}
export interface SavedScenario {
  id: string;
  title: string;
  createdAt: string;
  context: AnalysisContext;
  assumptions: ScenarioAssumptions;
  analysis: Analysis;
}
export interface InsightSuggestion {
  title: string;
  description: string;
  question: string;
  icon: 'budget' | 'compare' | 'energy' | 'document';
}
export type ProviderId = 'demo' | 'openai' | 'azure' | 'mistral' | 'corti';
export type CortiRegion = 'eu' | 'us' | 'fr';
export interface ProviderPublic {
  id: ProviderId;
  model: string;
  configured: boolean;
  active: boolean;
  endpoint?: string;
  region?: CortiRegion;
  authMode?: 'apiKey' | 'oauth';
  tenant?: string;
  temperature?: number;
  maxTokens?: number;
  status: string;
}
export const DEFAULT_SCENARIO: ScenarioAssumptions = {
  energyPercent: 0,
  salaryPercent: 0,
  substitutePercent: 0,
  pupilsPercent: 0,
  budgetPercent: 0,
  maintenancePercent: 0,
  horizon: 'remaining',
};
