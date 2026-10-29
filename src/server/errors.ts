export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ACCESS_DENIED' || error.code === 'INTEGRATION_ACCESS_DENIED')
  )
    return Response.json(
      { error: error.message },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  if (error instanceof ApiError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { 'Cache-Control': 'private, no-store' } },
    );
  console.error(
    JSON.stringify({
      event: 'kaia_request_failed',
      kind: error instanceof Error ? error.name : 'unknown',
    }),
  );
  return Response.json(
    { error: 'Handlingen kunne ikke gennemføres. Kontrollér opsætning og prøv igen.' },
    { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
export function privateJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
