import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { successResponse } from '../../../interfaces/api-response.js';
import {
  forgotPasswordSchema,
  loginSchema,
  mfaDisableSchema,
  mfaEnableSchema,
  mfaVerifySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.validators.js';

export class AuthController {
  constructor(private readonly service = new AuthService()) {}

  private meta(req: Request) {
    return {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }

  register = async (req: Request, res: Response): Promise<void> => {
    const input = registerSchema.parse(req.body);
    const data = await this.service.register(input, this.meta(req));
    res.status(201).json(successResponse(data, 'Registration successful'));
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const input = loginSchema.parse(req.body);
    const data = await this.service.login(input, this.meta(req));
    res.json(successResponse(data, data.mfaRequired ? 'MFA required' : 'Login successful'));
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const input = refreshSchema.parse(req.body);
    const data = await this.service.refresh(input);
    res.json(successResponse(data, 'Token refreshed'));
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const refreshToken =
      typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
    const data = await this.service.logout(req.user!.id, refreshToken);
    res.json(successResponse(data, 'Logged out'));
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.me(req.user!.id);
    res.json(successResponse(data, 'Current user'));
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const input = forgotPasswordSchema.parse(req.body);
    const data = await this.service.forgotPassword(input);
    res.json(successResponse(data, data.message));
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    const input = resetPasswordSchema.parse(req.body);
    const data = await this.service.resetPassword(input);
    res.json(successResponse(data, 'Password reset successful'));
  };

  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    const input = verifyEmailSchema.parse(req.body);
    const data = await this.service.verifyEmail(input);
    res.json(successResponse(data, 'Email verified'));
  };

  verifyMfa = async (req: Request, res: Response): Promise<void> => {
    const input = mfaVerifySchema.parse(req.body);
    const data = await this.service.verifyMfa(input, this.meta(req));
    res.json(successResponse(data, 'MFA verified'));
  };

  setupMfa = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.setupMfa(req.user!.id);
    res.json(successResponse(data, 'MFA setup started'));
  };

  enableMfa = async (req: Request, res: Response): Promise<void> => {
    const input = mfaEnableSchema.parse(req.body);
    const data = await this.service.enableMfa(req.user!.id, input);
    res.json(successResponse(data, 'MFA enabled'));
  };

  disableMfa = async (req: Request, res: Response): Promise<void> => {
    const input = mfaDisableSchema.parse(req.body);
    const data = await this.service.disableMfa(req.user!.id, input);
    res.json(successResponse(data, 'MFA disabled'));
  };

  status = async (_req: Request, res: Response): Promise<void> => {
    res.json(
      successResponse(
        {
          module: 'auth',
          ready: true,
          phase: 2,
          features: [
            'register',
            'login',
            'refresh',
            'logout',
            'forgot-password',
            'reset-password',
            'verify-email',
            'mfa',
            'rbac',
          ],
        },
        'Auth module status',
      ),
    );
  };
}
