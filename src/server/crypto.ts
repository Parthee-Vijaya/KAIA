import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
function key() {
  const encoded = process.env.KAIA_ENCRYPTION_KEY;
  if (!encoded || Buffer.from(encoded, 'base64').length !== 32)
    throw new Error('KAIA_ENCRYPTION_KEY must be 32 base64 encoded bytes');
  return Buffer.from(encoded, 'base64');
}
export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}
export function decryptSecret(value: string) {
  const [version, iv, tag, body] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('INVALID_SECRET');
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(body, 'base64url')), cipher.final()]).toString(
    'utf8',
  );
}
export function hashSession(value: string) {
  const secret = process.env.KAIA_SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('KAIA_SESSION_SECRET must contain at least 32 characters');
  return createHash('sha256').update(secret).update(':').update(value).digest('hex');
}
