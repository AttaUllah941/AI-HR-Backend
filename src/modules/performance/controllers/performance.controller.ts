import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { PerformanceService } from '../services/performance.service.js';
import type {
  CreateFeedbackInput,
  CreateGoalInput,
  CreateKpiInput,
  CreatePromotionInput,
  CreateReviewCycleInput,
  CreateReviewInput,
  ReviewPromotionInput,
  UpdateGoalInput,
  UpdateKpiInput,
  UpdatePromotionInput,
  UpdateReviewCycleInput,
  UpdateReviewInput,
  UpsertEmployeeKpiInput,
} from '../validators/performance.validators.js';

export class PerformanceController {
  constructor(private readonly service = new PerformanceService()) {}

  private actor(req: Request) {
    return { id: req.user!.id, permissions: req.user!.permissions };
  }

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.summary(
      this.actor(req),
      req.query.year as string | undefined,
    );
    res.json(successResponse(data, 'Performance summary'));
  };

  mySummary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.mySummary(
      this.actor(req),
      req.query.year as string | undefined,
    );
    res.json(successResponse(data, 'My performance summary'));
  };

  report = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.report(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Performance report'));
  };

  listGoals = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listGoals(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Goals'));
  };

  getGoal = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getGoal(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Goal'));
  };

  createGoal = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createGoal(
      this.actor(req),
      req.body as CreateGoalInput,
    );
    res.status(201).json(successResponse(data, 'Goal created'));
  };

  updateGoal = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateGoal(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateGoalInput,
    );
    res.json(successResponse(data, 'Goal updated'));
  };

  deleteGoal = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteGoal(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Goal deleted'));
  };

  listKpis = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listKpis(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'KPIs'));
  };

  createKpi = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createKpi(this.actor(req), req.body as CreateKpiInput);
    res.status(201).json(successResponse(data, 'KPI created'));
  };

  updateKpi = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateKpi(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateKpiInput,
    );
    res.json(successResponse(data, 'KPI updated'));
  };

  deleteKpi = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteKpi(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'KPI deleted'));
  };

  listEmployeeKpis = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listEmployeeKpis(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Employee KPIs'));
  };

  upsertEmployeeKpi = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.upsertEmployeeKpi(
      this.actor(req),
      req.body as UpsertEmployeeKpiInput,
    );
    res.status(201).json(successResponse(data, 'Employee KPI upserted'));
  };

  listCycles = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listCycles(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Review cycles'));
  };

  createCycle = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createCycle(
      this.actor(req),
      req.body as CreateReviewCycleInput,
    );
    res.status(201).json(successResponse(data, 'Review cycle created'));
  };

  updateCycle = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateCycle(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateReviewCycleInput,
    );
    res.json(successResponse(data, 'Review cycle updated'));
  };

  deleteCycle = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteCycle(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Review cycle deleted'));
  };

  activateCycle = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.activateCycle(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Review cycle activated'));
  };

  closeCycle = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.closeCycle(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Review cycle closed'));
  };

  listReviews = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listReviews(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Reviews'));
  };

  getReview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getReview(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Review'));
  };

  createReview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createReview(
      this.actor(req),
      req.body as CreateReviewInput,
    );
    res.status(201).json(successResponse(data, 'Review created'));
  };

  updateReview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateReview(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateReviewInput,
    );
    res.json(successResponse(data, 'Review updated'));
  };

  submitReview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.submitReview(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Review submitted'));
  };

  acknowledgeReview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.acknowledgeReview(
      this.actor(req),
      req.params.id as string,
    );
    res.json(successResponse(data, 'Review acknowledged'));
  };

  completeReview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.completeReview(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Review completed'));
  };

  listFeedback = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listFeedback(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Feedback'));
  };

  getFeedback = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getFeedback(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Feedback'));
  };

  createFeedback = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createFeedback(
      this.actor(req),
      req.body as CreateFeedbackInput,
    );
    res.status(201).json(successResponse(data, 'Feedback created'));
  };

  deleteFeedback = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteFeedback(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Feedback deleted'));
  };

  listPromotions = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listPromotions(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Promotion requests'));
  };

  getPromotion = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getPromotion(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Promotion request'));
  };

  createPromotion = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createPromotion(
      this.actor(req),
      req.body as CreatePromotionInput,
    );
    res.status(201).json(successResponse(data, 'Promotion request created'));
  };

  updatePromotion = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updatePromotion(
      this.actor(req),
      req.params.id as string,
      req.body as UpdatePromotionInput,
    );
    res.json(successResponse(data, 'Promotion request updated'));
  };

  submitPromotion = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.submitPromotion(
      this.actor(req),
      req.params.id as string,
    );
    res.json(successResponse(data, 'Promotion request submitted'));
  };

  reviewPromotion = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.reviewPromotion(
      this.actor(req),
      req.params.id as string,
      req.body as ReviewPromotionInput,
    );
    res.json(successResponse(data, 'Promotion request reviewed'));
  };

  withdrawPromotion = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.withdrawPromotion(
      this.actor(req),
      req.params.id as string,
    );
    res.json(successResponse(data, 'Promotion request withdrawn'));
  };
}
