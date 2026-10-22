import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

/** Wat de server over een ingelogde gebruiker bewaart. Staat versleuteld in een HttpOnly-cookie. */
export interface Session {
  subject: string;
  organizationId?: string;
  name?: string;
  email?: string;
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  /** Verloopmoment van het access token, in ms sinds epoch. */
  expiresAt: number;
}

/** Sleutel van 256 bits uit een geheim van minstens 32 tekens. */
export function sessionKey(secret: string): Uint8Array {
  if (secret.length < 32) throw new Error("Het sessiegeheim moet minstens 32 tekens lang zijn");
  return new Uint8Array(createHash("sha256").update(`t-jarpis-session:${secret}`).digest());
}

export async function seal(payload: object, key: Uint8Array, maxAgeSeconds: number): Promise<string> {
  return new EncryptJWT({ ...payload }).setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt().setExpirationTime(`${maxAgeSeconds}s`).encrypt(key);
}

export async function unseal<T>(token: string, key: Uint8Array): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(token, key, { contentEncryptionAlgorithms: ["A256GCM"], keyManagementAlgorithms: ["dir"] });
    return payload as T;
  } catch { return null; }
}

export interface CookieOptions { name: string; value: string; maxAge: number; secure: boolean }

/** Cookie met __Host-prefix: alleen via HTTPS, geen domein, pad /. Niet leesbaar voor JavaScript. */
export function serializeCookie({ name, value, maxAge, secure }: CookieOptions): string {
  const prefix = secure ? "__Host-" : "";
  return [`${prefix}${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`, ...(secure ? ["Secure"] : [])].join("; ");
}

export function readCookie(header: string | null | undefined, name: string, secure: boolean): string | null {
  if (!header) return null;
  const full = `${secure ? "__Host-" : ""}${name}`;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === full) return v.join("=");
  }
  return null;
}
