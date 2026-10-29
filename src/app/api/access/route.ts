import { z } from 'zod';
import { requireUser, assertAdmin } from '@/server/auth';
import { sql } from '@/server/db';
import { readJson, areas } from '@/server/validation';
import { allEntities, audit } from '@/server/repository';
import { allowedEntities } from '@/domain/policy';
import { errorResponse, privateJson, ApiError } from '@/server/errors';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const user = await requireUser();
    assertAdmin(user);
    const rows =
      await sql()`SELECT u.id,u.display_name,u.title,u.roles,g.unit_ids,g.areas FROM kaia_users u LEFT JOIN kaia_grants g ON g.user_id=u.id WHERE u.tenant_id=${user.tenantId} ORDER BY u.display_name`;
    return privateJson({
      identities: rows.map((r) => ({
        userId: r.id,
        displayName: r.display_name,
        title: r.title,
        roles: r.roles,
        unitIds: r.unit_ids || [],
        areas: r.areas || [],
      })),
      entities: allowedEntities(user, await allEntities()),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAdmin(user);
    const input = await readJson(
      request,
      z
        .object({
          userId: z.string().max(200),
          unitIds: z.array(z.string().max(100)).max(100),
          areas: z.array(areas).max(7),
        })
        .strict(),
    );
    const [existing] =
      await sql()`SELECT id FROM kaia_users WHERE id=${input.userId} AND tenant_id=${user.tenantId}`;
    if (!existing) throw new ApiError(404, 'Identiteten blev ikke fundet i organisationen.');
    const allowed = allowedEntities(user, await allEntities());
    if (
      input.areas.some((a) => !user.areas.includes(a)) ||
      input.unitIds.some((id) => !allowed.some((e) => e.id === id && input.areas.includes(e.area)))
    )
      throw new ApiError(403, 'Du kan kun tildele adgang inden for dit eget scope.');
    await sql()`INSERT INTO kaia_grants(user_id,unit_ids,areas) VALUES(${input.userId},${sql().json(input.unitIds)},${sql().json(input.areas)}) ON CONFLICT(user_id) DO UPDATE SET unit_ids=excluded.unit_ids,areas=excluded.areas`;
    await audit(user, 'scope.updated', input.userId);
    return privateJson({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
