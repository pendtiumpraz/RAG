import type { Metadata } from 'next';
import './plugin.css';

export const metadata: Metadata = {
  title: 'Panel Plugin · Nalar',
  robots: { index: false, follow: false },
};

/**
 * Layout panel plugin (embed-plugin-panel). Sengaja TIPIS: root layout sudah
 * menyediakan <html>/<body> + SessionProvider. Di sini cuma pembungkus ber-
 * kelas `.nplug` supaya seluruh gaya panel terkurung (lihat plugin.css) dan
 * tidak menabrak design-system utama saat halaman ini dibuka langsung.
 *
 * Saat disematkan lewat <iframe>, dokumen ini berdiri sendiri sehingga gaya
 * situs induk tak bisa bocor masuk — isolasi CSS otomatis dari iframe.
 */
export default function PluginLayout({ children }: { children: React.ReactNode }) {
  return <div className="nplug">{children}</div>;
}
