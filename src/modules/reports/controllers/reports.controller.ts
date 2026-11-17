import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { ReportsService } from '../services/reports.service.js';
import type {
  ExportReportInput,
  ReportQueryInput,
} from '../validators/reports.validators.js';

export class ReportsController {
  constructor(private readonly service = new ReportsService()) {}

  private actor(req: Request) {
    return { id: req.user!.id, permissions: req.user!.permissions };
  }

  private query(req: Request): ReportQueryInput {
    return req.query as unknown as ReportQueryInput;
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
    await this.sendExport(req, res, req.body as ExportReportInput);
  };

  exportReportFromQuery = async (req: Request, res: Response): Promise<void> => {
    await this.sendExport(req, res, req.query as unknown as ExportReportInput);
  };

  private async sendExport(req: Request, res: Response, input: ExportReportInput): Promise<void> {
    const file = await this.service.exportReport(this.actor(req), input);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.body);
  }
}
