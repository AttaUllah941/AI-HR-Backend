import { z } from 'zod';

const blankToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

const optionalString = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

const employmentStatusSchema = z.enum(['ACTIVE', 'REMOTE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED']);
const employmentTypeSchema = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);

export const employeeListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  departmentId: z.string().min(1).optional(),
  status: employmentStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  sort: z.enum(['name', 'hireDate', 'status', 'department']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const createEmployeeSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  phone: optionalString(50),
  employeeNumber: optionalString(40),
  position: optionalString(120),
  departmentId: z.preprocess(blankToUndefined, z.string().min(1).optional().nullable()),
  locationId: z.preprocess(blankToUndefined, z.string().min(1).optional().nullable()),
  managerId: z.preprocess(blankToUndefined, z.string().min(1).optional().nullable()),
  hireDate: z.preprocess(blankToUndefined, z.coerce.date().optional().nullable()),
  employmentType: employmentTypeSchema.optional(),
  status: employmentStatusSchema.optional(),
  avatarUrl: optionalString(500),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
