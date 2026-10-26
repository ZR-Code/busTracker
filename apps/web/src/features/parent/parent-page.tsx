import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Link2, ShieldCheck, Unlink, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { linkStudentSchema, type LinkedStudentDto } from '@busbuddy/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { RecentNotifications } from '@/features/dashboard/dashboard-page';
import { BusTracker } from '@/features/tracking/bus-tracker';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLinkedStudents, useLinkStudent, useUnlinkStudent } from '@/services/queries';

export function ParentPage() {
  const links = useLinkedStudents();
  const [params, setParams] = useSearchParams();
  const [linkOpen, setLinkOpen] = useState(false);
  const [stops, setStops] = useState<Record<string, string>>({});
  const verified = (links.data ?? []).filter((l): l is LinkedStudentDto & { student: NonNullable<LinkedStudentDto['student']> } => l.status === 'verified' && l.student !== null);
  const pending = (links.data ?? []).filter((l) => l.status !== 'verified');
  const selectedId = params.get('student') ?? verified[0]?.student.id ?? null;
  const selected = verified.find((l) => l.student.id === selectedId) ?? verified[0] ?? null;

  return (
    <>
      <PageHeader
        title="My students"
        description="Follow the buses of students you’re verified to see."
        actions={
          <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
            <Link2 className="h-4 w-4" aria-hidden /> Link a student
          </Button>
        }
      />
      {links.isPending ? (
        <LoadingBlock />
      ) : links.isError ? (
        <ErrorState message={errorMessage(links.error)} onRetry={() => links.refetch()} />
      ) : (
        <div className="space-y-4">
          {verified.length > 1 && (
            <div role="tablist" aria-label="Choose a student" className="flex flex-wrap gap-2">
              {verified.map((l) => {
                const active = l.student.id === selected?.student.id;
                return (
                  <button
                    key={l.relationshipId}
                    role="tab"
                    aria-selected={active}
                    onClick={() =>
                      setParams(
                        (p) => {
                          p.set('student', l.student.id);
                          return p;
                        },
                        { replace: true },
                      )
                    }
                    className={cn('flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold', active ? 'border-brand bg-info-soft text-brand-strong' : 'border-border bg-surface hover:bg-surface-muted')}
                  >
                    <UserRound className="h-4 w-4" aria-hidden />
                    {l.student.name}
                  </button>
                );
              })}
            </div>
          )}

          {selected ? (
            <section aria-label={`Transportation for ${selected.student.name}`} className="space-y-4">
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-lg font-bold">{selected.student.name}</p>
                  <p className="text-sm text-muted">
                    {selected.student.schoolName} · {selected.student.assignedRouteName ?? 'No route assigned'} · Stop: {selected.student.defaultStopName ?? 'not set'}
                  </p>
                </div>
                <Badge tone="success">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verified by school
                </Badge>
              </Card>
              {selected.student.busId ? (
                <BusTracker
                  busId={selected.student.busId}
                  selectedStopId={stops[selected.student.id] ?? selected.student.defaultStopId}
                  onSelectStop={(id) => setStops((s) => ({ ...s, [selected.student.id]: id }))}
                  etaHeading={`${selected.student.name.split(' ')[0]}’s pickup`}
                />
              ) : (
                <EmptyState title="No bus assigned" description="This student doesn’t have a route assigned yet." />
              )}
            </section>
          ) : (
            <EmptyState
              icon={<UserRound className="h-6 w-6" />}
              title="No verified students yet"
              description="Ask your student for a link code from their BusBuddy settings. Your school verifies each link before student information is shared."
              action={<Button onClick={() => setLinkOpen(true)}>Link a student</Button>}
            />
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <LinksCard links={links.data ?? []} pendingCount={pending.length} />
            <RecentNotifications />
          </div>
        </div>
      )}
      <LinkStudentDialog open={linkOpen} onOpenChange={setLinkOpen} />
    </>
  );
}

function LinksCard({ links, pendingCount }: { links: LinkedStudentDto[]; pendingCount: number }) {
  const unlink = useUnlinkStudent();
  const [target, setTarget] = useState<LinkedStudentDto | null>(null);
  return (
    <Card>
      <CardHeader title="Student links" description={pendingCount ? `${pendingCount} waiting for school verification` : 'All links are verified'} as="h3" />
      <CardBody>
        {links.length === 0 ? (
          <p className="text-sm text-muted">No students linked yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {links.map((l) => (
              <li key={l.relationshipId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="text-sm">
                  <p className="font-semibold">{l.student?.name ?? 'Student (hidden until verified)'}</p>
                  <p className="text-muted">Requested {new Date(l.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {l.status === 'verified' ? (
                    <Badge tone="success">Verified</Badge>
                  ) : l.status === 'pending' ? (
                    <Badge tone="warning">
                      <Clock className="h-3.5 w-3.5" aria-hidden /> Pending
                    </Badge>
                  ) : (
                    <Badge tone="danger">Not approved</Badge>
                  )}
                  <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => setTarget(l)}>
                    <Unlink className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Pending links never reveal a student’s name, route or stop. Your school confirms each relationship (for example against enrollment records) before approving it.</p>
      </CardBody>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Remove this link?"
        description="You’ll stop seeing this student’s bus and alerts. Linking again requires a new code and school verification."
        confirmLabel="Remove link"
        loading={unlink.isPending}
        onConfirm={() =>
          target &&
          unlink.mutate(target.relationshipId, {
            onSuccess: () => {
              toast.success('Link removed');
              setTarget(null);
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </Card>
  );
}

function LinkStudentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const link = useLinkStudent();
  const form = useForm<{ code: string }>({ resolver: zodResolver(linkStudentSchema), defaultValues: { code: '' } });
  const onSubmit = form.handleSubmit(async ({ code }) => {
    try {
      await link.mutateAsync(code);
      toast.success('Link requested', { description: 'Your school will verify it before you can see the student’s bus.' });
      form.reset();
      onOpenChange(false);
    } catch (e) {
      form.setError('code', { message: errorMessage(e) });
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Link a student" description="Enter the one-time code from your student’s BusBuddy settings.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Link code" hint="Format: ABCD-1234" error={form.formState.errors.code?.message}>
          {(ids) => <Input {...ids} autoComplete="off" autoCapitalize="characters" placeholder="ABCD-1234" {...form.register('code')} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Request link
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
