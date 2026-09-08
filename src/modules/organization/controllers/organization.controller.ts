import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { OrganizationService } from '../services/organization.service.js';
import type {
  CreateBranchInput,
  CreateDepartmentInput,
  CreateDesignationInput,
  CreateTeamInput,
  UpdateBranchInput,
  UpdateDepartmentInput,
  UpdateDesignationInput,
  UpdateTeamInput,
} from '../validators/organization.validators.js';

export class OrganizationController {
  constructor(private readonly service = new OrganizationService()) {}

  private actor(req: Request) {
    return {
      id: req.user!.id,
      permissions: req.user!.permissions,
    };
  }

  overview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getOverview(this.actor(req));
    res.json(successResponse(data, 'Organization overview'));
  };

  chart = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getOrgChart(this.actor(req));
    res.json(successResponse(data, 'Organization chart'));
  };

  listBranches = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listBranches(this.actor(req));
    res.json(successResponse(data, 'Branches'));
  };

  createBranch = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createBranch(this.actor(req), req.body as CreateBranchInput);
    res.status(201).json(successResponse(data, 'Branch created'));
  };

  updateBranch = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateBranch(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateBranchInput,
    );
    res.json(successResponse(data, 'Branch updated'));
  };

  deleteBranch = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteBranch(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Branch deleted'));
  };

  listDepartments = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listDepartments(this.actor(req));
    res.json(successResponse(data, 'Departments'));
  };

  createDepartment = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createDepartment(
      this.actor(req),
      req.body as CreateDepartmentInput,
    );
    res.status(201).json(successResponse(data, 'Department created'));
  };

  updateDepartment = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateDepartment(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateDepartmentInput,
    );
    res.json(successResponse(data, 'Department updated'));
  };

  deleteDepartment = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteDepartment(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Department deleted'));
  };

  listTeams = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listTeams(this.actor(req));
    res.json(successResponse(data, 'Teams'));
  };

  createTeam = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createTeam(this.actor(req), req.body as CreateTeamInput);
    res.status(201).json(successResponse(data, 'Team created'));
  };

  updateTeam = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateTeam(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateTeamInput,
    );
    res.json(successResponse(data, 'Team updated'));
  };

  deleteTeam = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteTeam(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Team deleted'));
  };

  listDesignations = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listDesignations(this.actor(req));
    res.json(successResponse(data, 'Designations'));
  };

  createDesignation = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createDesignation(
      this.actor(req),
      req.body as CreateDesignationInput,
    );
    res.status(201).json(successResponse(data, 'Designation created'));
  };

  updateDesignation = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateDesignation(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateDesignationInput,
    );
    res.json(successResponse(data, 'Designation updated'));
  };

  deleteDesignation = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteDesignation(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Designation deleted'));
  };
}
