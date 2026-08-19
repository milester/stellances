import { NotificationType } from '../../generated/prisma/client';

/**
 * Internal DTO used by other services to push a notification to a user.
 * Never exposed directly through HTTP — callers go through NotificationsService.
 */
export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  contractId?: string;
  milestoneId?: string;
}
