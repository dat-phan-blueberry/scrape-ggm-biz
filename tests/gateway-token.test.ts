import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { GATEWAY_TOKEN_TTL_SEC, signGatewayToken } from "../src/lib/gateway-token.ts";

Deno.test("Token gọi thẳng AI Gateway: đúng định dạng gateway kiểm (gwt.payload.HMAC), chỉ /v1/llm/chat, hạn 10 phút", () => {
  const now = 1_800_000_000;
  const { token, expiresAt } = signGatewayToken("s3cret", "dia-ba", now);
  const [prefix, body, sig] = token.split(".");
  if (prefix !== "gwt") throw new Error(prefix);
  if (sig !== createHmac("sha256", "s3cret").update(body).digest("base64url")) throw new Error("chữ ký sai");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.svc !== "dia-ba" || JSON.stringify(payload.scope) !== '["/v1/llm/chat"]') throw new Error(JSON.stringify(payload));
  if (payload.exp !== now + GATEWAY_TOKEN_TTL_SEC || expiresAt !== payload.exp) throw new Error("hạn sai");
  if (signGatewayToken("khac", "dia-ba", now).token === token) throw new Error("secret khác phải ra chữ ký khác");
});
