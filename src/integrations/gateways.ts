import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { z } from 'zod';
import type { AccessContext } from '../domain/types';
import { authorizeSource } from './policy';
import type { IntegrationAudit, SourceRequest } from './types';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
const mcpInput = z
  .object({
    sourceId: z.enum([
      'demo-ledger',
      'demo-documents',
      'energy-price-context',
      'demography-context',
    ]),
    year: z.number().int().min(2020).max(2032),
  })
  .strict();
const mcpWireInput = mcpInput
  .extend({
    access: z
      .object({
        subject: z.string(),
        area: z.string(),
        unitIds: z.array(z.string()).max(200),
        operation: z.literal('read'),
      })
      .strict(),
  })
  .strict();
const mcpOutput = z
  .object({
    sourceId: z.string(),
    year: z.number().int(),
    status: z.literal('simulated'),
    entityIds: z.array(z.string()).max(200),
    description: z.string().max(4000),
  })
  .strict();
const cliInput = z
  .object({
    sourceId: z.enum(['demo-ledger', 'demo-documents']),
    datasetVersion: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/),
  })
  .strict();
const cliOutput = z
  .object({
    jobId: z.string().max(180),
    status: z.literal('completed'),
    result: z
      .object({
        sourceId: z.string(),
        datasetVersion: z.string(),
        rowCount: z.number().int().nonnegative(),
        dataStatus: z.literal('simulated'),
      })
      .strict(),
  })
  .strict();
export const MCP_TOOL_SCHEMAS = [
  {
    name: 'catalog_lookup',
    description:
      'Læs metadata for en kilde; access injiceres af gatewayen fra den validerede session.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.toJSONSchema(mcpWireInput),
  },
] as const;
export const CLI_COMMANDS = {
  snapshot_status: {
    description: 'Læs status for en indlæst demokildeversion.',
    arguments: z.toJSONSchema(cliInput),
    readOnly: true,
  },
} as const;
export interface GatewayConfig {
  url: string;
  allowedHost: string;
  token: string;
  timeoutMs?: number;
}
type AuditSink = (event: IntegrationAudit) => void;
type Fetcher = typeof fetch;

export function isPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(normalized) === 4) {
    const [a, b, c] = normalized.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(normalized) === 6) {
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7);
      if (mapped.includes('.')) return isPublicAddress(mapped);
      const parts = mapped.split(':');
      if (parts.length !== 2 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return false;
      const high = Number.parseInt(parts[0], 16),
        low = Number.parseInt(parts[1], 16);
      return isPublicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return /^[23]/.test(normalized) && !/^2001:(db8|0|1[0-9a-f]):/.test(normalized);
  }
  return false;
}
export function validateGatewayUrl(config: GatewayConfig): URL {
  const url = new URL(config.url);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.port && url.port !== '443') ||
    host !== config.allowedHost.toLowerCase() ||
    !config.token ||
    config.token.length > 10000 ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    (isIP(host) && !isPublicAddress(host))
  )
    throw new Error(
      'Integrationen kræver et godkendt offentligt HTTPS-endpoint og en serverbaseret credential.',
    );
  return url;
}
async function assertPublicDns(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new Error('Interne netværksadresser er ikke tilladt.');
    return;
  }
  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => !isPublicAddress(record.address)))
    throw new Error('Endpointet peger på en intern eller reserveret netværksadresse.');
}
async function responseJson(response: Response) {
  if (!response.ok) throw new Error(`Integrationen svarede med HTTP ${response.status}.`);
  if (Number(response.headers.get('content-length') || 0) > 2_000_000)
    throw new Error('Integrationssvaret er for stort.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Integrationen returnerede et tomt svar.');
  const decoder = new TextDecoder();
  let text = '',
    bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 2_000_000) {
      await reader.cancel();
      throw new Error('Integrationssvaret er for stort.');
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const messages = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5).trim()) as unknown);
    const result = messages.find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        'id' in message &&
        ('result' in message || 'error' in message),
    );
    if (!result) throw new Error('MCP-streamen indeholdt ikke et gyldigt svar.');
    return result;
  }
  return JSON.parse(text) as unknown;
}
const rpcResponse = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number(), z.string()]),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});
const toolsList = z.object({
  tools: z
    .array(
      z.object({
        name: z.string(),
        annotations: z.object({ readOnlyHint: z.boolean().optional() }).optional(),
      }),
    )
    .max(100),
});
const toolResult = z.object({
  isError: z.boolean().optional(),
  structuredContent: z.unknown().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
});
function rpcResult(payload: unknown, id: number): unknown {
  const result = rpcResponse.parse(payload);
  if (result.id !== id || result.error)
    throw new Error('MCP-serveren returnerede en fejl eller forkert request-ID.');
  return result.result;
}

