import type { SourceRef } from '@/domain/types';

/** Keep model assumptions distinct from evidence retrieved from the dataset. */
export function sourceLabel(source: SourceRef): string {
  if (source.origin === 'assumption') return 'Foreslåede antagelser';
  if (source.origin === 'calculation') return 'Beregning fra antagelser';
  if (source.type === 'name') return 'Officiel navnekilde';
  if (source.type === 'context')
    return source.status === 'simulated' ? 'Kontekstserie' : 'Offentlig kontekst';
  return 'Beregningskilde';
}
