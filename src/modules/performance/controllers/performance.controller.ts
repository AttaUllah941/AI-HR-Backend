import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { PerformanceService } from '../services/performance.service.js';
import {
  createReviewSchema,
  performancePeriodQuerySchema,
  reviewListQuerySchema,
  topPerformersQuerySchema,
  updateReviewSchema,
} from '../validators/performance.validators.js';

export class PerformanceController {
  constructor(private readonly service = new PerformanceService()) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const query = performancePeriodQuerySchema.parse(req.query);
    const data = await this.service.summary(req.user!.id, query);
    res.json(successResponse(data, 'Performance summary'));
  };

  topPerformers = async (req: Request, res: Response): Promise<void> => {
    const query = topPerformersQuerySchema.parse(req.query);
    const data = await this.service.topPerformers(req.user!.id, query);
    res.json(successResponse(data, 'Top performers'));
  };

  insights = async (req: Request, res: Response): Promise<void> => {
    const query = performancePeriodQuerySchema.parse(req.query);
    const data = await this.service.insights(req.user!.id, query);
    res.json(successResponse(data, 'AI suggestions'));
  };

  listReviews = async (req: Request, res: Response): Promise<void> => {
    const query = reviewListQuerySchema.parse(req.query);
    const data = await this.service.listReviews(req.user!.id, query);
    res.json(successResponse(data, 'Performance reviews'));
  };

  createReview = async (req: Request, res: Response): Promise<void> => {
    const input = createReviewSchema.parse(req.body);
    const data = await this.service.createReview(req.user!.id, input);
    res.status(201).json(successResponse(data, 'Performance review saved'));
  };

  updateReview = async (req: Request, res: Response): Promise<void> => {
    const input = updateReviewSchema.parse(req.body);
    const data = await this.service.updateReview(req.user!.id, String(req.params.id), input);
    res.json(successResponse(data, 'Performance review updated'));
  };

  removeReview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.removeReview(req.user!.id, String(req.params.id));
    res.json(successResponse(data, 'Performance review deleted'));
  };
}
