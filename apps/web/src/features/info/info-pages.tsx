import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/button';

function Prose({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      {updated && <p className="mt-2 text-sm text-muted">Last updated {updated}</p>}
      <div className="mt-8 space-y-6 leading-relaxed [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_p]:text-text/90 [&_ul]:space-y-1.5">{children}</div>
    </article>
  );
}

export function PrivacyPage() {
  return (
    <Prose title="Privacy notice" updated="October 2026">
      <p>
        BusBuddy handles information about students’ school transportation, so we collect as little as possible and keep it under the school’s control. This page describes what <strong>this demonstration build actually does</strong>, and separately what a production deployment would need.
      </p>

      <h2>What this build collects</h2>
      <ul>
        <li><strong>Account details:</strong> name, email address, role (student or parent) and school. Passwords are stored only as bcrypt hashes.</li>
        <li><strong>Transportation choices:</strong> assigned route, default stop, favorite stops and reminder lead times.</li>
        <li><strong>Notifications</strong> generated for you (reminders, delays, announcements) and whether you’ve read them.</li>
        <li><strong>Session records:</strong> a random session token (we store only its hash) and when it expires.</li>
        <li><strong>Bus locations:</strong> positions of buses — vehicles, not people. BusBuddy never tracks the location of a student’s phone.</li>
      </ul>
      <p>We do not collect home addresses, phone numbers, device location, advertising identifiers or analytics, and we do not sell or share data.</p>

      <h2>Why it’s needed</h2>
      <p>Your school and route determine which bus you see; your stop determines the countdown and reminders. Notifications are stored so you can review them later.</p>

      <h2>How location information is handled</h2>
      <ul>
        <li>In the demo, every bus position is <strong>simulated</strong> and labeled “DEMO LIVE SIMULATION.” No real vehicle is tracked.</li>
        <li>Stops are public street-corner pickup points, not homes. Bus and route data shown to users never includes which students ride a bus.</li>
        <li>Bus location history is kept for a limited window (120 minutes by default) and then deleted automatically, except each bus’s most recent position.</li>
        <li>GPS provider credentials stay on the server and are never sent to the browser.</li>
      </ul>

      <h2>Who can see transportation information</h2>
      <ul>
        <li><strong>Students</strong> see routes and buses for their own school.</li>
        <li><strong>Parents</strong> see a student’s bus and stop only after the student shares a one-time code <em>and</em> a school administrator verifies the relationship. Pending links show no student details.</li>
        <li><strong>Administrators</strong> manage routes, stops, buses and announcements for their school (or district). Their actions are recorded in an activity log that excludes student personal details.</li>
        <li>Every permission is enforced by the server, not just hidden in the app.</li>
      </ul>

      <h2>Demo sessions</h2>
      <p>
        “Explore Demo” creates a temporary, fictional student or parent account just for your browser. It has no administrator access, uses only fictional people and places, and is deleted automatically after 24 hours (or immediately from Settings → Delete demo data).
      </p>

      <h2>Deleting your data</h2>
      <p>
        In this build, you can delete your account from Settings. Deletion immediately removes your profile, sessions, saved stops, reminders, notifications and parent–student links.
      </p>

      <h2>What a production school deployment would add</h2>
      <p>The following are <strong>planned, not implemented</strong> in this build:</p>
      <ul>
        <li>A data-processing agreement with the school district, and review for applicable laws (for example FERPA and COPPA in the United States, plus state student-privacy laws).</li>
        <li>Roster integration so routes are assigned by the school rather than chosen by students, and parent links are verified against enrollment records.</li>
        <li>District-controlled retention schedules and a process for districts to export or delete all of their data.</li>
        <li>Email delivery for password resets and optional push notifications through a configured provider.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions about privacy? See the <Link to="/contact" className="font-semibold text-brand-strong underline">contact page</Link>.
      </p>
    </Prose>
  );
}

export function AccessibilityPage() {
  return (
    <Prose title="Accessibility">
      <p>BusBuddy aims to meet WCAG 2.2 level AA. Getting to the bus on time matters for everyone, so the essential information never depends on seeing the map.</p>
      <h2>What we’ve built in</h2>
      <ul>
        <li>Every bus status uses a text label and an icon, never color alone.</li>
        <li>The route timeline lists every stop with its state and times as text, usable with a keyboard or screen reader.</li>
        <li>Arrival countdowns are announced politely to screen readers when they change.</li>
        <li>Visible focus outlines, a skip-to-content link, labeled form fields and error messages tied to their fields.</li>
        <li>Animations respect your device’s “reduce motion” setting; bus markers stop gliding and jump directly instead.</li>
        <li>Light and dark themes, with color contrast checked against AA targets.</li>
        <li>Large touch targets (at least 44 by 44 pixels) for primary controls.</li>
      </ul>
      <h2>Known limitations</h2>
      <ul>
        <li>Map tiles come from OpenStreetMap and are not fully described for screen readers; use the route timeline instead.</li>
        <li>Individual stop markers on the map can be selected by pointer only; every stop can be selected by keyboard from the timeline or the Stops list.</li>
      </ul>
      <p>
        Found a barrier? Please tell us through the <Link to="/contact" className="font-semibold text-brand-strong underline">contact page</Link>.
      </p>
    </Prose>
  );
}

export function AboutPage() {
  return (
    <Prose title="About BusBuddy">
      <p>BusBuddy is a student-built project for the Congressional App Challenge. It started with a simple problem: students miss buses because they can’t tell where the bus is or whether it’s late, and parents can’t see their kids’ commute either.</p>
      <p>BusBuddy combines an interactive map, arrival estimates based on real route geometry, reminders and delay alerts. It’s designed to connect to a school district’s GPS system through a documented, server-side adapter.</p>
      <p>
        <strong>Important:</strong> BusBuddy is not affiliated with or endorsed by any school district. The “Maplewood Valley” district in the demo is fictional, and its buses are simulated.
      </p>
      <ButtonLink to="/demo">Try the interactive demo</ButtonLink>
    </Prose>
  );
}

export function ContactPage() {
  return (
    <Prose title="Contact">
      <p>BusBuddy is a student project, not a commercial service. For questions, feedback or accessibility issues, please contact the project author through the Congressional App Challenge submission or the project’s source repository.</p>
      <p>
        If you are a school transportation office interested in a pilot, the <Link to="/about" className="font-semibold text-brand-strong underline">About page</Link> explains what BusBuddy can and can’t do today. A real deployment would require a district GPS integration and a data-privacy agreement.
      </p>
    </Prose>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="text-sm font-bold uppercase tracking-wider text-brand">404</p>
      <h1 className="mt-2 text-3xl font-extrabold">This stop isn’t on the route</h1>
      <p className="mt-2 text-muted">The page you’re looking for doesn’t exist or has moved.</p>
      <div className="mt-6 flex justify-center gap-2">
        <ButtonLink to="/">Go home</ButtonLink>
        <ButtonLink to="/demo" variant="outline">
          Open the demo
        </ButtonLink>
      </div>
    </div>
  );
}
