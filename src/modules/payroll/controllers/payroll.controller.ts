import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { PayrollService } from '../services/payroll.service.js';
import {
  createPayrollEntrySchema,
  payrollListQuerySchema,
  payrollPeriodQuerySchema,
  runPayrollSchema,
  updatePayrollEntrySchema,
} from '../validators/payroll.validators.js';

export class PayrollController {
  constructor(private readonly service = new PayrollService()) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const query = payrollPeriodQuerySchema.parse(req.query);
    const data = await this.service.summary(req.user!.id, query);
    res.json(successResponse(data, 'Payroll summary'));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = payrollListQuerySchema.parse(req.query);
    const data = await this.service.list(req.user!.id, query);
    res.json(successResponse(data, 'Payroll entries'));
  };

  exportCsv = async (req: Request, res: Response): Promise<void> => {
    const query = payrollListQuerySchema.parse(req.query);
    const csv = await this.service.exportCsv(req.user!.id, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payroll-${query.year}-${String(query.month).padStart(2, '0')}.csv"`,
    );
    res.status(200).send(csv);
  };

  createEntry = async (req: Request, res: Response): Promise<void> => {
    const input = createPayrollEntrySchema.parse(req.body);
    const data = await this.service.createEntry(req.user!.id, input);
    res.status(201).json(successResponse(data, 'Payroll entry saved'));
  };

  updateEntry = async (req: Request, res: Response): Promise<void> => {
    const input = updatePayrollEntrySchema.parse(req.body);
    const data = await this.service.updateEntry(req.user!.id, String(req.params.id), input);
    res.json(successResponse(data, 'Payroll entry updated'));
  };

  removeEntry = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.removeEntry(req.user!.id, String(req.params.id));
    res.json(successResponse(data, 'Payroll entry deleted'));
  };

  runPayroll = async (req: Request, res: Response): Promise<void> => {
    const input = runPayrollSchema.parse(req.body);
    const data = await this.service.runPayroll(req.user!.id, input);
    res.json(successResponse(data, 'Payroll processed'));
  };
}
