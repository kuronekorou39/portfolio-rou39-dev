export function ok(body: unknown) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function created(body: unknown) {
  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function badRequest(message: string) {
  return {
    statusCode: 400,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

export function notFound(message = 'Not found') {
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

export function forbidden(message = 'Forbidden') {
  return {
    statusCode: 403,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

export function conflict(message = 'Conflict', extra?: Record<string, unknown>) {
  return {
    statusCode: 409,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message, ...extra }),
  };
}

export function payloadTooLarge(message = 'Payload too large') {
  return {
    statusCode: 413,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

export function tooManyRequests(message = 'Too many requests') {
  return {
    statusCode: 429,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

export function serverError(message = 'Internal server error') {
  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}
