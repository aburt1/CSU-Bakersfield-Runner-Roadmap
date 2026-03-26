import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  const hex = process.env.API_CHECK_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'API_CHECK_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, 'hex');
}

export function isEncryptionConfigured(): boolean {
  const hex = process.env.API_CHECK_ENCRYPTION_KEY;
  return typeof hex === 'string' && /^[0-9a-fA-F]{64}$/.test(hex);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let data = cipher.update(plaintext, 'utf8', 'hex');
  data += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return JSON.stringify({ iv: iv.toString('hex'), data, tag });
}

export function decrypt(encrypted: string): string {
  const key = getKey();
  const { iv, data, tag } = JSON.parse(encrypted) as { iv: string; data: string; tag: string };

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let plaintext = decipher.update(data, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
