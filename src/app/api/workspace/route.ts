import { requireUser, setupStatus } from '@/server/auth';
import { errorResponse, privateJson } from '@/server/errors';
import { datasetMetadata, allEntities, lists } from '@/server/repository';
import { publicEntity } from '@/domain/public-entity';
import { allowedEntities } from '@/domain/policy';
import { suggestions } from '@/domain/analysis';
import { providersForUser } from '@/server/live-access';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const user = await requireUser();
    const [dataset, entities, saved, providers] = await Promise.all([
      datasetMetadata(),
      allEntities(),
      lists(user),
      providersForUser(user),
    ]);
    const { seed: _, demography: __, ...metadata } = dataset;
    void _;
    void __;
    return privateJson({
      user,
      entities: allowedEntities(user, entities).map(publicEntity),
      suggestions: suggestions(user),
      ...saved,
      providers: user.roles.includes('KAIA.Admin')
        ? providers
        : providers.map(({ id, model, configured, active, status }) => ({
            id,
            model,
            configured,
            active,
            status,
          })),
      dataset: metadata,
      setup: await setupStatus(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
