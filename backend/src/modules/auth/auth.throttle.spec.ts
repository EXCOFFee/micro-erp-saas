import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { Server } from 'http';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Test de rate limiting en /auth/login y /auth/register (auditoría M7).
 *
 * No usa Postgres/Redis/Testcontainers: monta el AuthController real con un
 * AuthService FAKE (login/register siempre resuelven) para aislar el
 * comportamiento del ThrottlerGuard del resto del flujo de autenticación.
 * El límite global (100 req/60s, app.module.ts) es demasiado laxo para
 * frenar fuerza bruta en login; @Throttle en el controller lo endurece
 * por ruta.
 */
describe('AuthController — rate limiting (M7)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockResolvedValue({ access_token: 'fake-jwt' }),
            register: jest.fn().mockResolvedValue({
              message: 'Comercio registrado exitosamente',
            }),
          },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('devuelve 429 en el 11º intento de login dentro de la misma ventana (límite: 10/60s)', async () => {
    for (let i = 0; i < 10; i++) {
      await request(httpServer)
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'whatever' })
        .expect(200);
    }

    await request(httpServer)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'whatever' })
      .expect(429);
  });

  it('devuelve 429 en el 21º intento de register dentro de la misma ventana (límite: 20/60s)', async () => {
    for (let i = 0; i < 20; i++) {
      await request(httpServer)
        .post('/auth/register')
        .send({
          tenant_name: 'Kiosco Test',
          email: 'admin@example.com',
          password: 'whatever',
          name: 'Admin Test',
        })
        .expect(201);
    }

    await request(httpServer)
      .post('/auth/register')
      .send({
        tenant_name: 'Kiosco Test',
        email: 'admin@example.com',
        password: 'whatever',
        name: 'Admin Test',
      })
      .expect(429);
  });
});
