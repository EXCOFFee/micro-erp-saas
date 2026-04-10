# CU-AUDIT-01: Trazabilidad (Audit Logs)

## 🎯 Objetivo
Dejar un rastro inmutable si un empleado con permisos modifica límites de crédito o anula transacciones para detectar fraudes internos.

## 🔄 Flujo Principal
1. Cuando ocurre un CU-CLI-02 (Cambio de límite) o CU-TX-03 (Reversión), el backend intercepta la acción.
2. Inserta un registro en la tabla `Audit_Logs` (action, user_id, tenant_id, old_value, new_value, ip_address).

## 🤖 Directivas Técnicas para la IA
* **NestJS:** Implementar esto usando *Interceptors* de NestJS o *Subscribers* (`@EventSubscriber()`) de TypeORM para que sea automático y no ensucie los controladores.