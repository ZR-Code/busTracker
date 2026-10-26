import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { live } from '@/test/fixtures';
import { DataSourceBanner, EtaCard, RouteTimeline } from './tracking';

describe('demo labeling and data freshness', () => {
  it('labels simulated movement clearly', () => {
    render(<DataSourceBanner live={live()} />);
    expect(screen.getByText('DEMO LIVE SIMULATION')).toBeInTheDocument();
    expect(screen.getByText(/not a real vehicle location/i)).toBeInTheDocument();
  });

  it('warns when the location is stale', () => {
    render(<DataSourceBanner live={live({ freshness: 'stale', ageSeconds: 400 })} />);
    expect(screen.getByText('Location update delayed')).toBeInTheDocument();
  });

  it('explains when no location exists', () => {
    render(<DataSourceBanner live={live({ freshness: 'unavailable', location: null })} />);
    expect(screen.getByText('Location unavailable')).toBeInTheDocument();
  });
});

describe('EtaCard', () => {
  it('shows a countdown, schedule status and source', () => {
    render(<EtaCard live={live()} stopId="s2" units="imperial" />);
    expect(screen.getByText('4 min')).toBeInTheDocument();
    expect(screen.getByText('Copper Kettle Park')).toBeInTheDocument();
    expect(screen.getByText('On time')).toBeInTheDocument();
    expect(screen.getAllByText('DEMO LIVE SIMULATION').length).toBeGreaterThan(0);
    expect(screen.getByText(/High confidence/)).toBeInTheDocument();
  });

  it('marks stale estimates as uncertain', () => {
    render(<EtaCard live={live({ freshness: 'stale', uncertain: true })} stopId="s2" units="imperial" />);
    expect(screen.getByText('Estimate uncertain')).toBeInTheDocument();
  });

  it('does not show a countdown for a stop the bus has passed', () => {
    render(<EtaCard live={live()} stopId="s1" units="imperial" />);
    expect(screen.getByText('Departed')).toBeInTheDocument();
    expect(screen.queryByText(/confidence/)).not.toBeInTheDocument();
  });

  it('never shows zero minutes when data is missing', () => {
    const l = live({ freshness: 'unavailable', location: null, stops: live().stops.map((s) => ({ ...s, etaSeconds: null, state: 'unknown' as const })) });
    render(<EtaCard live={l} stopId="s2" units="imperial" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText(/0 min/)).not.toBeInTheDocument();
  });
});

describe('RouteTimeline', () => {
  it('lists stop states and lets the user select a stop', async () => {
    const onSelect = vi.fn();
    render(<RouteTimeline live={live()} selectedStopId="s2" onSelect={onSelect} units="metric" />);
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Next stop')).toBeInTheDocument();
    const school = screen.getByRole('button', { name: /Maplewood Valley HS/ });
    expect(screen.getByRole('button', { name: /Copper Kettle Park/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(school);
    expect(onSelect).toHaveBeenCalledWith('s3');
  });
});
