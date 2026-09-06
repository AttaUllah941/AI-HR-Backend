import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { ProfileService } from '../services/profile.service.js';
import type {
  ChangePasswordInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
} from '../validators/profile.validators.js';

export class ProfileController {
  constructor(private readonly service = new ProfileService()) {}

  private actor(req: Request) {
    return {
      id: req.user!.id,
      permissions: req.user!.permissions,
      sessionId: (req.user as { sessionId?: string }).sessionId,
    };
  }

  private meta(req: Request) {
    return {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }

  get = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getProfile(this.actor(req));
    res.json(successResponse(data, 'Profile'));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateProfile(
      this.actor(req),
      req.body as UpdateProfileInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'Profile updated'));
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.changePassword(
      this.actor(req),
      req.body as ChangePasswordInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'Password changed'));
  };

  getPreferences = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getPreferences(this.actor(req));
    res.json(successResponse(data, 'Preferences'));
  };

  updatePreferences = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updatePreferences(
      this.actor(req),
      req.body as UpdatePreferencesInput,
    );
    res.json(successResponse(data, 'Preferences saved'));
  };

  listSessions = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listSessions(this.actor(req));
    res.json(successResponse(data, 'Sessions'));
  };

  revokeSession = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.revokeSession(
      this.actor(req),
      req.params.id as string,
    );
    res.json(successResponse(data, 'Session revoked'));
  };

  revokeOtherSessions = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.revokeOtherSessions(this.actor(req));
    res.json(successResponse(data, 'Other sessions revoked'));
  };

  listActivity = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listActivity(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Activity'));
  };
}
