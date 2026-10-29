import { currentUser, setupStatus } from '@/server/auth';
import { Login } from '@/components/login';
import { Workspace } from '@/components/workspace';
import { cookies } from 'next/headers';
import { forwardToBackend } from '@/server/gateway';
async function sessionState() {
  if (!process.env.KAIA_REMOTE_BACKEND_URL)
    return { setup: await setupStatus(), user: await currentUser(), error: undefined };
  const request = new Request(`${process.env.KAIA_APP_URL}/api/session`, {
    headers: { cookie: (await cookies()).toString() },
  });
  const response = await forwardToBackend(request);
  if (response.ok) return { ...(await response.json()), error: undefined };
  return {
    setup: {
      database: false,
      entra: false,
      encryption: false,
      localTest: false,
      callbackUrl: '',
      ready: false,
      authMode: 'demo' as const,
      demoEnabled: false,
    },
    user: null,
    error:
      'Den lokale backend kan ikke nås lige nu. Mac’en skal være tændt og online, før demoen kan åbnes.',
  };
}
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ loginError?: string }>;
}) {
  const params = await searchParams;
  const { setup, user, error } = await sessionState();
  return user ? (
    <Workspace />
  ) : (
    <Login
      setup={setup}
      error={
        params.loginError
          ? setup.authMode === 'demo'
            ? 'Demologin kunne ikke åbnes. Prøv igen.'
            : 'Microsoft-login kunne ikke afsluttes. Prøv igen eller kontakt administratoren.'
          : error
      }
    />
  );
}
