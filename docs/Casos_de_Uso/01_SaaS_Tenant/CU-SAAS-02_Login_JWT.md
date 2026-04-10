# CU-SAAS-02: Autenticación y Emisión de JWT (Login)

## 🎯 Objetivo
Autenticar a un usuario (Admin o Cajero) y emitir un token seguro que contenga su contexto de Tenant para aislar las futuras peticiones a la API.

## 👥 Actores
* Admin / Cajero.

## 🔄 Flujo Principal
1. El usuario ingresa `email` y `password` en el frontend.
2. El backend busca al usuario por email. Si no existe, retorna 401 Unauthorized.
3. El backend compara el hash del password. Si es inválido, retorna 401.
4. Si es exitoso, verifica que el `Tenant` asociado esté activo (`status = 'ACTIVE'`).
5. El sistema firma y emite un JWT y lo devuelve al cliente.

## ⚠️ Edge Cases & Reglas de Negocio
* **Tenant Suspendido:** Si el comercio no pagó la suscripción (CU-SAAS-04), el `Tenant.status` será `SUSPENDED`. El login debe fallar con un 403 Forbidden y un mensaje indicando problemas de facturación.
* **Prevención de Fuerza Bruta:** Bloquear la cuenta temporalmente tras 5 intentos fallidos (Opcional en MVP, considerar rate limiting).
* **Seguridad Genérica:** Los mensajes de error de credenciales inválidas deben ser idénticos ("Credenciales inválidas"), sin revelar si el error fue el email o la contraseña.

## 🤖 Directivas Técnicas para la IA
* **Payload del JWT:** El token DEBE contener estrictamente: `sub` (user_id), `tenant_id` y `role`. El `tenant_id` dentro de este payload será la fuente de verdad inmutable para todas las queries de TypeORM posteriores.
* **NestJS:** Implementar usando `@nestjs/jwt` y `@nestjs/passport` (estrategia JwtStrategy).