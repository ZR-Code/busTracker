import { BellRing, Clock, Database, Eye, FlaskConical, MapPinned, Radio, Route, ShieldCheck, UserPlus, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '@/app/auth-context';
import { Button, ButtonLink } from '@/components/ui/button';
import { useStartDemo } from '@/features/auth/use-start-demo';
import { HeroIllustration } from './hero-illustration';

export function LandingPage() {
  const { me, config } = useAuth();
  const navigate = useNavigate();
  const { start, pending } = useStartDemo();
  const demoEnabled = config?.demoEnabled !== false;
  const demoProps = (persona: 'student' | 'parent') => ({ onClick: () => start(persona), loading: pending === persona, disabled: pending !== null });

  return (
    <>
      <section className="bb-band relative overflow-hidden bg-band text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-16">
          <div>
            <h1 className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">Never miss your bus again.</h1>
            <p className="mt-5 max-w-xl text-pretty text-lg text-white/80">
              BusBuddy shows where your school bus is, how many minutes until it reaches your stop, and whether it’s running late — so students know exactly when to leave home and parents know their kids are on their way.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="bg-accent text-accent-fg hover:bg-accent-hover" onClick={() => (me ? navigate(homePathFor(me)) : navigate('/login'))}>
                <MapPinned className="h-5 w-5" aria-hidden /> Track Your Bus
              </Button>
              {demoEnabled ? (
                <Button size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15" {...demoProps('student')}>
                  <FlaskConical className="h-5 w-5" aria-hidden /> Explore Demo
                </Button>
              ) : (
                !me && (
                  <ButtonLink to="/signup" size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15">
                    <UserPlus className="h-5 w-5" aria-hidden /> Create an account
                  </ButtonLink>
                )
              )}
            </div>
            {demoEnabled && <p className="mt-4 text-sm text-white/65">No account needed for the demo. It uses a fictional district and clearly labeled simulated buses.</p>}
          </div>
          <div className="mx-auto w-full max-w-xl lg:max-w-none">
            <HeroIllustration demoEnabled={demoEnabled} />
          </div>
        </div>
      </section>

      {demoEnabled && (
        <section aria-labelledby="try-demo" className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 lg:flex-row lg:items-center lg:gap-8">
            <div className="max-w-xl">
              <h2 id="try-demo" className="text-xl font-bold">
                Try the interactive demo
              </h2>
              <p className="mt-1 text-pretty text-muted">Watch simulated buses run five routes in the fictional Maplewood Valley district — no sign-up needed.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button size="lg" {...demoProps('student')}>
                <FlaskConical className="h-4 w-4" aria-hidden /> Try interactive demo
              </Button>
              <Button size="lg" variant="outline" {...demoProps('parent')}>
                <Users className="h-4 w-4" aria-hidden /> Demo as a parent
              </Button>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="features" className="mx-auto max-w-6xl px-4 py-16">
        <h2 id="features" className="text-balance text-3xl font-extrabold tracking-tight">
          Everything you need at the bus stop
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature icon={<MapPinned />} title="Live bus map">
            See your bus move along its route, with your stop highlighted and every upcoming stop listed.
          </Feature>
          <Feature icon={<Clock />} title="Arrival countdown">
            A clear “minutes until arrival” estimate based on distance along the actual route, updated every few seconds.
          </Feature>
          <Feature icon={<BellRing />} title="Arrival reminders">
            Choose 2, 5 or 10 minutes of warning. Each reminder is sent once per trip — no notification floods.
          </Feature>
          <Feature icon={<Route />} title="Delays and route changes">
            Know when a bus is behind schedule, and read announcements from your transportation office.
          </Feature>
          <Feature icon={<Users />} title="Parent view">
            Parents follow their verified students’ buses — and only theirs. Links require the school’s approval.
          </Feature>
          <Feature icon={<Eye />} title="Accessible by design">
            Every status has a text label, and the full route is readable as a list for screen readers and keyboards.
          </Feature>
        </div>
      </section>

      <section aria-labelledby="how" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="how" className="text-balance text-3xl font-extrabold tracking-tight">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            <Step n={1} title="Buses report their location">
              A district’s GPS system sends each bus’s position to BusBuddy through a secure, server-side adapter.
            </Step>
            <Step n={2} title="BusBuddy predicts arrival">
              Positions are matched to the route’s geometry and timetable to estimate when the bus reaches each stop.
            </Step>
            <Step n={3} title="You get the right info at the right time">
              Check the countdown or get a reminder before the bus arrives, with clear warnings when data is delayed.
            </Step>
          </ol>
        </div>
      </section>

      <section aria-labelledby="benefits" className="mx-auto max-w-6xl px-4 py-16">
        <h2 id="benefits" className="text-balance text-3xl font-extrabold tracking-tight">
          Made for students and parents
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Benefit title="For students" points={['Leave home at the right time instead of waiting in the cold', 'Know right away when your bus is running late', 'Save your stop and get a reminder before the bus arrives']} />
          <Benefit title="For parents" points={['See your child’s bus and stop in one place', 'Get delay and cancellation alerts', 'Follow more than one student, with the school verifying each link']} />
        </div>
      </section>

      <section aria-labelledby="transparency" className="bb-band bg-band text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 id="transparency" className="text-balance text-3xl font-extrabold tracking-tight">
              Honest about where the data comes from
            </h2>
            <p className="mt-3 max-w-md text-pretty text-white/80">BusBuddy never presents simulated movement as a real vehicle. Every bus shows its data source and how fresh its location is.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            <Source icon={<Radio />} title="Live GPS" text="Positions reported by a district’s GPS system. Requires a district integration." />
            <Source icon={<FlaskConical />} title="DEMO LIVE SIMULATION" text="Fictional buses moved by BusBuddy’s simulator, for demonstration only." />
            <Source icon={<Clock />} title="Location update delayed" text="No update recently. The last known time is shown and the estimate is flagged as uncertain." />
            <Source icon={<Database />} title="Location unavailable" text="No position yet. Timetable times are shown instead of a countdown." />
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-brand" aria-hidden />
        <p className="mx-auto mt-3 max-w-2xl text-pretty text-muted">
          BusBuddy is a student project for the Congressional App Challenge. It is not affiliated with any school district, and the demo district is fictional. A real deployment would connect to a district’s GPS system through the documented adapter.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {demoEnabled && (
            <Button size="lg" {...demoProps('student')}>
              <FlaskConical className="h-4 w-4" aria-hidden /> Try interactive demo
            </Button>
          )}
          <ButtonLink to="/privacy" size="lg" variant="outline">
            Read the privacy notice
          </ButtonLink>
        </div>
      </section>
    </>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-info-soft text-brand-strong [&>svg]:h-5 [&>svg]:w-5" aria-hidden>
        {icon}
      </div>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="relative rounded-2xl border border-border bg-bg p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-band font-bold text-white dark:bg-brand dark:text-primary-fg" aria-hidden>
        {n}
      </span>
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </li>
  );
}

function Benefit({ title, points }: { title: string; points: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h3 className="text-xl font-bold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {points.map((p) => (
          <li key={p} className="flex gap-2 text-muted">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Source({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <p className="flex items-center gap-2 font-bold [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-accent">
        {icon}
        {title}
      </p>
      <p className="mt-1 text-sm text-white/75">{text}</p>
    </li>
  );
}
