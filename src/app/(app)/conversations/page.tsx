'use client';

import { EmptyState } from '../../_components/ui';

/**
 * Riwayat percakapan direkam per chatbot (tabel conversations/messages) saat
 * pengunjung memakai widget embed. Daftar percakapan penuh menyusul (endpoint
 * list belum dibuat) — halaman ini jujur menampilkan keadaan, tanpa dummy.
 */
export default function ConversationsPage() {
  return (
    <>
      <div className="page-head">
        <div><h1>Conversations</h1><p className="sub">Riwayat percakapan lengkap dengan trace retrieval &amp; sitasi sumber.</p></div>
      </div>
      <div className="card">
        <div className="panel-head"><span className="t">log percakapan</span></div>
        <EmptyState title="Belum ada percakapan"
          hint="Percakapan otomatis terekam saat pengunjung memakai widget embed chatbot-mu. Setiap jawaban menyimpan chunk sumber & skornya." />
      </div>
    </>
  );
}
