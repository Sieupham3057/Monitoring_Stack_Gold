import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppDispatch } from '@/app/hooks'
import { APP_ROUTES } from '@/config/constants'
import { normalizeApiError } from '@/shared/api/error'
import { applyApiFormErrors } from '@/shared/hooks/useApiFormError'
import { useLoginMutation } from './authApi'
import { setSession } from './authSlice'
import { loginSchema, type LoginFormValues } from './validation'

export default function LoginPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const [login, { isLoading }] = useLoginMutation()
  const { register, handleSubmit, setError, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  const submit = async (values: LoginFormValues) => {
    try {
      const session = await login(values).unwrap()
      dispatch(setSession(session))
      const target = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      await navigate(target || APP_ROUTES.dashboard, { replace: true })
    } catch (error) {
      applyApiFormErrors(error, setError)
      setError('root', { message: normalizeApiError(error).message })
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">S</div>
        <h1>Chào mừng trở lại</h1>
        <p className="muted">Đăng nhập để tiếp tục quản trị hệ thống.</p>
        {errors.root?.message && <div className="alert alert-danger">{errors.root.message}</div>}
        <form noValidate onSubmit={(event) => void handleSubmit(submit)(event)}>
          <div className="form-group">
            <label htmlFor="username">Tên đăng nhập</label>
            <input id="username" className={errors.username ? 'form-control invalid' : 'form-control'} autoComplete="username" {...register('username')} />
            {errors.username && <span className="field-error">{errors.username.message}</span>}
          </div>
          <div className="form-group">
            <label htmlFor="password">Mật khẩu</label>
            <input id="password" className={errors.password ? 'form-control invalid' : 'form-control'} type="password" autoComplete="current-password" {...register('password')} />
            {errors.password && <span className="field-error">{errors.password.message}</span>}
          </div>
          <button className="button button-primary button-block" type="submit" disabled={isLoading}>
            {isLoading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        <p className="auth-switch">Chưa có tài khoản? <Link to={APP_ROUTES.register}>Đăng ký</Link></p>
      </section>
    </main>
  )
}
