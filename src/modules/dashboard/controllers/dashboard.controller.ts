import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { AuthRepository } from '../../auth/repositories/auth.repository.js';
import { DashboardService } from '../services/dashboard.service.js';

export class DashboardController {
  constructor(
    private readonly service = new DashboardService(),
    private readonly authRepo = new AuthRepository(),
  ) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const dbUser = await this.authRepo.findById(req.user!.id);
    const data = await this.service.getSummary({
      id: req.user!.id,
      email: req.user!.email,
      firstName: dbUser?.firstName,
      lastName: dbUser?.lastName,
      permissions: req.user!.permissions,
    });
    res.json(successResponse(data, 'Dashboard summary'));
  };

  activity = async (req: Request, res: Response): Promise<void> => {
    const limit = Number(req.query.limit ?? 12);
    const data = await this.service.getActivity(Number.isFinite(limit) ? limit : 12);
    res.json(successResponse(data, 'Recent activity'));
  };

  notifications = async (req: Request, res: Response): Promise<void> => {
    const limit = Number(req.query.limit ?? 8);
    const data = await this.service.getNotifications(
      req.user!.id,
      Number.isFinite(limit) ? limit : 8,
    );
    res.json(successResponse(data, 'Notifications'));
  };
}
