import { SetMetadata } from '@nestjs/common';

export const IS_SKIP_SUBSCRIPTION_KEY = 'isSkipSubscription';

/**
 * @SkipSubscriptionCheck()
 *
 * Decorador para omitir la validación del SubscriptionGuard.
 * Útil para endpoints que deben ser accesibles incluso si el comercio
 * está suspendido por falta de pago (ej: endpoints de billing, settings de cuenta).
 */
export const SkipSubscriptionCheck = () => SetMetadata(IS_SKIP_SUBSCRIPTION_KEY, true);
