import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { NotificationsService } from '../services/notifications.service.js';
import type {
  CreateTemplateInput,
  RegisterDeviceInput,
  SendNotificationInput,
  UpdateTemplateInput,
  UpsertPreferencesInput,
} from '../validators/notifications.validators.js';

export class NotificationsController {
  constructor(private readonly service = new NotificationsService()) {}

  private actor(req: Request) {
    return { id: req.user!.id, permissions: req.user!.permissions };
  }

  status = async (_req: Request, res: Response): Promise<void> => {
    res.json(successResponse(this.service.status(), 'Notification providers'));
  };

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getSummary(this.actor(req));
    res.json(successResponse(data, 'Notifications summary'));
  };

  feed = async (req: Request, res: Response): Promise<void> => {
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    const data = await this.service.getFeed(this.actor(req), limit);
    res.json(successResponse(data, 'Notification feed'));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.list(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Notifications'));
  };

  getOne = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getOne(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Notification'));
  };

  markRead = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.markRead(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Notification marked read'));
  };

  markAllRead = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.markAllRead(this.actor(req));
    res.json(successResponse(data, 'All notifications marked read'));
  };

  deleteOne = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteOne(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Notification deleted'));
  };

  getPreferences = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getPreferences(this.actor(req));
    res.json(successResponse(data, 'Notification preferences'));
  };

  upsertPreferences = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.upsertPreferences(
      this.actor(req),
      req.body as UpsertPreferencesInput,
    );
    res.json(successResponse(data, 'Preferences saved'));
  };

  listTemplates = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listTemplates(this.actor(req));
    res.json(successResponse(data, 'Notification templates'));
  };

  createTemplate = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createTemplate(
      this.actor(req),
      req.body as CreateTemplateInput,
    );
    res.status(201).json(successResponse(data, 'Template created'));
  };

  updateTemplate = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateTemplate(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateTemplateInput,
    );
    res.json(successResponse(data, 'Template updated'));
  };

  deleteTemplate = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteTemplate(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Template deleted'));
  };

  listDevices = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listDevices(this.actor(req));
    res.json(successResponse(data, 'Push devices'));
  };

  registerDevice = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.registerDevice(
      this.actor(req),
      req.body as RegisterDeviceInput,
    );
    res.status(201).json(successResponse(data, 'Device registered'));
  };

  removeDevice = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.removeDevice(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Device removed'));
  };

  send = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.send(this.actor(req), req.body as SendNotificationInput);
    res.status(201).json(successResponse(data, 'Notification dispatched'));
  };
}
