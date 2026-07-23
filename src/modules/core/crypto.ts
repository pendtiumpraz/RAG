import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for provider API keys at rest.
 * Format stored in the DB: base64(iv).base64(authTag).base64(ciphertext)
 */
const KEY = Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY ?? '', 'base64');

function assertKey() {
  if (KEY.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be base64 of 32 bytes');
  }
}

export function encryptSecret(plaintext: string): string {
  assertKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(stored: string): string {
  assertKey();
  const [ivB64, tagB64, dataB64] = stored.split('.');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
