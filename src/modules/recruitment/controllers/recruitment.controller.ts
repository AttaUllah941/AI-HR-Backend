import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { RecruitmentService } from '../services/recruitment.service.js';
import {
  candidateListQuerySchema,
  createCandidateSchema,
  createJobSchema,
  jobListQuerySchema,
  updateCandidateSchema,
  updateJobSchema,
} from '../validators/recruitment.validators.js';

export class RecruitmentController {
  constructor(private readonly service = new RecruitmentService()) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.summary(req.user!.id);
    res.json(successResponse(data, 'Recruitment summary'));
  };

  pipeline = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.pipeline(req.user!.id);
    res.json(successResponse(data, 'Recruitment pipeline'));
  };

  listJobs = async (req: Request, res: Response): Promise<void> => {
    const query = jobListQuerySchema.parse(req.query);
    const data = await this.service.listJobs(req.user!.id, query);
    res.json(successResponse(data, 'Job openings'));
  };

  createJob = async (req: Request, res: Response): Promise<void> => {
    const input = createJobSchema.parse(req.body);
    const data = await this.service.createJob(req.user!.id, input);
    res.status(201).json(successResponse(data, 'Job opening created'));
  };

  updateJob = async (req: Request, res: Response): Promise<void> => {
    const input = updateJobSchema.parse(req.body);
    const data = await this.service.updateJob(req.user!.id, String(req.params.id), input);
    res.json(successResponse(data, 'Job opening updated'));
  };

  removeJob = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.removeJob(req.user!.id, String(req.params.id));
    res.json(successResponse(data, 'Job opening deleted'));
  };

  listCandidates = async (req: Request, res: Response): Promise<void> => {
    const query = candidateListQuerySchema.parse(req.query);
    const data = await this.service.listCandidates(req.user!.id, query);
    res.json(successResponse(data, 'Candidates'));
  };

  createCandidate = async (req: Request, res: Response): Promise<void> => {
    const input = createCandidateSchema.parse(req.body);
    const data = await this.service.createCandidate(req.user!.id, input);
    res.status(201).json(successResponse(data, 'Candidate created'));
  };

  updateCandidate = async (req: Request, res: Response): Promise<void> => {
    const input = updateCandidateSchema.parse(req.body);
    const data = await this.service.updateCandidate(req.user!.id, String(req.params.id), input);
    res.json(successResponse(data, 'Candidate updated'));
  };

  removeCandidate = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.removeCandidate(req.user!.id, String(req.params.id));
    res.json(successResponse(data, 'Candidate deleted'));
  };

  aiScreen = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.aiScreen(req.user!.id);
    res.json(successResponse(data, 'AI resume screening completed'));
  };
}
