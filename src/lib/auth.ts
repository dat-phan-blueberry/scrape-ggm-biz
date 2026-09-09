export interface AuthUser {
  email: string;
  password: string;
}

export interface SessionPayload {
  email: string;
  exp: number; // milliseconds timestamp
}

export const COOKIE_NAME = "ggm_session";
const TOKEN_EXPIRY_DAYS = 7;

function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.AUTH_USERS?.trim() ||
    "godine-ggm-secret-salt-2026"
  );
}

/**
 * Đọc và parse danh sách người dùng từ AUTH_USERS trong .env
 * Định dạng: email_1:password1,email_2:password_2
 */
export function getAuthUsers(): AuthUser[] {
  const raw = process.env.AUTH_USERS || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx === -1) return null;
      const email = pair.slice(0, idx).trim().toLowerCase();
      const password = pair.slice(idx + 1).trim();
      if (!email || !password) return null;
      return { email, password };
    })
    .filter((u): u is AuthUser => u !== null);
}

/**
 * Kiểm tra xem chế độ xác thực có đang được kích hoạt hay không
 * (Bật nếu trong .env có khai báo ít nhất 1 tài khoản trong AUTH_USERS)
 */
export function isAuthEnabled(): boolean {
  return getAuthUsers().length > 0;
}

/**
 * Xác thực thông tin đăng nhập với danh sách trong AUTH_USERS
 */
export function validateCredentials(email: string, password: string): AuthUser | null {
  const users = getAuthUsers();
  if (users.length === 0) return null;
  const cleanEmail = email.trim().toLowerCase();
  const found = users.find((u) => u.email === cleanEmail && u.password === password);
  return found || null;
}

// Chuyển Uint8Array sang Base64URL
function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Chuyển Base64URL sang chuỗi UTF-8
function base64UrlToString(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}

async function getCryptoKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const secretBytes = enc.encode(getAuthSecret());
  return await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Tạo token phiên đăng nhập (HMAC SHA-256)
 */
export async function createSessionToken(email: string): Promise<string> {
  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    exp: Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  };
  const payloadStr = JSON.stringify(payload);
  const enc = new TextEncoder();
  const payloadB64 = bufferToBase64Url(enc.encode(payloadStr).buffer);

  const key = await getCryptoKey();
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const signatureB64 = bufferToBase64Url(signatureBuffer);

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Kiểm tra và giải mã token phiên đăng nhập
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signatureB64] = parts;
  try {
    const enc = new TextEncoder();
    const key = await getCryptoKey();
    const expectedSig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
    const expectedSigB64 = bufferToBase64Url(expectedSig);

    if (signatureB64 !== expectedSigB64) {
      return null;
    }

    const payloadJson = base64UrlToString(payloadB64);
    const payload: SessionPayload = JSON.parse(payloadJson);

    if (!payload.email || typeof payload.exp !== "number") {
      return null;
    }

    // Kiểm tra hết hạn
    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
