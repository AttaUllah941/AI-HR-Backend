import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { SettingsService } from '../services/settings.service.js';
import type {
  CreateUserInput,
  UpdateCompanyInput,
  UpdateEmailSettingsInput,
  UpdateIntegrationsInput,
  UpdateRolePermissionsInput,
  UpdateStorageSettingsInput,
  UpdateSystemSettingsInput,
  UpdateUserInput,
} from '../validators/settings.validators.js';

export class SettingsController {
  constructor(private readonly service = new SettingsService()) {}

  private actor(req: Request) {
    return {
      id: req.user!.id,
      permissions: req.user!.permissions,
    };
  }

  private meta(req: Request) {
    return {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getSummary(this.actor(req));
    res.json(successResponse(data, 'Settings summary'));
  };

  getCompany = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getCompany(this.actor(req));
    res.json(successResponse(data, 'Company profile'));
  };

  updateCompany = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateCompany(
      this.actor(req),
      req.body as UpdateCompanyInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'Company profile updated'));
  };

  getConfig = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getConfig(this.actor(req));
    res.json(successResponse(data, 'System configuration'));
  };

  updateEmail = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateEmail(
      this.actor(req),
      req.body as UpdateEmailSettingsInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'Email settings updated'));
  };

  updateStorage = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateStorage(
      this.actor(req),
      req.body as UpdateStorageSettingsInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'Storage settings updated'));
  };

  updateIntegrations = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateIntegrations(
      this.actor(req),
      req.body as UpdateIntegrationsInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'Integrations updated'));
  };

  updateSystem = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateSystem(
      this.actor(req),
      req.body as UpdateSystemSettingsInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'System settings updated'));
  };

  listUsers = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listUsers(
      this.actor(req),
      req.query as Record<string, unknown>,
    );
    res.json(successResponse(data, 'Users'));
  };

  createUser = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createUser(
      this.actor(req),
      req.body as CreateUserInput,
      this.meta(req),
    );
    res.status(201).json(successResponse(data, 'User created'));
  };

  updateUser = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateUser(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateUserInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'User updated'));
  };

  deleteUser = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteUser(
      this.actor(req),
      req.params.id as string,
      this.meta(req),
    );
    res.json(successResponse(data, 'User deleted'));
  };

  listRoles = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listRoles(this.actor(req));
    res.json(successResponse(data, 'Roles'));
  };

  listPermissions = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listPermissions(this.actor(req));
    res.json(successResponse(data, 'Permissions'));
  };

  updateRolePermissions = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateRolePermissions(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateRolePermissionsInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'Role permissions updated'));
  };

  listAuditLogs = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listAuditLogs(
      this.actor(req),
      req.query as Record<string, unknown>,
    );
    res.json(successResponse(data, 'Audit logs'));
  };
}
