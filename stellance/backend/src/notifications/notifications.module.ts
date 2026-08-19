import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  // Export so ContractsService (and future PaymentsService) can inject it
  exports: [NotificationsService],
})
export class NotificationsModule {}