/** Server-only, fixed read tool. No prompt-supplied URL, SQL, shell or role is accepted. */
export class McpGateway {
  constructor(
    private readonly config?: GatewayConfig,
    private readonly audit: AuditSink = () => {},
    private readonly fetcher: Fetcher = fetch,
    private readonly resolveDns = assertPublicDns,
  ) {}
  async catalogLookup(input: unknown, access: AccessContext, request: SourceRequest) {
    const started = Date.now();
    let outcome: IntegrationAudit['outcome'] = 'error';
    try {
      const args = mcpInput.parse(input);
      if (
        request.sourceId !== 'mcp-fixture' ||
        request.operation !== 'tool' ||
        args.year !== request.period.year
      )
        throw new Error('MCP-kaldet matcher ikke analyseplanen.');
      try {
        authorizeSource(access, request);
        authorizeSource(access, {
          ...request,
          sourceId: args.sourceId,
          operation:
            args.sourceId === 'demo-ledger'
              ? 'aggregate'
              : args.sourceId === 'demo-documents'
                ? 'document'
                : 'series',
        });
      } catch (error) {
        outcome = 'denied';
        throw error;
      }
      if (!this.config) {
        outcome = 'ok';
        return {
          sourceId: args.sourceId,
          year: args.year,
          status: 'simulated' as const,
          entityIds: [...request.unitIds],
          description:
            'MCP-kontraktfixture: syntetiske metadata. Intet eksternt kommunalt system er tilsluttet.',
        };
      }
      const url = validateGatewayUrl(this.config);
      await this.resolveDns(url);
      const signal = AbortSignal.timeout(Math.min(this.config.timeoutMs || 10_000, 30_000));
      let sessionId: string | undefined;
      const send = async (body: unknown, expectsResponse = true) => {
        const response = await this.fetcher(url, {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            authorization: `Bearer ${this.config!.token}`,
            'mcp-protocol-version': MCP_PROTOCOL_VERSION,
            ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
          },
          body: JSON.stringify(body),
        });
        sessionId = response.headers.get('mcp-session-id') || sessionId;
        if (!response.ok) throw new Error(`MCP-forbindelsen svarede med HTTP ${response.status}.`);
        return expectsResponse ? responseJson(response) : undefined;
      };
      const init = z
        .object({
          protocolVersion: z.string(),
          capabilities: z.object({ tools: z.unknown().optional() }),
        })
        .parse(
          rpcResult(
            await send({
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: 'KAIA', version: '0.1.0' },
              },
            }),
            1,
          ),
        );
      if (init.protocolVersion !== MCP_PROTOCOL_VERSION || !('tools' in init.capabilities))
        throw new Error(
          'MCP-serverens protokolversion eller værktøjskapabilitet understøttes ikke.',
        );
      await send({ jsonrpc: '2.0', method: 'notifications/initialized' }, false);
      const tools = toolsList.parse(
        rpcResult(await send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }), 2),
      );
      if (
        !tools.tools.some(
          (tool) => tool.name === 'catalog_lookup' && tool.annotations?.readOnlyHint === true,
        )
      )
        throw new Error('Det godkendte læseværktøj er ikke tilgængeligt.');
      const result = toolResult.parse(
        rpcResult(
          await send({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
              name: 'catalog_lookup',
              arguments: {
                ...args,
                access: {
                  subject: createHash('sha256').update(access.userId).digest('hex'),
                  area: request.area,
                  unitIds: request.unitIds,
                  operation: 'read',
                },
              },
            },
          }),
          3,
        ),
      );
      if (result.isError) throw new Error('MCP-værktøjet kunne ikke gennemføre forespørgslen.');
      const raw =
        result.structuredContent ??
        JSON.parse(result.content?.find((item) => item.type === 'text')?.text || 'null');
      const output = mcpOutput.parse(raw);
      if (
        output.sourceId !== args.sourceId ||
        output.year !== args.year ||
        output.entityIds.some((id) => !request.unitIds.includes(id))
      )
        throw new Error('MCP-resultatet overskrider den godkendte afgrænsning.');
      outcome = 'ok';
      return output;
    } finally {
      this.audit({
        event: 'integration.call',
        userId: access.userId,
        sourceId: request.sourceId,
        operation: 'catalog_lookup',
        outcome,
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/** A remote runner hosts any real CLI. This Vercel module never spawns a process. */
export class CliRunnerGateway {
  constructor(
    private readonly config?: GatewayConfig,
    private readonly audit: AuditSink = () => {},
    private readonly fetcher: Fetcher = fetch,
    private readonly resolveDns = assertPublicDns,
  ) {}
  async snapshotStatus(
    commandId: string,
    input: unknown,
    access: AccessContext,
    request: SourceRequest,
  ) {
    const started = Date.now();
    let outcome: IntegrationAudit['outcome'] = 'error';
    try {
      if (commandId !== 'snapshot_status') throw new Error('Kommandoen er ikke tilladt.');
      const args = cliInput.parse(input);
      if (request.sourceId !== 'cli-fixture' || request.operation !== 'tool')
        throw new Error('Runner-kaldet matcher ikke analyseplanen.');
      try {
        authorizeSource(access, request);
        authorizeSource(access, {
          ...request,
          sourceId: args.sourceId,
          operation: args.sourceId === 'demo-ledger' ? 'aggregate' : 'document',
        });
      } catch (error) {
        outcome = 'denied';
        throw error;
      }
      if (!this.config) {
        outcome = 'ok';
        return {
          jobId: `fixture-${args.datasetVersion}`,
          status: 'completed' as const,
          result: { ...args, rowCount: 0, dataStatus: 'simulated' as const },
          fixture: true,
        };
      }
      const url = validateGatewayUrl(this.config);
      await this.resolveDns(url);
      const response = await this.fetcher(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(Math.min(this.config.timeoutMs || 10_000, 30_000)),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({
          commandId,
          arguments: args,
          access: { area: request.area, unitIds: request.unitIds, operation: 'read' },
        }),
      });
      const output = cliOutput.parse(await responseJson(response));
      if (
        output.result.sourceId !== args.sourceId ||
        output.result.datasetVersion !== args.datasetVersion
      )
        throw new Error('Runner-resultatet matcher ikke den valgte kildeversion.');
      outcome = 'ok';
      return { ...output, fixture: false };
    } finally {
      this.audit({
        event: 'integration.call',
        userId: access.userId,
        sourceId: request.sourceId,
        operation: commandId,
        outcome,
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
