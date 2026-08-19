'use client';

/**
 * Deret tab internal halaman (pola .dr-tab Dataroom, kelas global .page-tab).
 * Dipakai untuk memecah halaman panjang jadi beberapa bagian yang tampil satu
 * per satu. State-nya di pemanggil (biasanya lewat useHashTab) supaya tab bisa
 * di-bookmark. Tab superadmin difilter di daftar, bukan cuma isinya, agar
 * non-superadmin tak melihat tab dengan panel kosong.
 */
export interface TabDef<T extends string> { key: T; label: string; super?: boolean }

export function PageTabs<T extends string>({ tabs, active, onPick, label }: {
  tabs: readonly TabDef<T>[];
  active: T;
  onPick: (k: T) => void;
  label: string;
}) {
  return (
    <nav className="page-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={t.key === active}
          className={`page-tab${t.key === active ? ' on' : ''}`} onClick={() => onPick(t.key)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
