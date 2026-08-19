import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Req,
  Res,
  Sse,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { UserRole } from '../generated/prisma/client';
import { NotificationsService } from './notifications.service';

interface AuthRequest extends Request {
  user: { id: string; role: UserRole };
}

/**
 * NotificationsController
 *
 * Endpoints:
 *
 *   GET    /notifications              – list notifications (optionally unread only)
 *   GET    /notifications/unread-count – badge count
 *   GET    /notifications/stream       – SSE stream (EventSource)
 *   PATCH  /notifications/read-all     – mark all as read
 *   PATCH  /notifications/:id/read     – mark one as read
 *   DELETE /notifications/:id          – delete one notification
 *
 * SSE design:
 *   The `/stream` endpoint returns an Observable<MessageEvent>. NestJS
 *   serialises each emission as `data: <JSON>\n\n` automatically via the
 *   @Sse decorator. The client opens a standard EventSource and receives
 *   notifications in real-time as they are created by other services.
 *
 *   When the client disconnects (TCP close) we clean up the per-user Subject
 *   via res.on('close').
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  // ─── List & counts ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List notifications for the authenticated user' })
  @ApiQuery({
    name: 'unreadOnly',
    required: false,
    type: Boolean,
    description: 'Pass true to return only unread notifications',
  })
  @Get()
  async findAll(
    @Req() req: AuthRequest,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.findAll(req.user.id, {
      unreadOnly: unreadOnly === 'true',
    });
  }

  @ApiOperation({ summary: 'Count unread notifications (for badge)' })
  @Get('unread-count')
  async countUnread(@Req() req: AuthRequest) {
    const count = await this.service.countUnread(req.user.id);
    return { count };
  }

  // ─── SSE stream ───────────────────────────────────────────────────────────

  /**
   * GET /notifications/stream
   *
   * Server-Sent Events endpoint. The client opens an EventSource to this URL
   * and receives new Notification records in real-time.
   *
   * Each event is a JSON-serialised Notification:
   *   data: {"id":"...","type":"MILESTONE_SUBMITTED","title":"...","body":"...",...}
   *
   * The Observable is wired directly to the per-user RxJS Subject held in
   * NotificationsService. When the HTTP connection closes (client navigates
   * away, refreshes, etc.) we complete and remove the Subject.
   */
  @ApiOperation({
    summary: 'Server-Sent Events stream of real-time notifications',
    description:
      'Connect with EventSource. Each event is a JSON-serialised Notification record.',
  })
  @Sse('stream')
  stream(
    @Req() req: AuthRequest,
    @Res() res: Response,
  ): Observable<MessageEvent> {
    const userId = req.user.id;
    const subject = this.service.getStream(userId);

    // Clean up when the TCP connection closes
    res.on('close', () => this.service.removeStream(userId));

    return new Observable<MessageEvent>((observer) => {
      const subscription = subject.subscribe({
        next: (notification) =>
          observer.next({ data: JSON.stringify(notification) } as MessageEvent),
        error: (err) => observer.error(err),
        complete: () => observer.complete(),
      });
      return () => subscription.unsubscribe();
    });
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  /**
   * PATCH /notifications/read-all
   * Must be declared before :id routes so NestJS doesn't treat "read-all" as an ID.
   */
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @Patch('read-all')
  async markAllRead(@Req() req: AuthRequest) {
    return this.service.markAllRead(req.user.id);
  }

  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @Patch(':id/read')
  async markRead(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.markRead(id, req.user.id);
  }

  @ApiOperation({ summary: 'Delete a notification' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOne(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ): Promise<void> {
    await this.service.deleteOne(id, req.user.id);
  }
}
