import { z } from 'zod';

/** Only reviewed tables; an untrusted question cannot choose an arbitrary URL or API operation. */
export const STATBANK_TABLES = ['PRIS01', 'FOLK1A', 'BEV107'] as const;
const tableSchema = z.enum(STATBANK_TABLES);
const variableSchema = z.object({
  id: z.string(),
  text: z.string(),
  time: z.boolean().optional(),
  values: z.array(z.object({ id: z.string(), text: z.string() })),
});
const metadataSchema = z.object({
  id: tableSchema,
  text: z.string(),
  description: z.string(),
  unit: z.string(),
  updated: z.string(),
  active: z.boolean().optional(),
  variables: z.array(variableSchema),
  documentation: z.object({ url: z.url() }).optional(),
  footnote: z
    .union([z.string(), z.object({ text: z.string(), mandatory: z.boolean().optional() })])
    .nullable()
    .optional(),
});
export type StatbankMetadata = z.infer<typeof metadataSchema>;
export interface StatbankSelection {
  code: string;
  values: string[];
}
export interface StatbankExtract {
  metadata: StatbankMetadata;
  request: { table: (typeof STATBANK_TABLES)[number]; variables: StatbankSelection[] };
  rawCsv: string;
  rows: Array<Record<string, string>>;
  retrievedAt: string;
  status: 'public-api-extract';
  sourceUrl: string;
}

export function validateStatbankSelection(
  metadata: StatbankMetadata,
  selections: StatbankSelection[],
) {
  if (metadata.active === false)
    throw new Error('Tabellen er inaktiv. Vælg en aktuel, metadata-verificeret tabel.');
  if (
    selections.length !== metadata.variables.length ||
    new Set(selections.map((selection) => selection.code.toUpperCase())).size !== selections.length
  )
    throw new Error('Vælg præcis én eksplicit afgrænsning for hver variabel.');
  let cells = 1;
  for (const variable of metadata.variables) {
    const selected = selections.find(
      (item) => item.code.toUpperCase() === variable.id.toUpperCase(),
    );
    if (
      !selected ||
      selected.values.length === 0 ||
      selected.values.length > 200 ||
      new Set(selected.values).size !== selected.values.length ||
      selected.values.some((value) => !variable.values.some((item) => item.id === value))
    )
      throw new Error(
        `Ugyldigt metadata-valg for ${variable.id}. Jokertegn og gættede koder accepteres ikke.`,
      );
    cells *= selected.values.length;
  }
  if (cells > 10_000)
    throw new Error('Udtrækket er for stort. Afgræns til højst 10.000 observationer.');
  return selections.map((selection) => ({
    code: metadata.variables.find(
      (variable) => variable.id.toUpperCase() === selection.code.toUpperCase(),
    )!.id,
    values: [...selection.values],
  }));
}

export function parseStatbankCsv(csv: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && char === ';') {
      record.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      record.push(cell);
      if (record.some((value) => value.length)) records.push(record);
      record = [];
      cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('Uafsluttet citeret felt i kildeudtrækket.');
  if (cell || record.length) {
    record.push(cell);
    records.push(record);
  }
  const headers = records.shift();
  if (!headers || !headers.includes('INDHOLD') || new Set(headers).size !== headers.length)
    throw new Error('Statistikbankens CSV mangler et gyldigt observationsfelt.');
  return records.map((values) => {
    if (values.length !== headers.length)
      throw new Error('Udtrækket indeholder en ufuldstændig række.');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}
export function statbankNumber(value: string): number | null {
  if (/^(\.\.|\.|-|)$/u.test(value.trim())) return null;
  if (!/^-?\d+(,\d+)?$/.test(value))
    throw new Error('Ukendt talformat i Statistikbankens observation.');
  return Number(value.replace(',', '.'));
}

export class StatbankClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  private async post(functionName: 'tableinfo' | 'data', payload: Record<string, unknown>) {
    const response = await this.fetcher(`https://api.statbank.dk/v1/${functionName}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, lang: 'da' }),
    });
    if (!response.ok) throw new Error(`Statistikbanken svarede med HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 4_000_000) throw new Error('Statistikbankens svar er for stort.');
    return text;
  }
  async metadata(table: string): Promise<StatbankMetadata> {
    const id = tableSchema.parse(table.toUpperCase());
    // Parsing strips contacts and other personal metadata; no employee records are retained.
    const metadata = metadataSchema.parse(
      JSON.parse(await this.post('tableinfo', { table: id, format: 'JSON' })),
    );
    if (metadata.id !== id) throw new Error('Metadata matcher ikke den valgte tabel.');
    return metadata;
  }
  async extract(table: string, selections: StatbankSelection[]): Promise<StatbankExtract> {
    const metadata = await this.metadata(table);
    const variables = validateStatbankSelection(metadata, selections);
    const rawCsv = await this.post('data', {
      table: metadata.id,
      format: 'CSV',
      valuePresentation: 'Code',
      timeOrder: 'Ascending',
      variables,
    });
    const rows = parseStatbankCsv(rawCsv);
    if (rows.length === 0) throw new Error('Kilden returnerede ingen observationer.');
    for (const row of rows) {
      for (const selection of variables)
        if (!selection.values.includes(row[selection.code.toUpperCase()]))
          throw new Error('Udtrækket indeholder en observation uden for valget.');
      statbankNumber(row.INDHOLD);
    }
    return {
      metadata,
      request: { table: metadata.id, variables },
      rawCsv,
      rows,
      retrievedAt: new Date().toISOString(),
      status: 'public-api-extract',
      sourceUrl: `https://www.statistikbanken.dk/${metadata.id}`,
    };
  }
}
