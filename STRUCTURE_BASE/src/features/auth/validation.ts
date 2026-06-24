import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Vui lòng nhập tên đăng nhập'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
})

export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Tên đăng nhập cần ít nhất 3 ký tự')
      .max(50, 'Tên đăng nhập tối đa 50 ký tự')
      .regex(/^[a-zA-Z0-9._-]+$/, 'Chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang'),
    email: z.email('Email không đúng định dạng').max(100, 'Email tối đa 100 ký tự'),
    password: z
      .string()
      .min(8, 'Mật khẩu cần ít nhất 8 ký tự')
      .max(100, 'Mật khẩu tối đa 100 ký tự')
      .regex(/[a-z]/, 'Cần ít nhất một chữ thường')
      .regex(/[A-Z]/, 'Cần ít nhất một chữ hoa')
      .regex(/\d/, 'Cần ít nhất một chữ số')
      .regex(/[^a-zA-Z0-9]/, 'Cần ít nhất một ký tự đặc biệt'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu xác nhận chưa khớp',
  })

export type LoginFormValues = z.infer<typeof loginSchema>
export type RegisterFormValues = z.infer<typeof registerSchema>
