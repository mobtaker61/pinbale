export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class ProviderAuthError extends AppError {
  constructor(message = 'Provider authentication failed') {
    super(message, 'PROVIDER_AUTH_ERROR', 502);
  }
}

export class ProviderBlockedError extends AppError {
  constructor(message = 'Provider blocked by anti-bot rules') {
    super(message, 'PROVIDER_BLOCKED_ERROR', 503);
  }
}

export class ProviderTimeoutError extends AppError {
  constructor(message = 'Provider timed out') {
    super(message, 'PROVIDER_TIMEOUT_ERROR', 504);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 'RATE_LIMITED', 429);
  }
}

export class BaleDeliveryError extends AppError {
  constructor(message = 'Failed to deliver Bale message') {
    super(message, 'BALE_DELIVERY_ERROR', 502);
  }
}

export class CacheError extends AppError {
  constructor(message = 'Cache operation failed') {
    super(message, 'CACHE_ERROR', 500);
  }
}

export class InternalSearchError extends AppError {
  constructor(message = 'Internal search error') {
    super(message, 'INTERNAL_SEARCH_ERROR', 500);
  }
}
