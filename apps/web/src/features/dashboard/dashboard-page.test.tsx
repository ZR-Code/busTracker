import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { me, live, routeDetail, routeSummary, stops } from '@/test/fixtures';
import { mockApi, renderWithProviders } from '@/test/render';
import { DashboardPage } from './dashboard-page';

vi.mock('@/components/map/lazy-map', () => ({
  LazyTransitMap: ({ ariaLabel }: { ariaLabel: string }) => <div role="region" aria-label={ariaLabel} />,
}));

const base = {
  '/auth/config': { provider: 'local', demoEnabled: true, passwordResetDelivery: 'server_log', supabase: null },
  '/auth/session': { me },
  '/routes': [routeSummary],
  '/routes/r1': routeDetail,
  '/buses/b12/live': live(),
  '/stops': stops,
  '/announcements': [],
  '/notifications': { items: [], nextCursor: null },
};

beforeEach(() => vi.unstubAllGlobals());

describe('DashboardPage', () => {
  it('renders the greeting, assigned bus, countdown and demo label', async () => {
    mockApi(base);
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });
    expect(await screen.findByRole('heading', { level: 1, name: /Jordan/ })).toBeInTheDocument();
    expect(await screen.findByText('Your next pickup')).toBeInTheDocument();
    expect(screen.getByText('4 min')).toBeInTheDocument();
    expect(screen.getAllByText('DEMO LIVE SIMULATION').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: /Map of Route 1/ })).toBeInTheDocument();
    expect(screen.getByText('Route timeline')).toBeInTheDocument();
  });

  it('shows a loading state, then an error state with retry', async () => {
    mockApi({ ...base, '/routes': () => new Response(JSON.stringify({ error: { code: 'internal_error', message: 'Database unavailable' } }), { status: 500 }) });
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('asks the student to choose a route when none is assigned', async () => {
    mockApi({ ...base, '/auth/session': { me: { ...me, studentProfile: { ...me.studentProfile!, assignedRouteId: null } } } });
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });
    expect(await screen.findByText('Choose your bus route')).toBeInTheDocument();
  });

  it('selecting a stop in the timeline updates the arrival card', async () => {
    mockApi(base);
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });
    await screen.findByText('Your next pickup');
    await userEvent.click(screen.getByRole('button', { name: /Maplewood Valley HS — Bus Loop/ }));
    await waitFor(() => expect(screen.getByText('Arrival estimate')).toBeInTheDocument());
    expect(screen.getByText('9 min')).toBeInTheDocument();
  });

  it('saves an arrival reminder for the selected stop', async () => {
    const { calls } = mockApi({ ...base, 'PUT /stops/s2/preference': { ...stops[1], reminderLeadMinutes: 10 } });
    renderWithProviders(<DashboardPage />, { route: '/dashboard' });
    const group = await screen.findByRole('radiogroup', { name: /Arrival reminder for Copper Kettle Park/ });
    await waitFor(() => expect(within(group).getByRole('radio', { name: '5 min' })).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(within(group).getByRole('radio', { name: '10 min' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.path === '/stops/s2/preference')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toEqual({ reminderLeadMinutes: 10 });
  });
});
