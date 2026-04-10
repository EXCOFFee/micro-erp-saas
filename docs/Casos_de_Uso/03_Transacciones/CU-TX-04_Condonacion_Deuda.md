# CU-TX-04 Condonacion Deuda
# CU-TX-04: Condonación de Deuda (Perdón de Deuda)

## 🎯 Objetivo
Llevar el saldo de un cliente a $0 sin que ingrese dinero real a la caja (ej: el cliente falleció o el dueño asumió la pérdida).

## 👥 Actores
* SOLAMENTE Admin.

## 🔄 Flujo Principal
1. Admin selecciona al cliente y elige "Condonar Deuda".
2. Backend aplica `pessimistic_write` lock al Customer.
3. Crea transacción tipo `FORGIVENESS` por el monto exacto adeudado.
4. Actualiza `Customer.balance_cents = 0`.

## 🤖 Directivas Técnicas para la IA
* **Auditoría:** La transacción debe llevar una nota/motivo obligatorio (ej: `description: "Pérdida asumida"`).
* **Caja:** A diferencia del tipo `PAYMENT`, el tipo `FORGIVENESS` **NO DEBE SUMARSE** en el cálculo del arqueo de caja diario.