# CU-AUDIT-02: Revocación de Acceso de Emergencia (Kill Switch)

## 🎯 Objetivo
Permitir al Admin desconectar instantáneamente a un empleado (por despido o sospecha de fraude), invalidando su sesión actual para que no pueda seguir operando ni hacer daño.

## 🔄 Flujo Principal
1. Admin va a Empleados, selecciona uno y presiona "Revocar Acceso".
2. Backend marca al `User.is_active = false`.
3. Backend incrementa la columna `User.token_version` (ej. de 1 a 2).
4. El sistema fuerza un log-out en los dispositivos del empleado.

## 🤖 Directivas Técnicas para la IA
* **Invalidación de JWT (Stateless):** Para no guardar tokens en la BD, la IA DEBE implementar el patrón de `token_version`. El payload del JWT emitido en CU-SAAS-02 debe incluir la versión actual. El NestJS Guard validará en cada request que la versión del JWT coincida con la de la BD. Si el Admin revoca el acceso, la versión sube y el token viejo queda automáticamente muerto.