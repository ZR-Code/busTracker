import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnnouncementDto,
  BusDto,
  BusLiveDto,
  LinkCodeDto,
  LinkedStudentDto,
  MeDto,
  NotificationCategory,
  NotificationDto,
  Paginated,
  RouteDetailDto,
  RouteSummaryDto,
  SchoolDto,
  StopDto,
  StopPreferenceInput,
  StudentTransportationDto,
  UpdateProfileInput,
  UpdateStudentProfileInput,
} from '@busbuddy/shared';
import { api, qs } from '@/lib/api';
import { clientEnv } from '@/lib/env';
import { ME_KEY } from '@/app/auth-context';

export const keys = {
  schools: ['schools'] as const,
  routes: (search?: string) => ['routes', search ?? ''] as const,
  route: (id: string) => ['route', id] as const,
  stops: (p: { search?: string; routeId?: string }) => ['stops', p.search ?? '', p.routeId ?? ''] as const,
  buses: (routeId?: string) => ['buses', routeId ?? ''] as const,
  busLive: (id: string, stopId?: string | null) => ['bus-live', id, stopId ?? ''] as const,
  busesLive: (routeId?: string) => ['buses-live', routeId ?? ''] as const,
  notifications: (category?: NotificationCategory | 'all') => ['notifications', category ?? 'all'] as const,
  unread: ['notifications-unread'] as const,
  announcements: (routeId?: string) => ['announcements', routeId ?? ''] as const,
  students: ['linked-students'] as const,
  transport: (id: string) => ['student-transport', id] as const,
};

export const useSchools = () => useQuery({ queryKey: keys.schools, queryFn: () => api.get<SchoolDto[]>('/schools'), staleTime: 5 * 60_000 });

export const useRoutes = (search?: string) =>
  useQuery({ queryKey: keys.routes(search), queryFn: () => api.get<RouteSummaryDto[]>(`/routes${qs({ search })}`), placeholderData: keepPreviousData, refetchInterval: 15_000 });

export const useRoute = (id: string | null | undefined) =>
  useQuery({ queryKey: keys.route(id ?? ''), queryFn: () => api.get<RouteDetailDto>(`/routes/${id}`), enabled: Boolean(id), staleTime: 60_000 });

export const useStops = (p: { search?: string; routeId?: string } = {}) =>
  useQuery({ queryKey: keys.stops(p), queryFn: () => api.get<StopDto[]>(`/stops${qs(p)}`), placeholderData: keepPreviousData });

export const useBuses = (routeId?: string) => useQuery({ queryKey: keys.buses(routeId), queryFn: () => api.get<BusDto[]>(`/buses${qs({ routeId })}`), refetchInterval: 15_000 });

export const useLiveBus = (busId: string | null | undefined, stopId?: string | null) =>
  useQuery({
    queryKey: keys.busLive(busId ?? '', stopId),
    queryFn: ({ signal }) => api.get<BusLiveDto>(`/buses/${busId}/live${qs({ stopId })}`, signal),
    enabled: Boolean(busId),
    refetchInterval: clientEnv.pollIntervalMs,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

export const useLiveBuses = (routeId?: string, enabled = true) =>
  useQuery({
    queryKey: keys.busesLive(routeId),
    queryFn: ({ signal }) => api.get<BusLiveDto[]>(`/buses/live${qs({ routeId })}`, signal),
    enabled,
    refetchInterval: clientEnv.pollIntervalMs,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

export const useNotifications = (category: NotificationCategory | 'all' = 'all') =>
  useQuery({
    queryKey: keys.notifications(category),
    queryFn: () => api.get<Paginated<NotificationDto>>(`/notifications${qs({ category: category === 'all' ? undefined : category, limit: 50 })}`),
    refetchInterval: 10_000,
  });

export const useUnreadCount = (enabled = true) =>
  useQuery({ queryKey: keys.unread, queryFn: () => api.get<{ count: number }>('/notifications/unread-count'), refetchInterval: 10_000, enabled });

export const useAnnouncements = (routeId?: string) =>
  useQuery({ queryKey: keys.announcements(routeId), queryFn: () => api.get<AnnouncementDto[]>(`/announcements${qs({ routeId })}`), refetchInterval: 30_000 });

export const useLinkedStudents = (enabled = true) =>
  useQuery({ queryKey: keys.students, queryFn: () => api.get<LinkedStudentDto[]>('/me/students'), enabled });

export const useStudentTransport = (id: string | null | undefined) =>
  useQuery({ queryKey: keys.transport(id ?? ''), queryFn: () => api.get<StudentTransportationDto>(`/students/${id}/transportation`), enabled: Boolean(id) });

export function useStopPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stopId, ...input }: StopPreferenceInput & { stopId: string }) => api.put<StopDto>(`/stops/${stopId}/preference`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stops'] }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.patch<MeDto>('/me', input),
    onSuccess: (me) => qc.setQueryData(ME_KEY, me),
  });
}

export function useUpdateStudentProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStudentProfileInput) => api.patch<MeDto>('/me/student-profile', input),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
      void qc.invalidateQueries({ queryKey: ['stops'] });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<NotificationDto>(`/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: keys.unread });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ updated: number }>('/notifications/read-all'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: keys.unread });
    },
  });
}

export const useCreateLinkCode = () => useMutation({ mutationFn: () => api.post<LinkCodeDto>('/me/link-code') });

export function useLinkStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<{ relationshipId: string; status: string }>('/me/students/link', { code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.students }),
  });
}

export function useUnlinkStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relationshipId: string) => api.delete<void>(`/me/students/${relationshipId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.students }),
  });
}
