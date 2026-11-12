// Formas de cumbres en SVG (sin fotos): tres planos de montaña y nieve en las puntas.
export function Cumbres({ className = '' }) {
  return (
    <svg viewBox="0 0 1200 260" preserveAspectRatio="none" className={className} aria-hidden>
      <path d="M0 260V170l120-70 90 50 140-120 120 95 80-45 160 125 110-80 150 95 110-60 120 70v120Z" fill="#328CC1" opacity=".35" />
      <path d="M0 260V200l160-110 110 70 170-140 150 120 90-50 170 130 130-90 220 140v90Z" fill="#EAF4FB" opacity=".55" />
      <path d="M0 260v-40l220-120 120 70 200-150 170 140 120-60 220 150 150-60v70Z" fill="#fff" />
      <path d="M540 100l-34 32 22-6 12 14 18-22 20 10Z" fill="#EAF4FB" />
      <path d="M220 100l-30 22 18-2 10 10 14-14 16 4Z" fill="#EAF4FB" />
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
