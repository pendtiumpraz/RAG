-- Pandangan platform utk superadmin: Usage per-tenant & Conversations
-- lintas-tenant (pilih tenant → chatbot → sesi → transkrip).
--
-- Pola sama dgn 0009/0012: policy SELECT tambahan yang HANYA terbuka ketika
-- transaksi menyatakan konteks admin lewat GUC `app.admin_context` — diset
-- semata oleh service ber-guard superadmin. Query aplikasi biasa tetap
-- terisolasi penuh per tenant (policy ber-OR).
--
-- Sekaligus memperbaiki bug nyata: billing.service menjoin usage_counters
-- lintas-tenant dengan komentar "RLS dilewati secara sadar" — padahal TIDAK
-- ada mekanismenya, sehingga angka pemakaian semua tenant diam-diam NOL.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usage_counters', 'chatbots', 'conversations', 'messages']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = t AND policyname = t || '_platform_admin_read'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT USING (current_setting(''app.admin_context'', true) = ''platform_admin'');',
        t || '_platform_admin_read', t);
    END IF;
  END LOOP;
END $$;
