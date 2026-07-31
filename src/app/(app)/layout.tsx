'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import './shell.css';
import { Icon, type IconName } from '../_components/icons';
import { Logo, ToastProvider } from '../_components/ui';
import { toggleTheme } from '../providers';
import { useEntitlements, hasFeature, LockIcon, SKIP_ONBOARD_KEY } from '../_components/entitlements';
import type { Feature } from '@/modules/core/limits';

interface NavItem { href: string; label: string; icon: IconName; superadmin?: boolean; feature?: Feature }

const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: 'Workspace', items: [
    { href: '/chat', label: 'Chat', icon: 'chat' },
    { href: '/dashboard', label: 'Dashboard', icon: 'dash' },
    { href: '/chatbots', label: 'Chatbots', icon: 'bot' },
    { href: '/knowledge', label: 'Knowledge Base', icon: 'book' },
    { href: '/documents', label: 'Dokumen', icon: 'search' },
    { href: '/conversations', label: 'Conversations', icon: 'chat' },
    { href: '/analytics', label: 'Analitik', icon: 'pulse', feature: 'analytics' },
    { href: '/memory', label: 'Memory', icon: 'graph', feature: 'memory' },
    { href: '/categories', label: 'Kategori Dokumen', icon: 'tag', feature: 'memory' },
    { href: '/models', label: 'Models & Keys', icon: 'cpu' },
    { href: '/branding', label: 'Branding', icon: 'edit', feature: 'branding' },
  ] },
  { group: 'Organisasi', items: [
    { href: '/team', label: 'Team', icon: 'users', feature: 'team' },
    /* Tepat di bawah Team, karena keduanya menjawab satu pertanyaan yang
       sama: siapa orangnya, dan ia boleh melihat apa. */
    { href: '/divisions', label: 'Divisi', icon: 'users', feature: 'team' },
    { href: '/usage', label: 'Usage', icon: 'pulse', feature: 'usage' },
    { href: '/billing', label: 'Billing', icon: 'card' },
    { href: '/observability', label: 'Observability', icon: 'pulse' },
    // superadmin: item difilter per-role, bukan grup terpisah — grup sendiri
    // membuatnya duduk paling bawah dan terpotong di jendela pendek
    { href: '/dataroom', label: 'Dataroom', icon: 'book', superadmin: true },
    { href: '/settings', label: 'Settings', icon: 'gear' },
    // Panduan diletakkan PALING BAWAH dan tanpa gerbang fitur: yang paling
    // butuh membacanya adalah tenant paket gratis di hari pertama.
    { href: '/bantuan', label: 'Panduan', icon: 'book' },
  ] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const user = session?.user;
  const initial = (user?.name ?? user?.email ?? 'N').charAt(0).toUpperCase();
  const { data: ent } = useEntitlements();
  const router = useRouter();

  /* Onboarding sekali: hanya dari /dashboard (tujuan default sesudah login)
     dan hanya untuk yang benar-benar baru. Menawarkannya dari setiap halaman
     akan terasa seperti paywall yang mengejar-ngejar. */
  useEffect(() => {
    if (pathname !== '/dashboard' || !ent?.shouldOnboard) return;
    if (sessionStorage.getItem(SKIP_ONBOARD_KEY)) return;
    router.replace('/welcome');
  }, [pathname, ent?.shouldOnboard, router]);
  const nav = NAV.map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.superadmin || user?.role === 'superadmin'),
  }));

  return (
    <ToastProvider>
      <div className="shell">
        <aside className={`sidebar${open ? ' open' : ''}`}>
          <div className="side-brand"><Logo height={26} /></div>
          {/* area nav bisa di-scroll — tanpa ini item bawah TERPOTONG di
              jendela pendek (sidebar height:100vh, footer akun menempel) */}
          <div className="side-scroll">
            {nav.map((g) => (
              <nav key={g.group}>
                <div className="nav-label">{g.group}</div>
                {g.items.map((it) => {
                  // Item terkunci sengaja TETAP TAMPIL (dgn gembok): menyembunyikan
                  // fitur berbayar membuat pengguna tak tahu ada nilai lebih.
                  // Kliknya tetap membuka halaman — halamannya yang menjelaskan.
                  const locked = !!it.feature && !!ent && !hasFeature(ent, it.feature);
                  return (
                    <Link key={it.href} href={it.href} className="nav-item"
                      data-active={pathname === it.href || undefined}
                      data-locked={locked || undefined} onClick={() => setOpen(false)}>
                      <Icon name={it.icon} size={18} className="ico" /> {it.label}
                      {locked && <span className="nav-lock" title="Perlu upgrade plan"><LockIcon /></span>}
                    </Link>
                  );
                })}
              </nav>
            ))}
          </div>
          <div className="side-foot">
            <span className="avatar">{initial}</span>
            <div className="who">
              <b>{user?.name ?? user?.email ?? 'Pengguna'}</b>
              <small>{(user?.role ?? 'member').toUpperCase()}</small>
            </div>
            <button className="icon-btn" style={{ width: 34, height: 34 }} title="Keluar"
              onClick={() => signOut({ callbackUrl: '/auth' })}><Icon name="logout" size={16} /></button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="icon-btn hamb" aria-label="Menu" onClick={() => setOpen((v) => !v)}><Icon name="menu" size={18} /></button>
            <div className="grow" />
            <button className="icon-btn" aria-label="Ganti tema" onClick={toggleTheme}><Icon name="sun" size={18} /></button>
          </header>
          <div className="content">{children}</div>
        </div>
      </div>
    </ToastProvider>
  );
}
