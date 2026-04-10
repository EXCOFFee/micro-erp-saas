import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * GlobalExceptionFilter — Escudo contra fugas de información (Security Cross-Cutting).
 *
 * Captura TODAS las excepciones no manejadas en la aplicación.
 * 1. Mantiene el formato estándar para HttpExceptions (400, 401, 404, 409, 422).
 * 2. Intercepta los 500 Internal Server Error y OCULTA el stack trace original.
 *    Solo loguea el error real en la consola de Render (para el developer),
 *    pero le envía al frontend un mensaje genérico para no exponer vulnerabilidades.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Si es un HttpException estándar (ej: NotFound, BadRequest de class-validator)
    // Extraemos su respuesta nativa para no romper el contrato del frontend.
    if (isHttpException) {
      const exceptionResponse = exception.getResponse();
      const errorJson =
        typeof exceptionResponse === 'string'
          ? { message: exceptionResponse }
          : (exceptionResponse as object);

      response.status(status).json({
        ...errorJson,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
      return;
    }

    // Si NO es un HttpException, es un error de código no capturado (Bug, BD caída, etc).
    // Logueamos el error real internamente para debug.
    this.logger.error(
      `Unhandled Exception at ${request.url}: ${exception instanceof Error ? exception.stack : String(exception)}`,
    );

    // Retornamos un mensaje genérico al frontend (Regla de Seguridad)
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor. Contacte a soporte.',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
