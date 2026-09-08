import { z } from 'zod';

const blankToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

const optionalString = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const updateCompanySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  legalName: optionalString(200),
  email: z.preprocess(blankToUndefined, z.string().trim().email().max(255).optional()),
  phone: optionalString(50),
  website: optionalString(255),
  logoUrl: optionalString(500),
  addressLine1: optionalString(255),
  addressLine2: optionalString(255),
  city: optionalString(100),
  state: optionalString(100),
  country: optionalString(100),
  postalCode: optionalString(30),
  timezone: z.string().trim().min(1).max(100).optional(),
  locale: z.string().trim().min(2).max(20).optional(),
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: optionalString(40),
  description: optionalString(500),
  parentId: z.preprocess(blankToUndefined, z.string().min(1).optional().nullable()),
  isActive: z.boolean().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: optionalString(40),
  addressLine1: optionalString(255),
  city: optionalString(100),
  state: optionalString(100),
  country: optionalString(100),
  postalCode: optionalString(30),
  timezone: optionalString(100),
  isHeadquarters: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateLocationSchema = createLocationSchema.partial();

export const listQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type ListQueryInput = z.infer<typeof listQuerySchema>;
