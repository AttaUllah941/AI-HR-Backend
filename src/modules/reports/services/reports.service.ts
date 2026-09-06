import type { ReportType } from '@prisma/client';
import { ForbiddenError, ValidationError } from '../../../utils/app-error.js';
import { toCsv, toSimplePdf } from '../utils/export-formatters.js';
import { ReportsRepository } from '../repositories/reports.repository.js';
import type {
  ExportReportInput,
  ReportExportFormatValue,
  ReportQueryInput,
  ReportTypeValue,
} from '../validators/reports.validators.js';

type AuthActor = { id: string; permissions: string[] };

type ChartPoint = { label: string; value: number };

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function countsByKey(
  rows: Array<{ status?: string; employmentType?: string; _count: { _all: number } }>,
  key: 'status' | 'employmentType' = 'status',
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = (row[key] as string | undefined) ?? 'UNKNOWN';
    out[k] = row._count._all;
  }
  return out;
}

function toChart(map: Record<string, number>): ChartPoint[] {
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function monthLabel(month: number): string {
  return new Date(Date.UTC(2024, month - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}

export class ReportsService {
  constructor(private readonly repo = new ReportsRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('Your account is not linked to a company');
    }
    return user.companyId;
  }

  private assertCanView(actor: AuthActor) {
    if (!actor.permissions.includes('reports:view')) {
      throw new ForbiddenError('reports:view permission required');
    }
  }

  private requireExport(actor: AuthActor) {
    if (!actor.permissions.includes('reports:export')) {
      throw new ForbiddenError('reports:export permission required');
    }
  }

  async getSummary(actor: AuthActor) {
    this.assertCanView(actor);
    const companyId = await this.requireCompanyId(actor.id);
    const year = new Date().getUTCFullYear();
    const { from, to } = this.repo.parseRange();

    const [kpis, attendanceRows, leaveRows, payrollStatus, jobs, apps, recentExports] =
      await Promise.all([
        this.repo.overviewCounts(companyId),
        this.repo.attendanceByStatus(companyId, from, to),
        this.repo.leaveByStatus(companyId, year),
        this.repo.payrollRunStatusCounts(companyId, year),
        this.repo.jobStatusCounts(companyId),
        this.repo.applicationStatusCounts(companyId),
        this.repo.listExportLogs(companyId, 8),
      ]);

    const attendanceByStatus = countsByKey(attendanceRows);
    const leaveByStatus = countsByKey(leaveRows);
    const payrollByStatus = countsByKey(payrollStatus);
    const jobsByStatus = countsByKey(jobs);
    const applicationsByStatus = countsByKey(apps);

    return {
      generatedAt: new Date().toISOString(),
      range: { dateFrom: from.toISOString(), dateTo: to.toISOString(), year },
      kpis,
      charts: {
        attendanceByStatus: toChart(attendanceByStatus),
        leaveByStatus: toChart(leaveByStatus),
        payrollByStatus: toChart(payrollByStatus),
        jobsByStatus: toChart(jobsByStatus),
        applicationsByStatus: toChart(applicationsByStatus),
      },
      recentExports,
      modules: [
        { key: 'ATTENDANCE', label: 'Attendance', path: 'attendance' },
        { key: 'LEAVE', label: 'Leave', path: 'leave' },
        { key: 'PAYROLL', label: 'Payroll', path: 'payroll' },
        { key: 'RECRUITMENT', label: 'Recruitment', path: 'recruitment' },
        { key: 'PERFORMANCE', label: 'Performance', path: 'performance' },
        { key: 'EMPLOYEES', label: 'Employees', path: 'employees' },
      ],
    };
  }

  async getAttendanceReport(actor: AuthActor, query: ReportQueryInput = {}) {
    this.assertCanView(actor);
    const companyId = await this.requireCompanyId(actor.id);
    const { from, to } = this.repo.parseRange(query.dateFrom, query.dateTo);
    const departmentId = query.departmentId;

    const [byStatus, daily] = await Promise.all([
      this.repo.attendanceByStatus(companyId, from, to, departmentId),
      this.repo.attendanceDailyTrend(companyId, from, to, departmentId),
    ]);

    const statusMap = countsByKey(byStatus);
    const totals = {
      records: byStatus.reduce((s, r) => s + r._count._all, 0),
      workMinutes: byStatus.reduce((s, r) => s + (r._sum.workMinutes ?? 0), 0),
      overtimeMinutes: byStatus.reduce((s, r) => s + (r._sum.overtimeMinutes ?? 0), 0),
    };

    const trendMap = new Map<string, Record<string, number>>();
    for (const row of daily) {
      const key = row.date.toISOString().slice(0, 10);
      const bucket = trendMap.get(key) ?? {};
      bucket[row.status] = row._count._all;
      trendMap.set(key, bucket);
    }
    const dailyTrend = [...trendMap.entries()].map(([date, statuses]) => ({
      date,
      ...statuses,
      total: Object.values(statuses).reduce((a, b) => a + b, 0),
    }));

    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      departmentId: departmentId ?? null,
      totals,
      byStatus: statusMap,
      charts: {
        byStatus: toChart(statusMap),
        dailyPresent: dailyTrend.map((d) => ({
          label: d.date.slice(5),
          value: Number((d as Record<string, unknown>)['PRESENT'] ?? 0) || 0,
        })),
      },
      dailyTrend,
      rows: byStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
        workMinutes: row._sum.workMinutes ?? 0,
        overtimeMinutes: row._sum.overtimeMinutes ?? 0,
      })),
    };
  }

  async getLeaveReport(actor: AuthActor, query: ReportQueryInput = {}) {
    this.assertCanView(actor);
    const companyId = await this.requireCompanyId(actor.id);
    const year = query.year ?? new Date().getUTCFullYear();
    const employeeId = query.employeeId;

    const [byStatus, byType] = await Promise.all([
      this.repo.leaveByStatus(companyId, year, employeeId),
      this.repo.leaveByType(companyId, year, employeeId),
    ]);
    const types = await this.repo.leaveTypesByIds(
      companyId,
      byType.map((r) => r.leaveTypeId),
    );
    const typeName = new Map(types.map((t) => [t.id, t.name]));

    const statusMap = countsByKey(byStatus);
    const typeChart: ChartPoint[] = byType.map((row) => ({
      label: typeName.get(row.leaveTypeId) ?? row.leaveTypeId,
      value: row._sum.days ?? row._count._all,
    }));

    return {
      year,
      employeeId: employeeId ?? null,
      byStatus: statusMap,
      charts: {
        byStatus: toChart(statusMap),
        byType: typeChart.sort((a, b) => b.value - a.value),
      },
      rows: byStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
        days: row._sum.days ?? 0,
      })),
      byLeaveType: byType.map((row) => ({
        leaveTypeId: row.leaveTypeId,
        leaveTypeName: typeName.get(row.leaveTypeId) ?? 'Unknown',
        count: row._count._all,
        days: row._sum.days ?? 0,
      })),
    };
  }

  async getPayrollReport(actor: AuthActor, query: ReportQueryInput = {}) {
    this.assertCanView(actor);
    const companyId = await this.requireCompanyId(actor.id);
    const year = query.year ?? new Date().getUTCFullYear();

    const [statusRows, monthRuns] = await Promise.all([
      this.repo.payrollRunStatusCounts(companyId, year),
      this.repo.payrollMonthRuns(companyId, year),
    ]);

    const byMonth = monthRuns.map((run) => ({
      month: run.month,
      status: run.status,
      title: run.title,
      entryCount: run.entries.length,
      grossPay: roundMoney(run.entries.reduce((s, e) => s + e.grossPay, 0)),
      netPay: roundMoney(run.entries.reduce((s, e) => s + e.netPay, 0)),
      totalTax: roundMoney(run.entries.reduce((s, e) => s + e.totalTax, 0)),
      totalDeductions: roundMoney(run.entries.reduce((s, e) => s + e.totalDeductions, 0)),
    }));

    const statusMap = countsByKey(statusRows);
    return {
      year,
      byStatus: statusMap,
      byMonth,
      charts: {
        byStatus: toChart(statusMap),
        netByMonth: byMonth.map((m) => ({
          label: monthLabel(m.month),
          value: m.netPay,
        })),
        grossByMonth: byMonth.map((m) => ({
          label: monthLabel(m.month),
          value: m.grossPay,
        })),
      },
      totals: {
        grossPay: roundMoney(byMonth.reduce((s, m) => s + m.grossPay, 0)),
        netPay: roundMoney(byMonth.reduce((s, m) => s + m.netPay, 0)),
        totalTax: roundMoney(byMonth.reduce((s, m) => s + m.totalTax, 0)),
        runs: monthRuns.length,
      },
    };
  }

  async getRecruitmentReport(actor: AuthActor, query: ReportQueryInput = {}) {
    this.assertCanView(actor);
    const companyId = await this.requireCompanyId(actor.id);
    const jobOpeningId = query.jobOpeningId;

    const [jobRows, appRows, interviewRows, offerRows] = await Promise.all([
      this.repo.jobStatusCounts(companyId),
      this.repo.applicationStatusCounts(companyId, jobOpeningId),
      this.repo.interviewStatusCounts(companyId),
      this.repo.offerStatusCounts(companyId),
    ]);

    const jobsByStatus = countsByKey(jobRows);
    const applicationsByStatus = countsByKey(appRows);
    const interviewsByStatus = countsByKey(interviewRows);
    const offersByStatus = countsByKey(offerRows);

    return {
      jobOpeningId: jobOpeningId ?? null,
      jobsByStatus,
      applicationsByStatus,
      interviewsByStatus,
      offersByStatus,
      charts: {
        jobsByStatus: toChart(jobsByStatus),
        applicationsByStatus: toChart(applicationsByStatus),
        interviewsByStatus: toChart(interviewsByStatus),
        offersByStatus: toChart(offersByStatus),
      },
    };
  }

  async getPerformanceReport(actor: AuthActor, query: ReportQueryInput = {}) {
    this.assertCanView(actor);
    const companyId = await this.requireCompanyId(actor.id);
    const year = query.year ?? new Date().getUTCFullYear();
    const employeeId = query.employeeId;

    const [goalRows, reviewRows, promotionRows, ratingAgg] = await Promise.all([
      this.repo.goalStatusCounts(companyId, year, employeeId),
      this.repo.reviewStatusCounts(companyId, year, employeeId),
      this.repo.promotionStatusCounts(companyId, employeeId),
      this.repo.avgReviewRating(companyId, year, employeeId),
    ]);

    const goalsByStatus = countsByKey(goalRows);
    const reviewsByStatus = countsByKey(reviewRows);
    const promotionsByStatus = countsByKey(promotionRows);

    return {
      year,
      employeeId: employeeId ?? null,
      goalsByStatus,
      reviewsByStatus,
      promotionsByStatus,
      averageOverallRating: ratingAgg._avg.overallRating ?? null,
      ratedReviewCount: ratingAgg._count._all,
      charts: {
        goalsByStatus: toChart(goalsByStatus),
        reviewsByStatus: toChart(reviewsByStatus),
        promotionsByStatus: toChart(promotionsByStatus),
      },
    };
  }

  async getEmployeesReport(actor: AuthActor, query: ReportQueryInput = {}) {
    this.assertCanView(actor);
    const companyId = await this.requireCompanyId(actor.id);
    const departmentId = query.departmentId;

    const [statusRows, typeRows, deptRows, trend] = await Promise.all([
      this.repo.employeeStatusCounts(companyId, departmentId),
      this.repo.employeeTypeCounts(companyId, departmentId),
      this.repo.employeesByDepartment(companyId),
      this.repo.headcountTrend(companyId, 6),
    ]);

    const deptIds = deptRows
      .map((r) => r.departmentId)
      .filter((id): id is string => Boolean(id));
    const departments = await this.repo.departmentsByIds(companyId, deptIds);
    const deptName = new Map(departments.map((d) => [d.id, d.name]));

    const byStatus = countsByKey(statusRows);
    const byType = countsByKey(typeRows, 'employmentType');
    const byDepartment = deptRows.map((row) => ({
      departmentId: row.departmentId,
      departmentName: row.departmentId
        ? (deptName.get(row.departmentId) ?? 'Unknown')
        : 'Unassigned',
      count: row._count._all,
    }));

    return {
      departmentId: departmentId ?? null,
      byStatus,
      byEmploymentType: byType,
      byDepartment,
      headcountTrend: trend,
      charts: {
        byStatus: toChart(byStatus),
        byEmploymentType: toChart(byType),
        byDepartment: byDepartment
          .map((d) => ({ label: d.departmentName, value: d.count }))
          .sort((a, b) => b.value - a.value),
        activeHeadcount: trend.map((t) => ({
          label: `${monthLabel(t.month)} ${String(t.year).slice(2)}`,
          value: t.active,
        })),
      },
      totals: {
        employees: Object.values(byStatus).reduce((a, b) => a + b, 0),
        active: byStatus.ACTIVE ?? 0,
      },
    };
  }

  async getReportByType(
    actor: AuthActor,
    reportType: ReportTypeValue,
    query: ReportQueryInput = {},
  ) {
    switch (reportType) {
      case 'OVERVIEW':
        return this.getSummary(actor);
      case 'ATTENDANCE':
        return this.getAttendanceReport(actor, query);
      case 'LEAVE':
        return this.getLeaveReport(actor, query);
      case 'PAYROLL':
        return this.getPayrollReport(actor, query);
      case 'RECRUITMENT':
        return this.getRecruitmentReport(actor, query);
      case 'PERFORMANCE':
        return this.getPerformanceReport(actor, query);
      case 'EMPLOYEES':
        return this.getEmployeesReport(actor, query);
      default:
        throw new ValidationError('Invalid report type');
    }
  }

  async listExports(actor: AuthActor) {
    this.assertCanView(actor);
    const companyId = await this.requireCompanyId(actor.id);
    const items = await this.repo.listExportLogs(companyId, 50);
    return { items };
  }

  async exportReport(actor: AuthActor, input: ExportReportInput) {
    this.requireExport(actor);
    const companyId = await this.requireCompanyId(actor.id);
    const reportType = input.reportType as ReportType;
    const format = (input.format ?? 'CSV') as ReportExportFormatValue;

    const query: ReportQueryInput = {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      year: input.year,
      month: input.month,
      departmentId: input.departmentId,
      employeeId: input.employeeId,
      jobOpeningId: input.jobOpeningId,
    };

    const data = await this.getReportByType(actor, input.reportType, query);
    const stamp = new Date().toISOString().slice(0, 10);
    const baseName = `zenith-${input.reportType.toLowerCase()}-${stamp}`;

    if (format === 'JSON') {
      const body = JSON.stringify(data, null, 2);
      const fileName = `${baseName}.json`;
      await this.repo.createExportLog({
        companyId,
        userId: actor.id,
        reportType,
        format: 'JSON',
        filters: query as object,
        rowCount: 1,
        fileName,
      });
      return {
        fileName,
        contentType: 'application/json; charset=utf-8',
        body: Buffer.from(body, 'utf8'),
      };
    }

    const { headers, rows, lines } = this.flattenForExport(input.reportType, data);
    if (format === 'CSV') {
      const csv = toCsv(headers, rows);
      const fileName = `${baseName}.csv`;
      await this.repo.createExportLog({
        companyId,
        userId: actor.id,
        reportType,
        format: 'CSV',
        filters: query as object,
        rowCount: rows.length,
        fileName,
      });
      return {
        fileName,
        contentType: 'text/csv; charset=utf-8',
        body: Buffer.from(csv, 'utf8'),
      };
    }

    const pdf = toSimplePdf(`Zenith HR — ${input.reportType} Report`, lines);
    const fileName = `${baseName}.pdf`;
    await this.repo.createExportLog({
      companyId,
      userId: actor.id,
      reportType,
      format: 'PDF',
      filters: query as object,
      rowCount: rows.length,
      fileName,
    });
    return {
      fileName,
      contentType: 'application/pdf',
      body: pdf,
    };
  }

  private flattenForExport(
    reportType: ReportTypeValue,
    data: unknown,
  ): {
    headers: string[];
    rows: Array<Array<string | number | null | undefined>>;
    lines: string[];
  } {
    const obj = (data ?? {}) as Record<string, unknown>;
    const lines: string[] = [`Generated: ${new Date().toISOString()}`, `Type: ${reportType}`, ''];

    if (reportType === 'ATTENDANCE') {
      const rowsData = (obj['rows'] as Array<Record<string, unknown>>) ?? [];
      lines.push('Status breakdown:');
      for (const row of rowsData) {
        lines.push(
          `${row['status']}: count=${row['count']} workMin=${row['workMinutes']} otMin=${row['overtimeMinutes']}`,
        );
      }
      return {
        headers: ['status', 'count', 'workMinutes', 'overtimeMinutes'],
        rows: rowsData.map((r) => [
          String(r['status'] ?? ''),
          Number(r['count'] ?? 0),
          Number(r['workMinutes'] ?? 0),
          Number(r['overtimeMinutes'] ?? 0),
        ]),
        lines,
      };
    }

    if (reportType === 'LEAVE') {
      const rowsData = (obj['rows'] as Array<Record<string, unknown>>) ?? [];
      lines.push(`Year: ${obj['year']}`);
      for (const row of rowsData) {
        lines.push(`${row['status']}: ${row['count']} requests / ${row['days']} days`);
      }
      return {
        headers: ['status', 'count', 'days'],
        rows: rowsData.map((r) => [
          String(r['status'] ?? ''),
          Number(r['count'] ?? 0),
          Number(r['days'] ?? 0),
        ]),
        lines,
      };
    }

    if (reportType === 'PAYROLL') {
      const byMonth = (obj['byMonth'] as Array<Record<string, unknown>>) ?? [];
      lines.push(`Year: ${obj['year']}`);
      for (const row of byMonth) {
        lines.push(
          `M${row['month']} ${row['status']}: net=${row['netPay']} gross=${row['grossPay']}`,
        );
      }
      return {
        headers: [
          'month',
          'status',
          'title',
          'entryCount',
          'grossPay',
          'netPay',
          'totalTax',
          'totalDeductions',
        ],
        rows: byMonth.map((r) => [
          Number(r['month'] ?? 0),
          String(r['status'] ?? ''),
          String(r['title'] ?? ''),
          Number(r['entryCount'] ?? 0),
          Number(r['grossPay'] ?? 0),
          Number(r['netPay'] ?? 0),
          Number(r['totalTax'] ?? 0),
          Number(r['totalDeductions'] ?? 0),
        ]),
        lines,
      };
    }

    if (reportType === 'RECRUITMENT') {
      const apps = (obj['applicationsByStatus'] as Record<string, number>) ?? {};
      const headers = ['metric', 'status', 'count'];
      const rows: Array<Array<string | number>> = [];
      for (const [status, count] of Object.entries(apps)) {
        rows.push(['applications', status, count]);
        lines.push(`Application ${status}: ${count}`);
      }
      for (const [status, count] of Object.entries(
        (obj['jobsByStatus'] as Record<string, number>) ?? {},
      )) {
        rows.push(['jobs', status, count]);
      }
      return { headers, rows, lines };
    }

    if (reportType === 'PERFORMANCE') {
      const goals = (obj['goalsByStatus'] as Record<string, number>) ?? {};
      const rows: Array<Array<string | number>> = [];
      lines.push(`Year: ${obj['year']}`, `Avg rating: ${obj['averageOverallRating'] ?? 'n/a'}`);
      for (const [status, count] of Object.entries(goals)) {
        rows.push(['goals', status, count]);
        lines.push(`Goal ${status}: ${count}`);
      }
      return {
        headers: ['metric', 'status', 'count'],
        rows,
        lines,
      };
    }

    if (reportType === 'EMPLOYEES') {
      const byDept = (obj['byDepartment'] as Array<Record<string, unknown>>) ?? [];
      lines.push(`Total: ${(obj['totals'] as Record<string, number> | undefined)?.employees ?? 0}`);
      for (const row of byDept) {
        lines.push(`${row['departmentName']}: ${row['count']}`);
      }
      return {
        headers: ['departmentId', 'departmentName', 'count'],
        rows: byDept.map((r) => [
          String(r['departmentId'] ?? ''),
          String(r['departmentName'] ?? ''),
          Number(r['count'] ?? 0),
        ]),
        lines,
      };
    }

    // OVERVIEW fallback
    const kpis = (obj['kpis'] as Record<string, number>) ?? {};
    const rows = Object.entries(kpis).map(([k, v]) => [k, v] as Array<string | number>);
    for (const [k, v] of Object.entries(kpis)) {
      lines.push(`${k}: ${v}`);
    }
    return { headers: ['metric', 'value'], rows, lines };
  }
}
