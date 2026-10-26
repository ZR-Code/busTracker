import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/app-shell';
import { PublicLayout } from '@/components/layout/public-layout';
import { AdminAnalyticsPage, AdminOverviewPage, AdminSimulationPage } from '@/features/admin/admin-dashboard';
import { AdminAnnouncementsPage, AdminBusesPage, AdminParentLinksPage, AdminSchoolsPage, AdminStopsPage } from '@/features/admin/admin-entities';
import { AdminLayout } from '@/features/admin/admin-layout';
import { AdminRouteEditorPage, AdminRoutesPage } from '@/features/admin/admin-routes';
import { DemoPage, ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from '@/features/auth/auth-pages';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { AboutPage, AccessibilityPage, ContactPage, NotFoundPage, PrivacyPage } from '@/features/info/info-pages';
import { LandingPage } from '@/features/landing/landing-page';
import { NotificationsPage } from '@/features/notifications/notifications-page';
import { ParentPage } from '@/features/parent/parent-page';
import { RoutesPage } from '@/features/routes/routes-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { StopsPage } from '@/features/stops/stops-page';
import { TrackBusPage, TrackOverviewPage } from '@/features/tracking/track-page';
import { useThemeSync } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from './auth-context';
import { RedirectHome, RequireAuth } from './guards';

function Root() {
  const { me } = useAuth();
  useThemeSync(me?.settings.theme);
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

export const routes = [
  {
    element: <Root />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <LandingPage /> },
          { path: '/demo', element: <DemoPage /> },
          { path: '/login', element: <LoginPage /> },
          { path: '/signup', element: <SignupPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
          { path: '/privacy', element: <PrivacyPage /> },
          { path: '/accessibility', element: <AccessibilityPage /> },
          { path: '/about', element: <AboutPage /> },
          { path: '/contact', element: <ContactPage /> },
          { path: '/home', element: <RedirectHome /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { element: <RequireAuth roles={['student']} />, children: [{ path: '/dashboard', element: <DashboardPage /> }] },
              { element: <RequireAuth roles={['parent']} />, children: [{ path: '/parent', element: <ParentPage /> }] },
              { path: '/track', element: <TrackOverviewPage /> },
              { path: '/track/:busId', element: <TrackBusPage /> },
              { path: '/routes', element: <RoutesPage /> },
              { path: '/stops', element: <StopsPage /> },
              { path: '/notifications', element: <NotificationsPage /> },
              { path: '/settings', element: <SettingsPage /> },
              {
                element: <RequireAuth roles={['admin']} />,
                children: [
                  {
                    path: '/admin',
                    element: <AdminLayout />,
                    children: [
                      { index: true, element: <AdminOverviewPage /> },
                      { path: 'simulation', element: <AdminSimulationPage /> },
                      { path: 'buses', element: <AdminBusesPage /> },
                      { path: 'routes', element: <AdminRoutesPage /> },
                      { path: 'routes/:routeId', element: <AdminRouteEditorPage /> },
                      { path: 'stops', element: <AdminStopsPage /> },
                      { path: 'schools', element: <AdminSchoolsPage /> },
                      { path: 'announcements', element: <AdminAnnouncementsPage /> },
                      { path: 'parent-links', element: <AdminParentLinksPage /> },
                      { path: 'analytics', element: <AdminAnalyticsPage /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

const router = createBrowserRouter(routes);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2000,
        refetchOnWindowFocus: true,
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  });
}

const queryClient = createQueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
