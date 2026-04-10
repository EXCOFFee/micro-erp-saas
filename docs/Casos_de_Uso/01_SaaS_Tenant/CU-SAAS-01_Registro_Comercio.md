# CU-SAAS-01: Registro de Nuevo Comercio (Tenant Onboarding)

## 🎯 Objetivo
Permitir que un dueño de comercio se registre en la plataforma SaaS, aprovisionando su espacio de trabajo aislado (Tenant) y su cuenta de usuario administrador.

## 👥 Actores
* Dueño del Comercio (Usuario Anónimo que pasa a ser Admin).

## 🔄 Flujo Principal
1. El usuario accede a la landing page y selecciona "Crear Cuenta".
2. Ingresa los datos del comercio: `tenant_name` (ej. "Kiosco Carlitos").
3. Ingresa sus datos personales: `email`, `password`, `phone`.
4. El sistema valida que el email no exista globalmente.
5. El sistema crea el registro en la tabla `Tenants` generando un `tenant_id` (UUID) único.
6. El sistema crea el registro en la tabla `Users` asociado a ese `tenant_id` con el rol `ADMIN`.
7. El sistema retorna un código 201 Created y redirige al Login.

## ⚠️ Edge Cases & Reglas de Negocio
* **Aislamiento:** El nombre del comercio (`tenant_name`) puede repetirse (puede haber dos "Kiosco Carlitos"), pero el `email` del usuario DEBE ser único a nivel global.
* **Atomicidad:** Si falla la creación del `User` (ej. base de datos caída o validación fallida), la creación del `Tenant` DEBE revertirse (Rollback). No pueden quedar Tenants "huérfanos" sin usuarios.

## 🤖 Directivas Técnicas para la IA
* **TypeORM:** Usa un `QueryRunner` o `manager.transaction()` para asegurar que la inserción de `Tenant` y `User` sea ACID.
* **Seguridad:** Hashea el `password` usando `bcrypt` o `argon2` antes de guardar en la DB. NUNCA devuelvas el password en el JSON de respuesta.
* **Validación:** DTO con `@IsEmail()`, `@IsStrongPassword()` y `@IsString()` usando class-validator.