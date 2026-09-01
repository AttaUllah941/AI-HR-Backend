import { z } from 'zod';

const optionalString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().max(max).optional().nullable(),
  );

const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().email().max(255).optional().nullable(),
);

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.date().optional().nullable(),
);

const employeeStatus = z.enum([
  'DRAFT',
  'ACTIVE',
  'ON_LEAVE',
  'PROBATION',
  'NOTICE_PERIOD',
  'TERMINATED',
  'RESIGNED',
  'INACTIVE',
]);

const employmentType = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT']);

const gender = z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']);

export const createEmployeeSchema = z.object({
  employeeCode: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: optionalString(50),
  personalEmail: optionalEmail,
  dateOfBirth: optionalDate,
  gender: gender.optional().nullable(),
  nationality: optionalString(100),
  maritalStatus: optionalString(50),
  avatarUrl: optionalString(500),
  addressLine1: optionalString(200),
  addressLine2: optionalString(200),
  city: optionalString(100),
  state: optionalString(100),
  country: optionalString(100),
  postalCode: optionalString(30),
  branchId: optionalString(50),
  departmentId: optionalString(50),
  teamId: optionalString(50),
  designationId: optionalString(50),
  managerId: optionalString(50),
  employmentType: employmentType.optional(),
  status: employeeStatus.optional(),
  joinDate: optionalDate,
  probationEndDate: optionalDate,
  confirmationDate: optionalDate,
  exitDate: optionalDate,
  workLocation: optionalString(150),
  bio: optionalString(2000),
  notes: optionalString(2000),
  isActive: z.boolean().optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const createEmergencyContactSchema = z.object({
  name: z.string().min(1).max(150),
  relationship: z.string().min(1).max(100),
  phone: z.string().min(1).max(50),
  email: optionalEmail,
  isPrimary: z.boolean().optional(),
});

export const updateEmergencyContactSchema = createEmergencyContactSchema.partial();

export const createEducationSchema = z.object({
  institution: z.string().min(1).max(200),
  degree: optionalString(150),
  fieldOfStudy: optionalString(150),
  startDate: optionalDate,
  endDate: optionalDate,
  grade: optionalString(50),
  description: optionalString(1000),
});

export const updateEducationSchema = createEducationSchema.partial();

export const createExperienceSchema = z.object({
  companyName: z.string().min(1).max(200),
  title: z.string().min(1).max(150),
  location: optionalString(150),
  startDate: optionalDate,
  endDate: optionalDate,
  isCurrent: z.boolean().optional(),
  description: optionalString(2000),
});

export const updateExperienceSchema = createExperienceSchema.partial();

export const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  level: optionalString(50),
  years: z.number().int().min(0).max(80).optional().nullable(),
});

export const updateSkillSchema = createSkillSchema.partial();

export const createCertificationSchema = z.object({
  name: z.string().min(1).max(200),
  issuer: optionalString(200),
  credentialId: optionalString(100),
  issuedDate: optionalDate,
  expiryDate: optionalDate,
  documentUrl: optionalString(500),
});

export const updateCertificationSchema = createCertificationSchema.partial();

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  fileName: optionalString(255),
  fileUrl: optionalString(500),
  mimeType: optionalString(100),
  fileSize: z.number().int().min(0).optional().nullable(),
});

export const updateDocumentSchema = createDocumentSchema.partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type CreateEmergencyContactInput = z.infer<typeof createEmergencyContactSchema>;
export type UpdateEmergencyContactInput = z.infer<typeof updateEmergencyContactSchema>;
export type CreateEducationInput = z.infer<typeof createEducationSchema>;
export type UpdateEducationInput = z.infer<typeof updateEducationSchema>;
export type CreateExperienceInput = z.infer<typeof createExperienceSchema>;
export type UpdateExperienceInput = z.infer<typeof updateExperienceSchema>;
export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
export type CreateCertificationInput = z.infer<typeof createCertificationSchema>;
export type UpdateCertificationInput = z.infer<typeof updateCertificationSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
