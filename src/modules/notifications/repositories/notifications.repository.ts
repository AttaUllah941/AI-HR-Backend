import type {
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryStatus,
  Prisma,
  PushPlatform,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';

const notDeleted = { deletedAt: null };

export type ListQuery = {
  page: number;
  pageSize: number;
  category?: NotificationCategory;
  channel?: NotificationChannel;
  status?: NotificationDeliveryStatus;
  unreadOnly?: boolean;
};

export class NotificationsRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, companyId: true, email: true, firstName: true, lastName: true },
    });
  }

  findUserInCompany(companyId: string, userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, companyId, deletedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true, companyId: true },
    });
  }

  // —— Notifications ——

  listForUser(companyId: string, userId: string, query: ListQuery) {
    const where: Prisma.NotificationWhereInput = {
      companyId,
      userId,
      ...notDeleted,
      ...(query.category ? { category: query.category } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.unreadOnly ? { readAt: null, status: { not: 'READ' } } : {}),
    };
    return Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          template: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.notification.count({ where }),
    ]);
  }

  findForUser(companyId: string, userId: string, id: string) {
    return prisma.notification.findFirst({
      where: { id, companyId, userId, ...notDeleted },
      include: {
        template: { select: { id: true, code: true, name: true } },
      },
    });
  }

  createNotification(data: {
    companyId: string;
    userId: string;
    templateId?: string | null;
    category: NotificationCategory;
    channel: NotificationChannel;
    title: string;
    body: string;
    data?: Prisma.InputJsonValue;
    status?: NotificationDeliveryStatus;
    emailTo?: string | null;
    sentAt?: Date | null;
    errorMessage?: string | null;
  }) {
    return prisma.notification.create({
      data: {
        companyId: data.companyId,
        userId: data.userId,
        templateId: data.templateId ?? null,
        category: data.category,
        channel: data.channel,
        title: data.title,
        body: data.body,
        data: data.data ?? undefined,
        status: data.status ?? 'PENDING',
        emailTo: data.emailTo ?? null,
        sentAt: data.sentAt ?? null,
        errorMessage: data.errorMessage ?? null,
      },
    });
  }

  markRead(id: string) {
    return prisma.notification.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  markAllRead(companyId: string, userId: string) {
    return prisma.notification.updateMany({
      where: {
        companyId,
        userId,
        ...notDeleted,
        readAt: null,
        status: { not: 'READ' },
      },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  softDelete(id: string) {
    return prisma.notification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  updateDelivery(
    id: string,
    data: {
      status: NotificationDeliveryStatus;
      sentAt?: Date | null;
      errorMessage?: string | null;
      emailTo?: string | null;
    },
  ) {
    return prisma.notification.update({
      where: { id },
      data: {
        status: data.status,
        sentAt: data.sentAt === undefined ? undefined : data.sentAt,
        errorMessage: data.errorMessage === undefined ? undefined : data.errorMessage,
        emailTo: data.emailTo === undefined ? undefined : data.emailTo,
      },
    });
  }

  unreadCount(companyId: string, userId: string) {
    return prisma.notification.count({
      where: {
        companyId,
        userId,
        ...notDeleted,
        channel: 'IN_APP',
        readAt: null,
        status: { not: 'READ' },
      },
    });
  }

  countsByCategory(companyId: string, userId: string) {
    return prisma.notification.groupBy({
      by: ['category'],
      where: { companyId, userId, ...notDeleted, channel: 'IN_APP' },
      _count: { _all: true },
    });
  }

  unreadByCategory(companyId: string, userId: string) {
    return prisma.notification.groupBy({
      by: ['category'],
      where: {
        companyId,
        userId,
        ...notDeleted,
        channel: 'IN_APP',
        readAt: null,
        status: { not: 'READ' },
      },
      _count: { _all: true },
    });
  }

  recentFeed(companyId: string, userId: string, take = 8) {
    return prisma.notification.findMany({
      where: { companyId, userId, ...notDeleted, channel: 'IN_APP' },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        title: true,
        body: true,
        category: true,
        status: true,
        readAt: true,
        createdAt: true,
        data: true,
      },
    });
  }

  // —— Templates ——

  listTemplates(companyId: string) {
    return prisma.notificationTemplate.findMany({
      where: { companyId, ...notDeleted },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }

  findTemplate(companyId: string, id: string) {
    return prisma.notificationTemplate.findFirst({
      where: { id, companyId, ...notDeleted },
    });
  }

  findTemplateByCode(companyId: string, code: string) {
    return prisma.notificationTemplate.findFirst({
      where: { companyId, code, ...notDeleted, isActive: true },
    });
  }

  createTemplate(
    companyId: string,
    data: {
      code: string;
      name: string;
      category: NotificationCategory;
      channel: NotificationChannel;
      subject?: string | null;
      bodyTemplate: string;
      isActive?: boolean;
    },
  ) {
    return prisma.notificationTemplate.create({
      data: {
        companyId,
        code: data.code,
        name: data.name,
        category: data.category,
        channel: data.channel,
        subject: data.subject ?? null,
        bodyTemplate: data.bodyTemplate,
        isActive: data.isActive ?? true,
      },
    });
  }

  updateTemplate(
    id: string,
    data: Partial<{
      code: string;
      name: string;
      category: NotificationCategory;
      channel: NotificationChannel;
      subject: string | null;
      bodyTemplate: string;
      isActive: boolean;
    }>,
  ) {
    return prisma.notificationTemplate.update({
      where: { id },
      data,
    });
  }

  softDeleteTemplate(id: string) {
    return prisma.notificationTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // —— Preferences ——

  listPreferences(companyId: string, userId: string) {
    return prisma.notificationPreference.findMany({
      where: { companyId, userId },
      orderBy: { category: 'asc' },
    });
  }

  upsertPreference(data: {
    companyId: string;
    userId: string;
    category: NotificationCategory;
    inAppEnabled: boolean;
    emailEnabled: boolean;
    pushEnabled: boolean;
  }) {
    return prisma.notificationPreference.upsert({
      where: {
        userId_category: { userId: data.userId, category: data.category },
      },
      create: data,
      update: {
        inAppEnabled: data.inAppEnabled,
        emailEnabled: data.emailEnabled,
        pushEnabled: data.pushEnabled,
      },
    });
  }

  findPreference(userId: string, category: NotificationCategory) {
    return prisma.notificationPreference.findUnique({
      where: { userId_category: { userId, category } },
    });
  }

  // —— Push devices ——

  listDevices(companyId: string, userId: string) {
    return prisma.pushDevice.findMany({
      where: { companyId, userId, ...notDeleted, isActive: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  upsertDevice(data: {
    companyId: string;
    userId: string;
    platform: PushPlatform;
    token: string;
    label?: string | null;
  }) {
    return prisma.pushDevice.upsert({
      where: { userId_token: { userId: data.userId, token: data.token } },
      create: {
        companyId: data.companyId,
        userId: data.userId,
        platform: data.platform,
        token: data.token,
        label: data.label ?? null,
        isActive: true,
        lastSeenAt: new Date(),
      },
      update: {
        platform: data.platform,
        label: data.label ?? null,
        isActive: true,
        deletedAt: null,
        lastSeenAt: new Date(),
      },
    });
  }

  softDeleteDevice(companyId: string, userId: string, id: string) {
    return prisma.pushDevice.updateMany({
      where: { id, companyId, userId, ...notDeleted },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  activeDevices(companyId: string, userId: string) {
    return prisma.pushDevice.findMany({
      where: { companyId, userId, ...notDeleted, isActive: true },
      select: { id: true, token: true, platform: true },
    });
  }
}
