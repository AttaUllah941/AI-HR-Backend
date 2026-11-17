import type { Prisma, ReportExportFormat, ReportType } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const notDeleted = { deletedAt: null };

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

export class ReportsRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  parseRange(dateFrom?: string, dateTo?: string) {
    const to = dateTo ? startOfUtcDay(new Date(dateTo)) : startOfUtcDay(new Date());
    const from = dateFrom
      ? startOfUtcDay(new Date(dateFrom))
      : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - 29));
    return { from, to, toEnd: endOfUtcDay(to) };
  }

  // —— Overview KPIs ——

  async overviewCounts(companyId: string) {
    const today = startOfUtcDay(new Date());
    const [
      employees,
      activeEmployees,
      departments,
      attendanceToday,
      pendingLeave,
      openJobs,
      candidates,
      activeGoals,
      openReviews,
      payrollRunsYear,
    ] = await Promise.all([
      prisma.employee.count({ where: { companyId, ...notDeleted } }),
      prisma.employee.count({ where: { companyId, ...notDeleted, status: 'ACTIVE' } }),
      prisma.department.count({ where: { companyId, ...notDeleted } }),
      prisma.attendanceRecord.count({
        where: { companyId, ...notDeleted, date: { gte: today } },
      }),
      prisma.leaveRequest.count({
        where: { companyId, ...notDeleted, status: 'PENDING' },
      }),
      prisma.jobOpening.count({
        where: { companyId, ...notDeleted, status: 'OPEN' },
      }),
      prisma.candidate.count({ where: { companyId, ...notDeleted } }),
      prisma.performanceGoal.count({
        where: { companyId, ...notDeleted, status: 'ACTIVE' },
      }),
      prisma.performanceReview.count({
        where: {
          companyId,
          ...notDeleted,
          status: { in: ['DRAFT', 'IN_PROGRESS', 'SUBMITTED'] },
        },
      }),
      prisma.payrollRun.count({
        where: {
          companyId,
          ...notDeleted,
          year: new Date().getUTCFullYear(),
        },
      }),
    ]);

    return {
      employees,
      activeEmployees,
      departments,
      attendanceToday,
      pendingLeave,
      openJobs,
      candidates,
      activeGoals,
      openReviews,
      payrollRunsYear,
    };
  }

  // —— Attendance ——

  attendanceByStatus(companyId: string, from: Date, toEnd: Date, departmentId?: string) {
    return prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        companyId,
        ...notDeleted,
        date: { gte: from, lte: toEnd },
        ...(departmentId
          ? { employee: { departmentId, deletedAt: null } }
          : {}),
      },
      _count: { _all: true },
      _sum: { workMinutes: true, overtimeMinutes: true },
    });
  }

  attendanceDailyTrend(companyId: string, from: Date, toEnd: Date, departmentId?: string) {
    return prisma.attendanceRecord.groupBy({
      by: ['date', 'status'],
      where: {
        companyId,
        ...notDeleted,
        date: { gte: from, lte: toEnd },
        ...(departmentId
          ? { employee: { departmentId, deletedAt: null } }
          : {}),
      },
      _count: { _all: true },
      orderBy: { date: 'asc' },
    });
  }

  // —— Leave ——

  leaveByStatus(companyId: string, year: number, employeeId?: string) {
    return prisma.leaveRequest.groupBy({
      by: ['status'],
      where: {
        companyId,
        ...notDeleted,
        startDate: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
        ...(employeeId ? { employeeId } : {}),
      },
      _count: { _all: true },
      _sum: { days: true },
    });
  }

  leaveByType(companyId: string, year: number, employeeId?: string) {
    return prisma.leaveRequest.groupBy({
      by: ['leaveTypeId'],
      where: {
        companyId,
        ...notDeleted,
        status: { in: ['APPROVED', 'PENDING'] },
        startDate: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
        ...(employeeId ? { employeeId } : {}),
      },
      _count: { _all: true },
      _sum: { days: true },
    });
  }

  leaveTypesByIds(companyId: string, ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return prisma.leaveType.findMany({
      where: { companyId, id: { in: ids }, ...notDeleted },
      select: { id: true, name: true, code: true },
    });
  }

  // —— Payroll ——

  payrollRunStatusCounts(companyId: string, year: number, month?: number) {
    return prisma.payrollRun.groupBy({
      by: ['status'],
      where: {
        companyId,
        ...notDeleted,
        year,
        ...(month ? { month } : {}),
      },
      _count: { _all: true },
    });
  }

  payrollMonthRuns(companyId: string, year: number, month?: number) {
    return prisma.payrollRun
      .findMany({
        where: {
          companyId,
          ...notDeleted,
          year,
          ...(month ? { month } : {}),
        },
        orderBy: [{ month: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          month: true,
          status: true,
          title: true,
        },
      })
      .then(async (runs) => {
        if (!runs.length) return [];
        const sums = await prisma.payrollEntry.groupBy({
          by: ['payrollRunId'],
          where: { payrollRunId: { in: runs.map((r) => r.id) } },
          _sum: {
            grossPay: true,
            netPay: true,
            totalTax: true,
            totalDeductions: true,
          },
          _count: { _all: true },
        });
        const byRun = new Map(sums.map((row) => [row.payrollRunId, row]));
        return runs.map((run) => {
          const agg = byRun.get(run.id);
          return {
            ...run,
            entryCount: agg?._count._all ?? 0,
            grossPay: agg?._sum.grossPay ?? 0,
            netPay: agg?._sum.netPay ?? 0,
            totalTax: agg?._sum.totalTax ?? 0,
            totalDeductions: agg?._sum.totalDeductions ?? 0,
          };
        });
      });
  }

  // —— Recruitment ——

  jobStatusCounts(companyId: string) {
    return prisma.jobOpening.groupBy({
      by: ['status'],
      where: { companyId, ...notDeleted },
      _count: { _all: true },
    });
  }

  applicationStatusCounts(companyId: string, jobOpeningId?: string) {
    return prisma.jobApplication.groupBy({
      by: ['status'],
      where: {
        companyId,
        ...notDeleted,
        ...(jobOpeningId ? { jobOpeningId } : {}),
      },
      _count: { _all: true },
    });
  }

  interviewStatusCounts(companyId: string) {
    return prisma.interview.groupBy({
      by: ['status'],
      where: { companyId, ...notDeleted },
      _count: { _all: true },
    });
  }

  offerStatusCounts(companyId: string) {
    return prisma.jobOffer.groupBy({
      by: ['status'],
      where: { companyId, ...notDeleted },
      _count: { _all: true },
    });
  }

  // —— Performance ——

  goalStatusCounts(companyId: string, year: number, employeeId?: string) {
    return prisma.performanceGoal.groupBy({
      by: ['status'],
      where: {
        companyId,
        ...notDeleted,
        ...(employeeId ? { employeeId } : {}),
        OR: [
          {
            startDate: {
              gte: new Date(Date.UTC(year, 0, 1)),
              lt: new Date(Date.UTC(year + 1, 0, 1)),
            },
          },
          {
            dueDate: {
              gte: new Date(Date.UTC(year, 0, 1)),
              lt: new Date(Date.UTC(year + 1, 0, 1)),
            },
          },
          { AND: [{ startDate: null }, { dueDate: null }] },
        ],
      },
      _count: { _all: true },
    });
  }

  reviewStatusCounts(companyId: string, year: number, employeeId?: string) {
    return prisma.performanceReview.groupBy({
      by: ['status'],
      where: {
        companyId,
        ...notDeleted,
        ...(employeeId ? { employeeId } : {}),
        cycle: { year },
      },
      _count: { _all: true },
    });
  }

  promotionStatusCounts(companyId: string, employeeId?: string) {
    return prisma.promotionRequest.groupBy({
      by: ['status'],
      where: {
        companyId,
        ...notDeleted,
        ...(employeeId ? { employeeId } : {}),
      },
      _count: { _all: true },
    });
  }

  avgReviewRating(companyId: string, year: number, employeeId?: string) {
    return prisma.performanceReview.aggregate({
      where: {
        companyId,
        ...notDeleted,
        ...(employeeId ? { employeeId } : {}),
        cycle: { year },
        overallRating: { not: null },
      },
      _avg: { overallRating: true },
      _count: { _all: true },
    });
  }

  // —— Employees ——

  employeeStatusCounts(companyId: string, departmentId?: string) {
    return prisma.employee.groupBy({
      by: ['status'],
      where: {
        companyId,
        ...notDeleted,
        ...(departmentId ? { departmentId } : {}),
      },
      _count: { _all: true },
    });
  }

  employeeTypeCounts(companyId: string, departmentId?: string) {
    return prisma.employee.groupBy({
      by: ['employmentType'],
      where: {
        companyId,
        ...notDeleted,
        ...(departmentId ? { departmentId } : {}),
      },
      _count: { _all: true },
    });
  }

  employeesByDepartment(companyId: string) {
    return prisma.employee.groupBy({
      by: ['departmentId'],
      where: { companyId, ...notDeleted, departmentId: { not: null } },
      _count: { _all: true },
    });
  }

  departmentsByIds(companyId: string, ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return prisma.department.findMany({
      where: { companyId, id: { in: ids }, ...notDeleted },
      select: { id: true, name: true, code: true },
    });
  }

  /**
   * Hires and active headcount at the end of each of the last `months` months, in ONE query
   * (generate_series x employees with FILTER aggregates) instead of 2 counts per month.
   * Month boundaries are UTC, matching how dates are stored.
   */
  async headcountTrend(companyId: string, months = 6) {
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const rows = await prisma.$queryRaw<Array<{ month: Date; hired: number; active: number }>>`
      SELECT
        m.month AS "month",
        (COUNT(*) FILTER (
          WHERE e."joinDate" >= m.month AND e."joinDate" < m.month + interval '1 month'
        ))::int AS "hired",
        (COUNT(*) FILTER (
          WHERE e.status = 'ACTIVE'
            AND (e."joinDate" IS NULL OR e."joinDate" < m.month + interval '1 month')
            AND (e."exitDate" IS NULL OR e."exitDate" >= m.month + interval '1 month')
        ))::int AS "active"
      FROM generate_series(${iso(first)}::timestamp, ${iso(last)}::timestamp, interval '1 month') AS m(month)
      LEFT JOIN employees e
        ON e."companyId" = ${companyId} AND e."deletedAt" IS NULL
      GROUP BY m.month
      ORDER BY m.month
    `;

    return rows.map((row) => ({
      year: row.month.getUTCFullYear(),
      month: row.month.getUTCMonth() + 1,
      hired: row.hired,
      active: row.active,
    }));
  }

  // —— Export logs ——

  createExportLog(data: {
    companyId: string;
    userId?: string | null;
    reportType: ReportType;
    format: ReportExportFormat;
    filters?: Prisma.InputJsonValue;
    rowCount?: number | null;
    fileName?: string | null;
  }) {
    return prisma.reportExportLog.create({
      data: {
        companyId: data.companyId,
        userId: data.userId ?? null,
        reportType: data.reportType,
        format: data.format,
        filters: data.filters ?? undefined,
        rowCount: data.rowCount ?? null,
        fileName: data.fileName ?? null,
      },
    });
  }

  listExportLogs(companyId: string, take = 20) {
    return prisma.reportExportLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        reportType: true,
        format: true,
        filters: true,
        rowCount: true,
        fileName: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }
}
