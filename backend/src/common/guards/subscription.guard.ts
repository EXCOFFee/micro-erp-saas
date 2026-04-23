import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_SKIP_SUBSCRIPTION_KEY } from '../decorators/skip-subscription.decorator';
import { TenantStatus } from '../enums/tenant-status.enum';

interface JwtPayloadUser {
  sub: string;
  tenant_id: string;
  role: string;
  sub_status: TenantStatus;
  sub_expires_at: number | null;
}

interface RequestWithUser extends Request {
  user?: JwtPayloadUser;
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const isSkipSubscription = this.reflector.getAllAndOverride<boolean>(
      IS_SKIP_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic || isSkipSubscription) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      return true; // Si no hay usuario (caso borde, porque JwtAuthGuard corre antes), no validamos acá
    }

    const status = user.sub_status;

    // Si el status es SUSPENDED, bloquear
    if (status === TenantStatus.SUSPENDED) {
      throw new HttpException(
        'Comercio suspendido por falta de pago.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Si el status es PAST_DUE, verificamos los 3 días de gracia
    if (status === TenantStatus.PAST_DUE) {
      if (user.sub_expires_at) {
        // sub_expires_at es en segundos (epoch)
        const expirationMs = user.sub_expires_at * 1000;
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const gracePeriodEnd = expirationMs + threeDaysMs;

        if (Date.now() > gracePeriodEnd) {
          throw new HttpException(
            'Período de gracia expirado. Suscripción suspendida.',
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }

      // Inyectar header X-Subscription-Warning para advertencia
      const response = context.switchToHttp().getResponse<Response>();
      response.setHeader('X-Subscription-Warning', 'true');
    }

    return true;
  }
}
