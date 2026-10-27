import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, FlaskConical, Info } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { forgotPasswordSchema, loginSchema, passwordSchema, signupSchema, type LoginInput, type SignupInput } from '@busbuddy/shared';
import { homePathFor, useAuth } from '@/app/auth-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { errorMessage } from '@/lib/api';
import { useSchools } from '@/services/queries';
import { useStartDemo } from './use-start-demo';

function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-text">
      {message}
    </p>
  );
}

function ServerRequiredNotice() {
  const { serverAvailable } = useAuth();
  if (serverAvailable) return null;
  return (
    <p className="mb-4 flex gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
      <span>Accounts need the BusBuddy server, which isn’t connected to this site. The interactive demo runs entirely in your browser and works without it.</span>
    </p>
  );
}

function DemoCallout() {
  const { config } = useAuth();
  const { start, pending } = useStartDemo();
  if (!config?.demoEnabled) return null;
  return (
    <div className="mt-6 rounded-xl border border-demo/30 bg-demo-soft p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-demo">
        <FlaskConical className="h-4 w-4" aria-hidden /> Judges and visitors
      </p>
      <p className="mt-1 text-text/90">Explore a fictional district with simulated buses. Demo sessions have student or parent access only — never administrator access.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => start('student')} loading={pending === 'student'}>
          Demo as student
        </Button>
        <Button size="sm" variant="outline" onClick={() => start('parent')} loading={pending === 'parent'}>
          Demo as parent
        </Button>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { signIn, me, config, serverAvailable } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const from = (location.state as { from?: string } | null)?.from;

  if (me) return <Navigate to={from ?? homePathFor(me)} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const user = await signIn(values);
      toast.success('Signed in');
      navigate(from ?? homePathFor(user), { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard
      title="Sign in to BusBuddy"
      description="Track your bus and manage arrival reminders."
      footer={
        <>
          New to BusBuddy?{' '}
          <Link to="/signup" className="font-semibold text-brand-strong underline">
            Create an account
          </Link>
        </>
      }
    >
      <ServerRequiredNotice />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={error} />
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(ids) => <Input {...ids} type="email" autoComplete="email" {...form.register('email')} />}
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          {(ids) => <Input {...ids} type="password" autoComplete="current-password" {...form.register('password')} />}
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-strong underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
      {config?.provider === 'local' && serverAvailable && <p className="mt-4 text-xs text-muted">Accounts on this deployment are stored by BusBuddy’s own server (passwords are hashed with bcrypt).</p>}
      <DemoCallout />
    </AuthCard>
  );
}

