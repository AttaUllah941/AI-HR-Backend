import { logger } from '../../../config/logger.js';
import { DashboardRepository } from '../repositories/dashboard.repository.js';
import { NotificationsService } from '../../notifications/services/notifications.service.js';

export interface DashboardQuickAction {
  id: string;
  label: string;
  route: string;
  icon: string;
  permission?: string;
}

function greetingPeriod(date: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = date.getHours();
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 17) {
    return 'afternoon';
  }
  return 'evening';
}

function greetingMessage(firstName: string, date: Date): string {
  const period = greetingPeriod(date);
  const label = period === 'morning' ? 'Good morning' : period === 'afternoon' ? 'Good afternoon' : 'Good evening';
  return `${label}, ${firstName}`;
}

function humanizeAction(action: string): string {
  return action
    .split('.')
    .map((part) => part.replace(/-/g, ' '))
    .join(' · ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEPARTMENT_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899'];

export class DashboardService {
  constructor(
    private readonly repo = new DashboardRepository(),
    private readonly notifications = new NotificationsService(),
  ) {}

  async getGreeting(user: { id: string; email: string; firstName?: string }) {
    const company = await this.repo.findUserCompany(user.id);
    const now = new Date();
    const firstName = user.firstName || user.email.split('@')[0] || 'there';
    return {
      greeting: {
        firstName,
        message: greetingMessage(firstName, now),
        period: greetingPeriod(now),
        date: now.toISOString(),
      },
      company: company ?? { id: null, name: 'Your company' },
    };
  }

  async getSummary(user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    permissions: string[];
  }) {
    const now = new Date();
    const firstName = user.firstName || user.email.split('@')[0];
    const can = (permission: string) => user.permissions.includes(permission);
    const company = await this.repo.findUserCompany(user.id);
    const companyId = company?.id ?? null;

    // Each section is only computed and returned when the caller holds the matching permission.
    const modules = {
      organization: can('dashboard:view'),
      employees: can('employees:view'),
      attendance: can('attendance:view'),
      leave: can('leave:view'),
      payroll: can('payroll:view'),
      recruitment: can('recruitment:view'),
      performance: can('performance:view'),
      ai: can('ai:view'),
    };

    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekStart = new Date(todayUtc);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const growthStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

    const skip = Promise.resolve(null);
    const [
      activeUsers,
      totalUsers,
      activeSessions,
      orgCounts,
      employeeCounts,
      attendanceRows,
      pendingLeave,
      payrollRun,
      openPositions,
      applicationRows,
      avgRating,
      joins,
    ] = await Promise.all([
      companyId ? this.repo.countUsers(companyId, { status: 'ACTIVE' }) : 0,
      companyId ? this.repo.countUsers(companyId) : 0,
      companyId ? this.repo.countActiveSessions(companyId) : 0,
      this.repo.organizationCountsForUser(user.id),
      companyId && modules.employees ? this.repo.employeeCountsForCompany(companyId) : skip,
      companyId && modules.attendance ? this.repo.attendanceByDay(companyId, weekStart, todayUtc) : skip,
      companyId && modules.leave ? this.repo.countPendingLeave(companyId) : skip,
      companyId && modules.payroll ? this.repo.latestPayrollRun(companyId) : skip,
      companyId && modules.recruitment ? this.repo.countOpenPositions(companyId) : skip,
      companyId && modules.recruitment ? this.repo.applicationsByStatus(companyId) : skip,
      companyId && modules.performance ? this.repo.averageReviewRating(companyId) : skip,
      companyId && modules.employees ? this.repo.employeeJoinDates(companyId, growthStart) : skip,
    ]);

    const presentStatuses = new Set(['PRESENT', 'LATE', 'REMOTE', 'HALF_DAY', 'EARLY_LEAVE']);
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const trendDays: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(weekStart);
      d.setUTCDate(weekStart.getUTCDate() + i);
      trendDays.push(d);
    }
    const dayTotals = new Map<string, { present: number; absent: number; late: number }>();
    for (const row of attendanceRows ?? []) {
      const key = dayKey(row.date);
      const entry = dayTotals.get(key) ?? { present: 0, absent: 0, late: 0 };
      if (presentStatuses.has(row.status)) entry.present += row.count;
      if (row.status === 'ABSENT') entry.absent += row.count;
      if (row.status === 'LATE') entry.late += row.count;
      dayTotals.set(key, entry);
    }
    const attendanceTrend = trendDays.map((d) => ({
      label: weekDays[d.getUTCDay()]!,
      present: dayTotals.get(dayKey(d))?.present ?? 0,
      absent: dayTotals.get(dayKey(d))?.absent ?? 0,
    }));
    const today = dayTotals.get(dayKey(todayUtc)) ?? { present: 0, absent: 0, late: 0 };

    const departmentSlices = (employeeCounts?.departmentBreakdown ?? []).map((row, index) => ({
      label: row.name,
      value: row.count,
      color: DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length]!,
    }));
    const departmentTotal = departmentSlices.reduce((sum, slice) => sum + slice.value, 0);

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyJoins = new Array<number>(12).fill(0);
    for (const date of joins?.joinDates ?? []) {
      monthlyJoins[date.getUTCMonth()] = (monthlyJoins[date.getUTCMonth()] ?? 0) + 1;
    }
    let running = joins?.before ?? 0;
    const employeeGrowth = modules.employees
      ? monthLabels.slice(0, now.getUTCMonth() + 1).map((label, index) => {
          running += monthlyJoins[index] ?? 0;
          return { label, value: running };
        })
      : [];

    const appCount = new Map((applicationRows ?? []).map((r) => [r.status, r.count]));
    const countOf = (status: string) => appCount.get(status) ?? 0;
    // Cumulative funnel: each stage counts applications that reached it or later.
    const hired = countOf('HIRED');
    const offer = countOf('OFFER') + hired;
    const interview = countOf('INTERVIEW') + offer;
    const screening = countOf('SCREENING') + interview;
    const applied = countOf('APPLIED') + screening;
    const hiringStages = modules.recruitment
      ? [
          { label: 'Applied', value: applied },
          { label: 'Screening', value: screening },
          { label: 'Interview', value: interview },
          { label: 'Offer', value: offer },
          { label: 'Hired', value: hired },
        ]
      : [];

    const kpis: Array<Record<string, unknown>> = [];
    if (employeeCounts) {
      kpis.push({
        key: 'total_employees',
        label: 'Total Employees',
        value: employeeCounts.total,
        subValue: `${employeeCounts.active} active`,
        icon: 'groups',
        tone: 'primary',
      });
    }
    if (attendanceRows) {
      const base = employeeCounts?.active ?? 0;
      kpis.push(
        {
          key: 'present_today',
          label: 'Present Today',
          value: today.present,
          trend:
            base > 0
              ? { value: `${Math.round((today.present / base) * 100)}%`, direction: 'neutral' as const, positive: true }
              : undefined,
          icon: 'how_to_reg',
          tone: 'success',
        },
        { key: 'absent', label: 'Absent', value: today.absent, icon: 'person_off', tone: 'danger' },
        { key: 'late', label: 'Late', value: today.late, icon: 'schedule', tone: 'warning' },
      );
    }
    if (openPositions !== null) {
      kpis.push({ key: 'open_positions', label: 'Open Positions', value: openPositions, icon: 'work_outline', tone: 'info' });
    }
    if (pendingLeave !== null) {
      kpis.push({ key: 'pending_leave', label: 'Pending Leave', value: pendingLeave, icon: 'event_available', tone: 'warning' });
    }
    if (modules.payroll) {
      const period = payrollRun
        ? new Date(Date.UTC(payrollRun.year, payrollRun.month - 1, 1)).toLocaleString('en-US', {
            month: 'short',
            timeZone: 'UTC',
          })
        : now.toLocaleString('en-US', { month: 'short' });
      kpis.push({
        key: 'payroll_status',
        label: 'Payroll Status',
        value: payrollRun ? payrollRun.status : 'No run',
        trend: { value: period, direction: 'neutral' as const, positive: true },
        icon: 'payments',
        tone: 'success',
      });
    }
    if (modules.performance) {
      kpis.push({
        key: 'performance_score',
        label: 'Perf. Score',
        value: avgRating === null ? null : Math.round(avgRating * 10) / 10,
        icon: 'grade',
        tone: 'secondary',
      });
    }

    const insightItems: Array<{ prefix: string; highlight: string; suffix: string }> = [];
    if (attendanceRows && employeeCounts && employeeCounts.active > 0) {
      insightItems.push({
        prefix: 'Attendance today: ',
        highlight: `${today.present} of ${employeeCounts.active}`,
        suffix: ' active employees are present.',
      });
    }
    if (pendingLeave) {
      insightItems.push({
        prefix: '',
        highlight: `${pendingLeave} leave request${pendingLeave === 1 ? '' : 's'}`,
        suffix: ' awaiting review.',
      });
    }
    if (openPositions) {
      insightItems.push({
        prefix: '',
        highlight: `${openPositions} open position${openPositions === 1 ? '' : 's'}`,
        suffix: ' currently hiring.',
      });
    }

    return {
      greeting: {
        firstName,
        message: greetingMessage(firstName, now),
        period: greetingPeriod(now),
        date: now.toISOString(),
      },
      company: company ?? { id: null, name: 'Your company' },
      previewMode: false,
      kpis,
      aiInsights: {
        title: 'AI Insights for this week',
        live: insightItems.length > 0,
        items: insightItems,
        ctaLabel: 'Ask Nova for details',
        ctaRoute: '/ai/assistant',
      },
      attendanceTrend: {
        period: 'Last 7 days',
        series: modules.attendance ? attendanceTrend : [],
      },
      departmentDistribution: {
        total: departmentTotal,
        slices: departmentSlices,
      },
      hiringFunnel: {
        period: 'Current pipeline',
        stages: hiringStages,
      },
      employeeGrowth: {
        period: 'YTD',
        points: employeeGrowth,
      },
      stats: {
        totalUsers,
        activeUsers,
        activeSessions,
        departments: orgCounts.departments,
        teams: orgCounts.teams,
      },
      modules,
    };
  }

  async getActivity(userId: string, limit = 12) {
    const company = await this.repo.findUserCompany(userId);
    if (!company?.id) {
      return { items: [] };
    }
    const rows = await this.repo.recentAuditLogs(company.id, Math.min(Math.max(limit, 1), 50));
    return {
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        title: humanizeAction(row.action),
        entityType: row.entityType,
        entityId: row.entityId,
        actor: row.actor
          ? {
              id: row.actor.id,
              name: `${row.actor.firstName} ${row.actor.lastName}`.trim(),
              email: row.actor.email,
            }
          : null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async getNotifications(userId: string, limit = 8) {
    try {
      return await this.notifications.getFeed({ id: userId, permissions: ['notifications:view'] }, limit);
    } catch (error) {
      logger.warn('Notifications feed unavailable; using audit-log fallback', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback to audit-log proxy if notifications module is unavailable for the user
      const rows = await this.repo.recentNotificationsForUser(userId, Math.min(Math.max(limit, 1), 20));
      return {
        unreadCount: rows.length,
        items: rows.map((row) => ({
          id: row.id,
          title: humanizeAction(row.action),
          body: row.entityType ? `${row.entityType} activity` : 'System activity',
          createdAt: row.createdAt.toISOString(),
          read: false,
        })),
      };
    }
  }
}
