import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion';

export function HeroIllustration({ demoEnabled = true }: { demoEnabled?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const route = 'M40 330 C 90 300, 110 250, 160 240 S 250 250, 270 200 S 300 120, 360 110 S 450 90, 470 60';
  return (
    <figure className="relative">
      <svg viewBox="0 0 520 380" className="h-auto w-full rounded-3xl border border-white/10 bg-band-deep shadow-2xl" role="img" aria-labelledby="hero-map-title hero-map-desc">
        <title id="hero-map-title">Illustration of a bus moving along a route toward a student’s stop</title>
        <desc id="hero-map-desc">A stylized street map with a blue route line, several stops, a highlighted stop and a bus icon traveling along the route. An arrival card shows the bus arriving in four minutes.</desc>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#1d3d5f" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="520" height="380" fill="url(#grid)" />
        <g stroke="#24486e" strokeWidth="10" strokeLinecap="round" fill="none">
          <path d="M0 250 H520" />
          <path d="M0 110 H520" />
          <path d="M160 0 V380" />
          <path d="M360 0 V380" />
          <path d="M20 360 L500 20" opacity="0.6" />
        </g>
        <rect x="380" y="20" width="110" height="70" rx="10" fill="#16A34A" opacity="0.2" />
        <text x="435" y="45" textAnchor="middle" fill="#9ae6b4" fontSize="11" fontWeight="700">SCHOOL</text>
        <path d={route} fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="11" strokeLinecap="round" />
        <path id="hero-route" d={route} fill="none" stroke="#2878E5" strokeWidth="6" strokeLinecap="round" />
        {[
          [40, 330],
          [160, 240],
          [470, 60],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="7" fill="#16324F" stroke="#fff" strokeWidth="3" />
        ))}
        <circle cx="360" cy="110" r="11" fill="#F59E0B" stroke="#16324F" strokeWidth="3" />
        {!reduced && (
          <circle cx="360" cy="110" r="11" fill="none" stroke="#F59E0B" strokeWidth="2">
            <animate attributeName="r" values="11;24" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0" dur="2s" repeatCount="indefinite" />
          </circle>
        )}
        <g>
          <g transform="translate(-15 -15)">
            <rect width="30" height="30" rx="8" fill="#2878E5" stroke="#fff" strokeWidth="3" />
            <text x="15" y="20" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800">12</text>
          </g>
          {reduced ? (
            <animateTransform attributeName="transform" type="translate" values="270 200" dur="1s" fill="freeze" />
          ) : (
            <animateMotion dur="9s" repeatCount="indefinite" keyPoints="0;0.62;0.62" keyTimes="0;0.85;1" calcMode="linear">
              <mpath href="#hero-route" />
            </animateMotion>
          )}
        </g>
      </svg>
      <div className="absolute -bottom-6 left-4 right-4 rounded-2xl border border-border bg-surface p-4 shadow-xl sm:left-auto sm:right-6 sm:w-72">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Your stop · Copper Kettle Park</p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums text-navy">4 min</p>
        <p className="text-sm text-muted">Bus 12 · On time</p>
      </div>
      <figcaption className="mt-10 text-xs text-white/60 sm:mt-3 sm:pr-80">{demoEnabled ? 'Illustration — open the demo to see the live simulation.' : 'Illustration — not real bus data.'}</figcaption>
    </figure>
  );
}
