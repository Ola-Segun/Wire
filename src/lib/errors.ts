/**
 * Custom error classes for different failure scenarios.
 * Each error carries a code, HTTP status, and optional metadata.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Not authenticated") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      `${resource} not found${id ? `: ${id}` : ""}`,
      "NOT_FOUND",
      404,
      { resource, id }
    );
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fields?: Record<string, string>) {
    super(message, "VALIDATION_ERROR", 400, { fields });
    this.name = "ValidationError";
  }
}

export class PlatformConnectionError extends AppError {
  constructor(platform: string, message: string) {
    super(
      `${platform}: ${message}`,
      "PLATFORM_ERROR",
      502,
      { platform }
    );
    this.name = "PlatformConnectionError";
  }
}

export class AIServiceError extends AppError {
  constructor(service: string, message: string) {
    super(
      `AI service ${service}: ${message}`,
      "AI_SERVICE_ERROR",
      503,
      { service }
    );
    this.name = "AIServiceError";
  }
}

export class RateLimitError extends AppError {
  constructor(service: string, retryAfter?: number) {
    super(
      `Rate limit exceeded for ${service}`,
      "RATE_LIMIT_EXCEEDED",
      429,
      { service, retryAfter }
    );
    this.name = "RateLimitError";
  }
}
