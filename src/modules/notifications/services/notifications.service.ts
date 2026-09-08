import type { NotificationCategory, NotificationChannel } from '@prisma/client';
import { emailService } from '../../../services/email/email.service.js';
import { pushProvider } from '../../../services/push/push-provider.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../utils/app-error.js';
import { NotificationsRepository } from '../repositories/notifications.repository.js';
import { parsePagination, paginationMeta } from '../../../utils/pagination.js';
import type {
  CreateTemplateInput,
  RegisterDeviceInput,
  SendNotificationInput,
  UpdateTemplateInput,
  UpsertPreferencesInput,
} from '../validators/notifications.validators.js';

type AuthActor = { id: string; permissions: string[] };

const ALL_CATEGORIES: NotificationCategory[] = [
  'SYSTEM',
  'LEAVE',
  'ATTENDANCE',
  'PAYROLL',
  'RECRUITMENT',
  'PERFORMANCE',
  'AI',
  'SECURITY',
  'OTHER',
];

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}

export class NotificationsService {
  constructor(private readonly repo = new NotificationsRepository()) {}

  private async requireUser(userId: string) {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('Your account is not linked to a company');
    }
    return { ...user, companyId: user.companyId };
  }

  private canManage(actor: AuthActor) {
    return actor.permissions.includes('notifications:manage');
  }

  status() {
    return {
      emailProvider: emailService.providerName,
      pushProvider: pushProvider.name,
      channels: ['IN_APP', 'EMAIL', 'PUSH'] as const,
      categories: ALL_CATEGORIES,
    };
  }

  async getSummary(actor: AuthActor) {
    const user = await this.requireUser(actor.id);
    const [unreadCount, byCategory, unreadCats, recent] = await Promise.all([
      this.repo.unreadCount(user.companyId, actor.id),
      this.repo.countsByCategory(user.companyId, actor.id),
      this.repo.unreadByCategory(user.companyId, actor.id),
      this.repo.recentFeed(user.companyId, actor.id, 5),
    ]);

    const totalByCategory: Record<string, number> = {};
    for (const row of byCategory) totalByCategory[row.category] = row._count._all;
    const unreadByCategory: Record<string, number> = {};
    for (const row of unreadCats) unreadByCategory[row.category] = row._count._all;

    return {
      unreadCount,
      totalByCategory,
      unreadByCategory,
      recent,
      providers: this.status(),
    };
  }

  async getFeed(actor: AuthActor, limit = 8) {
    const user = await this.requireUser(actor.id);
    const take = Math.min(Math.max(limit, 1), 20);
    const [items, unreadCount] = await Promise.all([
      this.repo.recentFeed(user.companyId, actor.id, take),
      this.repo.unreadCount(user.companyId, actor.id),
    ]);
    return {
      unreadCount,
      items: items.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        category: row.category,
        createdAt: row.createdAt.toISOString(),
        read: row.readAt != null || row.status === 'READ',
        data: row.data,
      })),
    };
  }

  async list(actor: AuthActor, params: Record<string, string | undefined>) {
    const user = await this.requireUser(actor.id);
    const { page, pageSize } = parsePagination(params);
    const category = params.category as NotificationCategory | undefined;
    const channel = params.channel as NotificationChannel | undefined;
    const status = params.status as never;
    if (category && !ALL_CATEGORIES.includes(category)) {
      throw new ValidationError('Invalid category');
    }

    const [items, total] = await this.repo.listForUser(user.companyId, actor.id, {
      page,
      pageSize,
      category,
      channel,
      status,
      unreadOnly: params.unreadOnly === 'true' || params.unreadOnly === '1',
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getOne(actor: AuthActor, id: string) {
    const user = await this.requireUser(actor.id);
    const item = await this.repo.findForUser(user.companyId, actor.id, id);
    if (!item) throw new NotFoundError('Notification not found');
    return item;
  }

  async markRead(actor: AuthActor, id: string) {
    const user = await this.requireUser(actor.id);
    const item = await this.repo.findForUser(user.companyId, actor.id, id);
    if (!item) throw new NotFoundError('Notification not found');
    if (item.readAt) return item;
    return this.repo.markRead(id);
  }

  async markAllRead(actor: AuthActor) {
    const user = await this.requireUser(actor.id);
    const result = await this.repo.markAllRead(user.companyId, actor.id);
    return { updated: result.count };
  }

  async deleteOne(actor: AuthActor, id: string) {
    const user = await this.requireUser(actor.id);
    const item = await this.repo.findForUser(user.companyId, actor.id, id);
    if (!item) throw new NotFoundError('Notification not found');
    await this.repo.softDelete(id);
    return { id, deleted: true };
  }

  async getPreferences(actor: AuthActor) {
    const user = await this.requireUser(actor.id);
    const existing = await this.repo.listPreferences(user.companyId, actor.id);
    const byCat = new Map(existing.map((p) => [p.category, p]));
    const preferences = ALL_CATEGORIES.map((category) => {
      const row = byCat.get(category);
      return {
        category,
        inAppEnabled: row?.inAppEnabled ?? true,
        emailEnabled: row?.emailEnabled ?? true,
        pushEnabled: row?.pushEnabled ?? false,
      };
    });
    return { preferences };
  }

  async upsertPreferences(actor: AuthActor, input: UpsertPreferencesInput) {
    const user = await this.requireUser(actor.id);
    for (const pref of input.preferences) {
      await this.repo.upsertPreference({
        companyId: user.companyId,
        userId: actor.id,
        category: pref.category,
        inAppEnabled: pref.inAppEnabled,
        emailEnabled: pref.emailEnabled,
        pushEnabled: pref.pushEnabled,
      });
    }
    return this.getPreferences(actor);
  }

  async listTemplates(actor: AuthActor) {
    if (!this.canManage(actor)) {
      throw new ForbiddenError('notifications:manage required');
    }
    const user = await this.requireUser(actor.id);
    const items = await this.repo.listTemplates(user.companyId);
    return { items };
  }

  async createTemplate(actor: AuthActor, input: CreateTemplateInput) {
    if (!this.canManage(actor)) {
      throw new ForbiddenError('notifications:manage required');
    }
    const user = await this.requireUser(actor.id);
    try {
      return await this.repo.createTemplate(user.companyId, {
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        category: input.category,
        channel: input.channel,
        subject: input.subject ?? null,
        bodyTemplate: input.bodyTemplate,
        isActive: input.isActive,
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') throw new ConflictError('Template code already exists');
      throw error;
    }
  }

  async updateTemplate(actor: AuthActor, id: string, input: UpdateTemplateInput) {
    if (!this.canManage(actor)) {
      throw new ForbiddenError('notifications:manage required');
    }
    const user = await this.requireUser(actor.id);
    const existing = await this.repo.findTemplate(user.companyId, id);
    if (!existing) throw new NotFoundError('Template not found');
    try {
      return await this.repo.updateTemplate(id, {
        ...(input.code !== undefined ? { code: input.code.trim().toUpperCase() } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.bodyTemplate !== undefined ? { bodyTemplate: input.bodyTemplate } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') throw new ConflictError('Template code already exists');
      throw error;
    }
  }

  async deleteTemplate(actor: AuthActor, id: string) {
    if (!this.canManage(actor)) {
      throw new ForbiddenError('notifications:manage required');
    }
    const user = await this.requireUser(actor.id);
    const existing = await this.repo.findTemplate(user.companyId, id);
    if (!existing) throw new NotFoundError('Template not found');
    await this.repo.softDeleteTemplate(id);
    return { id, deleted: true };
  }

  async listDevices(actor: AuthActor) {
    const user = await this.requireUser(actor.id);
    const items = await this.repo.listDevices(user.companyId, actor.id);
    return { items };
  }

  async registerDevice(actor: AuthActor, input: RegisterDeviceInput) {
    const user = await this.requireUser(actor.id);
    const device = await this.repo.upsertDevice({
      companyId: user.companyId,
      userId: actor.id,
      platform: input.platform,
      token: input.token.trim(),
      label: input.label ?? null,
    });
    return device;
  }

  async removeDevice(actor: AuthActor, id: string) {
    const user = await this.requireUser(actor.id);
    const result = await this.repo.softDeleteDevice(user.companyId, actor.id, id);
    if (result.count === 0) throw new NotFoundError('Device not found');
    return { id, deleted: true };
  }

  /**
   * Create + dispatch notifications across requested channels,
   * respecting per-category user preferences.
   */
  async send(actor: AuthActor, input: SendNotificationInput) {
    if (!this.canManage(actor)) {
      throw new ForbiddenError('notifications:manage required');
    }
    const sender = await this.requireUser(actor.id);
    const recipient = await this.repo.findUserInCompany(sender.companyId, input.userId);
    if (!recipient) throw new NotFoundError('Recipient user not found');

    let title = input.title;
    let body = input.body;
    let templateId: string | null = null;

    if (input.templateCode) {
      const template = await this.repo.findTemplateByCode(
        sender.companyId,
        input.templateCode.trim().toUpperCase(),
      );
      if (!template) throw new ValidationError('Unknown or inactive template code');
      templateId = template.id;
      const vars: Record<string, string> = {
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        email: recipient.email,
        title: input.title,
        body: input.body,
      };
      if (template.subject) {
        title = applyTemplate(template.subject, vars);
      }
      body = applyTemplate(template.bodyTemplate, vars);
    }

    const pref = await this.repo.findPreference(recipient.id, input.category);
    const inAppOk = pref?.inAppEnabled ?? true;
    const emailOk = pref?.emailEnabled ?? true;
    const pushOk = pref?.pushEnabled ?? false;

    const created = [];
    for (const channel of input.channels) {
      if (channel === 'IN_APP' && !inAppOk) continue;
      if (channel === 'EMAIL' && !emailOk) continue;
      if (channel === 'PUSH' && !pushOk) continue;

      const notification = await this.repo.createNotification({
        companyId: sender.companyId,
        userId: recipient.id,
        templateId,
        category: input.category,
        channel,
        title,
        body,
        data: (input.data as never) ?? undefined,
        status: 'PENDING',
        emailTo: channel === 'EMAIL' ? recipient.email : null,
      });

      try {
        if (channel === 'IN_APP') {
          await this.repo.updateDelivery(notification.id, {
            status: 'SENT',
            sentAt: new Date(),
          });
          created.push({ ...notification, status: 'SENT' as const });
        } else if (channel === 'EMAIL') {
          await emailService.send({
            to: recipient.email,
            subject: title,
            text: body,
          });
          await this.repo.updateDelivery(notification.id, {
            status: 'SENT',
            sentAt: new Date(),
            emailTo: recipient.email,
          });
          created.push({ ...notification, status: 'SENT' as const });
        } else if (channel === 'PUSH') {
          const devices = await this.repo.activeDevices(sender.companyId, recipient.id);
          if (!devices.length) {
            await this.repo.updateDelivery(notification.id, {
              status: 'FAILED',
              errorMessage: 'No active push devices registered',
            });
            created.push({ ...notification, status: 'FAILED' as const });
            continue;
          }
          for (const device of devices) {
            await pushProvider.send({
              token: device.token,
              title,
              body,
              platform: device.platform,
              data: input.data,
            });
          }
          await this.repo.updateDelivery(notification.id, {
            status: 'SENT',
            sentAt: new Date(),
          });
          created.push({ ...notification, status: 'SENT' as const });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Delivery failed';
        await this.repo.updateDelivery(notification.id, {
          status: 'FAILED',
          errorMessage: message.slice(0, 1000),
        });
        created.push({ ...notification, status: 'FAILED' as const, errorMessage: message });
      }
    }

    return { items: created, count: created.length };
  }
}
