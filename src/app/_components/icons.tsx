/**
 * Ikon brand — outline, rounded, 2px stroke (sesuai ICON STYLE resmi).
 * currentColor agar warna diatur lewat CSS.
 */
export type IconName =
  | 'dash' | 'bot' | 'book' | 'chat' | 'graph' | 'cpu' | 'users' | 'gear'
  | 'plus' | 'search' | 'edit' | 'trash' | 'restore' | 'close' | 'menu'
  | 'sun' | 'moon' | 'plug' | 'sync' | 'logout' | 'card' | 'pulse';

const P: Record<IconName, React.ReactNode> = {
  dash: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="4.5" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="11.5" width="7" height="9.5" rx="1.5" /></>,
  bot: <><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 3v4M9 12h.01M15 12h.01M9.5 16h5" /></>,
  book: <><path d="M5 4h11a2 2 0 0 1 2 2v14l-4-2-3 1.5L8 18l-3 1.5V6a2 2 0 0 1 2-2Z" /><path d="M8 8h7M8 11h5" /></>,
  chat: <><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /><path d="M8 9h8M8 12h5" /></>,
  graph: <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M7.8 7.2 10.4 16M16.4 8.6 13.4 16.4M8.1 6.4 15.9 6.8" /></>,
  cpu: <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9.5 2v3M14.5 2v3M9.5 19v3M14.5 19v3M2 9.5h3M2 14.5h3M19 9.5h3M19 14.5h3" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" /><path d="M16 4.5a3 3 0 0 1 0 6M18 20c0-2.2-.8-3.7-2-4.6" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.6M12 18.9v2.6M4.2 6.4l1.8 1.1M18 16.5l1.8 1.1M2.5 12h2.6M18.9 12h2.6M4.2 17.6l1.8-1.1M18 7.5l1.8-1.1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-3.5-3.5" /></>,
  edit: <><path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" /><path d="M13.5 6.5 17.5 10.5" /></>,
  trash: <><path d="M4 6h16M9 6V4h6v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14" /><path d="M10 11v6M14 11v6" /></>,
  restore: <><path d="M4 12a8 8 0 1 1 2.3 5.6" /><path d="M4 20v-5h5" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  plug: <><path d="M9 3v6M15 3v6M6 9h12v2a6 6 0 0 1-12 0V9ZM12 17v4" /></>,
  sync: <><path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v3h3" /><path d="M4 13a8 8 0 0 0 14.5 4.5M20 20v-3h-3" /></>,
  // Pintu di KIRI, panah keluar ke KANAN. Versi sebelumnya menaruh pintu di
  // x 15–20 sementara panahnya membentang x 10–20 — ujung panah menembus
  // bingkai pintunya sendiri, dan hasilnya terbaca sebagai coretan.
  logout: <><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="M16 8l4 4-4 4M20 12h-9" /></>,
  card: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6 15h4" /></>,
  pulse: <path d="M2 12h4l3-7 4 14 3-7h6" />,
};

export function Icon({ name, size = 20, className, style }:
  { name: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true">
      {P[name]}
    </svg>
  );
}
