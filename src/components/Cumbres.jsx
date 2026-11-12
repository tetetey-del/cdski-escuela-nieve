// Cordillera en SVG (sin fotos): tres planos con profundidad, cumbres nevadas
// con cara de luz y de sombra, vetas de roca y pinos en primer plano.
export function Cumbres({ className = '' }) {
  return (
    <svg viewBox="0 0 1200 320" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="cdski-lejos" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9d8ee" stopOpacity=".9" />
          <stop offset="1" stopColor="#EAF4FB" stopOpacity=".4" />
        </linearGradient>
        <linearGradient id="cdski-medio" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f8fc0" />
          <stop offset=".7" stopColor="#8dbbdc" />
        </linearGradient>
        <linearGradient id="cdski-nieve" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f1f7fc" />
        </linearGradient>
        <linearGradient id="cdski-bruma" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity=".6" />
        </linearGradient>
        <symbol id="cdski-pino" viewBox="-16 -44 32 52" overflow="visible">
          <path d="M0-44 -8-27h4L-12-13h4L-15 2H15L8-13h4L4-27h4Z" />
          <rect x="-2" y="2" width="4" height="6" />
        </symbol>
      </defs>

      {/* cordillera lejana */}
      <path d="M0 215 80 172l60 18 90-72 70 47 60-25 90-57 70 65 80-40 90 50 70-65 90 45 80-35 80 45 90-35 100 45V320H0Z" fill="url(#cdski-lejos)" />

      {/* cordillera media */}
      <path d="M0 252 110 190l60 25 120-87 80 62 60-22 130-102 90 92 70-27 100 52 80-67 100 72 80-32 120 47V320H0Z" fill="url(#cdski-medio)" />
      {/* nieve en las cumbres medias: luz y sombra */}
      <path d="M560 68 520 108l16-4 12 12 12-12 12 10 14-12 12 6Z" fill="#fff" />
      <path d="M560 68 598 108l-12-6-14 12-6-14Z" fill="#d4e6f3" />
      <path d="M290 128 266 150l12-3 9 9 9-9 10 5Z" fill="#fff" />
      <path d="M290 128 306 152l-10-5-9 9Z" fill="#d4e6f3" />
      <path d="M900 118 874 142l12-3 10 9 10-8 12 6Z" fill="#fff" />
      <path d="M900 118 918 146l-12-6-10 8Z" fill="#d4e6f3" />
      <rect x="0" y="230" width="1200" height="90" fill="url(#cdski-bruma)" />

      {/* cordillera cercana, nevada */}
      <path d="M0 272 150 215l80 25 150-92 90 57 70-20 160-92 100 80 80-15 130 60 90-20 100 40V320H0Z" fill="url(#cdski-nieve)" />
      {/* caras en sombra */}
      <path d="M380 148 470 205l-38 10-24-24-14 8Z" fill="#d9e9f5" />
      <path d="M700 93 800 173l-40 12-24-34-18 9-6-30Z" fill="#cfe3f2" />
      <path d="M150 215 230 240l-30 6-26-14Z" fill="#e1eef7" />
      <path d="M1010 220l90-20 100 40-70-6-60-6Z" fill="#e4eff8" />
      {/* vetas de roca */}
      <path d="M700 93l-8 30 6-2-4 26 9-22 1 18 6-24Z" fill="#0B3C5D" opacity=".28" />
      <path d="M380 148l-6 22 5-2-3 18 7-16 3 10 2-20Z" fill="#0B3C5D" opacity=".22" />
      <path d="M712 110l14 24-4 2 8 18-14-18-2 6Z" fill="#0B3C5D" opacity=".14" />

      {/* ladera en primer plano */}
      <path d="M0 320V292Q300 252 600 284T1200 278V320Z" fill="#fff" />
      <path d="M0 300Q300 268 600 296T1200 290" fill="none" stroke="#d9e9f5" strokeWidth="2" />

      {/* pinos */}
      <g fill="#0B3C5D">
        <use href="#cdski-pino" x="40" y="252" width="32" height="52" />
        <use href="#cdski-pino" x="70" y="262" width="24" height="40" opacity=".85" />
        <use href="#cdski-pino" x="96" y="268" width="18" height="30" opacity=".7" />
        <use href="#cdski-pino" x="1100" y="246" width="30" height="50" />
        <use href="#cdski-pino" x="1132" y="256" width="24" height="40" opacity=".85" />
        <use href="#cdski-pino" x="1160" y="250" width="28" height="46" />
      </g>
    </svg>
  )
}

export function Logo({ claro, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 64 64" className="size-9" aria-hidden>
        <rect width="64" height="64" rx="14" fill={claro ? '#fff' : '#0B3C5D'} />
        <path d="M8 48 26 20l8 12 6-8 16 24Z" fill={claro ? '#0B3C5D' : '#fff'} />
        <path d="M26 20l5 7.7-5-2.7-4 3.5Z" fill="#328CC1" />
      </svg>
      <span className={`titulo text-2xl font-bold tracking-wide ${claro ? 'text-white' : 'text-glaciar'}`}>CDSKI</span>
    </span>
  )
}
