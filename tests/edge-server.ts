import { handleAuditRequest } from "../src/lib/audit/handler.ts";

Deno.serve({ hostname: "127.0.0.1", port: 3111 }, handleAuditRequest);
