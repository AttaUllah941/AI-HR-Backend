import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { getRequestIp } from '../../../utils/request-ip.js';
import { AttendanceService } from '../services/attendance.service.js';
import type {
  ClockActionInput,
  CreateAttendanceInput,
  CreateHolidayInput,
  CreateOvertimeInput,
  CreateShiftInput,
  ReviewOvertimeInput,
  UpdateAttendanceInput,
  UpdateHolidayInput,
  UpdateShiftInput,
} from '../validators/attendance.validators.js';

export class AttendanceController {
  constructor(private readonly service = new AttendanceService()) {}

  private actor(req: Request) {
    return { id: req.user!.id, permissions: req.user!.permissions };
  }

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getSummary(this.actor(req), req.query.date as string | undefined);
    res.json(successResponse(data, 'Attendance summary'));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.list(this.actor(req), req.query as Record<string, string>);
    res.json(successResponse(data, 'Attendance records'));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getById(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Attendance record'));
  };

  myToday = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getMyToday(this.actor(req));
    res.json(successResponse(data, 'My attendance today'));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.create(this.actor(req), req.body as CreateAttendanceInput);
    res.status(201).json(successResponse(data, 'Attendance created'));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.update(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateAttendanceInput,
    );
    res.json(successResponse(data, 'Attendance updated'));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.remove(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Attendance deleted'));
  };

  clockIn = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.clockIn(this.actor(req), req.body as ClockActionInput, {
      clientIp: getRequestIp(req),
    });
    res.status(201).json(successResponse(data, 'Clocked in'));
  };

  clockOut = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.clockOut(this.actor(req), req.body as ClockActionInput, {
      clientIp: getRequestIp(req),
    });
    res.json(successResponse(data, 'Clocked out'));
  };

  timesheet = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getTimesheet(this.actor(req), req.query as Record<string, string>);
    res.json(successResponse(data, 'Timesheet'));
  };

  report = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getReport(this.actor(req), req.query as Record<string, string>);
    res.json(successResponse(data, 'Attendance report'));
  };

  listShifts = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listShifts(this.actor(req));
    res.json(successResponse(data, 'Shifts'));
  };

  createShift = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createShift(this.actor(req), req.body as CreateShiftInput);
    res.status(201).json(successResponse(data, 'Shift created'));
  };

  updateShift = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateShift(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateShiftInput,
    );
    res.json(successResponse(data, 'Shift updated'));
  };

  deleteShift = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteShift(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Shift deleted'));
  };

  listHolidays = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listHolidays(this.actor(req), req.query.year as string | undefined);
    res.json(successResponse(data, 'Holidays'));
  };

  createHoliday = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createHoliday(this.actor(req), req.body as CreateHolidayInput);
    res.status(201).json(successResponse(data, 'Holiday created'));
  };

  updateHoliday = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateHoliday(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateHolidayInput,
    );
    res.json(successResponse(data, 'Holiday updated'));
  };

  deleteHoliday = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteHoliday(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Holiday deleted'));
  };

  listOvertime = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listOvertime(
      this.actor(req),
      req.query.status as string | undefined,
    );
    res.json(successResponse(data, 'Overtime requests'));
  };

  createOvertime = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createOvertime(this.actor(req), req.body as CreateOvertimeInput);
    res.status(201).json(successResponse(data, 'Overtime request created'));
  };

  approveOvertime = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.approveOvertime(
      this.actor(req),
      req.params.id as string,
      req.body as ReviewOvertimeInput,
    );
    res.json(successResponse(data, 'Overtime approved'));
  };

  rejectOvertime = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.rejectOvertime(
      this.actor(req),
      req.params.id as string,
      req.body as ReviewOvertimeInput,
    );
    res.json(successResponse(data, 'Overtime rejected'));
  };
}
