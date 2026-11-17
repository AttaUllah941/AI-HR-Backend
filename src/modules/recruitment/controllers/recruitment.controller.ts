import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { RecruitmentService } from '../services/recruitment.service.js';
import type {
  AttachResumeInput,
  CompleteInterviewInput,
  CreateApplicationInput,
  CreateCandidateInput,
  CreateInterviewInput,
  CreateJobOpeningInput,
  CreateOfferInput,
  RespondOfferInput,
  UpdateApplicationStatusInput,
  UpdateCandidateInput,
  UpdateInterviewInput,
  UpdateJobOpeningInput,
  UpdateOfferInput,
} from '../validators/recruitment.validators.js';

export class RecruitmentController {
  constructor(private readonly service = new RecruitmentService()) {}

  private actor(req: Request) {
    return { id: req.user!.id, permissions: req.user!.permissions };
  }

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.summary(this.actor(req));
    res.json(successResponse(data, 'Recruitment summary'));
  };

  pipeline = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.pipeline(
      this.actor(req),
      req.query.jobOpeningId as string | undefined,
    );
    res.json(successResponse(data, 'Recruitment pipeline'));
  };

  report = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.report(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Recruitment report'));
  };

  listJobs = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listJobs(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Job openings'));
  };

  getJob = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getJob(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Job opening'));
  };

  createJob = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createJob(
      this.actor(req),
      req.body as CreateJobOpeningInput,
    );
    res.status(201).json(successResponse(data, 'Job opening created'));
  };

  updateJob = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateJob(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateJobOpeningInput,
    );
    res.json(successResponse(data, 'Job opening updated'));
  };

  deleteJob = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteJob(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Job opening deleted'));
  };

  publishJob = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.publishJob(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Job opening published'));
  };

  closeJob = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.closeJob(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Job opening closed'));
  };

  holdJob = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.holdJob(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Job opening put on hold'));
  };

  listCandidates = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listCandidates(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Candidates'));
  };

  getCandidate = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getCandidate(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Candidate'));
  };

  createCandidate = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createCandidate(
      this.actor(req),
      req.body as CreateCandidateInput,
    );
    res.status(201).json(successResponse(data, 'Candidate created'));
  };

  updateCandidate = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateCandidate(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateCandidateInput,
    );
    res.json(successResponse(data, 'Candidate updated'));
  };

  deleteCandidate = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteCandidate(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Candidate deleted'));
  };

  attachResume = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.attachResume(
      this.actor(req),
      req.params.id as string,
      req.body as AttachResumeInput,
    );
    res.json(successResponse(data, 'Resume attached'));
  };

  updateScreening = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as UpdateCandidateInput;
    const data = await this.service.updateScreening(this.actor(req), req.params.id as string, {
      screeningScore: body.screeningScore,
      screeningNotes: body.screeningNotes,
    });
    res.json(successResponse(data, 'Screening updated'));
  };

  listApplications = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listApplications(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Applications'));
  };

  getApplication = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getApplication(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Application'));
  };

  createApplication = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createApplication(
      this.actor(req),
      req.body as CreateApplicationInput,
    );
    res.status(201).json(successResponse(data, 'Application created'));
  };

  updateApplicationStatus = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateApplicationStatus(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateApplicationStatusInput,
    );
    res.json(successResponse(data, 'Application status updated'));
  };

  rejectApplication = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as { rejectionReason?: string | null };
    const data = await this.service.rejectApplication(
      this.actor(req),
      req.params.id as string,
      { rejectionReason: body?.rejectionReason },
    );
    res.json(successResponse(data, 'Application rejected'));
  };

  listInterviews = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listInterviews(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Interviews'));
  };

  getInterview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getInterview(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Interview'));
  };

  createInterview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createInterview(
      this.actor(req),
      req.body as CreateInterviewInput,
    );
    res.status(201).json(successResponse(data, 'Interview scheduled'));
  };

  updateInterview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateInterview(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateInterviewInput,
    );
    res.json(successResponse(data, 'Interview updated'));
  };

  deleteInterview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteInterview(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Interview cancelled'));
  };

  completeInterview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.completeInterview(
      this.actor(req),
      req.params.id as string,
      (req.body ?? {}) as CompleteInterviewInput,
    );
    res.json(successResponse(data, 'Interview completed'));
  };

  listOffers = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listOffers(
      this.actor(req),
      req.query as Record<string, string>,
    );
    res.json(successResponse(data, 'Offers'));
  };

  getOffer = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getOffer(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Offer'));
  };

  createOffer = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createOffer(
      this.actor(req),
      req.body as CreateOfferInput,
    );
    res.status(201).json(successResponse(data, 'Offer created'));
  };

  updateOffer = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateOffer(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateOfferInput,
    );
    res.json(successResponse(data, 'Offer updated'));
  };

  sendOffer = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.sendOffer(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Offer sent'));
  };

  respondOffer = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.respondOffer(
      this.actor(req),
      req.params.id as string,
      req.body as RespondOfferInput,
    );
    res.json(successResponse(data, 'Offer response recorded'));
  };
}
