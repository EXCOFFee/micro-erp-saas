import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

/**
 * AuthModule — Módulo de autenticación y autorización.
 *
 * Encapsula toda la lógica de:
 * - Registro de comercios (CU-SAAS-01)
 * - Login y emisión de JWT (CU-SAAS-02)
 * - Validación de tokens (JwtStrategy + Kill Switch CU-AUDIT-02)
 *
 * Registra User y Tenant en TypeORM porque AuthService necesita
 * acceder directamente a ambas entidades durante el registro
 * (transacción ACID) y el login (verificar tenant status).
 */
@Module({
  imports: [
    PassportModule,

    /**
     * JwtModule configurado con secreto desde variables de entorno.
     *
     * signOptions.expiresIn: '8h' — Un turno de trabajo típico.
     * En comercios barriales, el cajero se loguea al inicio del turno
     * y trabaja 6-8 horas. El token expira al final para forzar
     * re-autenticación diaria.
     *
     * Si el Admin necesita revocar acceso antes, el Kill Switch
     * (token_version) invalida el token inmediatamente sin esperar
     * a que expire.
     */
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '8h' },
      }),
    }),

    /**
     * TypeORM entities que AuthService necesita:
     * - User: Para verificar credenciales y crear admins en registro
     * - Tenant: Para verificar status durante login
     */
    TypeOrmModule.forFeature([User, Tenant]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
