import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  AdminOverviewDto,
  AdminParentLinkDto,
  AnalyticsDto,
  AnnouncementDto,
  AuditEntryDto,
  BusDto,
  RouteDetailDto,
  RouteSummaryDto,
  SchoolDto,
  SimulationStatusDto,
  StopDto,
} from '@busbuddy/shared';
import { api, errorMessage } from '@/lib/api';

export type AdminSchool = SchoolDto & { counts: { routes: number; buses: number; stops: number } };

export const adminKeys = {
  overview: ['admin', 'overview'] as const,
  analytics: ['admin', 'analytics'] as const,
  activity: ['admin', 'activity'] as const,
  schools: ['admin', 'schools'] as const,
  stops: ['admin', 'stops'] as const,
  routes: ['admin', 'routes'] as const,
  route: (id: string) => ['admin', 'route', id] as const,
  buses: ['admin', 'buses'] as const,
  announcements: ['admin', 'announcements'] as const,
  simulation: ['admin', 'simulation'] as const,
  links: ['admin', 'links'] as const,
};

export const useAdminOverview = () => useQuery({ queryKey: adminKeys.overview, queryFn: () => api.get<AdminOverviewDto>('/admin/overview'), refetchInterval: 5000 });
export const useAdminAnalytics = () => useQuery({ queryKey: adminKeys.analytics, queryFn: () => api.get<AnalyticsDto>('/admin/analytics'), refetchInterval: 5000 });
export const useAdminActivity = () => useQuery({ queryKey: adminKeys.activity, queryFn: () => api.get<AuditEntryDto[]>('/admin/activity') });
export const useAdminSchools = () => useQuery({ queryKey: adminKeys.schools, queryFn: () => api.get<AdminSchool[]>('/admin/schools') });
export const useAdminStops = () => useQuery({ queryKey: adminKeys.stops, queryFn: () => api.get<StopDto[]>('/admin/stops') });
export const useAdminRoutes = () => useQuery({ queryKey: adminKeys.routes, queryFn: () => api.get<RouteSummaryDto[]>('/admin/routes'), refetchInterval: 10_000 });
export const useAdminRoute = (id: string | null) =>
  useQuery({ queryKey: adminKeys.route(id ?? ''), queryFn: () => api.get<RouteDetailDto>(`/admin/routes/${id}`), enabled: Boolean(id) });
export const useAdminBuses = () => useQuery({ queryKey: adminKeys.buses, queryFn: () => api.get<BusDto[]>('/admin/buses'), refetchInterval: 5000 });
export const useAdminAnnouncements = () => useQuery({ queryKey: adminKeys.announcements, queryFn: () => api.get<AnnouncementDto[]>('/admin/announcements') });
export const useSimulation = () => useQuery({ queryKey: adminKeys.simulation, queryFn: () => api.get<SimulationStatusDto>('/admin/simulation'), refetchInterval: 2000 });
export const useParentLinks = () => useQuery({ queryKey: adminKeys.links, queryFn: () => api.get<AdminParentLinkDto[]>('/admin/parent-links') });

export function useAdminMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>, opts: { success: string | ((r: TResult) => string); invalidate?: QueryKey[] }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      for (const k of opts.invalidate ?? [['routes'], ['route'], ['stops'], ['buses'], ['buses-live'], ['bus-live'], ['announcements']]) void qc.invalidateQueries({ queryKey: k });
    },
    onError: (e) => toast.error('Action failed', { description: errorMessage(e) }),
  });
}

export { api };
