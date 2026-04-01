import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const devLoginSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().min(1, 'Email is required'),
});

export type DevLoginInput = z.infer<typeof devLoginSchema>;

export const ssoLoginSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
});

export type SsoLoginInput = z.infer<typeof ssoLoginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
