import {
  buildBusLive,
  delayEventKey,
  demoSessionSchema,
  ETA_THRESHOLDS,
  idParamSchema,
  linkStudentSchema,
  listQuerySchema,
  liveQuerySchema,
  notificationQuerySchema,
  reminderEventKey,
  reminderMessage,
  serviceStatusFor,
  shouldFireReminder,
  SimulationEngine,
  stopPreferenceSchema,
  toBusDto,
  updateProfileSchema,
  updateStudentProfileSchema,
  type AnnouncementDto,
  type ApiErrorBody,
  type AuthConfigDto,
  type BusLiveDto,
  type BusStatus,
  type LinkCodeDto,
  type LinkedStudentDto,
  type LiveLocation,
  type MeDto,
  type NotificationCategory,
  type NotificationDto,
  type Paginated,
  type RouteDetailDto,
  type RouteSummaryDto,
  type SimBusState,
  type StopDto,
  type StudentTransportationDto,
  type UserSettingsDto,
  type VerificationStatus,
} from '@busbuddy/shared';
import { DEMO_ANNOUNCEMENTS, DEMO_DWELL_SECONDS, DEMO_PERSONAS, DEMO_REMINDER_LEAD_MINUTES, DEMO_SAMPLE_NOTIFICATIONS, type DemoStudentSpec } from '@busbuddy/shared/demo';
import type { ZodTypeAny, output } from 'zod';
import { buildWorld, type WorldBus, type WorldRoute, type WorldStop } from './world';

const STORAGE_KEY = 'busbuddy:browser-demo:v1';
const STALE_AFTER_SECONDS = 90;
const RESTART_DELAY_SECONDS = 90;
const SIM_RESET_AFTER_MS = 30 * 60_000;
const SESSION_TTL_MS = 24 * 3_600_000;
const REMINDER_INTERVAL_MS = 3000;
const MAX_NOTIFICATIONS = 500;

interface DemoUser {
  id: string;
  name: string;
  role: 'student' | 'parent';
  settings: UserSettingsDto;
  profile: { assignedRouteId: string | null; defaultStopId: string | null } | null;
}

interface StopPref {
  userId: string;
  stopId: string;
  favorite: boolean;
  reminderLeadMinutes: number | null;
}

interface StoredNotification {
  id: string;
  seq: number;
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  busId: string | null;
  stopId: string | null;
  routeId: string | null;
  eventKey: string;
  createdAt: number;
  readAt: number | null;
}

interface State {
  createdAt: number;
  savedAt: number;
  seq: number;
  sessionUserId: string | null;
  sessionStartedAt: number;
  users: DemoUser[];
  prefs: StopPref[];
  links: { id: string; seq: number; parentId: string; studentId: string; status: VerificationStatus; createdAt: number }[];
  linkCodes: { code: string; studentId: string; expiresAt: number; usedAt: number | null }[];
  notifications: StoredNotification[];
  busStatus: Record<string, BusStatus>;
  sim: { clock: number; resetAt: number; lastAdvanceAt: number; states: SimBusState[] };
}

