import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { LeaveService } from '../services/leave.service.js';
import {
  createLeaveRequestSchema,
  leaveHolidaysQuerySchema,
  leaveListQuerySchema,
  leavePendingQuerySchema,
  updateLeaveRequestSchema,
} from '../validators/leave.validators.js';

export class LeaveController {
  constructor(private readonly service = new LeaveService()) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.summary(req.user!.id);
    res.json(successResponse(data, 'Leave summary'));
  };

  pending = async (req: Request, res: Response): Promise<void> => {
    const query = leavePendingQuerySchema.parse(req.query);
    const data = await this.service.pending(req.user!.id, query);
    res.json(successResponse(data, 'Pending leave requests'));
  };

  holidays = async (req: Request, res: Response): Promise<void> => {
    const query = leaveHolidaysQuerySchema.parse(req.query);
    const data = await this.service.holidays(req.user!.id, query);
    res.json(successResponse(data, 'Upcoming holidays'));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = leaveListQuerySchema.parse(req.query);
    const data = await this.service.list(req.user!.id, query);
    res.json(successResponse(data, 'Leave requests'));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const input = createLeaveRequestSchema.parse(req.body);
    const data = await this.service.create(req.user!.id, input);
    res.status(201).json(successResponse(data, 'Leave request created'));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const input = updateLeaveRequestSchema.parse(req.body);
    const data = await this.service.update(req.user!.id, String(req.params.id), input);
    res.json(successResponse(data, 'Leave request updated'));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.remove(req.user!.id, String(req.params.id));
    res.json(successResponse(data, 'Leave request deleted'));
  };
}
