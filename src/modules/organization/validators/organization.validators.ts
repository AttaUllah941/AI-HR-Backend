import { z } from 'zod';

const optionalString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().max(max).optional().nullable(),
  );

export const createBranchSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(50),
  addressLine1: optionalString(200),
  addressLine2: optionalString(200),
  city: optionalString(100),
  state: optionalString(100),
  country: optionalString(100),
  postalCode: optionalString(30),
  phone: optionalString(50),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().email().max(255).optional().nullable(),
  ),
  isHeadOffice: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateBranchSchema = createBranchSchema.partial();

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(50),
  description: optionalString(500),
  branchId: optionalString(50),
  parentId: optionalString(50),
  isActive: z.boolean().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const createTeamSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(50),
  description: optionalString(500),
  departmentId: z.string().min(1),
  isActive: z.boolean().optional(),
});

export const updateTeamSchema = createTeamSchema.partial();

export const createDesignationSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(50),
  level: z.number().int().min(1).max(100).optional(),
  description: optionalString(500),
  isActive: z.boolean().optional(),
});

export const updateDesignationSchema = createDesignationSchema.partial();

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;
export type UpdateDesignationInput = z.infer<typeof updateDesignationSchema>;
