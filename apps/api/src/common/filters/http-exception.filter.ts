import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@portal/types';
import type { Request, Response } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: ApiErrorResponse['error']['details'];

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else if (typeof payload === 'object' && payload !== null) {
        const record = payload as Record<string, unknown>;
        if (typeof record.message === 'string') {
          message = record.message;
        } else if (Array.isArray(record.message)) {
          message = 'Validation failed';
          details = record.message.map((item) => ({ message: String(item) }));
        } else {
          message = exception.message;
        }
        code = typeof record.code === 'string' ? record.code : (HttpStatus[status] ?? 'HTTP_ERROR');
        if (Array.isArray(record.details)) {
          details = record.details as ApiErrorResponse['error']['details'];
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error({ err: exception, requestId: request.requestId }, exception.message);
    }

    const body: ApiErrorResponse = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        ...(request.requestId ? { requestId: request.requestId } : {}),
      },
    };

    response.status(status).json(body);
  }
}
