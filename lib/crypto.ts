import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Encryption at rest for secrets saved in the database (teams' AI API keys).
// AES-256-GCM; the key comes from APP_ENCRYPTION_KEY, falling back to
// NEXTAUTH_SECRET so it works without extra setup. Rotating that secret makes
// saved keys unreadable — teams would just re-enter them.

function key() {
  const secret = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("APP_ENCRYPTION_KEY (or NEXTAUTH_SECRET) must be set to store secrets.");
  return createHash("sha256").update(secret).digest();
}

/** "v1:<iv>:<tag>:<ciphertext>" (base64url parts). */
export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(stored: string): string | null {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** "…a1B2" — safe to show in the UI. */
export function maskSecret(plain: string | null) {
  return plain ? `…${plain.slice(-4)}` : null;
}
