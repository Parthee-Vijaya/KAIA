'use client';
import { useEffect, useState } from 'react';
import type { DashboardData } from '@/domain/dashboard';
import type { AnalysisContext } from '@/domain/types';
import { api } from './settings';
import { dashboardAccessKey, type DashboardAccess } from './workspace-state';

interface DashboardResult {
  key: string;
  data?: DashboardData;
  loading: boolean;
  error: string;
}

/** Each response belongs to its exact scope and version; superseded requests are discarded. */
export function useDashboard({
  enabled,
  context,
  version,
  access,
}: {
  enabled: boolean;
  context: Pick<AnalysisContext, 'area' | 'entityIds' | 'period'>;
  version?: string;
  access?: DashboardAccess;
}) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<DashboardResult>({ key: '', loading: false, error: '' });
  const parameters = new URLSearchParams({
    area: context.area,
    year: String(context.period.year),
    fromMonth: String(context.period.fromMonth),
    toMonth: String(context.period.toMonth),
    ...(version ? { datasetVersion: version } : {}),
  });
  for (const id of [...context.entityIds].sort()) parameters.append('entityId', id);
  const query = parameters.toString();
  const accessKey = dashboardAccessKey(access);
  const key = `${accessKey}:${query}`;
  const active = enabled && Boolean(version && accessKey);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setResult({ key, loading: true, error: '' });
    const timer = setTimeout(() => {
      void api<DashboardData>(`/api/dashboard?${query}`, undefined, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setResult({ key, data, loading: false, error: '' });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              loading: false,
              error: error instanceof Error ? error.message : 'Overblikket kunne ikke hentes.',
            });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, key, query, revision]);
  return {
    data: active && result.key === key ? result.data : undefined,
    loading: active && (result.key !== key || result.loading),
    error: active && result.key === key ? result.error : '',
    reload: () => setRevision((value) => value + 1),
  };
}
