# CU-CLI-01: Alta de Nuevo Cliente (Deudor)

## 🎯 Objetivo
Permitir a un cajero o admin registrar a una persona en el sistema para poder fiarle mercadería o servicios.

## 👥 Actores
* Admin / Cajero.

## 🔄 Flujo Principal
1. El usuario accede a "Clientes > Nuevo Cliente".
2. Ingresa `nombre_completo`, `telefono` (opcional), `dni` (opcional) y `credit_limit_cents` (Límite de crédito).
3. El sistema valida los datos.
4. El sistema asigna automáticamente el `balance_cents` inicial en `0`.
5. Se inserta el registro en la tabla `Customers` vinculado al `tenant_id` del usuario que hace la petición.
6. Retorna 201 Created.

## ⚠️ Edge Cases & Reglas de Negocio
* **Validación de Duplicados:** Dos clientes no pueden tener el mismo `telefono` o `dni` DENTRO DEL MISMO TENANT. Sí pueden repetirse en Tenants distintos (Juan puede deber en el Kiosco A y en la Carnicería B).
* **Seguridad Financiera:** El Frontend jamás debe enviar el campo `balance_cents` en el payload de creación, o debe ser ignorado por el Backend. El balance inicial es estrictamente 0 por defecto en la BD.

## 🤖 Directivas Técnicas para la IA
* **DTO:** Usar `@IsInt()` para el `credit_limit_cents` asegurando que no entren floats.
* **TypeORM:** Configurar en la entidad `Customer` una constraint `UNIQUE(tenant_id, telefono)` (índice compuesto).