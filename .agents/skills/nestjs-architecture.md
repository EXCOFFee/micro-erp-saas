# NestJS Architecture & Multi-tenant Rules

- **Arquitectura:** Separa estrictamente la lógica en Modules, Controllers y Services. Usa inyección de dependencias (`@Injectable()`).
- **Seguridad Multi-tenant:** Toda petición debe identificar el `tenant_id` del comercio. Los Repositories de TypeORM NUNCA deben devolver datos sin filtrar por `tenant_id`.
- **Validación:** Usa `class-validator` y `class-transformer` en todos los DTOs. Prohibido el uso de `any`.
- **Finanzas:** Los montos de dinero se manejan en formato entero (centavos) en la base de datos para evitar errores de coma flotante.