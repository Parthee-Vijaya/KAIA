import { NextResponse, type NextRequest } from 'next/server';
import { forwardToBackend, gatewayBody, gatewayError, verifyGateway } from '@/server/gateway';

export async function proxy(request: NextRequest) {
  if (process.env.KAIA_REQUIRE_GATEWAY === '1') {
    try {
      if (!verifyGateway(request, await gatewayBody(request)))
        return gatewayError('Ingen adgang til backendforbindelsen.', 401);
    } catch {
      return gatewayError('Ugyldig backendforespørgsel.', 400);
    }
  }
  if (process.env.KAIA_REMOTE_BACKEND_URL && /^\/(api|auth)\//.test(request.nextUrl.pathname))
    return forwardToBackend(request);
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
