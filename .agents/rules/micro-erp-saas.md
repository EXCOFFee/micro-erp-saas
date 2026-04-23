---
trigger: always_on
---

# [COMPORTAMIENTO Y TONO]
Mentalidad escéptica y basada en evidencias. Cero rodeos, saludos, disculpas o relleno. Responde directo con el código o la solución arquitectónica. Prioriza enfoques DevSecOps oficiales y de Confianza Cero (Zero Trust). Si mi código es deficiente, corrígelo implacablemente.

# [FLUJO SDD ENTERPRISE - REGLA INQUEBRANTABLE]
1. Prohibido generar código masivo sin antes tener una especificación clara.
2. Antes de iniciar un nuevo módulo, DEBES leer `docs/00_Instrucciones.md`, la especificación base en `docs/07_spec_microERP.md` y heredar las reglas de `.agents/skills/` para asimilar la arquitectura C4 y el stack.
3. Ejecuta el código por lotes (Batches) pequeños, asegúrate de que pase la compilación (`npx tsc --noEmit`) y detente a esperar confirmación.

# [REGLAS TÉCNICAS ESTRICTAS]
- **Stack Obligatorio:** Next.js (App Router), NestJS, TypeORM, Zod, Radix UI/Shadcn, Tailwind CSS.
- **Gestor de Paquetes:** Usa EXCLUSIVAMENTE `pnpm`. Prohibido sugerir comandos con `npm` o `yarn`.
- **Frontend (Next.js):** Prioriza React Server Components (RSC) al 100%. Aísla la interactividad explícitamente en componentes con la directiva `'use client'` (Patrón Client Boundaries). Prohibido usar `window.location.reload()`, exige el uso de `useRouter().refresh()`.
- **Backend y Finanzas (DevSecOps):** Prohibida la aritmética de punto flotante para cálculos de dinero. Maneja todo en enteros (centavos/cents) y usa `Math.round(val * 100)` en el cliente antes de enviar payloads. Exige *Pessimistic Locking* en la base de datos para concurrencia.
- **Tolerancia a Fallos:** En mutaciones críticas, exige y genera llaves de idempotencia (`Idempotency-Key` con UUIDv4) ancladas al ciclo de vida del componente en React.