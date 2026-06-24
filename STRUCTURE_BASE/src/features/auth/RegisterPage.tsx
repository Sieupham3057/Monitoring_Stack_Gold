import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { APP_ROUTES } from '@/config/constants'
import { applyApiFormErrors } from '@/shared/hooks/useApiFormError'
import { useRegisterMutation } from './authApi'
import { registerSchema, type RegisterFormValues } from './validation'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [createAccount, { isLoading }] = useRegisterMutation()
  const { register, handleSubmit, setError, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  })

  const submit = async (values: RegisterFormValues) => {
    try {
      await createAccount({ username: values.username, email: values.email, password: values.password }).unwrap()
      await navigate(APP_ROUTES.login, { replace: true, state: { registered: true } })
    } catch (error) {
      const normalized = applyApiFormErrors(error, setError)
      setError('root', { message: normalized.message })
    }
  }

  const fields = [
    ['username', 'Tên đăng nhập', 'text', 'username'],
    ['email', 'Email', 'email', 'email'],
    ['password', 'Mật khẩu', 'password', 'new-password'],
    ['confirmPassword', 'Xác nhận mật khẩu', 'password', 'new-password'],
  ] as const

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-wide">
        <div className="auth-brand">S</div>
        <h1>Tạo tài khoản</h1>
        <p className="muted">Thông tin được kiểm tra đồng nhất với backend.</p>
        {errors.root?.message && <div className="alert alert-danger">{errors.root.message}</div>}
        <form noValidate onSubmit={(event) => void handleSubmit(submit)(event)}>
          {fields.map(([name, label, type, autoComplete]) => (
            <div className="form-group" key={name}>
              <label htmlFor={name}>{label}</label>
              <input id={name} className={errors[name] ? 'form-control invalid' : 'form-control'} type={type} autoComplete={autoComplete} {...register(name)} />
              {errors[name] && <span className="field-error">{errors[name]?.message}</span>}
            </div>
          ))}
          <button className="button button-primary button-block" type="submit" disabled={isLoading}>
            {isLoading ? 'Đang tạo tài khoản…' : 'Đăng ký'}
          </button>
        </form>
        <p className="auth-switch">Đã có tài khoản? <Link to={APP_ROUTES.login}>Đăng nhập</Link></p>
      </section>
    </main>
  )
}
