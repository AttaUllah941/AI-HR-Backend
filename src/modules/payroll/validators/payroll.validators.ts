import { z } from 'zod';

const optionalString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().max(max).optional().nullable(),
  );

const componentKind = z.enum(['ALLOWANCE', 'DEDUCTION', 'BONUS', 'TAX']);
const calcType = z.enum(['FIXED', 'PERCENT_OF_BASIC']);
const requiredDate = z.coerce.date();

export const createSalaryComponentSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(50),
  kind: componentKind,
  calcType: calcType.optional(),
  defaultValue: z.number().min(0).max(1_000_000).optional(),
  isTaxable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  description: optionalString(1000),
});

export const updateSalaryComponentSchema = createSalaryComponentSchema.partial();

const structureItemSchema = z.object({
  componentId: z.string().min(1),
  value: z.number().min(0).max(1_000_000),
});

export const createSalaryStructureSchema = z.object({
  employeeId: z.string().min(1),
  basicSalary: z.number().min(0).max(10_000_000),
  currency: z.string().min(1).max(10).optional(),
  effectiveFrom: requiredDate,
  effectiveTo: requiredDate.optional().nullable(),
  bankName: optionalString(150),
  bankAccount: optionalString(100),
  bankIban: optionalString(50),
  notes: optionalString(2000),
  isActive: z.boolean().optional(),
  components: z.array(structureItemSchema).max(50).optional(),
});

export const updateSalaryStructureSchema = z.object({
  basicSalary: z.number().min(0).max(10_000_000).optional(),
  currency: z.string().min(1).max(10).optional(),
  effectiveFrom: requiredDate.optional(),
  effectiveTo: requiredDate.optional().nullable(),
  bankName: optionalString(150),
  bankAccount: optionalString(100),
  bankIban: optionalString(50),
  notes: optionalString(2000),
  isActive: z.boolean().optional(),
  components: z.array(structureItemSchema).max(50).optional(),
});

export const updateTaxSettingSchema = z.object({
  taxYear: z.number().int().min(2000).max(2100).optional(),
  standardRate: z.number().min(0).max(100).optional(),
  personalAllowance: z.number().min(0).max(10_000_000).optional(),
  notes: optionalString(2000),
});

export const createPayrollRunSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  title: z.string().min(1).max(200).optional(),
  notes: optionalString(2000),
});

export const updatePayrollRunSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: optionalString(2000),
});

export type CreateSalaryComponentInput = z.infer<typeof createSalaryComponentSchema>;
export type UpdateSalaryComponentInput = z.infer<typeof updateSalaryComponentSchema>;
export type CreateSalaryStructureInput = z.infer<typeof createSalaryStructureSchema>;
export type UpdateSalaryStructureInput = z.infer<typeof updateSalaryStructureSchema>;
export type UpdateTaxSettingInput = z.infer<typeof updateTaxSettingSchema>;
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type UpdatePayrollRunInput = z.infer<typeof updatePayrollRunSchema>;