export function SignupPage() {
  const { signUp, me } = useAuth();
  const navigate = useNavigate();
  const schools = useSchools();
  const [error, setError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const form = useForm<SignupInput>({ resolver: zodResolver(signupSchema), defaultValues: { name: '', email: '', password: '', role: 'student', schoolId: '' } });

  if (me && !confirmEmail) return <Navigate to={homePathFor(me)} replace />;
  if (confirmEmail) {
    return (
      <AuthCard title="Check your email">
        <p className="flex gap-2 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success-text" aria-hidden /> We sent a confirmation link. Open it to finish creating your account, then sign in.
        </p>
      </AuthCard>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const r = await signUp(values);
      if (r.needsEmailConfirmation) setConfirmEmail(true);
      else {
        toast.success('Account created', { description: values.role === 'student' ? 'Choose your route and stop in Settings.' : 'Link your student from your parent dashboard.' });
        navigate(values.role === 'parent' ? '/parent' : '/settings', { replace: true });
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard
      title="Create your account"
      description="Student and parent accounts. Administrator accounts are created by your school."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-strong underline">
            Sign in
          </Link>
        </>
      }
    >
      <ServerRequiredNotice />
      {schools.isError ? (
        <ErrorState message="We couldn’t load the list of schools." onRetry={() => schools.refetch()} />
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError message={error} />
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">I am a…</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['student', 'parent'] as const).map((r) => (
                <label key={r} className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold capitalize has-[:checked]:border-brand has-[:checked]:bg-info-soft">
                  <input type="radio" value={r} {...form.register('role')} className="accent-[#2878E5]" />
                  {r}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Full name" error={form.formState.errors.name?.message}>
            {(ids) => <Input {...ids} autoComplete="name" {...form.register('name')} />}
          </Field>
          <Field label="Email" error={form.formState.errors.email?.message}>
            {(ids) => <Input {...ids} type="email" autoComplete="email" {...form.register('email')} />}
          </Field>
          <Field label="Password" hint="At least 10 characters, with a letter and a number." error={form.formState.errors.password?.message}>
            {(ids) => <Input {...ids} type="password" autoComplete="new-password" {...form.register('password')} />}
          </Field>
          <Field label="School" error={form.formState.errors.schoolId?.message && 'Choose your school'}>
            {(ids) => (
              <Select {...ids} {...form.register('schoolId')} disabled={schools.isPending}>
                <option value="">{schools.isPending ? 'Loading schools…' : 'Select a school'}</option>
                {schools.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isDemo ? ' (fictional demo school)' : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
            Create account
          </Button>
          <p className="text-xs text-muted">
            We only collect what’s needed to show your bus: your name, email, school and chosen stop. See our{' '}
            <Link to="/privacy" className="underline">
              privacy notice
            </Link>
            .
          </p>
        </form>
      )}
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const { requestPasswordReset, config } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard title="Reset your password" footer={<Link to="/login" className="font-semibold text-brand-strong underline">Back to sign in</Link>}>
      <ServerRequiredNotice />
      {sent ? (
        <div className="space-y-3 text-sm" role="status">
          <p className="flex gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success-text" aria-hidden /> If an account exists for that email, a reset link has been created. It expires in 30 minutes.
          </p>
          {config?.passwordResetDelivery === 'server_log' && (
            <p className="flex gap-2 rounded-lg bg-warning-soft p-3">
              <Info className="h-5 w-5 shrink-0 text-warning-text" aria-hidden />
              Email delivery isn’t configured on this local deployment. In development, the reset link is printed in the API server’s console instead.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError message={error} />
          <Field label="Email" error={form.formState.errors.email?.message}>
            {(ids) => <Input {...ids} type="email" autoComplete="email" {...form.register('email')} />}
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

const resetFormSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords don’t match', path: ['confirm'] });

export function ResetPasswordPage() {
  const { resetPassword, config } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ password: string; confirm: string }>({ resolver: zodResolver(resetFormSchema), defaultValues: { password: '', confirm: '' } });

  if (!token && config?.provider === 'local') {
    return (
      <AuthCard title="Reset link missing">
        <p className="text-sm text-muted">Open the full link from your reset message, or request a new one.</p>
        <Link to="/forgot-password" className="mt-4 inline-block font-semibold text-brand-strong underline">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await resetPassword(token, password);
      toast.success('Password updated', { description: 'Sign in with your new password.' });
      navigate('/login', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard title="Choose a new password">
      <ServerRequiredNotice />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={error} />
        <Field label="New password" hint="At least 10 characters, with a letter and a number." error={form.formState.errors.password?.message}>
          {(ids) => <Input {...ids} type="password" autoComplete="new-password" {...form.register('password')} />}
        </Field>
        <Field label="Confirm new password" error={form.formState.errors.confirm?.message}>
          {(ids) => <Input {...ids} type="password" autoComplete="new-password" {...form.register('confirm')} />}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}

export function DemoPage() {
  const { start, pending } = useStartDemo();
  return (
    <AuthCard title="Interactive demo" description="A fictional school district with simulated buses. No account needed.">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => start('student')}
          disabled={pending !== null}
          className="w-full rounded-xl border border-border p-4 text-left transition-colors hover:border-brand hover:bg-info-soft disabled:opacity-60"
        >
          <p className="font-bold">Explore as a student {pending === 'student' && '…'}</p>
          <p className="text-sm text-muted">Jordan rides Bus 12 on Route 1 and waits at Copper Kettle Park.</p>
        </button>
        <button
          type="button"
          onClick={() => start('parent')}
          disabled={pending !== null}
          className="w-full rounded-xl border border-border p-4 text-left transition-colors hover:border-brand hover:bg-info-soft disabled:opacity-60"
        >
          <p className="font-bold">Explore as a parent {pending === 'parent' && '…'}</p>
          <p className="text-sm text-muted">Casey follows two verified students — one on a delayed bus — and has one link awaiting school verification.</p>
        </button>
      </div>
      <p className="mt-5 text-xs text-muted">Demo sessions never have administrator access. Administrators sign in with an account created by the school.</p>
    </AuthCard>
  );
}
