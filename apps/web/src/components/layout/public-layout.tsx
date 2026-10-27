import { Link, NavLink, Outlet } from 'react-router-dom';
import { homePathFor, useAuth } from '@/app/auth-context';
import { Logo } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';

export function PublicLayout() {
  const { me, status, config, serverAvailable } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-[2000] rounded bg-surface px-4 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to main content
      </a>
      <header className="sticky top-0 z-[900] border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" aria-label="BusBuddy home">
            <Logo />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            {status === 'authenticated' && me ? (
              <ButtonLink to={homePathFor(me)} size="sm">
                Open BusBuddy
              </ButtonLink>
            ) : (
              <>
                {serverAvailable && (
                  <NavLink to="/login" className="inline-flex h-9 items-center whitespace-nowrap rounded-lg px-2.5 text-sm font-semibold hover:bg-surface-muted sm:px-3">
                    Sign in
                  </NavLink>
                )}
                {config?.demoEnabled === false ? (
                  <ButtonLink to="/signup" size="sm">
                    Create account
                  </ButtonLink>
                ) : (
                  <ButtonLink to="/demo" size="sm">
                    <span className="sm:hidden">Try demo</span>
                    <span className="hidden sm:inline">Try interactive demo</span>
                  </ButtonLink>
                )}
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo className="scale-90 origin-left" />
          <p className="mt-1">Never miss your bus again. A Congressional App Challenge project.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 font-medium">
            <li><Link className="hover:text-text hover:underline" to="/about">About</Link></li>
            <li><Link className="hover:text-text hover:underline" to="/privacy">Privacy</Link></li>
            <li><Link className="hover:text-text hover:underline" to="/accessibility">Accessibility</Link></li>
            <li><Link className="hover:text-text hover:underline" to="/contact">Contact</Link></li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-muted">
        Map data © OpenStreetMap contributors. The demo district, schools, people and bus movements are fictional.
      </p>
    </footer>
  );
}
