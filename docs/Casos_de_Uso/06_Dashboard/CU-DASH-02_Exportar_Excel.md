# CU-DASH-02: Exportación de Morosos a Excel/CSV

## 🎯 Objetivo
Permitir al dueño descargar un listado completo de quién le debe plata y cuánto, para cruzarlo con su sistema contable o dárselo a un cobrador físico.

## 🔄 Flujo Principal
1. Admin presiona "Exportar a Excel" en el Dashboard.
2. Backend recopila a todos los `Customers` activos del `tenant_id` donde `balance_cents > 0`.
3. Backend formatea los centavos a moneda decimal realista.
4. Genera un archivo `.csv` o `.xlsx` y lo envía como `application/octet-stream`.

## 🤖 Directivas Técnicas para la IA
* **NestJS y Streams:** Si el comercio tiene miles de clientes, generar el string en memoria colapsará Node.js. La IA DEBE usar la API de *Streams* (`stream.Readable`) de Node.js junto con una librería como `csv-stringify` para enviar el archivo por partes (Chunked Response).