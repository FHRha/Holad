import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Helper to generate user_id
export function generateUserId(login: string, passwordHash: string): string {
  return crypto.createHash('sha256').update(`${login}:${passwordHash}`).digest('hex');
}

// Secure Encryption helpers for integration tokens
export function getMasterEncryptionKey(): Buffer {
  if (process.env.ENCRYPTION_KEY) {
    return crypto.createHash('sha256').update(String(process.env.ENCRYPTION_KEY)).digest();
  }
  const keyFilePath = path.resolve(process.cwd(), '.encryption_key');
  try {
    if (fs.existsSync(keyFilePath)) {
      const savedKey = fs.readFileSync(keyFilePath, 'utf8').trim();
      if (savedKey.length === 64) {
        return Buffer.from(savedKey, 'hex');
      }
    }
    const newKey = crypto.randomBytes(32);
    fs.writeFileSync(keyFilePath, newKey.toString('hex'), { mode: 0o600 });
    return newKey;
  } catch (err) {
    return crypto.createHash('sha256').update('holad_persistent_machine_key_' + (process.env.COMPUTERNAME || process.env.HOSTNAME || 'default')).digest();
  }
}

export const GCM_IV_LENGTH = 12;

export function encrypt(text: string): string {
  const key = getMasterEncryptionKey();
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `gcm:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string | null {
  try {
    const key = getMasterEncryptionKey();
    if (text.startsWith('gcm:')) {
      const parts = text.split(':');
      if (parts.length !== 4) return null;
      const ivHex = parts[1];
      const tagHex = parts[2];
      const dataHex = parts[3];
      if (!ivHex || !tagHex || !dataHex || tagHex.length !== 32) return null;
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'), { authTagLength: 16 });
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      let decryptedStr = decipher.update(dataHex, 'hex', 'utf8');
      decryptedStr += decipher.final('utf8');
      return decryptedStr;
    }
    // Backward compatibility with legacy aes-256-cbc format
    const textParts = text.split(':');
    if (textParts.length < 2) return null;
    const ivHex = textParts.shift()!;
    if (ivHex.length !== 32 || !/^[0-9a-f]+$/i.test(ivHex)) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedHex = textParts.join(':');
    if (!/^[0-9a-f]+$/i.test(encryptedHex)) return null;
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', key.subarray(0, 32), iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      const legacyKey = Buffer.from('default_secret_key_needs_change_');
      const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKey, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    }
  } catch (e) {
    return null;
  }
}

export function safeEncrypt(val: string | null | undefined): string | null {
  if (!val) return null;
  if (val.startsWith('gcm:')) return val;
  const plain = safeDecrypt(val);
  return encrypt(plain || val);
}

export function safeDecrypt(val: string | null | undefined): string | undefined {
  if (!val) return undefined;
  if (val.startsWith('gcm:')) {
    const decrypted = decrypt(val);
    if (decrypted !== null) return decrypted;
    return val;
  }
  const decrypted = decrypt(val);
  if (decrypted !== null) return decrypted;
  return val;
}
