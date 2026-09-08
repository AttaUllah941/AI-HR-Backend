import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { AiService } from '../services/ai.service.js';
import type {
  AppraisalInput,
  AssistantChatInput,
  InsightsInput,
  PolicyGenerateInput,
  RecommendationsInput,
  ResumeScreeningInput,
} from '../validators/ai.validators.js';

export class AiController {
  constructor(private readonly service = new AiService()) {}

  private actor(req: Request) {
    return { id: req.user!.id, permissions: req.user!.permissions };
  }

  status = async (_req: Request, res: Response): Promise<void> => {
    const data = this.service.getStatus();
    res.json(successResponse(data, 'AI status'));
  };

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getSummary(this.actor(req));
    res.json(successResponse(data, 'AI summary'));
  };

  getInsights = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getInsights(this.actor(req));
    res.json(successResponse(data, 'AI insights'));
  };

  refreshInsights = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.refreshInsights(
      this.actor(req),
      req.body as InsightsInput,
    );
    res.status(201).json(successResponse(data, 'AI insights generated'));
  };

  getRecommendations = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getRecommendations(this.actor(req));
    res.json(successResponse(data, 'AI recommendations'));
  };

  refreshRecommendations = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.refreshRecommendations(
      this.actor(req),
      req.body as RecommendationsInput,
    );
    res.status(201).json(successResponse(data, 'AI recommendations generated'));
  };

  listConversations = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listConversations(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Conversations'));
  };

  chat = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.assistantChat(
      this.actor(req),
      req.body as AssistantChatInput,
    );
    res.status(201).json(successResponse(data, 'Assistant reply'));
  };

  getConversation = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getConversation(
      this.actor(req),
      req.params.id as string,
    );
    res.json(successResponse(data, 'Conversation'));
  };

  deleteConversation = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteConversation(
      this.actor(req),
      req.params.id as string,
    );
    res.json(successResponse(data, 'Conversation deleted'));
  };

  screenResume = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.screenResume(
      this.actor(req),
      req.body as ResumeScreeningInput,
    );
    res.status(201).json(successResponse(data, 'Resume screened'));
  };

  generateAppraisal = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.generateAppraisal(
      this.actor(req),
      req.body as AppraisalInput,
    );
    res.status(201).json(successResponse(data, 'Appraisal generated'));
  };

  generatePolicy = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.generatePolicy(
      this.actor(req),
      req.body as PolicyGenerateInput,
    );
    res.status(201).json(successResponse(data, 'Policy generated'));
  };

  listGenerations = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listGenerations(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Generations'));
  };

  getGeneration = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getGeneration(
      this.actor(req),
      req.params.id as string,
    );
    res.json(successResponse(data, 'Generation'));
  };

  deleteGeneration = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteGeneration(
      this.actor(req),
      req.params.id as string,
    );
    res.json(successResponse(data, 'Generation deleted'));
  };
}