export interface BackendResponse {
  status: number;
  body?: unknown;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in to continue.');
const forbidden = (message = 'You do not have permission to do that.') => new HttpError(403, 'forbidden', message);
const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found.`);
const badRequest = (message: string) => new HttpError(400, 'bad_request', message);
const serverRequired = () =>
  new HttpError(503, 'server_required', 'Accounts need the BusBuddy server, which isn’t connected to this site. The interactive demo works without it.');

function parse<S extends ZodTypeAny>(schema: S, data: unknown): output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'validation_error', 'Some fields are invalid.', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

const defaultSettings = (): UserSettingsDto => ({
  reminderLeadMinutes: DEMO_REMINDER_LEAD_MINUTES,
  remindersEnabled: true,
  browserNotifications: false,
  distanceUnits: 'imperial',
  theme: 'system',
});

function readStorage(): State | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}

function linkCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => alphabet[n % alphabet.length]).join('');
  return `${pick()}-${pick()}`;
}

export class BrowserBackend {
  private readonly world = buildWorld();
  private readonly engine = new SimulationEngine({ dwellSeconds: DEMO_DWELL_SECONDS, restartDelaySeconds: RESTART_DELAY_SECONDS });
  private state: State;
  private lastReminderRun = 0;

  constructor(private readonly now: () => number = Date.now) {
    const stored = readStorage();
    const t = this.now();
    if (stored && t - stored.savedAt < SESSION_TTL_MS) {
      this.state = stored;
      if (t - stored.savedAt > SIM_RESET_AFTER_MS) this.resetSimulation(t);
      else this.restoreSimulation();
    } else {
      this.state = this.freshState(t);
      this.resetSimulation(t);
    }
    if (this.state.sessionUserId && t - this.state.sessionStartedAt > SESSION_TTL_MS) this.state.sessionUserId = null;
  }

  async handle(method: string, rawPath: string, body: unknown): Promise<BackendResponse> {
    const url = new URL(rawPath, 'http://browser-demo');
    const query = Object.fromEntries(url.searchParams);
    try {
      this.advance();
      return this.route(method, url.pathname, query, body);
    } catch (e) {
      if (e instanceof HttpError) {
        const err: ApiErrorBody = { error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) } };
        return { status: e.status, body: err };
      }
      throw e;
    } finally {
      this.save();
    }
  }

  private route(method: string, path: string, query: Record<string, string>, body: unknown): BackendResponse {
    const ok = (b: unknown, status = 200): BackendResponse => ({ status, body: b });
    const seg = path.split('/').filter(Boolean);
    const is = (m: string, pattern: string) => {
      if (m !== method) return null;
      const parts = pattern.split('/').filter(Boolean);
      if (parts.length !== seg.length) return null;
      const params: Record<string, string> = {};
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]!.startsWith(':')) params[parts[i]!.slice(1)] = decodeURIComponent(seg[i]!);
        else if (parts[i] !== seg[i]) return null;
      }
      return params;
    };
    let p: Record<string, string> | null;

    if (is('GET', '/auth/config')) {
      const cfg: AuthConfigDto = { provider: 'local', demoEnabled: true, passwordResetDelivery: 'server_log', supabase: null };
      return ok(cfg);
    }
    if (is('GET', '/auth/session')) return ok({ me: this.state.sessionUserId ? this.me(this.state.sessionUserId) : null });
    if (is('POST', '/auth/demo')) {
      const { persona } = parse(demoSessionSchema, body ?? {});
      const userId = this.createPersona(persona);
      this.state.sessionUserId = userId;
      this.state.sessionStartedAt = this.now();
      return ok(this.me(userId), 201);
    }
    if (is('POST', '/auth/logout')) {
      this.state.sessionUserId = null;
      return { status: 204 };
    }
    if (seg[0] === 'auth') throw serverRequired();
    if (is('GET', '/health')) return ok({ status: 'ok', database: 'ok', version: '1.0.0', providers: [] });
    if (is('GET', '/schools')) return ok([this.world.school]);

    if (seg[0] === 'admin') {
      this.user();
      throw forbidden('Administrator access required.');
    }

    if (is('GET', '/routes')) {
      this.user();
      const q = parse(listQuerySchema, query);
      const search = q.search?.toLowerCase();
      const routes = [...this.world.routes.values()]
        .filter((rt) => !q.schoolId || rt.schoolId === q.schoolId)
        .filter((rt) => !search || rt.name.toLowerCase().includes(search) || rt.number.toLowerCase() === search || `route ${rt.number}`.includes(search))
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
      return ok(routes.map((r) => this.routeSummary(r)));
    }
    if ((p = is('GET', '/routes/:id'))) {
      this.user();
      return ok(this.routeDetail(this.routeOr404(p.id!)));
    }
    if ((p = is('GET', '/routes/:id/stops'))) {
      this.user();
      return ok(this.routeDetail(this.routeOr404(p.id!)).stops);
    }

    if (is('GET', '/stops')) {
      const user = this.user();
      const q = parse(listQuerySchema, query);
      const search = q.search?.toLowerCase();
      const stops = [...this.world.stops.values()]
        .filter((s) => !q.routeId || s.routeIds.includes(q.routeId))
        .filter((s) => !search || s.name.toLowerCase().includes(search) || s.description.toLowerCase().includes(search))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 200);
      return ok(stops.map((s) => this.stopDto(s, this.pref(user.id, s.id))));
    }
    if ((p = is('GET', '/stops/:id'))) {
      const user = this.user();
      const stop = this.stopOr404(p.id!);
      return ok(this.stopDto(stop, this.pref(user.id, stop.id)));
    }
    if ((p = is('PUT', '/stops/:id/preference'))) {
      const user = this.user();
      const stop = this.stopOr404(p.id!);
      const input = parse(stopPreferenceSchema, body);
      let pref = this.pref(user.id, stop.id);
      if (!pref) {
        pref = { userId: user.id, stopId: stop.id, favorite: input.favorite ?? false, reminderLeadMinutes: input.reminderLeadMinutes ?? null };
        this.state.prefs.push(pref);
      } else {
        if (input.favorite !== undefined) pref.favorite = input.favorite;
        if (input.reminderLeadMinutes !== undefined) pref.reminderLeadMinutes = input.reminderLeadMinutes;
      }
      const result = { ...pref };
      if (!pref.favorite && pref.reminderLeadMinutes === null) this.state.prefs = this.state.prefs.filter((x) => x !== pref);
      return ok(this.stopDto(stop, result));
    }

    if (is('GET', '/buses')) {
      this.user();
      const q = parse(listQuerySchema, query);
      return ok(this.visibleBuses(q.routeId).map((b) => toBusDto(this.withStatus(b))));
    }
    if (is('GET', '/buses/live')) {
      this.user();
      const q = parse(listQuerySchema, query);
      return ok(this.visibleBuses(q.routeId).map((b) => this.live(b)));
    }
    if ((p = is('GET', '/buses/:id'))) {
      this.user();
      return ok(toBusDto(this.withStatus(this.busOr404(p.id!))));
    }
    if ((p = is('GET', '/buses/:id/live'))) {
      this.user();
      const q = parse(liveQuerySchema, query);
      return ok(this.live(this.busOr404(p.id!), q.stopId));
    }

    if (is('GET', '/notifications')) {
      const user = this.user();
      const q = parse(notificationQuerySchema, query);
      const all = this.state.notifications
        .filter((n) => n.userId === user.id && (!q.category || n.category === q.category) && (q.unread === undefined || (q.unread ? n.readAt === null : n.readAt !== null)))
        .sort((a, b) => b.seq - a.seq);
      const start = q.cursor ? all.findIndex((n) => n.id === q.cursor) + 1 : 0;
      const page = all.slice(start, start + q.limit);
      const body: Paginated<NotificationDto> = { items: page.map((n) => this.notificationDto(n)), nextCursor: all.length > start + q.limit ? page[page.length - 1]!.id : null };
      return ok(body);
    }
    if (is('GET', '/notifications/unread-count')) {
      const user = this.user();
      return ok({ count: this.state.notifications.filter((n) => n.userId === user.id && n.readAt === null).length });
    }
    if (is('POST', '/notifications/read-all')) {
      const user = this.user();
      let updated = 0;
      for (const n of this.state.notifications) {
        if (n.userId === user.id && n.readAt === null) {
          n.readAt = this.now();
          updated++;
        }
      }
      return ok({ updated });
    }
    if ((p = is('POST', '/notifications/:id/read'))) {
      const user = this.user();
      const { id } = parse(idParamSchema, p);
      const n = this.state.notifications.find((x) => x.id === id && x.userId === user.id);
      if (!n) throw notFound('Notification');
      n.readAt ??= this.now();
      return ok(this.notificationDto(n));
    }
    if (is('GET', '/announcements')) {
      this.user();
      const q = parse(listQuerySchema, query);
      return ok(this.announcements().filter((a) => !q.routeId || a.routes.length === 0 || a.routes.some((r) => r.id === q.routeId)));
    }

    if (is('GET', '/me')) return ok(this.me(this.user().id));
    if (is('PATCH', '/me')) {
      const user = this.user();
      const input = parse(updateProfileSchema, body);
      if (input.name) user.name = input.name;
      if (input.settings) user.settings = { ...user.settings, ...input.settings };
      return ok(this.me(user.id));
    }
    if (is('DELETE', '/me')) {
      const user = this.user();
      this.state.users = this.state.users.filter((u) => u.id !== user.id);
      this.state.prefs = this.state.prefs.filter((x) => x.userId !== user.id);
      this.state.notifications = this.state.notifications.filter((n) => n.userId !== user.id);
      this.state.links = this.state.links.filter((l) => l.parentId !== user.id && l.studentId !== user.id);
      this.state.sessionUserId = null;
      return { status: 204 };
    }
    if (is('PATCH', '/me/student-profile')) return ok(this.updateStudentProfile(this.user('student'), body));
    if (is('POST', '/me/link-code')) {
      const user = this.user('student');
      const code = linkCode();
      const expiresAt = this.now() + 24 * 3_600_000;
      this.state.linkCodes = [...this.state.linkCodes.filter((c) => c.studentId !== user.id || c.usedAt !== null), { code, studentId: user.id, expiresAt, usedAt: null }];
      const dto: LinkCodeDto = { code, expiresAt: new Date(expiresAt).toISOString() };
      return ok(dto, 201);
    }
    if (is('GET', '/me/students')) {
      const user = this.user('parent');
      return ok(this.state.links.filter((l) => l.parentId === user.id).sort((a, b) => a.seq - b.seq).map((l) => this.linkedStudentDto(l)));
    }
    if (is('POST', '/me/students/link')) {
      const parent = this.user('parent');
      const { code } = parse(linkStudentSchema, body);
      const row = this.state.linkCodes.find((c) => c.code === code);
      if (!row || row.usedAt !== null || row.expiresAt < this.now()) throw badRequest('That code is invalid or has expired. Ask your student for a new code.');
      row.usedAt = this.now();
      let link = this.state.links.find((l) => l.parentId === parent.id && l.studentId === row.studentId);
      if (!link) {
        link = { id: this.nextId('link'), seq: this.state.seq, parentId: parent.id, studentId: row.studentId, status: 'pending', createdAt: this.now() };
        this.state.links.push(link);
      }
      return ok({ relationshipId: link.id, status: link.status }, 201);
    }
    if ((p = is('DELETE', '/me/students/:id'))) {
      const parent = this.user('parent');
      const before = this.state.links.length;
      this.state.links = this.state.links.filter((l) => !(l.id === p!.id && l.parentId === parent.id));
      if (this.state.links.length === before) throw notFound('Link');
      return { status: 204 };
    }
    if ((p = is('GET', '/students/:id/transportation'))) {
      const user = this.user();
      const { id } = parse(idParamSchema, p);
      const allowed = user.id === id || (user.role === 'parent' && this.state.links.some((l) => l.parentId === user.id && l.studentId === id && l.status === 'verified'));
      const student = this.state.users.find((u) => u.id === id && u.role === 'student');
      if (!allowed || !student) throw notFound('Student');
      const route = student.profile?.assignedRouteId ? this.world.routes.get(student.profile.assignedRouteId) : undefined;
      const stop = student.profile?.defaultStopId ? this.world.stops.get(student.profile.defaultStopId) : undefined;
      const dto: StudentTransportationDto = {
        studentId: student.id,
        name: student.name,
        schoolName: this.world.school.name,
        route: route ? this.routeSummary(route) : null,
        defaultStop: stop ? { id: stop.id, name: stop.name } : null,
        busId: this.primaryBusId(student.profile?.assignedRouteId ?? null),
      };
      return ok(dto);
    }

    throw new HttpError(404, 'not_found', 'Endpoint not found.');
  }

  private freshState(t: number): State {
    return {
      createdAt: t,
      savedAt: t,
      seq: 0,
      sessionUserId: null,
      sessionStartedAt: 0,
      users: [],
      prefs: [],
      links: [],
      linkCodes: [],
      notifications: [],
      busStatus: Object.fromEntries(this.world.buses.map((b) => [b.id, b.status])),
      sim: { clock: 0, resetAt: t, lastAdvanceAt: t, states: [] },
    };
  }

  private nextId(kind: string): string {
    this.state.seq += 1;
    return `demo-${kind}-${this.state.seq}`;
  }

  private save(): void {
    this.state.savedAt = this.now();
    this.state.sim.clock = this.engine.simClockSeconds;
    this.state.sim.states = this.engine.allStates();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {}
  }

  private resetSimulation(t: number): void {
    this.engine.simClockSeconds = 0;
    this.engine.load(this.world.simRoutes, this.world.simConfigs);
    this.engine.reset();
    this.state.sim = { clock: 0, resetAt: t, lastAdvanceAt: t, states: this.engine.allStates() };
    this.state.busStatus = Object.fromEntries(this.world.buses.map((b) => [b.id, b.status]));
    this.state.createdAt = t;
  }

  private restoreSimulation(): void {
    this.engine.simClockSeconds = this.state.sim.clock;
    this.engine.load(this.world.simRoutes, this.world.simConfigs, Object.fromEntries(this.state.sim.states.map((s) => [s.busId, s])));
  }

  private advance(): void {
    const t = this.now();
    const dt = (t - this.state.sim.lastAdvanceAt) / 1000;
    if (dt > 0) {
      this.engine.step(dt);
      this.state.sim.lastAdvanceAt = t;
    }
    if (t - this.lastReminderRun >= REMINDER_INTERVAL_MS) {
      this.lastReminderRun = t;
      this.syncStatusesAndReminders();
    }
  }

  private location(bus: WorldBus): LiveLocation | null {
    const s = this.engine.getState(bus.id);
    const pos = s && this.engine.position(bus.id);
    const config = this.engine.getConfig(bus.id);
    if (s && pos && config) {
      const nowMs = this.now();
      return {
        busId: bus.id,
        lat: pos.lat,
        lng: pos.lng,
        heading: s.heading,
        speedMps: s.speedMps,
        recordedAt: new Date(this.state.sim.lastAdvanceAt),
        dataSource: 'demo_simulation',
        tripId: `sim-${this.state.sim.resetAt}-${bus.id}-${s.tripNumber}`,
        progressMeters: s.progressMeters,
        simulation: {
          phase: s.phase,
          dwellRemainingSeconds: s.phase === 'dwelling' ? s.dwellRemainingSeconds : 0,
          departsInSeconds: s.phase === 'waiting' ? s.waitRemainingSeconds : 0,
          tripScheduledStartMs: nowMs + (s.tripScheduledStartSec - this.engine.simClockSeconds) * 1000,
          timeScale: 1,
          cruiseSpeedMps: config.cruiseSpeedMps * config.speedFactor,
          running: true,
          speedMultiplier: 1,
        },
      };
    }
    if (bus.lastKnown) {
      const recordedAt = new Date(this.state.createdAt - bus.lastKnown.ageSeconds * 1000);
      return {
        busId: bus.id,
        lat: bus.lastKnown.lat,
        lng: bus.lastKnown.lng,
        heading: 0,
        speedMps: 0,
        recordedAt,
        dataSource: bus.dataSource,
        tripId: `${bus.dataSource}-${bus.id}-${recordedAt.toISOString().slice(0, 10)}`,
      };
    }
    return null;
  }

  private withStatus(bus: WorldBus): WorldBus {
    return { ...bus, status: this.state.busStatus[bus.id] ?? bus.status };
  }

  private live(bus: WorldBus, selectedStopId?: string | null): BusLiveDto {
    const b = this.withStatus(bus);
    return buildBusLive({
      bus: b,
      route: b.routeId ? this.world.routes.get(b.routeId) : undefined,
      loc: this.location(b),
      nowMs: this.now(),
      staleAfterSeconds: STALE_AFTER_SECONDS,
      dwellSeconds: DEMO_DWELL_SECONDS,
      selectedStopId,
    }).dto;
  }

  private syncStatusesAndReminders(): void {
    const results = this.world.buses.filter((b) => this.state.busStatus[b.id] !== 'out_of_service').map((b) => this.live(b));
    for (const r of results) this.state.busStatus[r.bus.id] = r.bus.status;

    const subs = this.state.prefs.filter((x) => x.reminderLeadMinutes !== null && this.state.users.find((u) => u.id === x.userId)?.settings.remindersEnabled);
    for (const dto of results) {
      if (!dto.tripId || !dto.bus.routeId) continue;
      const suffix = dto.location?.dataSource === 'demo_simulation' ? ' (Demo simulation — not a real bus.)' : '';
      for (const stop of dto.stops) {
        for (const sub of subs.filter((x) => x.stopId === stop.stopId)) {
          if (!shouldFireReminder({ etaSeconds: stop.etaSeconds, leadMinutes: sub.reminderLeadMinutes!, stopState: stop.state, freshness: dto.freshness })) continue;
          const eventKey = reminderEventKey({ tripId: dto.tripId, busId: dto.bus.id, stopId: stop.stopId, leadMinutes: sub.reminderLeadMinutes! });
          const msg = reminderMessage(dto.bus.busNumber, stop.name, stop.etaSeconds!);
          this.notify({ userId: sub.userId, category: 'bus_approaching', title: msg.title, body: msg.body + suffix, busId: dto.bus.id, stopId: stop.stopId, routeId: dto.bus.routeId, eventKey });
        }
      }
      const fresh = dto.freshness !== 'stale' && dto.freshness !== 'unavailable';
      if (fresh && (dto.deviationSeconds ?? 0) >= ETA_THRESHOLDS.delayedSeconds) {
        const eventKey = delayEventKey(dto.tripId, dto.bus.id);
        const minutes = Math.round((dto.deviationSeconds ?? 0) / 60);
        for (const userId of this.routeAudience(dto.bus.routeId)) {
          this.notify({
            userId,
            category: 'delay',
            title: `Bus ${dto.bus.busNumber} is running late`,
            body: `Bus ${dto.bus.busNumber} on Route ${dto.bus.routeNumber} is about ${minutes} minutes behind schedule. Arrival times are estimates.${suffix}`,
            busId: dto.bus.id,
            stopId: null,
            routeId: dto.bus.routeId,
            eventKey,
          });
        }
      }
    }
  }

  private notify(n: Omit<StoredNotification, 'id' | 'seq' | 'createdAt' | 'readAt'>, read = false): void {
    if (this.state.notifications.some((x) => x.userId === n.userId && x.eventKey === n.eventKey)) return;
    const id = this.nextId('notification');
    const t = this.now();
    this.state.notifications.push({ ...n, id, seq: this.state.seq, createdAt: t, readAt: read ? t : null });
    if (this.state.notifications.length > MAX_NOTIFICATIONS) this.state.notifications.splice(0, this.state.notifications.length - MAX_NOTIFICATIONS);
  }

  private routeAudience(routeId: string): string[] {
    const students = this.state.users.filter((u) => u.profile?.assignedRouteId === routeId).map((u) => u.id);
    const routeStops = new Set(this.world.routes.get(routeId)?.stops.map((s) => s.stopId));
    const prefUsers = this.state.prefs.filter((x) => routeStops.has(x.stopId) && (x.favorite || x.reminderLeadMinutes !== null)).map((x) => x.userId);
    const parents = this.state.links.filter((l) => l.status === 'verified' && students.includes(l.studentId)).map((l) => l.parentId);
    return [...new Set([...students, ...prefUsers, ...parents])];
  }

  private user(role?: 'student' | 'parent'): DemoUser {
    const u = this.state.sessionUserId ? this.state.users.find((x) => x.id === this.state.sessionUserId) : undefined;
    if (!u) throw unauthorized();
    if (role && u.role !== role) throw forbidden();
    return u;
  }

  private createStudent(spec: DemoStudentSpec): DemoUser {
    const student: DemoUser = { id: this.nextId('user'), name: spec.name, role: 'student', settings: defaultSettings(), profile: { assignedRouteId: spec.routeId, defaultStopId: spec.stopId } };
    this.state.users.push(student);
    this.state.prefs.push({ userId: student.id, stopId: spec.stopId, favorite: true, reminderLeadMinutes: DEMO_REMINDER_LEAD_MINUTES });
    return student;
  }

  private addSampleNotifications(userId: string): void {
    for (const n of DEMO_SAMPLE_NOTIFICATIONS) {
      this.notify({ userId, category: n.category, title: n.title, body: n.body, busId: null, stopId: null, routeId: n.routeId ?? null, eventKey: n.eventKey }, n.read);
    }
  }

  private createPersona(persona: 'student' | 'parent'): string {
    if (persona === 'student') {
      const student = this.createStudent(DEMO_PERSONAS.student);
      this.addSampleNotifications(student.id);
      return student.id;
    }
    const spec = DEMO_PERSONAS.parent;
    const parent: DemoUser = { id: this.nextId('user'), name: spec.name, role: 'parent', settings: defaultSettings(), profile: null };
    this.state.users.push(parent);
    const verified = spec.verifiedStudents.map((s) => this.createStudent(s));
    const pending = this.createStudent(spec.pendingStudent);
    const t = this.now();
    for (const [student, status] of [...verified.map((s) => [s, 'verified'] as const), [pending, 'pending'] as const]) {
      this.state.links.push({ id: this.nextId('link'), seq: this.state.seq, parentId: parent.id, studentId: student.id, status, createdAt: t });
    }
    for (const stopId of spec.favoriteStopIds) this.state.prefs.push({ userId: parent.id, stopId, favorite: true, reminderLeadMinutes: DEMO_REMINDER_LEAD_MINUTES });
    this.addSampleNotifications(parent.id);
    return parent.id;
  }

  private me(userId: string): MeDto {
    const u = this.state.users.find((x) => x.id === userId);
    if (!u) throw unauthorized();
    const route = u.profile?.assignedRouteId ? this.world.routes.get(u.profile.assignedRouteId) : undefined;
    const stop = u.profile?.defaultStopId ? this.world.stops.get(u.profile.defaultStopId) : undefined;
    return {
      id: u.id,
      name: u.name,
      email: null,
      role: u.role,
      schoolId: this.world.school.id,
      isDemo: true,
      settings: u.settings,
      studentProfile: u.profile
        ? {
            schoolId: this.world.school.id,
            schoolName: this.world.school.name,
            assignedRouteId: u.profile.assignedRouteId,
            assignedRouteName: route ? `Route ${route.number} – ${route.name}` : null,
            defaultStopId: u.profile.defaultStopId,
            defaultStopName: stop?.name ?? null,
          }
        : null,
      permissions: { canSelfAssignRoute: u.role === 'student' },
    };
  }

  private updateStudentProfile(user: DemoUser, body: unknown): MeDto {
    const input = parse(updateStudentProfileSchema, body);
    const profile = user.profile!;
    if (input.schoolId && input.schoolId !== this.world.school.id) throw badRequest('Choose a valid school.');
    const routeId = input.assignedRouteId === undefined ? profile.assignedRouteId : input.assignedRouteId;
    if (routeId && !this.world.routes.has(routeId)) throw badRequest('That route does not serve your school.');
    let stopId = input.defaultStopId === undefined ? profile.defaultStopId : input.defaultStopId;
    if (routeId !== profile.assignedRouteId && input.defaultStopId === undefined) stopId = null;
    if (stopId) {
      if (!routeId) throw badRequest('Choose a route before choosing a stop.');
      if (!this.world.routes.get(routeId)!.stops.some((s) => s.stopId === stopId)) throw badRequest('That stop is not on your route.');
    }
    user.profile = { assignedRouteId: routeId, defaultStopId: stopId };
    return this.me(user.id);
  }

  private linkedStudentDto(l: State['links'][number]): LinkedStudentDto {
    const s = this.state.users.find((u) => u.id === l.studentId);
    const route = s?.profile?.assignedRouteId ? this.world.routes.get(s.profile.assignedRouteId) : undefined;
    const stop = s?.profile?.defaultStopId ? this.world.stops.get(s.profile.defaultStopId) : undefined;
    return {
      relationshipId: l.id,
      status: l.status,
      createdAt: new Date(l.createdAt).toISOString(),
      student:
        l.status === 'verified' && s
          ? {
              id: s.id,
              name: s.name,
              schoolName: this.world.school.name,
              assignedRouteId: s.profile?.assignedRouteId ?? null,
              assignedRouteName: route ? `Route ${route.number} – ${route.name}` : null,
              defaultStopId: s.profile?.defaultStopId ?? null,
              defaultStopName: stop?.name ?? null,
              busId: this.primaryBusId(s.profile?.assignedRouteId ?? null),
            }
          : null,
    };
  }

  private primaryBusId(routeId: string | null): string | null {
    if (!routeId) return null;
    const buses = this.world.buses.filter((b) => b.routeId === routeId).map((b) => this.withStatus(b));
    return (buses.find((b) => b.status !== 'out_of_service') ?? buses[0])?.id ?? null;
  }

  private visibleBuses(routeId?: string): WorldBus[] {
    return this.world.buses.filter((b) => b.routeId !== null && (!routeId || b.routeId === routeId));
  }

  private busOr404(id: string): WorldBus {
    const bus = this.visibleBuses().find((b) => b.id === id);
    if (!bus) throw notFound('Bus');
    return bus;
  }

  private routeOr404(id: string): WorldRoute {
    const route = this.world.routes.get(id);
    if (!route) throw notFound('Route');
    return route;
  }

  private stopOr404(id: string): WorldStop {
    const stop = this.world.stops.get(id);
    if (!stop) throw notFound('Stop');
    return stop;
  }

  private pref(userId: string, stopId: string): StopPref | undefined {
    return this.state.prefs.find((x) => x.userId === userId && x.stopId === stopId);
  }

  private stopDto(s: WorldStop, pref: { favorite: boolean; reminderLeadMinutes: number | null } | undefined): StopDto {
    return {
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      description: s.description,
      schoolId: s.schoolId,
      routes: s.routeIds.map((id) => {
        const r = this.world.routes.get(id)!;
        return { id: r.id, name: r.name, number: r.number };
      }),
      favorite: pref?.favorite ?? false,
      reminderLeadMinutes: pref?.reminderLeadMinutes ?? null,
    };
  }

  private announcements(): AnnouncementDto[] {
    const publishedAt = new Date(this.state.createdAt).toISOString();
    return DEMO_ANNOUNCEMENTS.map((a) => ({
      id: a.id,
      schoolId: this.world.school.id,
      routes: a.routes.map((id) => {
        const r = this.world.routes.get(id)!;
        return { id: r.id, name: r.name, number: r.number };
      }),
      title: a.title,
      body: a.body,
      severity: a.severity,
      category: a.category,
      publishedAt,
      expiresAt: null,
      publishedBy: null,
      isDemo: true,
      active: true,
    }));
  }

  private routeSummary(r: WorldRoute): RouteSummaryDto {
    const buses = this.world.buses.filter((b) => b.routeId === r.id).map((b) => this.withStatus(b));
    const disruption = DEMO_ANNOUNCEMENTS.filter((a) => a.routes.includes(r.id)).reduce<'delayed' | 'disrupted' | undefined>((acc, a) => {
      if (a.category === 'service_cancellation' || a.severity === 'critical') return 'disrupted';
      if (a.category === 'delay' && acc !== 'disrupted') return 'delayed';
      return acc;
    }, undefined);
    return {
      id: r.id,
      name: r.name,
      number: r.number,
      schoolId: r.schoolId,
      schoolName: this.world.school.name,
      active: r.active,
      color: r.color,
      scheduledStartTime: r.scheduledStartTime,
      scheduledEndTime: r.scheduledEndTime,
      stopCount: r.stops.length,
      firstPickupTime: r.stops[0]?.scheduledArrivalTime ?? null,
      buses: buses.map((b) => ({ id: b.id, busNumber: b.busNumber, status: b.status })),
      serviceStatus: serviceStatusFor(r, buses.map((b) => b.status), disruption),
      isDemo: true,
    };
  }

  private routeDetail(r: WorldRoute): RouteDetailDto {
    return {
      ...this.routeSummary(r),
      geometry: r.geometry,
      geometrySource: r.geometrySource,
      lengthMeters: Math.round(r.path?.lengthMeters ?? 0),
      stops: r.stops.map((s) => ({
        stopId: s.stopId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        description: s.description,
        order: s.order,
        scheduledArrivalTime: s.scheduledArrivalTime,
        scheduledDepartureTime: s.scheduledDepartureTime,
        distanceAlongMeters: Math.round(s.distanceAlongMeters),
      })),
    };
  }

  private notificationDto(n: StoredNotification): NotificationDto {
    const bus = n.busId ? this.world.buses.find((b) => b.id === n.busId) : undefined;
    const stop = n.stopId ? this.world.stops.get(n.stopId) : undefined;
    const route = n.routeId ? this.world.routes.get(n.routeId) : undefined;
    return {
      id: n.id,
      category: n.category,
      title: n.title,
      body: n.body,
      busId: n.busId,
      busNumber: bus?.busNumber ?? null,
      stopId: n.stopId,
      stopName: stop?.name ?? null,
      routeId: n.routeId,
      routeName: route ? `Route ${route.number} – ${route.name}` : null,
      isDemo: true,
      createdAt: new Date(n.createdAt).toISOString(),
      readAt: n.readAt === null ? null : new Date(n.readAt).toISOString(),
    };
  }
}
