import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { EmployeeService } from '../services/employee.service.js';
import {
  createEmployeeSchema,
  employeeListQuerySchema,
  updateEmployeeSchema,
} from '../validators/employee.validators.js';

export class EmployeeController {
  constructor(private readonly service = new EmployeeService()) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = employeeListQuerySchema.parse(req.query);
    const data = await this.service.list(req.user!.id, query);
    res.json(successResponse(data, 'Employees'));
  };

  exportCsv = async (req: Request, res: Response): Promise<void> => {
    const query = employeeListQuerySchema.pick({
      search: true,
      departmentId: true,
      status: true,
    }).parse(req.query);
    const csv = await this.service.exportCsv(req.user!.id, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
    res.status(200).send(csv);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getById(req.user!.id, String(req.params.id));
    res.json(successResponse(data, 'Employee'));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const input = createEmployeeSchema.parse(req.body);
    const data = await this.service.create(req.user!.id, input);
    res.status(201).json(successResponse(data, 'Employee created'));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const input = updateEmployeeSchema.parse(req.body);
    const data = await this.service.update(req.user!.id, String(req.params.id), input);
    res.json(successResponse(data, 'Employee updated'));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.remove(req.user!.id, String(req.params.id));
    res.json(successResponse(data, 'Employee deleted'));
  };
}
