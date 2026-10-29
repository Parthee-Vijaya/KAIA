import { requireUser } from '@/server/auth';
import { ownedAnalysis } from '@/server/repository';
import { analysisCsv } from '@/server/export';
import { errorResponse, ApiError } from '@/server/errors';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const id = url.searchParams.get('analysisId');
    if (!id) throw new ApiError(400, 'Analysen mangler.');
    const a = await ownedAnalysis(user, id);
    const format = url.searchParams.get('format') || 'json';
    if (format !== 'csv' && format !== 'json') throw new ApiError(400, 'Vælg CSV eller JSON.');
    const text =
      format === 'json'
        ? JSON.stringify({ status: 'Simulerede data', ...a }, null, 2)
        : analysisCsv(a);
    return new Response(text, {
      headers: {
        'Content-Type':
          format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="KAIA-DEMO-${a.analysisId}.${format}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
