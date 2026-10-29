import { z } from 'zod';
import { parseQuestion } from '@/domain/analysis';
import { canAccessDocument, allowedEntities } from '@/domain/policy';
import type { Dataset } from '@/domain/data';
import type { AccessContext, Analysis } from '@/domain/types';
import { assumptionsSchema, areas } from './validation';
import { ApiError } from './errors';
import { planQuery } from '@/integrations';
import type { ChatTool } from './providers';
const toolInput = z
  .object({
    question: z.string().min(3).max(2000),
    area: areas,
    entityIds: z.array(z.string()).max(50),
    year: z.number().int().min(2020).max(2032),
    fromMonth: z.number().int().min(1).max(12),
    toMonth: z.number().int().min(1).max(12),
    scenario: assumptionsSchema.optional(),
  })
  .strict()
  .refine((v) => v.fromMonth <= v.toMonth);
const searchInput = z.object({ query: z.string().max(300) }).strict();
const documentInput = z.object({ documentId: z.string().max(150) }).strict();
const contextInput = z
  .object({
    sourceId: z.enum([
      'energy-price-context',
      'demography-context',
      'dst-prices',
      'dst-population',
    ]),
  })
  .strict();
const basisInput = z.object({}).strict();
export function scopedTools(user: AccessContext, dataset: Dataset, basis: Analysis) {
  let selected = basis;
  const permittedDocumentIds = new Set(
    basis.sources.flatMap((source) => (source.documentId ? [source.documentId] : [])),
  );
  const definitions: ChatTool[] = [
    {
      type: 'function',
      function: {
        name: 'get_context_series',
        description:
          'Hent markerede eksterne eller simulerede pris- og befolkningsserier med metadata. Kaldet bruger kun analysens tilladte afgrænsning og periode.',
        parameters: z.toJSONSchema(contextInput),
      },
    },
    {
      type: 'function',
      function: {
        name: 'calculate_analysis',
        description:
          'Hent budgetstatus, sammenlign tilladte enheder eller beregn et scenarie. Alle tal kommer fra serverens simulerede snapshot. Ingen rolle- eller brugerargumenter.',
        parameters: z.toJSONSchema(toolInput),
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_documents',
        description: 'Find adgangsfiltrerede simulerede dokumentuddrag med tekstsøgning.',
        parameters: z.toJSONSchema(searchInput),
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_document',
        description: 'Hent et tilladt simuleret dokument.',
        parameters: z.toJSONSchema(documentInput),
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_analysis_basis',
        description:
          'Hent det aktuelle dokumenterede beregningsgrundlag, tal, kilder og antagelser.',
        parameters: z.toJSONSchema(basisInput),
      },
    },
  ];
  return {
    definitions,
    currentAnalysis: () => selected,
    execute: async (name: string, input: unknown): Promise<unknown> => {
      if (name === 'calculate_analysis') {
        const args = toolInput.parse(input);
        const allowed = new Set(
          allowedEntities(user, dataset.entities)
            .filter((e) => e.area === args.area)
            .map((e) => e.id),
        );
        if (!user.areas.includes(args.area) || args.entityIds.some((id) => !allowed.has(id)))
          throw new ApiError(403, 'Værktøjskaldet ligger uden for dit adgangsområde.');
        const context = parseQuestion(args.question, user, dataset, basis.context, {
          area: args.area,
          entityIds: args.entityIds,
          period: { year: args.year, fromMonth: args.fromMonth, toMonth: args.toMonth },
          scenario: args.scenario,
        });
        planQuery(args.question, context, user);
        const same =
          context.area === basis.context.area &&
          context.intent === basis.context.intent &&
          JSON.stringify(context.period) === JSON.stringify(basis.context.period) &&
          JSON.stringify([...context.entityIds].sort()) ===
            JSON.stringify([...basis.context.entityIds].sort()) &&
          JSON.stringify(context.scenario || null) ===
            JSON.stringify(basis.context.scenario || null) &&
          context.metric === basis.context.metric &&
          JSON.stringify(context.comparison || null) ===
            JSON.stringify(basis.context.comparison || null) &&
          context.projectionEndYear === basis.context.projectionEndYear;
        if (!same)
          throw new ApiError(
            400,
            'Værktøjet kan kun hente denne analyses afgrænsning og metric. Stil et opfølgende spørgsmål for at ændre den.',
          );
        selected = basis;
        return selected;
      }
      if (name === 'get_context_series') {
        const { sourceId } = contextInput.parse(input);
        return (
          selected.contextSeries?.filter((series) =>
            sourceId === 'dst-prices'
              ? series.id.startsWith('dst-PRIS')
              : sourceId === 'dst-population'
                ? series.id.startsWith('dst-FOLK')
                : series.id === sourceId,
          ) || []
        );
      }
      if (name === 'search_documents') {
        const { query } = searchInput.parse(input);
        const terms = query.toLocaleLowerCase('da').split(/\s+/).filter(Boolean);
        return dataset.documents
          .filter(
            (d) => permittedDocumentIds.has(d.id) && canAccessDocument(user, d, dataset.entities),
          )
          .map((d) => ({
            d,
            score: terms.reduce(
              (s, t) => s + (d.text.toLocaleLowerCase('da').includes(t) ? 1 : 0),
              0,
            ),
          }))
          .filter((x) => !terms.length || x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map(({ d }) => ({
            id: d.id,
            title: d.title,
            period: d.period,
            status: d.status,
            text: d.text.slice(0, 2400),
          }));
      }
      if (name === 'get_document') {
        const { documentId } = documentInput.parse(input);
        const doc = dataset.documents.find((d) => d.id === documentId);
        if (
          !doc ||
          !permittedDocumentIds.has(doc.id) ||
          !canAccessDocument(user, doc, dataset.entities)
        )
          throw new ApiError(404, 'Dokumentet blev ikke fundet.');
        return doc;
      }
      if (name === 'get_analysis_basis') {
        basisInput.parse(input);
        return {
          datasetVersion: selected.datasetVersion,
          context: selected.context,
          metrics: selected.metrics,
          sources: selected.sources,
          assumptions: selected.assumptions,
          chart: selected.chart,
        };
      }
      throw new ApiError(400, 'Ukendt værktøj.');
    },
  };
}
