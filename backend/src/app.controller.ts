import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  /**
   * Health Check (@Public())
   * 
   * Endpoint simple para que cron-job.org o UptimeRobot eviten
   * la hibernación del servidor (Render Free Tier).
   */
  @Public()
  @Get('health')
  healthCheck() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
