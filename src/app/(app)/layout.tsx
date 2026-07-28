'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import './shell.css';
import { Icon, type IconName } from '../_components/icons';
import { Logo, ToastProvider } from '../_components/ui';
import { toggleTheme } from '../providers';

interface NavItem { href: string; label: string; icon: IconName; superadmin?: boolean }

const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: 'Workspace', items: [
    { href: '/chat', label: 'Chat', icon: 'chat' },
    { href: '/dashboard', label: 'Dashboard', icon: 'dash' },
    { href: '/chatbots', label: 'Chatbots', icon: 'bot' },
    { href: '/knowledge', label: 'Knowledge Base', icon: 'book' },
    { href: '/conversations', label: 'Conversations', icon: 'chat' },
    { href: '/analytics', label: 'Analitik', icon: 'pulse' },
    { href: '/memory', label: 'Memory', icon: 'graph' },
    { href: '/models', label: 'Models & Keys', icon: 'cpu' },
    { href: '/branding', label: 'Branding', icon: 'edit' },
  ] },
  { group: 'Organisasi', items: [
    { href: '/team', label: 'Team', icon: 'users' },
    { href: '/usage', label: 'Usage', icon: 'pulse' },
    { href: '/billing', label: 'Billing', icon: 'card' },
    { href: '/observability', label: 'Observability', icon: 'pulse' },
    // superadmin: item difilter per-role, bukan grup terpisah — grup sendiri
    // membuatnya duduk paling bawah dan terpotong di jendela pendek
    { href: '/dataroom', label: 'Dataroom', icon: 'book', superadmin: true },
    { href: '/settings', label: 'Settings', icon: 'gear' },
  ] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const user = session?.user;
  const initial = (user?.name ?? user?.email ?? 'N').charAt(0).toUpperCase();
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
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className="nav-item"
                    data-active={pathname === it.href || undefined} onClick={() => setOpen(false)}>
                    <Icon name={it.icon} size={18} className="ico" /> {it.label}
                  </Link>
                ))}
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
