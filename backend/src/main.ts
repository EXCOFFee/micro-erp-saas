import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

/**
 * Bootstrap del Micro ERP SaaS Backend.
 *
 * Infraestructura (Render Free Tier):
 * - El puerto se lee de process.env.PORT, que Render asigna dinámicamente.
 * - Fallback a 3000 para desarrollo local.
 *
 * Seguridad Global (Regla de Oro IV):
 * - ValidationPipe global asegura que TODOS los endpoints validen
 *   los DTOs con class-validator automáticamente.
 * - whitelist: true descarta cualquier propiedad no declarada en el DTO,
 *   previniendo inyecciones de campos maliciosos (ej: un frontend
 *   intentando enviar balance_cents en un payload de creación de cliente).
 * - forbidNonWhitelisted: true rechaza el request con 400 Bad Request
 *   si envían propiedades no permitidas, en vez de ignorarlas silenciosamente.
 * - transform: true convierte los payloads planos de JSON en instancias
 *   de las clases DTO, habilitando los decoradores de class-transformer.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * Seguridad Global: Helmet
   * Oculta cabeceras de servidor y añade restricciones para evitar distintos tipos de exploits HTTP.
   */
  app.use(helmet());

  /**
   * CORS — Permite que el frontend (Vercel) haga peticiones al backend (Render).
   * Seguridad (Auditoría):
   * Si FRONTEND_URL está definido, lo usa estrictamente.
   * Si no está definido pero estamos en development, permite localhost.
   * Si no está definido en production, RECHAZA todo por defecto.
   */
  app.enableCors({
    origin: process.env.NODE_ENV === 'production'
      ? process.env.FRONTEND_URL
      : (process.env.FRONTEND_URL || 'http://localhost:3001'),
    credentials: true,
  });

  /**
   * Filtro Global de Excepciones.
   * Estandariza los JSON de error y oculta los detalles de 500 Internal Server Error.
   */
  app.useGlobalFilters(new GlobalExceptionFilter());

  /**
   * Validación global de DTOs (class-validator).
   * Esto reemplaza la necesidad de aplicar @UsePipes() en cada controlador.
   * Regla de Oro IV: "Jamás confíes en el payload del Frontend."
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  /**
   * Health check — Render usa esto para verificar que la instancia está viva.
   * También útil para uptime monitors (UptimeRobot, etc.) keep-alive pings.
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const expressApp = app.getHttpAdapter().getInstance();

  /**
   * Throttler / Proxies en Producción:
   * Al estar desplegados en la nube (Render/Vercel/etc.), estamos tras un proxy.
   * Trust Proxy permite que express reconozca la IP real del usuario en lugar de 
   * la IP del load balancer, fundamental para que el Rate Limiting discrimine bien.
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  expressApp.set('trust proxy', 1);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  expressApp.get(
    '/health',
    (_req: unknown, res: { json: (body: unknown) => void }) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    },
  );

  /**
   * Puerto dinámico para Render.
   * Render asigna el puerto via process.env.PORT.
   * En desarrollo local, se usa el fallback 3000.
   */
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🚀 Micro ERP Backend corriendo en puerto ${port}`);
}

void bootstrap();
