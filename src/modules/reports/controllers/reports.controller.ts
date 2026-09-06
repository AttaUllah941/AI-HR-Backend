import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { ReportsService } from '../services/reports.service.js';
import type {
  ExportReportInput,
  ReportQueryInput,
  ReportTypeValue,
} from '../validators/reports.validators.js';

export class ReportsController {
  constructor(private readonly service = new ReportsService()) {}

  private actor(req: Request) {
    return { id: req.user!.id, permissions: req.user!.permissions };
  }

  private query(req: Request): ReportQueryInput {
    const q = req.query as Record<string, string | undefined>;
    return {
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      year: q.year ? Number(q.year) : undefined,
      month: q.month ? Number(q.month) : undefined,
      departmentId: q.departmentId,
      employeeId: q.employeeId,
      jobOpeningId: q.jobOpeningId,
    };
  }

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getSummary(this.actor(req));
    res.json(successResponse(data, 'Reports summary'));
  };

  attendance = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getAttendanceReport(this.actor(req), this.query(req));
    res.json(successResponse(data, 'Attendance report'));
  };

  leave = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getLeaveReport(this.actor(req), this.query(req));
    res.json(successResponse(data, 'Leave report'));
  };

  payroll = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getPayrollReport(this.actor(req), this.query(req));
    res.json(successResponse(data, 'Payroll report'));
  };

  recruitment = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getRecruitmentReport(this.actor(req), this.query(req));
    res.json(successResponse(data, 'Recruitment report'));
  };

  performance = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getPerformanceReport(this.actor(req), this.query(req));
    res.json(successResponse(data, 'Performance report'));
  };

  employees = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getEmployeesReport(this.actor(req), this.query(req));
    res.json(successResponse(data, 'Employees report'));
  };

  listExports = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listExports(this.actor(req));
    res.json(successResponse(data, 'Report exports'));
  };

  exportReport = async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Partial<ExportReportInput>;
    const q = req.query as Record<string, string | undefined>;
    const reportType = (body.reportType ?? q.reportType) as ReportTypeValue | undefined;
    if (!reportType) {
      res.status(400).json({
        success: false,
        message: 'reportType is required',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const input: ExportReportInput = {
      reportType,
      format: (body.format ?? q.format ?? 'CSV') as ExportReportInput['format'],
      dateFrom: body.dateFrom ?? q.dateFrom,
      dateTo: body.dateTo ?? q.dateTo,
      year: body.year ?? (q.year ? Number(q.year) : undefined),
      month: body.month ?? (q.month ? Number(q.month) : undefined),
      departmentId: body.departmentId ?? q.departmentId,
      employeeId: body.employeeId ?? q.employeeId,
      jobOpeningId: body.jobOpeningId ?? q.jobOpeningId,
    };

    const file = await this.service.exportReport(this.actor(req), input);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.body);
  };
}