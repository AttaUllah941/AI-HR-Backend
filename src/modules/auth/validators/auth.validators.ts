import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Password must include at least one letter and one number');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  companyName: z.string().trim().min(1).max(200).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  remember: z.boolean().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});

export const mfaEnableSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type MfaEnableInput = z.infer<typeof mfaEnableSchema>;
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;
