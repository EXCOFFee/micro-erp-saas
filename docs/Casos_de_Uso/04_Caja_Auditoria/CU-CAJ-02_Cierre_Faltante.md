# CU-CAJ-02: Cierre de Turno con Faltante/Sobrante

## 🎯 Objetivo
Registrar el momento en que un cajero termina su turno, comparando lo que el sistema dice que cobró contra los billetes físicos reales que está rindiendo, dejando constancia de cualquier descuadre.

## 🔄 Flujo Principal
1. El cajero entra a "Cerrar Turno".
2. El sistema calcula que debe haber $50.000 (CU-CAJ-01).
3. El cajero cuenta sus billetes e ingresa: $48.000 (Rendición física).
4. El sistema calcula la diferencia (-$2.000).
5. El cajero ingresa una nota obligatoria ("Tuve que pagarle al sodero").
6. El backend inserta un registro en la tabla `Cash_Registers_Logs` (Cierres de Caja) con estado `CLOSED_WITH_DISCREPANCY`.

## 🤖 Directivas Técnicas para la IA
* **Transaccionalidad:** Al hacer el cierre, el backend debe asociar el ID de este cierre a todas las transacciones `PAYMENT` de ese turno para "congelarlas" y que no se vuelvan a sumar en el turno de la tarde.
* **Seguridad:** El cajero no puede modificar cierres de caja pasados.