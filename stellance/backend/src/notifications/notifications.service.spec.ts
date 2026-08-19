/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-001';
const OTHER_USER_ID = 'user-uuid-002';
const NOTIF_ID = 'notif-uuid-001';

const baseNotif = {
  id: NOTIF_ID,
  userId: USER_ID,
  type: NotificationType.MILESTONE_SUBMITTED,
  title: 'Milestone ready for review',
  body: '"Deliverable 1" has been submitted for your review.',
  read: false,
  contractId: 'contract-uuid-001',
  milestoneId: 'milestone-uuid-001',
  createdAt: new Date('2026-08-19T00:00:00Z'),
};

// ─── Prisma stub ──────────────────────────────────────────────────────────────

interface NotifPrismaMock {
  create: jest.Mock;
  findMany: jest.Mock;
  findUnique: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
}
interface PrismaStub {
  notification: NotifPrismaMock;
}

function makePrisma(): PrismaStub {
  return {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  function setup() {
    const prisma = makePrisma();
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
    );
    return { prisma, service };
  }

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('persists and returns the notification', async () => {
      const { prisma, service } = setup();
      prisma.notification.create.mockResolvedValue(baseNotif);

      const result = await service.create({
        userId: USER_ID,
        type: NotificationType.MILESTONE_SUBMITTED,
        title: baseNotif.title,
        body: baseNotif.body,
        contractId: baseNotif.contractId,
        milestoneId: baseNotif.milestoneId,
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          type: NotificationType.MILESTONE_SUBMITTED,
          title: baseNotif.title,
        }),
      });
      expect(result).toEqual(baseNotif);
    });

    it('emits on the SSE stream when a subscription exists', async () => {
      const { prisma, service } = setup();
      prisma.notification.create.mockResolvedValue(baseNotif);

      const subject = service.getStream(USER_ID);
      const received: unknown[] = [];
      const sub = subject.subscribe((n) => received.push(n));

      await service.create({
        userId: USER_ID,
        type: NotificationType.MILESTONE_SUBMITTED,
        title: baseNotif.title,
        body: baseNotif.body,
      });

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(baseNotif);
      sub.unsubscribe();
    });

    it('does not throw when no SSE stream is open for the user', async () => {
      const { prisma, service } = setup();
      prisma.notification.create.mockResolvedValue(baseNotif);

      await expect(
        service.create({
          userId: OTHER_USER_ID,
          type: NotificationType.CONTRACT_FUNDED,
          title: 'Funded',
          body: 'Contract funded',
        }),
      ).resolves.not.toThrow();
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all notifications ordered by createdAt desc', async () => {
      const { prisma, service } = setup();
      prisma.notification.findMany.mockResolvedValue([baseNotif]);

      const result = await service.findAll(USER_ID);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([baseNotif]);
    });

    it('applies unreadOnly filter when requested', async () => {
      const { prisma, service } = setup();
      prisma.notification.findMany.mockResolvedValue([baseNotif]);

      await service.findAll(USER_ID, { unreadOnly: true });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, read: false },
        }),
      );
    });
  });

  // ── countUnread ───────────────────────────────────────────────────────────

  describe('countUnread', () => {
    it('returns the count of unread notifications', async () => {
      const { prisma, service } = setup();
      prisma.notification.count.mockResolvedValue(3);

      const count = await service.countUnread(USER_ID);

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: USER_ID, read: false },
      });
      expect(count).toBe(3);
    });
  });

  // ── markRead ──────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('marks a notification as read and returns the updated record', async () => {
      const { prisma, service } = setup();
      prisma.notification.findUnique.mockResolvedValue(baseNotif);
      const updated = { ...baseNotif, read: true };
      prisma.notification.update.mockResolvedValue(updated);

      const result = await service.markRead(NOTIF_ID, USER_ID);

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID },
        data: { read: true },
      });
      expect(result.read).toBe(true);
    });

    it('throws NotFoundException when notification does not exist', async () => {
      const { prisma, service } = setup();
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markRead(NOTIF_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when notification belongs to another user', async () => {
      const { prisma, service } = setup();
      prisma.notification.findUnique.mockResolvedValue({
        ...baseNotif,
        userId: OTHER_USER_ID,
      });

      await expect(service.markRead(NOTIF_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── markAllRead ───────────────────────────────────────────────────────────

  describe('markAllRead', () => {
    it('bulk-updates all unread notifications and returns the count', async () => {
      const { prisma, service } = setup();
      prisma.notification.updateMany.mockResolvedValue({ count: 4 });

      const result = await service.markAllRead(USER_ID);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, read: false },
        data: { read: true },
      });
      expect(result).toEqual({ updated: 4 });
    });
  });

  // ── deleteOne ─────────────────────────────────────────────────────────────

  describe('deleteOne', () => {
    it('deletes the notification when ownership is verified', async () => {
      const { prisma, service } = setup();
      prisma.notification.findUnique.mockResolvedValue(baseNotif);
      prisma.notification.delete.mockResolvedValue(baseNotif);

      await expect(
        service.deleteOne(NOTIF_ID, USER_ID),
      ).resolves.toBeUndefined();

      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: NOTIF_ID },
      });
    });

    it('throws NotFoundException when notification does not exist', async () => {
      const { prisma, service } = setup();
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.deleteOne(NOTIF_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException when trying to delete another user's notification", async () => {
      const { prisma, service } = setup();
      prisma.notification.findUnique.mockResolvedValue({
        ...baseNotif,
        userId: OTHER_USER_ID,
      });

      await expect(service.deleteOne(NOTIF_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.notification.delete).not.toHaveBeenCalled();
    });
  });

  // ── SSE stream lifecycle ──────────────────────────────────────────────────

  describe('getStream / removeStream', () => {
    it('lazily creates a Subject on first call', () => {
      const { service } = setup();
      const subject = service.getStream(USER_ID);
      expect(subject).toBeDefined();
    });

    it('returns the same Subject on subsequent calls', () => {
      const { service } = setup();
      const a = service.getStream(USER_ID);
      const b = service.getStream(USER_ID);
      expect(a).toBe(b);
    });

    it('completes the Subject and removes it on removeStream', () => {
      const { service } = setup();
      const subject = service.getStream(USER_ID);
      let completed = false;
      subject.subscribe({
        complete: () => {
          completed = true;
        },
      });

      service.removeStream(USER_ID);

      expect(completed).toBe(true);
      // A new call after removal creates a fresh Subject
      const fresh = service.getStream(USER_ID);
      expect(fresh).not.toBe(subject);
    });

    it('does nothing when removeStream is called for an unknown user', () => {
      const { service } = setup();
      expect(() => service.removeStream('non-existent-user')).not.toThrow();
    });
  });
});
