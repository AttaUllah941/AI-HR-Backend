import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { EmployeeService } from '../services/employee.service.js';
import type {
  CreateCertificationInput,
  CreateDocumentInput,
  CreateEducationInput,
  CreateEmergencyContactInput,
  CreateEmployeeInput,
  CreateExperienceInput,
  CreateSkillInput,
  UpdateCertificationInput,
  UpdateDocumentInput,
  UpdateEducationInput,
  UpdateEmergencyContactInput,
  UpdateEmployeeInput,
  UpdateExperienceInput,
  UpdateSkillInput,
} from '../validators/employee.validators.js';

export class EmployeeController {
  constructor(private readonly service = new EmployeeService()) {}

  private actor(req: Request) {
    return { id: req.user!.id, permissions: req.user!.permissions };
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.list(this.actor(req), req.query as Record<string, string>);
    res.json(successResponse(data, 'Employees'));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getById(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Employee profile'));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.create(this.actor(req), req.body as CreateEmployeeInput);
    res.status(201).json(successResponse(data, 'Employee created'));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.update(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateEmployeeInput,
    );
    res.json(successResponse(data, 'Employee updated'));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.remove(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Employee deleted'));
  };

  timeline = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getTimeline(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Employee timeline'));
  };

  activity = async (req: Request, res: Response): Promise<void> => {
    const limit = Number(req.query.limit ?? 20);
    const data = await this.service.getActivity(this.actor(req), req.params.id as string, limit);
    res.json(successResponse(data, 'Employee activity'));
  };

  createEmergencyContact = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createEmergencyContact(
      this.actor(req),
      req.params.id as string,
      req.body as CreateEmergencyContactInput,
    );
    res.status(201).json(successResponse(data, 'Emergency contact created'));
  };

  updateEmergencyContact = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateEmergencyContact(
      this.actor(req),
      req.params.id as string,
      req.params.contactId as string,
      req.body as UpdateEmergencyContactInput,
    );
    res.json(successResponse(data, 'Emergency contact updated'));
  };

  deleteEmergencyContact = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteEmergencyContact(
      this.actor(req),
      req.params.id as string,
      req.params.contactId as string,
    );
    res.json(successResponse(data, 'Emergency contact deleted'));
  };

  createEducation = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createEducation(
      this.actor(req),
      req.params.id as string,
      req.body as CreateEducationInput,
    );
    res.status(201).json(successResponse(data, 'Education record created'));
  };

  updateEducation = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateEducation(
      this.actor(req),
      req.params.id as string,
      req.params.eduId as string,
      req.body as UpdateEducationInput,
    );
    res.json(successResponse(data, 'Education record updated'));
  };

  deleteEducation = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteEducation(
      this.actor(req),
      req.params.id as string,
      req.params.eduId as string,
    );
    res.json(successResponse(data, 'Education record deleted'));
  };

  createExperience = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createExperience(
      this.actor(req),
      req.params.id as string,
      req.body as CreateExperienceInput,
    );
    res.status(201).json(successResponse(data, 'Experience record created'));
  };

  updateExperience = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateExperience(
      this.actor(req),
      req.params.id as string,
      req.params.expId as string,
      req.body as UpdateExperienceInput,
    );
    res.json(successResponse(data, 'Experience record updated'));
  };

  deleteExperience = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteExperience(
      this.actor(req),
      req.params.id as string,
      req.params.expId as string,
    );
    res.json(successResponse(data, 'Experience record deleted'));
  };

  createSkill = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createSkill(
      this.actor(req),
      req.params.id as string,
      req.body as CreateSkillInput,
    );
    res.status(201).json(successResponse(data, 'Skill created'));
  };

  updateSkill = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateSkill(
      this.actor(req),
      req.params.id as string,
      req.params.skillId as string,
      req.body as UpdateSkillInput,
    );
    res.json(successResponse(data, 'Skill updated'));
  };

  deleteSkill = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteSkill(
      this.actor(req),
      req.params.id as string,
      req.params.skillId as string,
    );
    res.json(successResponse(data, 'Skill deleted'));
  };

  createCertification = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createCertification(
      this.actor(req),
      req.params.id as string,
      req.body as CreateCertificationInput,
    );
    res.status(201).json(successResponse(data, 'Certification created'));
  };

  updateCertification = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateCertification(
      this.actor(req),
      req.params.id as string,
      req.params.certId as string,
      req.body as UpdateCertificationInput,
    );
    res.json(successResponse(data, 'Certification updated'));
  };

  deleteCertification = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteCertification(
      this.actor(req),
      req.params.id as string,
      req.params.certId as string,
    );
    res.json(successResponse(data, 'Certification deleted'));
  };

  createDocument = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createDocument(
      this.actor(req),
      req.params.id as string,
      req.body as CreateDocumentInput,
    );
    res.status(201).json(successResponse(data, 'Document created'));
  };

  updateDocument = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateDocument(
      this.actor(req),
      req.params.id as string,
      req.params.docId as string,
      req.body as UpdateDocumentInput,
    );
    res.json(successResponse(data, 'Document updated'));
  };

  deleteDocument = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteDocument(
      this.actor(req),
      req.params.id as string,
      req.params.docId as string,
    );
    res.json(successResponse(data, 'Document deleted'));
  };
}
