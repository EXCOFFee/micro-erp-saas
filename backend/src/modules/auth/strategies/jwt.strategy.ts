import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * JwtStrategy — Estrategia de Passport para validar tokens JWT.
 *
 * Se ejecuta automáticamente en cada request protegido (via JwtAuthGuard).
 * Realiza DOS validaciones críticas que van más allá de la firma del JWT:
 *
 * 1. Kill Switch (CU-AUDIT-02): Compara token_version del JWT contra la BD.
 *    Si el Admin revocó el acceso, la versión en la BD será mayor que la del
 *    token → UnauthorizedException inmediato.
 *
 * 2. Estado activo: Si el usuario fue desactivado (is_active = false),
 *    el token se rechaza aunque la firma sea válida.
 *
 * NOTA DE PERFORMANCE (Supabase Free Tier):
 * Esta estrategia ejecuta un SELECT a la BD en CADA request autenticado
 * para verificar token_version. Esto es aceptable en MVP con poco tráfico,
 * pero si escala, considerar un cache en Redis de token_version.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      /**
       * Extraemos el JWT del header Authorization: Bearer <token>.
       * Estándar de facto para APIs REST.
       */
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      /**
       * Passport rechaza automáticamente tokens expirados.
       * NO desactivamos esta verificación (false = "no ignorar expiración").
       */
      ignoreExpiration: false,

      /**
       * Secreto para verificar la firma del JWT.
       * Se lee de las variables de entorno (Render: Dashboard, Local: .env).
       */
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Método ejecutado DESPUÉS de que Passport verifica la firma y expiración.
   * Recibe el payload decodificado del JWT.
   *
   * Si retorna un objeto, este se inyecta como `req.user` en los controllers.
   * Si lanza una excepción, Passport retorna 401.
   *
   * @param payload - El payload decodificado del JWT (JwtPayload)
   * @returns Objeto del usuario para inyectar en req.user
   */
  async validate(payload: JwtPayload) {
    /**
     * Buscamos al usuario en la BD para verificar kill switch y estado activo.
     * Solo traemos los campos estrictamente necesarios para la validación.
     */
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      select: ['id', 'tenant_id', 'role', 'is_active', 'token_version'],
    });

    if (!user) {
      throw new UnauthorizedException('Token inválido');
    }

    /**
     * Kill Switch (CU-AUDIT-02):
     * Si el Admin revocó acceso del empleado, incrementó token_version en la BD.
     * El JWT viejo tiene la versión anterior → se rechaza automáticamente.
     * Esto invalida la sesión sin necesidad de una blacklist de tokens.
     */
    if (payload.token_version !== user.token_version) {
      throw new UnauthorizedException(
        'Sesión revocada. Vuelva a iniciar sesión',
      );
    }

    /**
     * Verificación de estado activo (CU-SAAS-03):
     * Un usuario desactivado no puede operar aunque tenga un JWT válido.
     */
    if (!user.is_active) {
      throw new UnauthorizedException('Cuenta desactivada');
    }

    /**
     * Retornamos el objeto que se inyecta como req.user en los controllers.
     * Incluimos los campos mínimos necesarios para que los services
     * puedan filtrar por tenant_id y verificar roles.
     *
     * SDD — SaaS Core:
     * sub_status y sub_expires_at se pasan del JWT al req.user para que
     * el SubscriptionGuard los lea en-memoria (Zero-Query pattern).
     */
    return {
      id: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      sub_status: payload.sub_status,
      sub_expires_at: payload.sub_expires_at,
    };
  }
}
