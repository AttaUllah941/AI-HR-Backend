import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { LeaveService } from '../services/leave.service.js';
import type {
  CreateLeaveRequestInput,
  CreateLeaveTypeInput,
  ReviewLeaveRequestInput,
  UpdateLeavePolicyInput,
  UpdateLeaveRequestInput,
  UpdateLeaveTypeInput,
  UpsertLeaveBalanceInput,
} from '../validators/leave.validators.js';

export class LeaveController {
  constructor(private readonly service = new LeaveService()) {}

  private actor(req: Request) {
    return { id: req.user!.id, permissions: req.user!.permissions };
  }

  listTypes = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listTypes(this.actor(req));
    res.json(successResponse(data, 'Leave types'));
  };

  createType = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createType(this.actor(req), req.body as CreateLeaveTypeInput);
    res.status(201).json(successResponse(data, 'Leave type created'));
  };

  updateType = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateType(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateLeaveTypeInput,
    );
    res.json(successResponse(data, 'Leave type updated'));
  };

  deleteType = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteType(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Leave type deleted'));
  };

  getPolicy = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getPolicy(this.actor(req));
    res.json(successResponse(data, 'Leave policy'));
  };

  updatePolicy = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updatePolicy(
      this.actor(req),
      req.body as UpdateLeavePolicyInput,
    );
    res.json(successResponse(data, 'Leave policy updated'));
  };

  listBalances = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listBalances(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Leave balances'));
  };

  upsertBalance = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.upsertBalance(
      this.actor(req),
      req.body as UpsertLeaveBalanceInput,
    );
    res.json(successResponse(data, 'Leave balance saved'));
  };

  listRequests = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listRequests(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Leave requests'));
  };

  getRequest = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getRequest(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Leave request'));
  };

  createRequest = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createRequest(
      this.actor(req),
      req.body as CreateLeaveRequestInput,
    );
    res.status(201).json(successResponse(data, 'Leave request created'));
  };

  updateRequest = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateRequest(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateLeaveRequestInput,
    );
    res.json(successResponse(data, 'Leave request updated'));
  };

  approveRequest = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.approveRequest(
      this.actor(req),
      req.params.id as string,
      req.body as ReviewLeaveRequestInput,
    );
    res.json(successResponse(data, 'Leave request approved'));
  };

  rejectRequest = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.rejectRequest(
      this.actor(req),
      req.params.id as string,
      req.body as ReviewLeaveRequestInput,
    );
    res.json(successResponse(data, 'Leave request rejected'));
  };

  cancelRequest = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.cancelRequest(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Leave request cancelled'));
  };

  mySummary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.mySummary(this.actor(req), req.query.year as string | undefined);
    res.json(successResponse(data, 'My leave summary'));
  };

  calendar = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.calendar(this.actor(req), req.query as Record<string, string>);
    res.json(successResponse(data, 'Leave calendar'));
  };

  report = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.report(this.actor(req), req.query as Record<string, string>);
    res.json(successResponse(data, 'Leave report'));
  };
}
