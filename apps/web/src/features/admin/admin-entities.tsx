import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ANNOUNCEMENT_SEVERITIES,
  DATA_SOURCE_LABELS,
  DATA_SOURCES,
  formatClock,
  formatRelative,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  schoolInputSchema,
  type AnnouncementDto,
  type BusDto,
  type StopDto,
} from '@busbuddy/shared';
import { BusStatusBadge } from '@/components/bus/status';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { api, useAdminAnnouncements, useAdminBuses, useAdminMutation, useAdminRoutes, useAdminSchools, useAdminStops, useParentLinks, type AdminSchool } from './admin-api';

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </Card>
  );
}

function RowActions({ onEdit, onDelete, label }: { onEdit?: () => void; onDelete?: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && (
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${label}`}>
          <Pencil className="h-4 w-4" aria-hidden />
        </Button>
      )}
      {onDelete && (
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Delete ${label}`}>
          <Trash2 className="h-4 w-4 text-danger-text" aria-hidden />
        </Button>
      )}
    </div>
  );
}

function useConfirm<T>() {
  const [target, setTarget] = useState<T | null>(null);
  return { target, ask: setTarget, close: () => setTarget(null) };
}

function SchoolSelect({ value, onChange, schools, id, ...rest }: { value: string; onChange: (v: string) => void; schools: AdminSchool[] | undefined; id: string }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {schools?.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

const busFormSchema = z.object({
  busNumber: z.string().trim().min(1, 'Required').max(12),
  schoolId: z.string().min(1, 'Choose a school'),
  routeId: z.string(),
  inService: z.boolean(),
  dataSource: z.enum(DATA_SOURCES),
  capacity: z.coerce.number().int().min(1).max(120),
});
type BusForm = z.infer<typeof busFormSchema>;

export function AdminBusesPage() {
  const buses = useAdminBuses();
  const routes = useAdminRoutes();
  const schools = useAdminSchools();
  const [editing, setEditing] = useState<BusDto | 'new' | null>(null);
  const [locating, setLocating] = useState<BusDto | null>(null);
  const del = useConfirm<BusDto>();
  const remove = useAdminMutation((b: BusDto) => api.delete(`/admin/buses/${b.id}`), { success: 'Bus removed' });

  return (
    <>
      <PageHeader
        title="Buses"
        description="Assign buses to routes, take them out of service and choose their location source."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden /> Add bus
          </Button>
        }
      />
      {buses.isPending ? (
        <LoadingBlock />
      ) : buses.isError ? (
        <ErrorState message={errorMessage(buses.error)} onRetry={() => buses.refetch()} />
      ) : buses.data.length === 0 ? (
        <EmptyState title="No buses yet" action={<Button onClick={() => setEditing('new')}>Add bus</Button>} />
      ) : (
        <Table head={['Bus', 'Route', 'Status', 'Location source', 'Capacity', '']}>
          {buses.data.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-3 font-semibold">Bus {b.busNumber}</td>
              <td className="px-4 py-3">{b.routeName ? `Route ${b.routeNumber} – ${b.routeName}` : <span className="text-muted">Unassigned</span>}</td>
              <td className="px-4 py-3">
                <BusStatusBadge status={b.status} />
              </td>
              <td className="px-4 py-3">
                {DATA_SOURCE_LABELS[b.dataSource]}
                {b.dataSource === 'manual_test' && (
                  <Button variant="ghost" size="sm" className="ml-1" onClick={() => setLocating(b)}>
                    Set location
                  </Button>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums">{b.capacity}</td>
              <td className="px-4 py-3">
                <RowActions label={`bus ${b.busNumber}`} onEdit={() => setEditing(b)} onDelete={() => del.ask(b)} />
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <BusDialog bus={editing === 'new' ? null : editing} onClose={() => setEditing(null)} routes={routes.data ?? []} schools={schools.data} />}
      {locating && <ManualLocationDialog bus={locating} onClose={() => setLocating(null)} />}
      <ConfirmDialog
        open={del.target !== null}
        onOpenChange={(o) => !o && del.close()}
        title={`Remove bus ${del.target?.busNumber}?`}
        description="The bus and its location history will be deleted. Students on its route will no longer see it."
        confirmLabel="Remove bus"
        loading={remove.isPending}
        onConfirm={() => del.target && remove.mutate(del.target, { onSettled: del.close })}
      />
    </>
  );
}

function BusDialog({ bus, onClose, routes, schools }: { bus: BusDto | null; onClose: () => void; routes: { id: string; name: string; number: string; schoolId: string }[]; schools: AdminSchool[] | undefined }) {
  const form = useForm<BusForm>({
    resolver: zodResolver(busFormSchema) as never,
    defaultValues: {
      busNumber: bus?.busNumber ?? '',
      schoolId: bus?.schoolId ?? schools?.[0]?.id ?? '',
      routeId: bus?.routeId ?? '',
      inService: bus ? bus.status !== 'out_of_service' : true,
      dataSource: bus?.dataSource ?? 'demo_simulation',
      capacity: bus?.capacity ?? 72,
    },
  });
  const save = useAdminMutation(
    (v: BusForm) => {
      const body = { busNumber: v.busNumber, schoolId: v.schoolId, routeId: v.routeId || null, status: v.inService ? (bus && bus.status !== 'out_of_service' ? bus.status : 'scheduled') : 'out_of_service', dataSource: v.dataSource, capacity: v.capacity };
      return bus ? api.put(`/admin/buses/${bus.id}`, body) : api.post('/admin/buses', body);
    },
    { success: bus ? 'Bus updated' : 'Bus added' },
  );
  const schoolId = form.watch('schoolId');
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={bus ? `Edit bus ${bus.busNumber}` : 'Add bus'}>
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v, { onSuccess: onClose }))}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bus number" error={e.busNumber?.message}>
            {(ids) => <Input {...ids} {...form.register('busNumber')} />}
          </Field>
          <Field label="Capacity" error={e.capacity?.message}>
            {(ids) => <Input {...ids} type="number" min={1} max={120} {...form.register('capacity')} />}
          </Field>
        </div>
        <Field label="School" error={e.schoolId?.message}>
          {(ids) => <SchoolSelect {...ids} schools={schools} value={schoolId} onChange={(v) => form.setValue('schoolId', v, { shouldValidate: true })} />}
        </Field>
        <Field label="Assigned route">
          {(ids) => (
            <Select {...ids} {...form.register('routeId')}>
              <option value="">Unassigned (spare)</option>
              {routes
                .filter((r) => r.schoolId === schoolId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    Route {r.number} – {r.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Location source" hint="Use District GPS only for buses reported by a configured GPS feed.">
          {(ids) => (
            <Select {...ids} {...form.register('dataSource')}>
              {DATA_SOURCES.map((d) => (
                <option key={d} value={d}>
                  {DATA_SOURCE_LABELS[d]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <span className="text-sm">
            <span className="block font-semibold">In service</span>
            <span className="text-muted">Turn off to mark the bus out of service (it stops being simulated or tracked).</span>
          </span>
          <Switch checked={form.watch('inService')} onCheckedChange={(v) => form.setValue('inService', v)} aria-label="In service" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {bus ? 'Save changes' : 'Add bus'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const manualSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  heading: z.coerce.number().min(0).max(360),
  speedMps: z.coerce.number().min(0).max(45),
  ageSeconds: z.coerce.number().int().min(0).max(86_400),
});
type ManualForm = z.infer<typeof manualSchema>;

function ManualLocationDialog({ bus, onClose }: { bus: BusDto; onClose: () => void }) {
  const form = useForm<ManualForm>({ resolver: zodResolver(manualSchema) as never, defaultValues: { lat: 41.748, lng: -88.165, heading: 0, speedMps: 8, ageSeconds: 0 } });
  const save = useAdminMutation((v: ManualForm) => api.post(`/admin/buses/${bus.id}/manual-location`, v), { success: 'Test location recorded' });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Manual test location — Bus ${bus.busNumber}`} description="Positions entered here are labeled “Manual test location”. Back-date a sample to test stale-data handling.">
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v, { onSuccess: onClose }))}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">{(ids) => <Input {...ids} inputMode="decimal" {...form.register('lat')} />}</Field>
          <Field label="Longitude">{(ids) => <Input {...ids} inputMode="decimal" {...form.register('lng')} />}</Field>
          <Field label="Heading (°)">{(ids) => <Input {...ids} inputMode="decimal" {...form.register('heading')} />}</Field>
          <Field label="Speed (m/s)">{(ids) => <Input {...ids} inputMode="decimal" {...form.register('speedMps')} />}</Field>
        </div>
        <Field label="Sample age (seconds)" hint="0 = now. Over 90 seconds shows as “Location update delayed”.">
          {(ids) => <Input {...ids} inputMode="numeric" {...form.register('ageSeconds')} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Record location
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const stopFormSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  description: z.string().trim().max(300),
  schoolId: z.string().min(1),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
type StopForm = z.infer<typeof stopFormSchema>;

export function AdminStopsPage() {
  const stops = useAdminStops();
  const schools = useAdminSchools();
  const [editing, setEditing] = useState<StopDto | 'new' | null>(null);
  const del = useConfirm<StopDto>();
  const remove = useAdminMutation((s: StopDto) => api.delete(`/admin/stops/${s.id}`), { success: 'Stop deleted' });
  return (
    <>
      <PageHeader
        title="Stops"
        description="Pickup points. Use public locations such as street corners — never a student’s home address."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden /> Add stop
          </Button>
        }
      />
      {stops.isPending ? (
        <LoadingBlock />
      ) : stops.isError ? (
        <ErrorState message={errorMessage(stops.error)} onRetry={() => stops.refetch()} />
      ) : stops.data.length === 0 ? (
        <EmptyState title="No stops yet" action={<Button onClick={() => setEditing('new')}>Add stop</Button>} />
      ) : (
        <Table head={['Stop', 'Location', 'Routes', '']}>
          {stops.data.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3">
                <p className="font-semibold">{s.name}</p>
                <p className="text-muted">{s.description}</p>
              </td>
              <td className="px-4 py-3 tabular-nums text-muted">
                {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
              </td>
              <td className="px-4 py-3">{s.routes.length ? s.routes.map((r) => `Route ${r.number}`).join(', ') : <span className="text-muted">Not on a route</span>}</td>
              <td className="px-4 py-3">
                <RowActions label={s.name} onEdit={() => setEditing(s)} onDelete={() => del.ask(s)} />
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <StopDialog stop={editing === 'new' ? null : editing} schools={schools.data} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={del.target !== null}
        onOpenChange={(o) => !o && del.close()}
        title={`Delete ${del.target?.name}?`}
        description={del.target?.routes.length ? `This stop will also be removed from ${del.target.routes.map((r) => `Route ${r.number}`).join(', ')}. Saved favorites and reminders for it are deleted.` : 'Saved favorites and reminders for this stop are deleted.'}
        confirmLabel="Delete stop"
        loading={remove.isPending}
        onConfirm={() => del.target && remove.mutate(del.target, { onSettled: del.close })}
      />
    </>
  );
}

function StopDialog({ stop, schools, onClose }: { stop: StopDto | null; schools: AdminSchool[] | undefined; onClose: () => void }) {
  const school = schools?.find((s) => s.id === stop?.schoolId) ?? schools?.[0];
  const form = useForm<StopForm>({
    resolver: zodResolver(stopFormSchema) as never,
    defaultValues: { name: stop?.name ?? '', description: stop?.description ?? '', schoolId: stop?.schoolId ?? school?.id ?? '', lat: stop?.lat ?? school?.lat ?? 41.748, lng: stop?.lng ?? school?.lng ?? -88.165 },
  });
  const save = useAdminMutation((v: StopForm) => (stop ? api.put(`/admin/stops/${stop.id}`, v) : api.post('/admin/stops', v)), { success: stop ? 'Stop updated' : 'Stop added' });
  const lat = Number(form.watch('lat'));
  const lng = Number(form.watch('lng'));
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={stop ? `Edit ${stop.name}` : 'Add stop'} description="Click the map to place the stop, or type coordinates." wide>
      <form className="grid gap-4 md:grid-cols-2" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v, { onSuccess: onClose }))}>
        <div className="space-y-4">
          <Field label="Name" error={e.name?.message}>
            {(ids) => <Input {...ids} {...form.register('name')} />}
          </Field>
          <Field label="Location description" hint="e.g. “Northeast corner, by the crosswalk”" error={e.description?.message}>
            {(ids) => <Textarea {...ids} {...form.register('description')} />}
          </Field>
          <Field label="School">{(ids) => <SchoolSelect {...ids} schools={schools} value={form.watch('schoolId')} onChange={(v) => form.setValue('schoolId', v)} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" error={e.lat?.message}>
              {(ids) => <Input {...ids} inputMode="decimal" {...form.register('lat')} />}
            </Field>
            <Field label="Longitude" error={e.lng?.message}>
              {(ids) => <Input {...ids} inputMode="decimal" {...form.register('lng')} />}
            </Field>
          </div>
        </div>
        <StopPicker lat={lat} lng={lng} onPick={(p) => { form.setValue('lat', Number(p.lat.toFixed(6)), { shouldValidate: true }); form.setValue('lng', Number(p.lng.toFixed(6)), { shouldValidate: true }); }} />
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {stop ? 'Save changes' : 'Add stop'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const LocationPicker = lazy(() => import('./location-picker'));
function StopPicker(props: { lat: number; lng: number; onPick: (p: { lat: number; lng: number }) => void }) {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-surface-muted" />}>
      <LocationPicker {...props} />
    </Suspense>
  );
}

type SchoolForm = z.infer<typeof schoolInputSchema>;

export function AdminSchoolsPage() {
  const schools = useAdminSchools();
  const [editing, setEditing] = useState<AdminSchool | 'new' | null>(null);
  const del = useConfirm<AdminSchool>();
  const remove = useAdminMutation((s: AdminSchool) => api.delete(`/admin/schools/${s.id}`), { success: 'School removed' });
  return (
    <>
      <PageHeader
        title="Schools"
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden /> Add school
          </Button>
        }
      />
      {schools.isPending ? (
        <LoadingBlock />
      ) : schools.isError ? (
        <ErrorState message={errorMessage(schools.error)} onRetry={() => schools.refetch()} />
      ) : (
        <Table head={['School', 'Time zone', 'Routes', 'Buses', 'Stops', '']}>
          {schools.data.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3">
                <p className="font-semibold">
                  {s.name} {s.isDemo && <Badge tone="demo">Fictional demo</Badge>}
                </p>
                <p className="text-muted">{s.address}</p>
              </td>
              <td className="px-4 py-3">{s.timeZone}</td>
              <td className="px-4 py-3 tabular-nums">{s.counts.routes}</td>
              <td className="px-4 py-3 tabular-nums">{s.counts.buses}</td>
              <td className="px-4 py-3 tabular-nums">{s.counts.stops}</td>
              <td className="px-4 py-3">
                <RowActions label={s.name} onEdit={() => setEditing(s)} onDelete={s.isDemo ? undefined : () => del.ask(s)} />
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <SchoolDialog school={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={del.target !== null}
        onOpenChange={(o) => !o && del.close()}
        title={`Remove ${del.target?.name}?`}
        description="Schools can only be removed once they have no routes, buses or students."
        confirmLabel="Remove school"
        loading={remove.isPending}
        onConfirm={() => del.target && remove.mutate(del.target, { onSettled: del.close })}
      />
    </>
  );
}

function SchoolDialog({ school, onClose }: { school: AdminSchool | null; onClose: () => void }) {
  const form = useForm<SchoolForm>({
    resolver: zodResolver(schoolInputSchema.extend({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) })) as never,
    defaultValues: { name: school?.name ?? '', address: school?.address ?? '', timeZone: school?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, lat: school?.lat ?? 41.748, lng: school?.lng ?? -88.165 },
  });
  const save = useAdminMutation((v: SchoolForm) => (school ? api.put(`/admin/schools/${school.id}`, v) : api.post('/admin/schools', v)), { success: school ? 'School updated' : 'School added' });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={school ? `Edit ${school.name}` : 'Add school'}>
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v, { onSuccess: onClose }))}>
        <Field label="Name" error={e.name?.message}>{(ids) => <Input {...ids} {...form.register('name')} />}</Field>
        <Field label="Address" error={e.address?.message}>{(ids) => <Input {...ids} {...form.register('address')} />}</Field>
        <Field label="Time zone" hint="IANA name, e.g. America/New_York" error={e.timeZone?.message}>{(ids) => <Input {...ids} {...form.register('timeZone')} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude" error={e.lat?.message}>{(ids) => <Input {...ids} inputMode="decimal" {...form.register('lat')} />}</Field>
          <Field label="Longitude" error={e.lng?.message}>{(ids) => <Input {...ids} inputMode="decimal" {...form.register('lng')} />}</Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{school ? 'Save changes' : 'Add school'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

const announcementFormSchema = z.object({
  schoolId: z.string().min(1),
  title: z.string().trim().min(3, 'At least 3 characters').max(120),
  body: z.string().trim().min(3, 'At least 3 characters').max(2000),
  severity: z.enum(ANNOUNCEMENT_SEVERITIES),
  category: z.enum(NOTIFICATION_CATEGORIES),
  routeIds: z.array(z.string()),
  expiresInHours: z.string(),
  notifyUsers: z.boolean(),
});
type AnnouncementForm = z.infer<typeof announcementFormSchema>;

export function AdminAnnouncementsPage() {
  const list = useAdminAnnouncements();
  const [editing, setEditing] = useState<AnnouncementDto | 'new' | null>(null);
  const del = useConfirm<AnnouncementDto>();
  const remove = useAdminMutation((a: AnnouncementDto) => api.delete(`/admin/announcements/${a.id}`), { success: 'Announcement deleted' });
  const expire = useAdminMutation((a: AnnouncementDto) => api.post(`/admin/announcements/${a.id}/expire`), { success: 'Announcement expired' });
  return (
    <>
      <PageHeader
        title="Service announcements"
        description="Publish delays, cancellations and route changes. Affected students and verified parents are notified once."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden /> New announcement
          </Button>
        }
      />
      {list.isPending ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No announcements" action={<Button onClick={() => setEditing('new')}>New announcement</Button>} />
      ) : (
        <ul className="space-y-2">
          {list.data.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{a.title}</p>
                    <Badge tone={a.active ? 'success' : 'neutral'}>{a.active ? 'Active' : 'Expired'}</Badge>
                    <Badge tone={a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warning' : 'info'}>{a.severity}</Badge>
                    <Badge>{NOTIFICATION_CATEGORY_LABELS[a.category]}</Badge>
                    {a.isDemo && <Badge tone="demo">Demo</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-text/90">{a.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {a.routes.length ? a.routes.map((r) => `Route ${r.number}`).join(', ') : 'All routes'} · Published {formatRelative(a.publishedAt)}
                    {a.publishedBy && ` by ${a.publishedBy}`}
                    {a.expiresAt && ` · ${a.active ? 'Expires' : 'Expired'} ${formatClock(a.expiresAt)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {a.active && (
                    <Button variant="outline" size="sm" onClick={() => expire.mutate(a)} loading={expire.isPending && expire.variables?.id === a.id}>
                      Expire now
                    </Button>
                  )}
                  <RowActions label={a.title} onEdit={() => setEditing(a)} onDelete={() => del.ask(a)} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing && <AnnouncementDialog announcement={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={del.target !== null}
        onOpenChange={(o) => !o && del.close()}
        title="Delete this announcement?"
        description="It will disappear for everyone. Notifications already delivered stay in users’ history."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => del.target && remove.mutate(del.target, { onSettled: del.close })}
      />
    </>
  );
}

function AnnouncementDialog({ announcement, onClose }: { announcement: AnnouncementDto | null; onClose: () => void }) {
  const schools = useAdminSchools();
  const routes = useAdminRoutes();
  const form = useForm<AnnouncementForm>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: {
      schoolId: announcement?.schoolId ?? schools.data?.[0]?.id ?? '',
      title: announcement?.title ?? '',
      body: announcement?.body ?? '',
      severity: announcement?.severity ?? 'info',
      category: announcement?.category ?? 'general',
      routeIds: announcement?.routes.map((r) => r.id) ?? [],
      expiresInHours: announcement?.expiresAt ? 'keep' : '4',
      notifyUsers: !announcement,
    },
  });
  const save = useAdminMutation(
    (v: AnnouncementForm) => {
      const expiresAt = v.expiresInHours === 'keep' ? announcement?.expiresAt ?? null : v.expiresInHours === 'none' ? null : new Date(Date.now() + Number(v.expiresInHours) * 3_600_000).toISOString();
      const body = { schoolId: v.schoolId, title: v.title, body: v.body, severity: v.severity, category: v.category, routeIds: v.routeIds, expiresAt, notifyUsers: v.notifyUsers };
      return announcement ? api.put(`/admin/announcements/${announcement.id}`, body) : api.post('/admin/announcements', body);
    },
    { success: announcement ? 'Announcement updated' : 'Announcement published' },
  );
  const schoolId = form.watch('schoolId') || schools.data?.[0]?.id || '';
  const routeIds = form.watch('routeIds');
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={announcement ? 'Edit announcement' : 'New announcement'} wide>
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => save.mutate({ ...v, schoolId }, { onSuccess: onClose }))}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="School">{(ids) => <SchoolSelect {...ids} schools={schools.data} value={schoolId} onChange={(v) => form.setValue('schoolId', v)} />}</Field>
          <Field label="Type">
            {(ids) => (
              <Select {...ids} {...form.register('category')}>
                {NOTIFICATION_CATEGORIES.filter((c) => c !== 'bus_approaching').map((c) => (
                  <option key={c} value={c}>
                    {NOTIFICATION_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Severity">
            {(ids) => (
              <Select {...ids} {...form.register('severity')}>
                <option value="info">Information</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Title" error={e.title?.message}>{(ids) => <Input {...ids} {...form.register('title')} />}</Field>
        <Field label="Message" error={e.body?.message}>{(ids) => <Textarea {...ids} rows={4} {...form.register('body')} />}</Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Affected routes (none selected = all routes)</legend>
          <div className="flex flex-wrap gap-2">
            {(routes.data ?? [])
              .filter((r) => r.schoolId === schoolId)
              .map((r) => {
                const on = routeIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => form.setValue('routeIds', on ? routeIds.filter((x) => x !== r.id) : [...routeIds, r.id])}
                    className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm font-semibold ${on ? 'border-brand bg-info-soft text-brand-strong' : 'border-border'}`}
                  >
                    {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5 opacity-0" aria-hidden />} Route {r.number}
                  </button>
                );
              })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Expires">
            {(ids) => (
              <Select {...ids} {...form.register('expiresInHours')}>
                {announcement?.expiresAt && <option value="keep">Keep current ({formatClock(announcement.expiresAt)})</option>}
                <option value="1">In 1 hour</option>
                <option value="4">In 4 hours</option>
                <option value="12">In 12 hours</option>
                <option value="24">In 24 hours</option>
                <option value="none">Never (expire manually)</option>
              </Select>
            )}
          </Field>
          {!announcement && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <span className="text-sm font-semibold">Notify affected users</span>
              <Switch checked={form.watch('notifyUsers')} onCheckedChange={(v) => form.setValue('notifyUsers', v)} aria-label="Notify affected users" />
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{announcement ? 'Save changes' : 'Publish'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AdminParentLinksPage() {
  const links = useParentLinks();
  const decide = useAdminMutation(({ id, decision }: { id: string; decision: 'verify' | 'reject' }) => api.post(`/admin/parent-links/${id}/${decision}`), {
    success: 'Link updated',
  });
  return (
    <>
      <PageHeader title="Parent–student links" description="Verify each relationship (for example against enrollment records) before a parent can see a student’s bus." />
      {links.isPending ? (
        <LoadingBlock />
      ) : links.isError ? (
        <ErrorState message={errorMessage(links.error)} onRetry={() => links.refetch()} />
      ) : links.data.length === 0 ? (
        <EmptyState title="No link requests" description="Requests appear here when a parent enters a student’s link code. Demo-session links are verified automatically and aren’t listed." />
      ) : (
        <Table head={['Parent', 'Student', 'School', 'Requested', 'Status', '']}>
          {links.data.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-3">
                <p className="font-semibold">{l.parentName}</p>
                <p className="text-muted">{l.parentEmail}</p>
              </td>
              <td className="px-4 py-3">{l.studentName}</td>
              <td className="px-4 py-3">{l.schoolName}</td>
              <td className="px-4 py-3">{formatRelative(l.createdAt)}</td>
              <td className="px-4 py-3">
                <Badge tone={l.status === 'verified' ? 'success' : l.status === 'pending' ? 'warning' : 'danger'}>{l.status}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  {l.status !== 'verified' && (
                    <Button size="sm" onClick={() => decide.mutate({ id: l.id, decision: 'verify' })}>
                      Verify
                    </Button>
                  )}
                  {l.status !== 'rejected' && (
                    <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: l.id, decision: 'reject' })}>
                      Reject
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

