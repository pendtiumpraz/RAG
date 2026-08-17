/**
 * Registrasi SEMUA adapter — impor berkas ini sekali (lih. adapter.ts)
 * supaya tiap penyedia mendaftarkan dirinya ke registry. Menambah penyedia
 * baru cukup dengan import di sini (atau langsung daftarkanPenyedia di
 * berkas adapter-nya, yang juga diimpor).
 */
import './s3-family';
import './gcs';
import './azure';
import './platform';
