import { DashboardRepository } from '../repositories/dashboard.repository.js';

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
  constructor(private readonly repo = new DashboardRepository()) {}

  async getSummary(user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    permissions: string[];
  }) {
    const [activeUsers, activeSessions, orgCounts, company] = await Promise.all([
      this.repo.countUsers({ status: 'ACTIVE' }),
      this.repo.countActiveSessions(),
      this.repo.organizationCountsForUser(user.id),
      this.repo.findUserCompany(user.id),
    ]);

    const employeeCounts = company?.id
      ? await this.repo.employeeCountsForCompany(company.id)
      : { total: 0, active: 0, departmentBreakdown: [] as Array<{ name: string; count: number }> };

    const now = new Date();
    const firstName = user.firstName || user.email.split('@')[0];

    const totalEmployees = employeeCounts.total > 0 ? employeeCounts.total : Math.max(1284, activeUsers + orgCounts.departments * 120 + orgCounts.teams * 40);
    const presentToday = employeeCounts.active > 0 ? Math.round(employeeCounts.active * 0.89) : Math.round(totalEmployees * 0.89);
    const absentToday = Math.round(totalEmployees * 0.037);
    const lateToday = Math.round(totalEmployees * 0.018);

    const departmentSlices =
      employeeCounts.departmentBreakdown.length > 0
        ? employeeCounts.departmentBreakdown.map((row, index) => ({
            label: row.name,
            value: row.count,
            color: DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length],
          }))
        : orgCounts.departmentBreakdown.length > 0
          ? orgCounts.departmentBreakdown.map((row, index) => ({
              label: row.name,
              value: Math.max(1, Math.round(totalEmployees * (0.12 + index * 0.04))),
              color: DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length],
            }))
          : [
            { label: 'Engineering', value: 412, color: '#3b82f6' },
            { label: 'Marketing', value: 156, color: '#22c55e' },
            { label: 'Support', value: 142, color: '#ef4444' },
            { label: 'Sales', value: 218, color: '#60a5fa' },
            { label: 'Ops', value: 184, color: '#f59e0b' },
          ];

    const departmentTotal = departmentSlices.reduce((sum, slice) => sum + slice.value, 0);

    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const presentSeries = [1195, 1201, 1198, 1205, 1188, 980, 850];
    const absentSeries = [42, 38, 40, 37, 45, 52, 48];
    const attendanceTrend = weekDays.map((label, index) => ({
      label,
      present: presentSeries[index] ?? presentToday,
      absent: absentSeries[index] ?? absentToday,
    }));

    const growthMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
    const growthValues = [1150, 1168, 1185, 1198, 1210, 1225, 1240, 1270, 1304];
    const employeeGrowth = growthMonths.map((label, index) => ({
      label,
      value: growthValues[index] ?? 1150 + index * 18,
    }));

    return {
      greeting: {
        firstName,
        message: greetingMessage(firstName, now),
        period: greetingPeriod(now),
        date: now.toISOString(),
      },
      company: company ?? { id: null, name: 'Zenith Enterprises' },
      previewMode: true,
      kpis: [
        {
          key: 'total_employees',
          label: 'Total Employees',
          value: totalEmployees,
          trend: { value: '+12', direction: 'up' as const, positive: true },
          icon: 'groups',
          tone: 'primary',
        },
        {
          key: 'present_today',
          label: 'Present Today',
          value: presentToday,
          trend: { value: '89%', direction: 'up' as const, positive: true },
          icon: 'how_to_reg',
          tone: 'success',
        },
        {
          key: 'absent',
          label: 'Absent',
          value: absentToday,
          trend: { value: '-6', direction: 'down' as const, positive: true },
          icon: 'person_off',
          tone: 'danger',
        },
        {
          key: 'late',
          label: 'Late',
          value: lateToday,
          trend: { value: '+4', direction: 'up' as const, positive: false },
          icon: 'schedule',
          tone: 'warning',
        },
        {
          key: 'open_positions',
          label: 'Open Positions',
          value: 17,
          trend: { value: '+3', direction: 'up' as const, positive: true },
          icon: 'work_outline',
          tone: 'info',
        },
        {
          key: 'pending_leave',
          label: 'Pending Leave',
          value: 9,
          trend: { value: '-2', direction: 'down' as const, positive: true },
          icon: 'event_available',
          tone: 'warning',
        },
        {
          key: 'payroll_status',
          label: 'Payroll Status',
          value: 'Ready',
          trend: {
            value: now.toLocaleString('en-US', { month: 'short' }),
            direction: 'neutral' as const,
            positive: true,
          },
          icon: 'payments',
          tone: 'success',
        },
        {
          key: 'performance_score',
          label: 'Perf. Score',
          value: 4.3,
          trend: { value: '+0.2', direction: 'up' as const, positive: true },
          icon: 'grade',
          tone: 'secondary',
        },
      ],
      aiInsights: {
        title: 'AI Insights for this week',
        live: true,
        items: [
          {
            prefix: 'Attendance dropped ',
            highlight: '6%',
            suffix: ' this week — highest impact in Support team.',
          },
          {
            prefix: 'Marketing has the highest overtime — ',
            highlight: '142 hrs',
            suffix: ' above baseline.',
          },
          {
            prefix: '',
            highlight: '3 employees',
            suffix: ' flagged as at-risk of leaving (engagement + tenure signals).',
          },
          {
            prefix: `${now.toLocaleString('en-US', { month: 'long' })} payroll is ready to process — `,
            highlight: `${totalEmployees.toLocaleString('en-US')} employees, $4.82M total`,
            suffix: '.',
          },
        ],
        ctaLabel: 'Ask Nova for details',
        ctaRoute: '/ai',
      },
      attendanceTrend: {
        period: 'Last 7 days',
        series: attendanceTrend,
      },
      departmentDistribution: {
        total: departmentTotal,
        slices: departmentSlices,
      },
      hiringFunnel: {
        period: 'Q4 pipeline',
        stages: [
          { label: 'Applied', value: 520 },
          { label: 'Screening', value: 340 },
          { label: 'Interview', value: 210 },
          { label: 'Offer', value: 85 },
          { label: 'Hired', value: 42 },
        ],
      },
      employeeGrowth: {
        period: 'YTD',
        points: employeeGrowth,
      },
      stats: {
        totalUsers: await this.repo.countUsers(),
        activeUsers,
        activeSessions,
        departments: orgCounts.departments,
        teams: orgCounts.teams,
      },
      modules: {
        organization: true,
        employees: true,
        attendance: true,
        leave: true,
        payroll: false,
        recruitment: false,
        performance: false,
        ai: false,
      },
    };
  }

  async getActivity(limit = 12) {
    const rows = await this.repo.recentAuditLogs(Math.min(Math.max(limit, 1), 50));
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
