/**
 * URUTAN TABEL untuk ekspor/impor satu tenant.
 *
 * Proyek ini SENGAJA tanpa foreign key (Rule #2), jadi tak ada satu pun
 * informasi di basis data yang memberi tahu urutan yang benar. Urutannya
 * hidup di sini — dan kalau ia salah, hasilnya bukan galat melainkan basis
 * data yang tampak lengkap tapi berisi baris yatim di mana-mana.
 *
 * DAFTAR INI HARUS LENGKAP. Satu tabel yang terlewat berarti datanya hilang
 * diam-diam saat tenant dipindahkan — kegagalan yang baru ketahuan
 * berbulan-bulan kemudian, saat seseorang mencari dokumen yang tak pernah
 * ikut berpindah. Ada uji yang membandingkan daftar ini dengan `schema.ts`
 * dan gagal begitu ada tabel ber-`tenant_id` yang tak terdaftar.
 */

/** Tabel yang barisnya dipilih lewat kolom `tenant_id`. */
export const TENANT_TABLES = [
  // identitas & pengaturan — didahulukan karena sisanya menunjuk ke sini
  /* Divisi didahulukan dari users: users.division_id menunjuk ke sini, dan
     memindahkan orangnya lebih dulu membuat penunjuk itu menggantung di
     tengah perpindahan — tak ada FK yang akan mengeluhkannya (Rule #2). */
  'divisions',
  'users',
  'tenant_settings',
  'invitations',
  /* Koneksi SSO ikut pindah bersama tenantnya: kalau tertinggal, pelanggan
     yang dipindahkan kehilangan jalan masuk lewat direktori perusahaannya
     sendiri — dan gagalnya baru terlihat saat orang mencoba login. */
  'sso_connections',
  'provider_credentials',
  'document_categories',

  // struktur pengetahuan
  'chatbots',
  'knowledge_bases',
  'chatbot_knowledge_bases',
  'data_sources',

  // isi — bagian terbesar, hampir selalu >95% volumenya
  'documents',
  'document_duplicates',
  'document_vectors',

  // memory (menunjuk chatbot & dokumen)
  'memory_notes',
  'memory_edges',

  // percakapan
  'conversations',
  'messages',

  // integrasi & operasional
  'api_keys',
  'webhooks',
  'oauth_connections',
  /* Penyimpanan objek BYOB (S3/R2/GCS/Azure…) per-user — ikut pindah bersama
     tenantnya: kredensialnya milik pelanggan, dan meninggalkannya berarti
     memutus akses mereka ke bucket yang sudah mereka konfigurasi. */
  'storage_connections',
  'usage_counters',
  'payments',
  'audit_logs',
] as const;

/**
 * Tabel milik PLATFORM, bukan tenant — sengaja TIDAK ikut berpindah.
 *
 * Didaftarkan eksplisit supaya "tidak ikut" adalah keputusan yang tercatat,
 * bukan kelalaian yang kebetulan tak ketahuan.
 */
export const PLATFORM_TABLES = [
  // D10: aplikasi OAuth (client id/secret Google & Microsoft) dikelola
  // superadmin secara GLOBAL. Kolom "ms_tenant_id" di sana adalah id
  // direktori Microsoft, BUKAN tenant Nalar — dan justru itu yang membuatnya
  // sempat salah masuk daftar tenant, karena namanya memuat "tenant_id".
  // Wasitnya kini bukan pembacaan nama, melainkan information_schema; ada uji
  // yang membandingkan daftar ini dengan kolom yang benar-benar ada.
  'oauth_apps',
  'platform_settings',   // mode deploy & harga plan — milik operator
  'payment_gateways',    // kredensial gateway operator
  'backlog_items',       // papan kerja produk, bukan data pelanggan
  'llm_servers',         // server LLM global (D8: dikelola superadmin)
  'embedding_servers',   // idem
  'auth_tokens',         // token verifikasi email, berumur pendek
] as const;

/** Baris `tenants` itu sendiri — dipilih lewat `id`, bukan `tenant_id`. */
export const TENANT_ROOT_TABLE = 'tenants';
