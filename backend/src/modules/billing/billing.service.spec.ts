import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { BillingService } from './billing.service';

/**
 * Unit tests de BillingService — foco en verifySignature() (auditoría C1/C2/C4).
 *
 * verifySignature() no toca `this.dataSource`, así que se instancia el service
 * directo sin TestingModule de Nest — no hay nada que mockear vía DI.
 *
 * Estos tests son la razón por la que C1 (timing attack) y C2 (fail-open sin
 * MP_WEBHOOK_SECRET) no deberían volver a colarse desapercibidos: antes de este
 * archivo, billing.service.ts tenía 0% de cobertura — justo donde vivían las
 * dos vulnerabilidades confirmadas.
 */
describe('BillingService.verifySignature', () => {
  let service: BillingService;
  const ORIGINAL_ENV = { ...process.env };

  const SECRET = 'test-mp-webhook-secret-1234567890';
  const REQUEST_ID = 'req-abc-123';
  const PAYMENT_ID = 999;
  const TS = '1700000000';

  /** Calcula el HMAC real siguiendo el mismo manifest que usa el service. */
  function computeValidSignatureHeader(secret: string): string {
    const manifest = `id:${PAYMENT_ID};request-id:${REQUEST_ID};ts:${TS};`;
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');
    return `ts=${TS},v1=${hmac}`;
  }

  beforeEach(() => {
    service = new BillingService({} as DataSource);
    process.env = { ...ORIGINAL_ENV };
    process.env.MP_WEBHOOK_SECRET = SECRET;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const body = { data: { id: PAYMENT_ID } };

  it('acepta una firma válida calculada con el mismo secreto y manifest', () => {
    const signature = computeValidSignatureHeader(SECRET);

    expect(service.verifySignature(signature, REQUEST_ID, body)).toBe(true);
  });

  it('rechaza una firma con v1 que no corresponde al HMAC esperado', () => {
    const signature = `ts=${TS},v1=${'0'.repeat(64)}`;

    expect(service.verifySignature(signature, REQUEST_ID, body)).toBe(false);
  });

  it('rechaza una firma calculada con un secreto distinto (simula HMAC forjado)', () => {
    const signature = computeValidSignatureHeader('otro-secreto-distinto');

    expect(service.verifySignature(signature, REQUEST_ID, body)).toBe(false);
  });

  it('rechaza si el header x-signature no trae ts=', () => {
    const { data } = body;
    const manifest = `id:${data.id};request-id:${REQUEST_ID};ts:;`;
    const hmac = crypto
      .createHmac('sha256', SECRET)
      .update(manifest)
      .digest('hex');
    const signature = `v1=${hmac}`; // sin "ts="

    expect(service.verifySignature(signature, REQUEST_ID, body)).toBe(false);
  });

  it('rechaza si el header x-signature no trae v1=', () => {
    const signature = `ts=${TS}`; // sin "v1="

    expect(service.verifySignature(signature, REQUEST_ID, body)).toBe(false);
  });

  it('rechaza si falta signature, requestId o body', () => {
    const signature = computeValidSignatureHeader(SECRET);

    expect(service.verifySignature('', REQUEST_ID, body)).toBe(false);
    expect(service.verifySignature(signature, '', body)).toBe(false);
    expect(
      service.verifySignature(signature, REQUEST_ID, undefined as never),
    ).toBe(false);
  });

  // ─── C2: FAIL-CLOSED cuando falta MP_WEBHOOK_SECRET ────────────────────────

  it('C2: rechaza CUALQUIER webhook si falta el secreto en producción (fail-closed)', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';

    const signature = computeValidSignatureHeader(SECRET); // firma "válida" según el secreto real, pero no importa: no hay secreto configurado

    expect(service.verifySignature(signature, REQUEST_ID, body)).toBe(false);
  });

  it('permite omitir la validación solo fuera de producción si falta el secreto', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'development';

    const signature = 'ts=anything,v1=anything'; // no se valida en absoluto

    expect(service.verifySignature(signature, REQUEST_ID, body)).toBe(true);
  });

  it('permite omitir la validación en test (NODE_ENV=test) si falta el secreto', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'test';

    expect(service.verifySignature('ts=x,v1=y', REQUEST_ID, body)).toBe(true);
  });
});
