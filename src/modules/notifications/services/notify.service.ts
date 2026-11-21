import type { NotificationCategory, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { logger } from '../../../config/logger.js';
import { notificationHub } from '../notification-hub.js';

export interface NotifyInput {
  companyId: string;
  userIds: string[];
  category: NotificationCategory;
  title: string;
  body: string;
  /** Extra context for the client (ids to deep-link with). Never put secrets here. */
  data?: Prisma.InputJsonValue;
}

/**
 * Creates in-app notifications for system events and pushes them to open streams.
 *
 * Best effort by design: it never throws, so a notification problem can never fail the business
 * operation that triggered it (call it after the operation has committed, without awaiting if the
 * caller does not need the result). Recipients are limited to active users of `companyId`, and a
 * user who switched in-app notifications off for the category is skipped.
 */
export async function notifyUsers(input: NotifyInput): Promise<number> {
  try {
    const wanted = [...new Set(input.userIds)];
    if (wanted.length === 0) return 0;

    const users = await prisma.user.findMany({
      where: { id: { in: wanted }, companyId: input.companyId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    if (users.length === 0) return 0;

    const prefs = await prisma.notificationPreference.findMany({
      where: { userId: { in: users.map((u) => u.id) }, category: input.category },
      select: { userId: true, inAppEnabled: true },
    });
    const off = new Set(prefs.filter((p) => !p.inAppEnabled).map((p) => p.userId));

    let created = 0;
    for (const user of users) {
      if (off.has(user.id)) continue;
      const notification = await prisma.notification.create({
        data: {
          companyId: input.companyId,
          userId: user.id,
          category: input.category,
          channel: 'IN_APP',
          title: input.title,
          body: input.body,
          data: input.data ?? undefined,
          status: 'SENT',
          sentAt: new Date(),
        },
        select: { id: true, category: true, title: true },
      });
      notificationHub.publish(user.id, notification);
      created += 1;
    }
    return created;
  } catch (error) {
    logger.warn('Could not create notification', {
      category: input.category,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/** Active users of the company whose roles grant `permission` (e.g. the people who approve leave). */
export async function userIdsWithPermission(companyId: string, permission: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: 'ACTIVE',
      userRoles: { some: { role: { rolePermissions: { some: { permission: { code: permission } } } } } },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** The login behind an employee record (null when the employee has no account). */
export async function userIdOfEmployee(companyId: string, employeeId: string): Promise<string | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { userId: true },
  });
  return employee?.userId ?? null;
}

/** The login of an employee's direct manager, if both exist. */
export async function managerUserIdOf(companyId: string, employeeId: string): Promise<string | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { manager: { select: { userId: true } } },
  });
  return employee?.manager?.userId ?? null;
}
