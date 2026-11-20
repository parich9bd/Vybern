import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorPayload(error: unknown): { statusCode: number; body: object } {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.flatten() } },
    };
  }
  if (error instanceof AppError) {
    return { statusCode: error.statusCode, body: { error: { code: error.code, message: error.message } } };
  }
  if (typeof error === 'object' && error !== null && 'validation' in error && 'statusCode' in error) {
    const statusCode = (error as { statusCode: unknown }).statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return { statusCode, body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } } };
    }
  }
  return { statusCode: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } } };
}
