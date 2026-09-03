import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { EmployeeController } from './controllers/employee.controller.js';
import {
  createCertificationSchema,
  createDocumentSchema,
  createEducationSchema,
  createEmergencyContactSchema,
  createEmployeeSchema,
  createExperienceSchema,
  createSkillSchema,
  updateCertificationSchema,
  updateDocumentSchema,
  updateEducationSchema,
  updateEmergencyContactSchema,
  updateEmployeeSchema,
  updateExperienceSchema,
  updateSkillSchema,
} from './validators/employee.validators.js';

const controller = new EmployeeController();

export const employeesRouter = Router();

employeesRouter.use(authMiddleware);

employeesRouter.get('/', requirePermissions('employees:view'), asyncHandler(controller.list));
employeesRouter.get(
  '/:id',
  requirePermissions('employees:view'),
  asyncHandler(controller.getById),
);
employeesRouter.post(
  '/',
  requirePermissions('employees:create'),
  validateBody(createEmployeeSchema),
  asyncHandler(controller.create),
);
employeesRouter.patch(
  '/:id',
  requirePermissions('employees:update'),
  validateBody(updateEmployeeSchema),
  asyncHandler(controller.update),
);
employeesRouter.delete(
  '/:id',
  requirePermissions('employees:delete'),
  asyncHandler(controller.remove),
);

employeesRouter.get(
  '/:id/timeline',
  requirePermissions('employees:view'),
  asyncHandler(controller.timeline),
);
employeesRouter.get(
  '/:id/activity',
  requirePermissions('employees:view'),
  asyncHandler(controller.activity),
);

employeesRouter.post(
  '/:id/emergency-contacts',
  requirePermissions('employees:update'),
  validateBody(createEmergencyContactSchema),
  asyncHandler(controller.createEmergencyContact),
);
employeesRouter.patch(
  '/:id/emergency-contacts/:contactId',
  requirePermissions('employees:update'),
  validateBody(updateEmergencyContactSchema),
  asyncHandler(controller.updateEmergencyContact),
);
employeesRouter.delete(
  '/:id/emergency-contacts/:contactId',
  requirePermissions('employees:update'),
  asyncHandler(controller.deleteEmergencyContact),
);

employeesRouter.post(
  '/:id/education',
  requirePermissions('employees:update'),
  validateBody(createEducationSchema),
  asyncHandler(controller.createEducation),
);
employeesRouter.patch(
  '/:id/education/:eduId',
  requirePermissions('employees:update'),
  validateBody(updateEducationSchema),
  asyncHandler(controller.updateEducation),
);
employeesRouter.delete(
  '/:id/education/:eduId',
  requirePermissions('employees:update'),
  asyncHandler(controller.deleteEducation),
);

employeesRouter.post(
  '/:id/experience',
  requirePermissions('employees:update'),
  validateBody(createExperienceSchema),
  asyncHandler(controller.createExperience),
);
employeesRouter.patch(
  '/:id/experience/:expId',
  requirePermissions('employees:update'),
  validateBody(updateExperienceSchema),
  asyncHandler(controller.updateExperience),
);
employeesRouter.delete(
  '/:id/experience/:expId',
  requirePermissions('employees:update'),
  asyncHandler(controller.deleteExperience),
);

employeesRouter.post(
  '/:id/skills',
  requirePermissions('employees:update'),
  validateBody(createSkillSchema),
  asyncHandler(controller.createSkill),
);
employeesRouter.patch(
  '/:id/skills/:skillId',
  requirePermissions('employees:update'),
  validateBody(updateSkillSchema),
  asyncHandler(controller.updateSkill),
);
employeesRouter.delete(
  '/:id/skills/:skillId',
  requirePermissions('employees:update'),
  asyncHandler(controller.deleteSkill),
);

employeesRouter.post(
  '/:id/certifications',
  requirePermissions('employees:update'),
  validateBody(createCertificationSchema),
  asyncHandler(controller.createCertification),
);
employeesRouter.patch(
  '/:id/certifications/:certId',
  requirePermissions('employees:update'),
  validateBody(updateCertificationSchema),
  asyncHandler(controller.updateCertification),
);
employeesRouter.delete(
  '/:id/certifications/:certId',
  requirePermissions('employees:update'),
  asyncHandler(controller.deleteCertification),
);

employeesRouter.post(
  '/:id/documents',
  requirePermissions('employees:update'),
  validateBody(createDocumentSchema),
  asyncHandler(controller.createDocument),
);
employeesRouter.patch(
  '/:id/documents/:docId',
  requirePermissions('employees:update'),
  validateBody(updateDocumentSchema),
  asyncHandler(controller.updateDocument),
);
employeesRouter.delete(
  '/:id/documents/:docId',
  requirePermissions('employees:update'),
  asyncHandler(controller.deleteDocument),
);
