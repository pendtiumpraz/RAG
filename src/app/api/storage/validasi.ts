import type { KredensialStorage, PenyediaStorage } from '@/modules/storage';
import { penyedia } from '@/modules/storage';

/**
 * Rakit `KredensialStorage` dari badan permintaan lalu VALIDASI lewat
 * adapter-nya. `credentials` hanya memuat MEDAN yang memang milik penyedia
 * itu — medan tak dikenal dibuang (tidak disimpan), dan rahasia tak pernah
 * bocor ke `scoping` (yang diambil dari adapter.scopingDari).
 */
export function wajibPerPenyedia(
  provider: PenyediaStorage,
  mentah: Record<string, unknown>,
): KredensialStorage {
  const adapter = penyedia(provider);
  const kred: KredensialStorage = {};

  const ambil = (k: string) => {
    const v = mentah[k];
    return typeof v === 'string' ? v : undefined;
  };
  const ambilBool = (k: string): boolean | undefined => typeof mentah[k] === 'boolean'
    ? (mentah[k] as boolean) : undefined;

  if (provider === 's3' || provider === 'r2' || provider === 's3-compat') {
    kred.accessKeyId = ambil('accessKeyId');
    kred.secretAccessKey = ambil('secretAccessKey');
    kred.region = ambil('region');
    kred.bucket = ambil('bucket');
    kred.endpoint = ambil('endpoint');
    kred.gayaPath = ambilBool('gayaPath');
  } else if (provider === 'gcs') {
    kred.serviceAccountJson = ambil('serviceAccountJson');
    kred.gcsBucket = ambil('gcsBucket');
  } else if (provider === 'azure') {
    kred.azureAccountName = ambil('azureAccountName');
    kred.azureAccountKey = ambil('azureAccountKey');
    kred.azureContainer = ambil('azureContainer');
    kred.azureSas = ambil('azureSas');
  }

  adapter.validasi(kred);
  /* scoping diturunkan adapter di storage.service; tak perlu di sini. */
  return kred;
}
