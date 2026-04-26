FASE 1: SRS (Desarrollo Técnico)
1. Introducción

1.1 Propósito del Documento
Definir los contratos, la arquitectura inmutable y los vectores de seguridad para el módulo de Recuperación y Reseteo de Contraseñas (CU-SAAS-05) dentro del ecosistema Micro-ERP (NestJS / Next.js).

1.2 Visión General (Overview)
El flujo se compone de un sistema de delegación de confianza de factor único. Transforma el formulario de Login en un nodo de decisión, inyectando un endpoint público que emite un JSON Web Token (JWT) de propósito específico (reset_password), cifrado, con un tiempo de vida (TTL) estricto de 15 minutos, entregado asíncronamente vía SMTP.

1.3 Objetivos Core B2B (Métricas de ROI)

Reducción de Costos Operativos: Eliminación del 100% de las intervenciones manuales de soporte (horas-hombre) para la gestión de pérdida de credenciales.

Mitigación de Fuga de Capital: Supresión de tiempos de inactividad por cuentas bloqueadas en Tenants comerciales, asegurando la continuidad de la facturación en caja.

Blindaje de SLA (Service Level Agreement): Cero exposición a vulnerabilidades de enumeración (CWE-203), garantizando a los clientes B2B que las listas de correos de su personal están protegidas contra extracciones automatizadas.

2. Roles y User Personas (RBAC)

2.1 Actores Externos (Usuario No Autenticado)

Estado: Carece de un token JWT de autorización estándar en sus cabeceras HTTP.

Alcance: Limitado exclusivamente a los endpoints expuestos con el decorador @Public() en el framework NestJS.

Vector de Acceso Temporal: Adquiere permisos de mutación de credenciales única y exclusivamente si porta el token temporal proporcionado vía parámetro de URL en el frontend (/reset-password?token=XYZ).

2.2 Restricciones de Dominio (Aislamiento de Tenants)

El reseteo opera a nivel de la entidad User. Aunque un usuario pertenezca a un Tenant específico, la autenticación y la propiedad del correo son globales a nivel de la tabla de usuarios. El sistema mutará la contraseña sin revelar a qué Tenant pertenece ni alterar el estado del comercio.

3. Diagrama de Casos de Uso (Flujo de Arquitectura)

3.1 Flujo A: Solicitud de Enlace (Fail-Safe)

Actor ingresa un correo en la UI y presiona "Recuperar Contraseña".

Next.js ejecuta un POST HTTP hacia /auth/forgot-password.

NestJS busca el correo en la base de datos.

Rama A (Existe): Genera JWT de reseteo, encola tarea asíncrona de envío de correo en background (NodeMailer/Resend).

Rama B (No Existe): Absorbe el ciclo de CPU de forma controlada (protección contra timing attacks) y no encola correo.

NestJS responde con HTTP 200 OK genérico ("Si el correo existe, se han enviado las instrucciones"). Queda prohibido el HTTP 404.

3.2 Flujo B: Ejecución de Mutación

Actor hace clic en el enlace de su correo electrónico y accede a /reset-password?token=XYZ en Next.js.

Next.js despliega el formulario para la nueva contraseña.

Next.js empaqueta la nueva contraseña y el token en un DTO y ejecuta POST a /auth/reset-password.

NestJS verifica la firma del JWT, extrae el userId, valida que no haya expirado y que no haya sido utilizado previamente (Invalidación).

NestJS genera un nuevo salt, ejecuta bcrypt sobre la nueva contraseña, aplica Pessimistic Locking en la tabla User para evitar colisiones de estado concurrente y muta el campo password.

NestJS genera un Audit Log (Categoría: SEGURIDAD) registrando el cambio de contraseña.

4. Requisitos

4.1 Requisitos de Usuario (UI/UX)

Vista /login: Inyección de un componente tipo Link ("¿Olvidaste tu contraseña?") que redirija o abra un modal (Dialog de Shadcn) para solicitar el correo electrónico.

Vista /reset-password: Nueva ruta en Next.js (App Router) que captura el parámetro de la URL (searchParams.token). Debe bloquear el renderizado del formulario si el token es nulo o inválido sintácticamente.

Feedback Fail-Safe: Queda prohibido mostrar alertas en rojo o verde dependiendo de si el correo existe en la base de datos. El mensaje de éxito debe ser genérico y estático en la UI.

4.2 Requisitos Funcionales

Generación de JWT Dedicado: NestJS debe firmar un token exclusivo con el payload { sub: userId, purpose: 'pwd_reset' }.

Tiempo de Vida (TTL): El token expira obligatoriamente a los 15m (900 segundos).

Procesamiento en Background: El envío del correo no debe bloquear el hilo principal de Node.js. Debe delegarse a un Event Emitter o cola de trabajos para responder al cliente en menos de 200ms.

4.3 Requisitos No Funcionales (Seguridad y Contratos)

Contratos de Datos (Zod / DTOs):

TypeScript
import { z } from 'zod';

export const ForgotPasswordSchema = z.object({
  email: z.string().email("Formato de correo inválido").toLowerCase().trim(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(32, "Token de seguridad requerido"),
  new_password: z.string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
    .regex(/[0-9]/, "Debe contener al menos un número"),
});
Políticas DevSecOps:

Anti-Enumeración Constante (Timing Attack Mitigation): El controlador forgot-password debe ejecutar un retraso artificial simulado o usar bcrypt.compare con un hash fantasma en caso de no encontrar el correo, para que el tiempo de respuesta (TTFB) sea idéntico (ej. 300ms) exista o no el usuario.

Rate Limiting Estricto: Restricción a nivel de API Gateway/NestJS Throttler de máximo 3 solicitudes por IP cada 60 minutos para el endpoint de solicitud de correo.

Invalidación de Token Post-Uso: Una vez consumido, el JWT queda quemado. Se implementará verificando que el iat (Issued At) del token sea mayor a la columna password_changed_at (a crear) en la tabla User.

5. Flujo de Datos y Componentes del Sistema

POST /api/auth/forgot-password

Input: ForgotPasswordSchema.

Componente: AuthController -> AuthService.requestPasswordReset(email).

Proceso: Consulta TypeORM (findOneBy). Si existe, genera JWT con secreto único (JWT_RESET_SECRET). Emite evento asíncrono EmailService.sendResetLink.

Output: 200 OK (Mensaje estático de confirmación).

POST /api/auth/reset-password

Input: ResetPasswordSchema + Headers (Idempotency-Key).

Componente: AuthController -> AuthService.executePasswordReset(token, new_password).

Proceso: 1. Verifica firma del JWT con JWT_RESET_SECRET.
2. Extrae sub (userId).
3. Abre QueryRunner e inicia transacción.
4. Aplica setLock('pessimistic_write') sobre el registro del usuario.
5. Valida que el JWT sea más reciente que el último cambio de credenciales.
6. Hashea nueva contraseña (bcrypt.hash).
7. Escribe nuevo hash y actualiza timestamp password_changed_at.
8. Dispara evento de auditoría.
9. Realiza commit.

Output: 200 OK.