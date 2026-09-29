import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export type SealedType = 'client' | 'request' | 'code' | 'access' | 'refresh';

/**
 * Self-contained encrypted blobs, so the OAuth server needs no database: client ids,
 * pending authorization requests, codes and tokens all carry their own data and expiry.
 * The type is bound as AAD, so a blob of one type never decrypts as another.
 */
export class Sealer {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (secret.length < 32) {
      throw new Error('MOBILEPROXY_OAUTH_SECRET must be at least 32 characters (generate one with: openssl rand -hex 32)');
    }
    this.key = Buffer.from(hkdfSync('sha256', secret, 'mobileproxy-mcp', 'oauth-seal-v1', 32));
  }

  seal(type: SealedType, data: Record<string, unknown>, ttlSeconds: number): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(type));
    const payload = JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
    const body = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    return `mpo_${type}.` + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }

  /** Returns null for anything tampered, expired, malformed or of another type. */
  unseal<T>(type: SealedType, token: string): (T & { exp: number }) | null {
    const prefix = `mpo_${type}.`;
    if (!token.startsWith(prefix)) return null;
    try {
      const raw = Buffer.from(token.slice(prefix.length), 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
      decipher.setAAD(Buffer.from(type));
      decipher.setAuthTag(raw.subarray(12, 28));
      const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
      const data = JSON.parse(json) as T & { exp: number };
      if (typeof data.exp !== 'number' || data.exp < Date.now() / 1000) return null;
      return data;
    } catch {
      return null;
    }
  }
}
