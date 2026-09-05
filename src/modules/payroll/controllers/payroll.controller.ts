import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { PayrollService } from '../services/payroll.service.js';
import type {
  CreatePayrollRunInput,
  CreateSalaryComponentInput,
  CreateSalaryStructureInput,
  UpdatePayrollRunInput,
  UpdateSalaryComponentInput,
  UpdateSalaryStructureInput,
  UpdateTaxSettingInput,
} from '../validators/payroll.validators.js';

export class PayrollController {
  constructor(private readonly service = new PayrollService()) {}

  private actor(req: Request) {
    return { id: req.user!.id, permissions: req.user!.permissions };
  }

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.summary(
      this.actor(req),
      req.query.year as string | undefined,
    );
    res.json(successResponse(data, 'Payroll summary'));
  };

  mySummary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.mySummary(
      this.actor(req),
      req.query.year as string | undefined,
    );
    res.json(successResponse(data, 'My payroll summary'));
  };

  report = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.report(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Payroll report'));
  };

  listComponents = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listComponents(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Salary components'));
  };

  createComponent = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createComponent(
      this.actor(req),
      req.body as CreateSalaryComponentInput,
    );
    res.status(201).json(successResponse(data, 'Salary component created'));
  };

  updateComponent = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateComponent(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateSalaryComponentInput,
    );
    res.json(successResponse(data, 'Salary component updated'));
  };

  deleteComponent = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteComponent(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Salary component deleted'));
  };

  listStructures = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listStructures(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Salary structures'));
  };

  getStructure = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getStructure(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Salary structure'));
  };

  createStructure = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createStructure(
      this.actor(req),
      req.body as CreateSalaryStructureInput,
    );
    res.status(201).json(successResponse(data, 'Salary structure created'));
  };

  updateStructure = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateStructure(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateSalaryStructureInput,
    );
    res.json(successResponse(data, 'Salary structure updated'));
  };

  deleteStructure = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteStructure(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Salary structure deleted'));
  };

  getTax = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getTax(this.actor(req));
    res.json(successResponse(data, 'Tax settings'));
  };

  updateTax = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateTax(
      this.actor(req),
      req.body as UpdateTaxSettingInput,
    );
    res.json(successResponse(data, 'Tax settings updated'));
  };

  listRuns = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listRuns(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Payroll runs'));
  };

  getRun = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getRun(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Payroll run'));
  };

  createRun = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createRun(
      this.actor(req),
      req.body as CreatePayrollRunInput,
    );
    res.status(201).json(successResponse(data, 'Payroll run created'));
  };

  updateRun = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateRun(
      this.actor(req),
      req.params.id as string,
      req.body as UpdatePayrollRunInput,
    );
    res.json(successResponse(data, 'Payroll run updated'));
  };

  processRun = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.processRun(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Payroll run processed'));
  };

  approveRun = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.approveRun(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Payroll run approved'));
  };

  markRunPaid = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.markRunPaid(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Payroll run marked as paid'));
  };

  cancelRun = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.cancelRun(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Payroll run cancelled'));
  };

  listEntries = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listEntries(
      this.actor(req),
      req.params.id as string,
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Payroll entries'));
  };

  listPayslips = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listPayslips(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Payslips'));
  };

  getPayslip = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getPayslip(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Payslip'));
  };

  myPayslips = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.myPayslips(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'My payslips'));
  };
}
