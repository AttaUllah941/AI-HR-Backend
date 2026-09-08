import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { SecurityService } from '../services/security.service.js';
import type { UpdateSecurityPolicyInput } from '../validators/security.validators.js';

export class SecurityController {
  constructor(private readonly service = new SecurityService()) {}

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

  status = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getStatus(this.actor(req));
    res.json(successResponse(data, 'Security status'));
  };

  review = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getReview(this.actor(req));
    res.json(successResponse(data, 'Security review'));
  };

  getPolicy = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getPolicy(this.actor(req));
    res.json(successResponse(data, 'Security policy'));
  };

  updatePolicy = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updatePolicy(
      this.actor(req),
      req.body as UpdateSecurityPolicyInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'Security policy updated'));
  };

  listLoginAttempts = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listLoginAttempts(
      this.actor(req),
      req.query as Record<string, unknown>,
    );
    res.json(successResponse(data, 'Login attempts'));
  };
}
