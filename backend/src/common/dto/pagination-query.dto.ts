import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min, Max } from 'class-validator';

/**
 * PaginationQueryDto — DTO base para paginación defensiva.
 *
 * Previene ataques OOM (Out Of Memory) limitando el máximo de registros
 * que un cliente puede solicitar en una sola petición.
 *
 * Valores por defecto: limit=20, offset=0
 * Máximo permitido: limit=100 (protección contra queries masivas)
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
