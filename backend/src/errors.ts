import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

/** Exception body with a stable machine-readable code: `throw new BadRequestException(coded('CLOSET_EMPTY', '…'))`. */
export function coded(code: string, message: string) {
  return { code, message };
}

const defaultCodes: Record<number, string> = {
  400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED', 503: 'SERVICE_UNAVAILABLE',
};

/** Every error response is `{statusCode, error, message, code}`; `message` stays human-friendly, `code` is for app logic. */
@Catch()
export class ErrorCodes implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (!(exception instanceof HttpException)) {
      console.error(exception);
      res.status(500).json({ statusCode: 500, error: 'Internal Server Error', message: 'Something went wrong on our side. Please try again.', code: 'INTERNAL_ERROR' });
      return;
    }
    const status = exception.getStatus();
    const body = exception.getResponse();
    const fields = typeof body === 'string' ? { message: body } : (body as { message?: string | string[]; code?: string; error?: string });
    const message = fields.message ?? exception.message;
    const code = fields.code ?? (Array.isArray(message) ? 'VALIDATION_ERROR' : defaultCodes[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR'));
    res.status(status).json({ statusCode: status, error: fields.error ?? HttpStatus[status] ?? 'Error', message, code });
  }
}
