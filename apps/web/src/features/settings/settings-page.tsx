import { Copy, Database, KeyRound, Link2, Trash2, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DATA_SOURCE_LABELS, formatClock, REMINDER_LEAD_OPTIONS, type DistanceUnits, type ThemePreference } from '@busbuddy/shared';
import { useAuth } from '@/app/auth-context';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { BrowserNotificationsPrompt } from '@/features/notifications/notifications-page';
import { api, errorMessage } from '@/lib/api';
import { useCreateLinkCode, useRoute, useRoutes, useSchools, useUpdateProfile, useUpdateStudentProfile } from '@/services/queries';

export function SettingsPage() {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <>
      <PageHeader title="Settings" description="Your profile, bus, reminders and display preferences." />
      <div className="grid gap-4 xl:grid-cols-2">
        <ProfileCard />
        {me.role === 'student' && <TransportCard />}
        <RemindersCard />
        <DisplayCard />
        {me.role === 'student' && !me.isDemo && <ParentLinkCard />}
        <DataSourceCard />
        <AccountCard />
      </div>
    </>
  );
}

function ProfileCard() {
  const { me } = useAuth();
  const update = useUpdateProfile();
  const [name, setName] = useState(me?.name ?? '');
  const valid = name.trim().length >= 2;
  return (
    <Card>
      <CardHeader title="Profile" icon={<User className="h-4 w-4 text-brand" aria-hidden />} />
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            update.mutate({ name: name.trim() }, { onSuccess: () => toast.success('Profile saved'), onError: (err) => toast.error(errorMessage(err)) });
          }}
        >
          <Field label="Name" error={!valid ? 'Enter at least 2 characters' : undefined}>
            {(ids) => <Input {...ids} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
          </Field>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Email</dt>
              <dd className="font-semibold">{me?.email ?? (me?.isDemo ? 'Demo session' : '—')}</dd>
            </div>
            <div>
              <dt className="text-muted">Account type</dt>
              <dd className="font-semibold capitalize">{me?.role}</dd>
            </div>
          </dl>
          <Button type="submit" loading={update.isPending} disabled={!valid || name.trim() === me?.name}>
            Save profile
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function TransportCard() {
  const { me } = useAuth();
  const p = me?.studentProfile;
  const schools = useSchools();
  const routes = useRoutes();
  const update = useUpdateStudentProfile();
  const route = useRoute(p?.assignedRouteId);
  const canEdit = me?.permissions.canSelfAssignRoute ?? false;
  const save = (input: Parameters<typeof update.mutate>[0], msg: string) =>
    update.mutate(input, { onSuccess: () => toast.success(msg), onError: (e) => toast.error('Couldn’t save', { description: errorMessage(e) }) });

  return (
    <Card>
      <CardHeader title="School, route and stop" description={canEdit ? 'Choose the bus you ride.' : 'Assigned by your school. Contact your transportation office to change it.'} />
      <CardBody className="space-y-4">
        <Field label="Preferred school">
          {(ids) => (
            <Select {...ids} value={p?.schoolId ?? ''} disabled={!canEdit || update.isPending} onChange={(e) => save({ schoolId: e.target.value }, 'School updated')}>
              {schools.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Assigned route">
          {(ids) => (
            <Select {...ids} value={p?.assignedRouteId ?? ''} disabled={!canEdit || update.isPending} onChange={(e) => save({ assignedRouteId: e.target.value || null }, 'Route updated — now choose your stop')}>
              <option value="">No route</option>
              {routes.data
                ?.filter((r) => r.schoolId === p?.schoolId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    Route {r.number} – {r.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Default stop" hint="Your dashboard shows the countdown for this stop.">
          {(ids) => (
            <Select {...ids} value={p?.defaultStopId ?? ''} disabled={!canEdit || !p?.assignedRouteId || update.isPending} onChange={(e) => save({ defaultStopId: e.target.value || null }, 'Default stop updated')}>
              <option value="">{p?.assignedRouteId ? 'Choose a stop' : 'Choose a route first'}</option>
              {route.data?.stops.map((s) => (
                <option key={s.stopId} value={s.stopId}>
                  {s.order}. {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </CardBody>
    </Card>
  );
}

function RemindersCard() {
  const { me } = useAuth();
  const update = useUpdateProfile();
  const s = me!.settings;
  const save = (settings: Parameters<typeof update.mutate>[0]['settings'], msg: string) =>
    update.mutate({ settings }, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card>
      <CardHeader title="Arrival reminders" description="Arrival predictions are estimates. Leave a little extra time." />
      <CardBody className="space-y-5">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-semibold">Send arrival reminders</span>
            <span className="block text-sm text-muted">Pauses every stop reminder without deleting them.</span>
          </span>
          <Switch checked={s.remindersEnabled} onCheckedChange={(v) => save({ remindersEnabled: v }, v ? 'Reminders on' : 'Reminders paused')} aria-label="Send arrival reminders" />
        </label>
        <div>
          <p className="mb-2 text-sm font-semibold" id="lead-label">
            Default reminder lead time
          </p>
          <Segmented
            label="Default reminder lead time"
            value={s.reminderLeadMinutes}
            onChange={(v) => save({ reminderLeadMinutes: v as 2 | 5 | 10 }, `Default lead time: ${v} minutes`)}
            options={REMINDER_LEAD_OPTIONS.map((n) => ({ value: n as number, label: `${n} minutes before` }))}
          />
          <p className="mt-2 text-xs text-muted">Set reminders for individual stops on the Stops page or while tracking a bus.</p>
        </div>
        <BrowserNotificationsPrompt inline />
      </CardBody>
    </Card>
  );
}

function DisplayCard() {
  const { me } = useAuth();
  const update = useUpdateProfile();
  const s = me!.settings;
  return (
    <Card>
      <CardHeader title="Display" />
      <CardBody className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold">Distance units</p>
          <Segmented<DistanceUnits>
            label="Distance units"
            value={s.distanceUnits}
            onChange={(v) => update.mutate({ settings: { distanceUnits: v } }, { onSuccess: () => toast.success(v === 'metric' ? 'Using kilometers' : 'Using miles') })}
            options={[
              { value: 'imperial', label: 'Miles / feet' },
              { value: 'metric', label: 'Kilometers / meters' },
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Theme</p>
          <Segmented<ThemePreference>
            label="Theme"
            value={s.theme}
            onChange={(v) => update.mutate({ settings: { theme: v } }, { onSuccess: () => toast.success('Theme updated') })}
            options={[
              { value: 'system', label: 'Match device' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </CardBody>
    </Card>
  );
}

function ParentLinkCard() {
  const create = useCreateLinkCode();
  const code = create.data;
  return (
    <Card>
      <CardHeader title="Link a parent" icon={<Link2 className="h-4 w-4 text-brand" aria-hidden />} description="Give a one-time code to a parent or guardian. Your school must verify the link before they can see your bus." />
      <CardBody>
        {code ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">Share this code only with your parent or guardian:</p>
            <div className="flex items-center gap-2">
              <code className="rounded-lg bg-surface-muted px-4 py-2 text-2xl font-bold tracking-widest">{code.code}</code>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy code"
                onClick={() => navigator.clipboard?.writeText(code.code).then(() => toast.success('Code copied'), () => toast.error('Copy failed — select the code instead'))}
              >
                <Copy className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <p className="text-xs text-muted">Expires {formatClock(code.expiresAt)} tomorrow. Creating a new code cancels this one.</p>
          </div>
        ) : null}
        <Button className="mt-3" variant={code ? 'outline' : 'primary'} loading={create.isPending} onClick={() => create.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>
          <KeyRound className="h-4 w-4" aria-hidden /> {code ? 'Create a new code' : 'Create link code'}
        </Button>
      </CardBody>
    </Card>
  );
}

function DataSourceCard() {
  return (
    <Card>
      <CardHeader title="Data sources" icon={<Database className="h-4 w-4 text-brand" aria-hidden />} />
      <CardBody className="space-y-2 text-sm">
        <p>
          <strong>{DATA_SOURCE_LABELS.district_gps}:</strong> positions reported by a school district’s GPS system. This deployment has no district connected.
        </p>
        <p>
          <strong>{DATA_SOURCE_LABELS.demo_simulation}:</strong> fictional buses moved by BusBuddy’s simulator, always labeled “DEMO LIVE SIMULATION.”
        </p>
        <p>
          <strong>{DATA_SOURCE_LABELS.manual_test}:</strong> positions typed in by an administrator for testing.
        </p>
        <p className="text-muted">If a bus hasn’t reported its location for over 90 seconds, BusBuddy shows “Location update delayed” and marks its estimate as uncertain.</p>
      </CardBody>
    </Card>
  );
}

function AccountCard() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!me || me.role === 'admin') return null;
  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete('/me');
      await signOut();
      toast.success(me.isDemo ? 'Demo data deleted' : 'Account deleted');
      navigate('/');
    } catch (e) {
      toast.error('Couldn’t delete account', { description: errorMessage(e) });
    } finally {
      setDeleting(false);
      setOpen(false);
    }
  };
  return (
    <Card>
      <CardHeader title={me.isDemo ? 'Demo session data' : 'Delete account'} />
      <CardBody>
        <p className="text-sm text-muted">
          {me.isDemo ? 'Delete this demo session and everything you changed in it. Demo sessions are also deleted automatically after 24 hours.' : 'Permanently delete your account, saved stops, reminders and notifications.'}
        </p>
        <Button variant="danger" className="mt-3" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" aria-hidden /> {me.isDemo ? 'Delete demo data' : 'Delete my account'}
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={me.isDemo ? 'Delete demo session?' : 'Delete your account?'}
          description="This can’t be undone. Your saved stops, reminders and notifications will be removed."
          confirmLabel="Delete permanently"
          onConfirm={remove}
          loading={deleting}
        />
      </CardBody>
    </Card>
  );
}
