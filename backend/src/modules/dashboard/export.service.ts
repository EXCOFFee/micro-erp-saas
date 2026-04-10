import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Readable } from 'stream';
import { Customer } from '../customers/entities/customer.entity';

/**
 * ExportService — Exportación de morosos a CSV con streaming (CU-DASH-02).
 *
 * Directiva Técnica (CU-DASH-02):
 * Si el comercio tiene miles de clientes, generar el string en memoria
 * colapsará Node.js. Usamos un Readable Stream que emite filas CSV
 * una a una, permitiendo al cliente HTTP recibirlas por chunks.
 *
 * Evitamos dependencias externas (csv-stringify) usando formateo manual
 * simple — un CSV de morosos tiene una estructura fija y predecible.
 * Esto cumple con la Regla de Oro VI (Dieta de Dependencias).
 */
@Injectable()
export class ExportService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Genera un Readable Stream con el listado de morosos en formato CSV.
   *
   * Columnas: Nombre, Teléfono, DNI, Deuda ($), Límite ($), Estado, Promesa de Pago
   * Los centavos se convierten a formato monetario con 2 decimales en el CSV.
   *
   * @returns Readable stream que emite el CSV fila por fila
   */
  createDebtorsStream(tenantId: string): Readable {
    const dataSource = this.dataSource;

    /**
     * Usamos un Readable con implementación async del método _read.
     * Esto permite que Node.js envíe chunks al cliente HTTP
     * sin almacenar todo el CSV en memoria (CU-DASH-02 Directiva).
     */
    const stream = new Readable({
      read() {
        // No-op: push se hace manualmente en la función async
      },
    });

    // Encabezado CSV (BOM UTF-8 para que Excel reconozca los acentos)
    const BOM = '\uFEFF';
    const header =
      'Nombre,Teléfono,DNI,Deuda ($),Límite Crédito ($),Estado,Promesa de Pago\n';
    stream.push(BOM + header);

    // Query y push asíncrono
    void (async () => {
      try {
        const customers = await dataSource.getRepository(Customer).find({
          where: { tenant_id: tenantId },
          order: { balance_cents: 'DESC' },
          select: [
            'full_name',
            'phone',
            'dni',
            'balance_cents',
            'credit_limit_cents',
            'is_active',
            'next_payment_promise',
          ],
        });

        for (const c of customers) {
          // Solo exportar clientes con deuda (CU-DASH-02: "quién le debe plata")
          if (c.balance_cents <= 0) continue;

          const row = [
            escapeCsv(c.full_name),
            escapeCsv(c.phone ?? ''),
            escapeCsv(c.dni ?? ''),
            centsToDecimal(c.balance_cents),
            centsToDecimal(c.credit_limit_cents),
            c.is_active ? 'Activo' : 'Bloqueado',
            c.next_payment_promise
              ? new Date(c.next_payment_promise).toISOString().split('T')[0]
              : '',
          ].join(',');

          stream.push(row + '\n');
        }

        // Señalizar fin del stream
        stream.push(null);
      } catch {
        stream.destroy(new Error('Error al generar el export CSV'));
      }
    })();

    return stream;
  }
}

/**
 * Escapa un valor para CSV: si contiene comas, comillas o saltos de línea,
 * lo envuelve en comillas dobles y escapa las comillas internas.
 */
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convierte centavos a formato decimal con 2 dígitos.
 * Ej: 1500050 → "15000.50"
 *
 * Se usa division de enteros para evitar imprecisión de floats (Regla de Oro III).
 * La separación es con punto porque el CSV se importa a Excel.
 */
function centsToDecimal(cents: number): string {
  const integer = Math.floor(cents / 100);
  const decimal = cents % 100;
  return `${integer}.${decimal.toString().padStart(2, '0')}`;
}
