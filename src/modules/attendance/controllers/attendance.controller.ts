import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { AttendanceService } from '../services/attendance.service.js';
import {
  attendanceCalendarQuerySchema,
  attendanceCheckInsQuerySchema,
  attendanceDateQuerySchema,
  attendanceListQuerySchema,
  createAttendanceSchema,
  updateAttendanceSchema,
} from '../validators/attendance.validators.js';

export class AttendanceController {
  constructor(private readonly service = new AttendanceService()) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const query = attendanceDateQuerySchema.parse(req.query);
    const data = await this.service.summary(req.user!.id, query.date);
    res.json(successResponse(data, 'Attendance summary'));
  };

  checkIns = async (req: Request, res: Response): Promise<void> => {
    const query = attendanceCheckInsQuerySchema.parse(req.query);
    const data = await this.service.checkIns(req.user!.id, query);
    res.json(successResponse(data, 'Recent check-ins'));
  };

  calendar = async (req: Request, res: Response): Promise<void> => {
    const query = attendanceCalendarQuerySchema.parse(req.query);
    const data = await this.service.calendar(req.user!.id, query);
    res.json(successResponse(data, 'Attendance calendar'));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = attendanceListQuerySchema.parse(req.query);
    const data = await this.service.list(req.user!.id, query);
    res.json(successResponse(data, 'Attendance records'));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const input = createAttendanceSchema.parse(req.body);
    const data = await this.service.create(req.user!.id, input);
    res.status(201).json(successResponse(data, 'Attendance saved'));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const input = updateAttendanceSchema.parse(req.body);
    const data = await this.service.update(req.user!.id, String(req.params.id), input);
    res.json(successResponse(data, 'Attendance updated'));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.remove(req.user!.id, String(req.params.id));
    res.json(successResponse(data, 'Attendance deleted'));
  };
}
