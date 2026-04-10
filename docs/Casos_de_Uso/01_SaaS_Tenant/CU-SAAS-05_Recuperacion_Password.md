# CU-SAAS-05: Recuperación de Contraseña

## 🎯 Objetivo
Permitir a un usuario (Admin o Cajero) recuperar el acceso a su cuenta sin intervención manual de soporte técnico.

## 🔄 Flujo Principal
1. Usuario ingresa su email en "Olvidé mi contraseña".
2. Backend verifica si existe y si su Tenant está activo.
3. Genera un Token de Reseteo (JWT de un solo uso o token en BD con expiración de 15 mins).
4. Envía un email transaccional con el link mágico.
5. Usuario hace clic, ingresa su nueva contraseña.
6. Backend hashea y actualiza.

## ⚠️ Edge Cases & Reglas de Negocio
* **Seguridad:** El endpoint de solicitud de reseteo debe devolver 200 OK **incluso si el email no existe** para evitar ataques de enumeración (descubrir qué correos usan el sistema).
* **Invalidación:** Una vez usado el token, debe invalidarse (borrarse de la BD o guardar su jti en una blacklist).

## 🤖 Directivas Técnicas para la IA
* **NestJS:** Crear un `ResetTokenService`. Usar `@nestjs/mailer` o un SDK como Resend para el correo.