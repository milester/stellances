import { Injectable, NotFoundException } from '@nestjs/common';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from '../generated/prisma/client';

/**
 * NotificationsService
 *
 * Provides two surfaces:
 *
 * 1. **Persistence** – CRUD on the Notification table via Prisma.
 *    Other services call `create()` to push a notification; the controller
 *    exposes read/mark-read/delete endpoints for the client.
 *
 * 2. **Real-time push** – each authenticated SSE connection subscribes to
 *    a per-user RxJS Subject. When `create()` is called, the new record is
 *    both persisted AND emitted on the subject, so any open SSE stream for
 *    that user receives it instantly without polling.
 *
 * Design notes:
 * - The Subject map is in-process memory. This works for single-instance
 *   deployments. For horizontal scale, replace with a Redis pub/sub adapter.
 * - SSE streams created here are properly cleaned up when the client
 *   disconnects (see the controller's `@Sse` handler).
 */
@Injectable()
export class NotificationsService {
  /**
   * Per-user RxJS subjects for SSE streaming.
   * Key: userId, Value: Subject that emits Notification records.
   */
  private readonly streams = new Map<string, Subject<Notification>>();

  constructor(private readonly prisma: PrismaService) {}

  // ─── Real-time stream ────────────────────────────────────────────────────

  /**
   * Returns (or lazily creates) the Subject for a given user.
   * The SSE controller subscribes to `getStream(userId)` and passes each
   * emitted value back to the client as a MessageEvent.
   */
  getStream(userId: string): Subject<Notification> {
    if (!this.streams.has(userId)) {
      this.streams.set(userId, new Subject<Notification>());
    }
    return this.streams.get(userId)!;
  }

  /**
   * Removes the Subject when the SSE connection closes.
   * Called by the controller's cleanup logic.
   */
  removeStream(userId: string): void {
    const subject = this.streams.get(userId);
    if (subject) {
      subject.complete();
      this.streams.delete(userId);
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  /**
   * Persist a notification and emit it on the user's SSE stream (if open).
   *
   * Used internally by ContractsService (and eventually PaymentsService) to
   * push alerts for key contract lifecycle events.
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        contractId: dto.contractId ?? null,
        milestoneId: dto.milestoneId ?? null,
      },
    });

    // Push to SSE stream if the user has an open connection
    this.streams.get(dto.userId)?.next(notification);

    return notification;
  }

  /**
   * Return all notifications for a user, ordered newest-first.
   * Supports optional `unreadOnly` flag for the notification badge count.
   */
  async findAll(
    userId: string,
    opts: { unreadOnly?: boolean } = {},
  ): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts.unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // safety cap — client can paginate if needed
    });
  }

  /**
   * Return the count of unread notifications for a user.
   * Used by the notification badge in the frontend header.
   */
  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  /**
   * Mark a single notification as read. Verifies ownership.
   */
  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  /**
   * Mark all notifications for a user as read.
   * Returns the count of updated records.
   */
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }

  /**
   * Delete a single notification. Verifies ownership.
   */
  async deleteOne(id: string, userId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    await this.prisma.notification.delete({ where: { id } });
  }
}
