import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { OrganizationService } from '../services/organization.service.js';
import {
  createDepartmentSchema,
  createLocationSchema,
  listQuerySchema,
  updateCompanySchema,
  updateDepartmentSchema,
  updateLocationSchema,
} from '../validators/organization.validators.js';

export class OrganizationController {
  constructor(private readonly service = new OrganizationService()) {}

  overview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getOverview(req.user!.id);
    res.json(successResponse(data, 'Organization overview'));
  };

  getCompany = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getCompany(req.user!.id);
    res.json(successResponse(data, 'Company profile'));
  };

  updateCompany = async (req: Request, res: Response): Promise<void> => {
    const input = updateCompanySchema.parse(req.body);
    const data = await this.service.updateCompany(req.user!.id, input);
    res.json(successResponse(data, 'Company updated'));
  };

  listDepartments = async (req: Request, res: Response): Promise<void> => {
    const query = listQuerySchema.parse(req.query);
    const data = await this.service.listDepartments(req.user!.id, query);
    res.json(successResponse(data, 'Departments'));
  };

  createDepartment = async (req: Request, res: Response): Promise<void> => {
    const input = createDepartmentSchema.parse(req.body);
    const data = await this.service.createDepartment(req.user!.id, input);
    res.status(201).json(successResponse(data, 'Department created'));
  };

  updateDepartment = async (req: Request, res: Response): Promise<void> => {
    const input = updateDepartmentSchema.parse(req.body);
    const data = await this.service.updateDepartment(req.user!.id, String(req.params.id), input);
    res.json(successResponse(data, 'Department updated'));
  };

  deleteDepartment = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteDepartment(req.user!.id, String(req.params.id));
    res.json(successResponse(data, 'Department deleted'));
  };

  listLocations = async (req: Request, res: Response): Promise<void> => {
    const query = listQuerySchema.parse(req.query);
    const data = await this.service.listLocations(req.user!.id, query);
    res.json(successResponse(data, 'Locations'));
  };

  createLocation = async (req: Request, res: Response): Promise<void> => {
    const input = createLocationSchema.parse(req.body);
    const data = await this.service.createLocation(req.user!.id, input);
    res.status(201).json(successResponse(data, 'Location created'));
  };

  updateLocation = async (req: Request, res: Response): Promise<void> => {
    const input = updateLocationSchema.parse(req.body);
    const data = await this.service.updateLocation(req.user!.id, String(req.params.id), input);
    res.json(successResponse(data, 'Location updated'));
  };

  deleteLocation = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteLocation(req.user!.id, String(req.params.id));
    res.json(successResponse(data, 'Location deleted'));
  };
}
