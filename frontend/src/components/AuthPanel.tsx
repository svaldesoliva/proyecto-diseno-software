import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { changeSession, type Session } from '../api/auth.ts'
import googleLogo from '../assets/google-g.png'

interface Props {
  session: Session
  productId: string | null
  googleError: boolean
  onChange: (user: Session['user']) => void
}

const authErrors = [
  'auth.invalidCredentials', 'auth.invalidInput', 'auth.usernameTaken',
  'auth.tryLater', 'auth.googleError', 'auth.requestError',
] as const

export default function AuthPanel({ session, productId, googleError, onChange }: Props) {
  const { t } = useTranslation()
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<typeof authErrors[number] | ''>(googleError ? 'auth.googleError' : '')
  const googleUrl = productId
    ? `/api/auth/google?${new URLSearchParams({ product: productId })}`
    : '/api/auth/google'

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (busy) return

    const fields = event ? new FormData(event.currentTarget) : null
    setBusy(true)
    setError('')
    try {
      const user = fields
        ? await changeSession(register ? 'register' : 'login', {
          username: String(fields.get('username')),
          password: String(fields.get('password')),
        })
        : await changeSession('logout')
      setRegister(false)
      onChange(user)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setError(authErrors.find((key) => key === message) ?? 'auth.requestError')
    } finally {
      setBusy(false)
    }
  }

  if (session.user) {
    return (
      <div className="account">
        <span>{t('auth.signedIn', { name: session.user.name })}</span>
        <button type="button" disabled={busy} onClick={() => void submit()}>
          {t('auth.logout')}
        </button>
        {error && <p role="alert">{t(error)}</p>}
      </div>
    )
  }

  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <h1 id="auth-title">{t(register ? 'auth.register' : 'auth.login')}</h1>
      <p>{t('auth.catalogPrompt')}</p>
      <form key={String(register)} method="post" onSubmit={submit}>
        <label>
          {t('auth.username')}
          <input name="username" autoComplete="username" required minLength={3} maxLength={32}
            pattern="[A-Za-z0-9_]{3,32}" aria-describedby={register ? 'username-hint' : undefined} />
          {register && <small id="username-hint">{t('auth.usernameHint')}</small>}
        </label>
        <label>
          {t('auth.password')}
          <input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'}
            required minLength={register ? 12 : undefined} maxLength={128}
            aria-describedby={register ? 'password-hint' : undefined} />
          {register && <small id="password-hint">{t('auth.passwordHint')}</small>}
        </label>
        <button type="submit" disabled={busy}>{t(register ? 'auth.register' : 'auth.login')}</button>
      </form>
      {error && <p role="alert">{t(error)}</p>}
      {session.googleEnabled && (
        <a className="google-login" href={googleUrl}>
          <img src={googleLogo} alt="" width={20} height={20} />
          {t('auth.google')}
        </a>
      )}
      <button className="auth-toggle" type="button" disabled={busy} onClick={() => {
        setRegister(!register)
        setError('')
      }}>
        {t(register ? 'auth.backToLogin' : 'auth.register')}
      </button>
    </section>
  )
}
