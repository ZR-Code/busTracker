import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { formatTimeOfDay, minutesFromTimeOfDay, timeOfDayFromMinutes, type RouteDetailDto } from '@busbuddy/shared';
import { ServiceStatusBadge } from '@/components/bus/status';
import { PageHeader } from '@/components/layout/app-shell';
import { LazyTransitMap } from '@/components/map/lazy-map';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { toMapRoute } from '@/lib/map-data';
import { api, useAdminMutation, useAdminRoute, useAdminRoutes, useAdminSchools, useAdminStops } from './admin-api';

export function AdminRoutesPage() {
  const routes = useAdminRoutes();
  return (
    <>
      <PageHeader
        title="Routes"
        description="Create routes, set schedules and order their stops."
        actions={
          <ButtonLink to="/admin/routes/new">
            <Plus className="h-4 w-4" aria-hidden /> New route
          </ButtonLink>
        }
      />
      {routes.isPending ? (
        <LoadingBlock />
      ) : routes.isError ? (
        <ErrorState message={errorMessage(routes.error)} onRetry={() => routes.refetch()} />
      ) : routes.data.length === 0 ? (
        <EmptyState title="No routes yet" action={<ButtonLink to="/admin/routes/new">New route</ButtonLink>} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {routes.data.map((r) => (
            <li key={r.id}>
              <Link to={`/admin/routes/${r.id}`} className="block rounded-2xl">
                <Card className="flex items-center gap-3 p-4 transition-colors hover:border-brand">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold text-white" style={{ backgroundColor: r.color }} aria-hidden>
                    {r.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      Route {r.number} – {r.name}
                    </p>
                    <p className="text-sm text-muted">
                      {r.stopCount} stops · {formatTimeOfDay(r.scheduledStartTime)}–{formatTimeOfDay(r.scheduledEndTime)} · {r.buses.length ? `Bus ${r.buses.map((b) => b.busNumber).join(', ')}` : 'No bus'}
                    </p>
                  </div>
                  <ServiceStatusBadge status={r.serviceStatus} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const routeFormSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  number: z.string().trim().min(1, 'Required').max(12),
  schoolId: z.string().min(1, 'Choose a school'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #2878E5'),
  active: z.boolean(),
  scheduledStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM'),
  scheduledEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM'),
  geometryJson: z.string(),
});
type RouteForm = z.infer<typeof routeFormSchema>;

interface StopRow {
  stopId: string;
  scheduledArrivalTime: string;
  scheduledDepartureTime: string;
}

export function AdminRouteEditorPage() {
  const { routeId = 'new' } = useParams();
  const isNew = routeId === 'new';
  const route = useAdminRoute(isNew ? null : routeId);
  if (!isNew && route.isPending) return <LoadingBlock />;
  if (!isNew && route.isError) return <ErrorState message={errorMessage(route.error)} onRetry={() => route.refetch()} />;
  return <RouteEditor key={route.data?.id ?? 'new'} route={route.data ?? null} />;
}

function RouteEditor({ route }: { route: RouteDetailDto | null }) {
  const navigate = useNavigate();
  const schools = useAdminSchools();
  const allStops = useAdminStops();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const form = useForm<RouteForm>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: {
      name: route?.name ?? '',
      number: route?.number ?? '',
      schoolId: route?.schoolId ?? '',
      color: route?.color ?? '#2878E5',
      active: route?.active ?? true,
      scheduledStartTime: route?.scheduledStartTime ?? '07:00',
      scheduledEndTime: route?.scheduledEndTime ?? '07:45',
      geometryJson: '',
    },
  });
  useEffect(() => {
    if (!form.getValues('schoolId') && schools.data?.[0]) form.setValue('schoolId', schools.data[0].id);
  }, [schools.data, form]);

  const [rows, setRows] = useState<StopRow[]>(route?.stops.map((s) => ({ stopId: s.stopId, scheduledArrivalTime: s.scheduledArrivalTime, scheduledDepartureTime: s.scheduledDepartureTime })) ?? []);
  const [regenerate, setRegenerate] = useState(false);
  const [addStopId, setAddStopId] = useState('');
  const schoolId = form.watch('schoolId');
  const stopOptions = (allStops.data ?? []).filter((s) => s.schoolId === schoolId && !rows.some((r) => r.stopId === s.id));
  const stopName = (id: string) => allStops.data?.find((s) => s.id === id)?.name ?? id;

  const saveRoute = useAdminMutation(
    async (v: RouteForm) => {
      let geometry: [number, number][] | null | undefined;
      if (v.geometryJson.trim()) {
        const parsed: unknown = JSON.parse(v.geometryJson);
        if (!Array.isArray(parsed)) throw new Error('Geometry must be a JSON array of [lat, lng] pairs.');
        geometry = parsed as [number, number][];
      }
      const body = { name: v.name, number: v.number, schoolId: v.schoolId, color: v.color, active: v.active, scheduledStartTime: v.scheduledStartTime, scheduledEndTime: v.scheduledEndTime, ...(geometry ? { geometry } : {}) };
      return route ? api.put<RouteDetailDto>(`/admin/routes/${route.id}`, body) : api.post<RouteDetailDto>('/admin/routes', body);
    },
    { success: route ? 'Route saved' : 'Route created — now add stops' },
  );
  const saveStops = useAdminMutation((id: string) => api.put<RouteDetailDto>(`/admin/routes/${id}/stops`, { stops: rows, regenerateGeometry: regenerate }), { success: 'Stops saved' });
  const remove = useAdminMutation((id: string) => api.delete(`/admin/routes/${id}`), { success: 'Route deleted' });

  const addStop = () => {
    if (!addStopId) return;
    const last = rows[rows.length - 1];
    const t = last ? timeOfDayFromMinutes(minutesFromTimeOfDay(last.scheduledDepartureTime) + 3) : form.getValues('scheduledStartTime');
    setRows([...rows, { stopId: addStopId, scheduledArrivalTime: t, scheduledDepartureTime: t }]);
    setAddStopId('');
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    const [r] = next.splice(i, 1);
    next.splice(i + d, 0, r!);
    setRows(next);
  };
  const setTime = (i: number, k: 'scheduledArrivalTime' | 'scheduledDepartureTime', v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v, ...(k === 'scheduledArrivalTime' && r.scheduledDepartureTime < v ? { scheduledDepartureTime: v } : {}) } : r)));
  const e = form.formState.errors;

  return (
    <>
      <div className="mb-3">
        <Link to="/admin/routes" className="text-sm font-semibold text-brand-strong hover:underline">
          ← All routes
        </Link>
      </div>
      <PageHeader
        title={route ? `Route ${route.number} – ${route.name}` : 'New route'}
        actions={
          route && (
            <Button variant="outline" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4 text-danger-text" aria-hidden /> Delete route
            </Button>
          )
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Route details" />
          <CardBody>
            <form
              className="space-y-4"
              noValidate
              onSubmit={form.handleSubmit((v) =>
                saveRoute.mutate(v, {
                  onSuccess: (r) => {
                    form.setValue('geometryJson', '');
                    if (!route) navigate(`/admin/routes/${r.id}`, { replace: true });
                  },
                }),
              )}
            >
              <div className="grid grid-cols-3 gap-3">
                <Field label="Number" error={e.number?.message}>{(ids) => <Input {...ids} {...form.register('number')} />}</Field>
                <Field label="Name" error={e.name?.message} className="col-span-2">{(ids) => <Input {...ids} {...form.register('name')} />}</Field>
              </div>
              <Field label="School" error={e.schoolId?.message}>
                {(ids) => (
                  <Select {...ids} {...form.register('schoolId')} disabled={Boolean(route)}>
                    {schools.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Start" error={e.scheduledStartTime?.message}>{(ids) => <Input {...ids} type="time" {...form.register('scheduledStartTime')} />}</Field>
                <Field label="End" error={e.scheduledEndTime?.message}>{(ids) => <Input {...ids} type="time" {...form.register('scheduledEndTime')} />}</Field>
                <Field label="Color" error={e.color?.message}>{(ids) => <Input {...ids} type="color" className="p-1" {...form.register('color')} />}</Field>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span className="text-sm">
                  <span className="block font-semibold">Route active</span>
                  <span className="text-muted">Inactive routes show as “Not running”.</span>
                </span>
                <Switch checked={form.watch('active')} onCheckedChange={(v) => form.setValue('active', v)} aria-label="Route active" />
              </label>
              <Field label="Road geometry (optional)" hint="Paste a JSON array of [lat, lng] pairs from a routing tool to replace the stored geometry. Leave empty to keep it.">
                {(ids) => <Textarea {...ids} rows={3} placeholder="[[41.77, -88.18], [41.769, -88.17], …]" {...form.register('geometryJson')} />}
              </Field>
              <Button type="submit" loading={saveRoute.isPending}>
                {route ? 'Save route' : 'Create route'}
              </Button>
            </form>
          </CardBody>
        </Card>

        {route && (
          <Card>
            <CardHeader title="Map preview" description={route.geometrySource === 'straight_line' ? 'No stored road geometry: straight lines between stops are used (ETAs are flagged as less certain).' : `Road geometry · ${(route.lengthMeters / 1609.344).toFixed(1)} mi`} />
            <CardBody>
              <LazyTransitMap className="h-80" ariaLabel={`Map preview of route ${route.number}`} routes={[toMapRoute(route)]} buses={[]} showLegend={false} />
            </CardBody>
          </Card>
        )}

        {route && (
          <Card className="xl:col-span-2">
            <CardHeader title="Stops and schedule" description="Order stops from first pickup to the school. Times use the school’s time zone." />
            <CardBody className="space-y-4">
              {rows.length === 0 ? (
                <p className="text-sm text-muted">No stops yet. Add the first pickup below.</p>
              ) : (
                <ol className="space-y-2">
                  {rows.map((r, i) => (
                    <li key={r.stopId} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-sm font-bold" aria-hidden>
                        {i + 1}
                      </span>
                      <span className="min-w-40 flex-1 font-semibold">{stopName(r.stopId)}</span>
                      <label className="flex items-center gap-1 text-sm">
                        Arrive
                        <Input type="time" className="h-9 w-36" value={r.scheduledArrivalTime} onChange={(ev) => setTime(i, 'scheduledArrivalTime', ev.target.value)} aria-label={`Arrival time at ${stopName(r.stopId)}`} />
                      </label>
                      <label className="flex items-center gap-1 text-sm">
                        Depart
                        <Input type="time" className="h-9 w-36" value={r.scheduledDepartureTime} onChange={(ev) => setTime(i, 'scheduledDepartureTime', ev.target.value)} aria-label={`Departure time at ${stopName(r.stopId)}`} />
                      </label>
                      <span className="flex gap-1">
                        <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${stopName(r.stopId)} up`}>
                          <ArrowUp className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${stopName(r.stopId)} down`}>
                          <ArrowDown className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove ${stopName(r.stopId)}`}>
                          <Trash2 className="h-4 w-4 text-danger-text" aria-hidden />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Add a stop" className="min-w-64 flex-1">
                  {(ids) => (
                    <Select {...ids} value={addStopId} onChange={(ev) => setAddStopId(ev.target.value)}>
                      <option value="">Choose a stop…</option>
                      {stopOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Button variant="outline" onClick={addStop} disabled={!addStopId}>
                  <Plus className="h-4 w-4" aria-hidden /> Add
                </Button>
                <ButtonLink to="/admin/stops" variant="ghost">
                  Create a new stop
                </ButtonLink>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={regenerate} onCheckedChange={setRegenerate} aria-label="Replace geometry with straight lines" />
                Replace the stored road geometry with straight lines between these stops
              </label>
              <Button onClick={() => saveStops.mutate(route.id)} loading={saveStops.isPending}>
                Save stops and schedule
              </Button>
            </CardBody>
          </Card>
        )}
      </div>
      {route && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete Route ${route.number}?`}
          description="Buses on this route become unassigned and students lose their route assignment. Stops are kept."
          confirmLabel="Delete route"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(route.id, { onSuccess: () => navigate('/admin/routes') })}
        />
      )}
    </>
  );
}
