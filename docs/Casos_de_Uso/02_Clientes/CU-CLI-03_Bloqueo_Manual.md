# CU-CLI-03: Bloqueo Manual de Cliente (Lista Negra)

## 🎯 Objetivo
Impedir que un cliente moroso o problemático pueda seguir sacando mercadería fiada, sin eliminar su perfil ni su deuda histórica del sistema.

## 🔄 Flujo Principal
1. El usuario busca al cliente en el listado.
2. Hace clic en "Bloquear Cliente" (o cambiar estado a Inactivo).
3. El sistema valida que el cliente pertenezca al `tenant_id` del usuario.
4. Se actualiza el campo `is_active = false` en la tabla `Customers`.
5. Retorna 200 OK.

## ⚠️ Edge Cases & Reglas de Negocio
* **Cobranza Permitida:** Un cliente con `is_active = false` NO PUEDE registrar nuevas deudas (403 Forbidden), pero SÍ DEBE poder registrar pagos. Queremos recuperar la plata, solo cortamos el crédito nuevo.
* **Informalidad Local:** El bloqueo puede aplicarse a perfiles informales (ej. clientes registrados solo con un "Apodo" y sin DNI).

## 🤖 Directivas Técnicas para la IA
* **TypeORM:** No usar `@DeleteDateColumn` (Soft Delete) para esto, ya que ocultaría al cliente del dashboard de morosos. Usar un flag explícito `is_active` (boolean) y un `UpdateQueryBuilder` filtrando por `tenant_id`.