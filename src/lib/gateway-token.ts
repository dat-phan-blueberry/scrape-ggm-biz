import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";

/**
 * Token ngắn hạn để trình duyệt gọi thẳng AI Gateway (Koyeb), không đi qua hàm Netlify có timeout cố định.
 * Cùng định dạng với ai-gateway/security.js (verifyGatewayToken): gwt.<base64url(payload)>.<base64url(HMAC-SHA256)>.
 * Chỉ ký ở server, sau khi middleware đã kiểm phiên đăng nhập; secret GATEWAY_TOKEN_SECRET đặt giống nhau ở Netlify và Koyeb.
 */
export const GATEWAY_TOKEN_TTL_SEC = 10 * 60;
/** Đường dẫn trình duyệt được gọi bằng token (AI fallback của extension). */
export const GATEWAY_TOKEN_SCOPE = ["/v1/llm/chat"];

export function signGatewayToken(secret: string, service: string, nowSec = Math.floor(Date.now() / 1000)): { token: string; expiresAt: number } {
  const exp = nowSec + GATEWAY_TOKEN_TTL_SEC;
  const body = Buffer.from(JSON.stringify({ svc: service, scope: GATEWAY_TOKEN_SCOPE, exp })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return { token: `gwt.${body}.${sig}`, expiresAt: exp };
}
