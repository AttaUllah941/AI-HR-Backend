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

  attendanceByStatus(companyId: string, from: Date, to: Date, departmentId?: string) {
    return prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        companyId,
        ...notDeleted,
        date: { gte: from, lte: to },
        ...(departmentId
          ? { employee: { departmentId, deletedAt: null } }
          : {}),
      },
      _count: { _all: true },
      _sum: { workMinutes: true, overtimeMinutes: true },
    });
  }

  attendanceDailyTrend(companyId: string, from: Date, to: Date, departmentId?: string) {
    return prisma.attendanceRecord.groupBy({
      by: ['date', 'status'],
      where: {
        companyId,
        ...notDeleted,
        date: { gte: from, lte: to },
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

  payrollRunStatusCounts(companyId: string, year: number) {
    return prisma.payrollRun.groupBy({
      by: ['status'],
      where: { companyId, ...notDeleted, year },
      _count: { _all: true },
    });
  }

  payrollMonthRuns(companyId: string, year: number) {
    return prisma.payrollRun.findMany({
      where: { companyId, ...notDeleted, year },
      orderBy: [{ month: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        month: true,
        status: true,
        title: true,
        entries: {
          select: {
            grossPay: true,
            netPay: true,
            totalTax: true,
            totalDeductions: true,
          },
        },
      },
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

  headcountTrend(companyId: string, months = 6) {
    const now = new Date();
    const points: Array<{ year: number; month: number; from: Date; to: Date }> = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      const from = new Date(Date.UTC(year, month - 1, 1));
      const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      points.push({ year, month, from, to });
    }
    return Promise.all(
      points.map(async (p) => ({
        year: p.year,
        month: p.month,
        hired: await prisma.employee.count({
          where: {
            companyId,
            ...notDeleted,
            joinDate: { gte: p.from, lte: p.to },
          },
        }),
        active: await prisma.employee.count({
          where: {
            companyId,
            ...notDeleted,
            status: 'ACTIVE',
            OR: [{ joinDate: null }, { joinDate: { lte: p.to } }],
            AND: [
              {
                OR: [{ exitDate: null }, { exitDate: { gt: p.to } }],
              },
            ],
          },
        }),
      })),
    );
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
