# CU-HW-01: Impresión de Ticket de Fiado

## 🎯 Objetivo
Imprimir un comprobante físico en una comandera (impresora térmica 58mm/80mm) para que el cliente lo firme como pagaré.

## 🔄 Flujo Principal
1. Al terminar CU-TX-01 (Registro de Deuda), aparece botón "Imprimir Ticket".
2. Frontend formatea los datos (Fecha, Cliente, Detalle, Saldo Anterior, Saldo Actual).
3. Envía los comandos ESC/POS a la impresora Bluetooth/USB conectada al dispositivo del cajero.

## 🤖 Directivas Técnicas para la IA
* **Next.js:** Al ser una app web, usar la `Web Serial API` o `Web Bluetooth API` nativa del navegador para enviar buffers ESC/POS crudos directamente a la impresora desde el Frontend (Client Component), sin pasar por el Backend.