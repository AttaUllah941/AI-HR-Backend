import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { successResponse } from '../../../interfaces/api-response.js';
import type {
  ForgotPasswordInput,
  LoginInput,
  MfaDisableInput,
  MfaEnableInput,
  MfaVerifyInput,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
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
    const data = await this.service.register(req.body as RegisterInput, this.meta(req));
    res.status(201).json(successResponse(data, 'Registration successful'));
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.login(req.body as LoginInput, this.meta(req));
    res.json(successResponse(data, data.mfaRequired ? 'MFA required' : 'Login successful'));
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.refresh(req.body as RefreshInput);
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
    const data = await this.service.forgotPassword(req.body as ForgotPasswordInput);
    res.json(successResponse(data, data.message));
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.resetPassword(req.body as ResetPasswordInput);
    res.json(successResponse(data, 'Password reset successful'));
  };

  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.verifyEmail(req.body as VerifyEmailInput);
    res.json(successResponse(data, 'Email verified'));
  };

  verifyMfa = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.verifyMfa(req.body as MfaVerifyInput, this.meta(req));
    res.json(successResponse(data, 'MFA verified'));
  };

  setupMfa = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.setupMfa(req.user!.id);
    res.json(successResponse(data, 'MFA setup started'));
  };

  enableMfa = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.enableMfa(req.user!.id, req.body as MfaEnableInput);
    res.json(successResponse(data, 'MFA enabled'));
  };

  disableMfa = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.disableMfa(req.user!.id, req.body as MfaDisableInput);
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
